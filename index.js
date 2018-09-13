/* eslint no-console: off */

'use strict';

var fs = require('fs');
var bodyParser = require('body-parser');
var PercyClient = require('percy-client');
var PromisePool = require('es6-promise-pool');

// Some build assets we never want to upload.
var SKIPPED_ASSETS = [
  '/assets/tests.js',
  '/assets/tests.jsp',
  '/assets/tests.map',
  '/tests/index.html',
  '/assets/test-support.js',
  '/assets/test-loader.js',
  '/assets/test-support.css',
  '/assets/dummy.js',
  '/index.html',
  '/testem.js',
  /\.map$/,
  /\.log$/,
  /\.DS_Store$/
];

// Helper method to parse missing-resources from an API response.
function parseMissingResources(response) {
  return response.body.data &&
    response.body.data.relationships &&
    response.body.data.relationships['missing-resources'] &&
    response.body.data.relationships['missing-resources'].data || [];
}

function handlePercyFailure(error) {
  isPercyEnabled = false;
  console.warn('\n[percy][ERROR] API call failed, Percy has been disabled for this build.')
  if (error) {
    console.warn(error.toString());  // Stringify to prevent full response output.
  }
}

// TODO: refactor to break down into a more modular design with less global state.
var percyClient;
var percyConfig = {};
var percyBuildPromise;
var buildResourceUploadPromises = [];
var snapshotResourceUploadPromises = [];
var isPercyEnabled = true;
var createPercyBuildInvoked = false;


module.exports = {
  name: 'ember-percy',

  _clientInfo: function() {
    if(!this._clientInfoCache) {
      // eslint-disable-next-line node/no-missing-require
      var version = require('./package.json').version;
      this._clientInfoCache = `${this.name}/${version}`;
    }

    return this._clientInfoCache;
  },

  _environmentInfo: function() {
    if(!this._environmentInfoCache) {
      this._environmentInfoCache = [
        `ember/${this._emberSourceVersion()}`,
        `ember-cli/${this._emberCliVersion()}`
      ].join('; ');
    }

    return this._environmentInfoCache;
  },

  _emberSourceVersion: function() {
    try {
      // eslint-disable-next-line node/no-unpublished-require
      return require('ember-source/package.json').version;
    } catch (e) {
      return 'unknown';
    }
  },

  _emberCliVersion: function() {
    try {
      // eslint-disable-next-line node/no-unpublished-require
      return require('ember-cli/lib/utilities/version-utils').emberCLIVersion();
    } catch (e) {
      return 'unknown';
    }
  },

  included: function(app) {
    this._super.included(app);
    app.import('vendor/percy-jquery.js', {type: 'test'});
  },

  // Only allow the addon to be incorporated in non-production envs.
  isEnabled: function() {
    // This cannot be just 'test', because people often run tests from development servers, and the
    // helper imports will fail since ember-cli excludes addon files entirely if not enabled.
    return (process.env.EMBER_ENV !== 'production');
  },

  // Grab and store the `percy` config set in an app's config/environment.js.
  config: function(env, baseConfig) {
    percyConfig = baseConfig.percy || {};

    // Store the Ember rootURL to be used later.
    percyConfig.baseUrlPath = baseConfig.rootURL || '/';

    // Make sure the percy config has a 'breakpoints' object.
    percyConfig.breakpointsConfig = percyConfig.breakpointsConfig || {};
  },

  // Inject percy finalization into the footer of tests/index.html.
  contentFor: function(type) {
    // Disable finalize injection if Percy is explicitly disabled or if not in an 'ember test' run.
    // This must be handled separately than the outputReady disabling below.
    if (process.env.PERCY_ENABLE == '0' || process.env.EMBER_ENV !== 'test') {
      return;
    }
    if (type === 'test-body-footer') {
      return "\
        <script> \
          require('ember-percy/native-xhr')['default'](); \
          require('ember-percy/finalize')['default'](); \
        </script> \
      ";
    }
  },


  outputReady: function(result) {
    // outputReady is run both in `ember build` and in `ember test` when a build is completed.
    // Only create a Percy Build in the `ember test` context. Tests aren't run for `ember build`.
    if (process.env.EMBER_CLI_TEST_COMMAND === 'true') {
      // NOTE: it's important to return a promise from outputReady to make sure the uploads are
      // finished before the tests are run.
      return this.createPercyBuild(result.directory);
    }
  },

  // Create a Percy build and upload missing build resources.
  createPercyBuild: function(buildOutputDirectory) {
    createPercyBuildInvoked = true;

    var token = process.env.PERCY_TOKEN;
    var apiUrl = process.env.PERCY_API; // Optional.

    // Disable if Percy is explicitly disabled or if this is not an 'ember test' run.
    if (process.env.PERCY_ENABLE == '0' || process.env.EMBER_ENV !== 'test') {
      isPercyEnabled = false;
    }

    if (token && isPercyEnabled) {
      console.warn('[percy] Percy is running.');
      percyClient = new PercyClient({
        token: token,
        apiUrl: apiUrl,
        clientInfo: this._clientInfo(),
        environmentInfo: this._environmentInfo(),
      });
    } else {
      isPercyEnabled = false;
      if (!token) {
        console.warn(
          '[percy][WARNING] Percy is disabled, no PERCY_TOKEN environment variable found.')
      }
    }

    if (!isPercyEnabled) { return; }

    var resources = percyClient.gatherBuildResources(buildOutputDirectory, {
      baseUrlPath: percyConfig.baseUrlPath,
      skippedPathRegexes: SKIPPED_ASSETS,
    });

    // Initialize the percy client and a new build.
    percyBuildPromise = percyClient.createBuild({resources: resources});

    // Return a promise and only resolve when all build resources are uploaded, which
    // ensures that the output build dir is still available to be read from before deleted.
    return new Promise(function(resolve) {
      percyBuildPromise.then(
        function(buildResponse) {
          var percyBuildData = buildResponse.body.data;
          console.log('\n[percy] Build created:', percyBuildData.attributes['web-url']);

          // Upload all missing build resources.
          var missingResources = parseMissingResources(buildResponse);
          if (missingResources && missingResources.length > 0) {

            // Note that duplicate resources with the same SHA will get clobbered here into this
            // hash, but that is ok since we only use this to access the content below for upload.
            var hashToResource = {};
            resources.forEach(function(resource) {
              hashToResource[resource.sha] = resource;
            });

            var missingResourcesIndex = 0;
            var promiseGenerator = function() {
              var missingResource = missingResources[missingResourcesIndex];
              missingResourcesIndex++;

              if (missingResource) {
                var resource = hashToResource[missingResource.id];
                var content = fs.readFileSync(resource.localPath);

                // Start the build resource upload and add it to a collection we can block on later
                // because build resources must be fully uploaded before snapshots are finalized.
                var promise = percyClient.uploadResource(percyBuildData.id, content);
                promise.then(function() {
                  console.log('\n[percy] Uploaded new build resource: ' + resource.resourceUrl);
                }, handlePercyFailure);
                buildResourceUploadPromises.push(promise);

                return promise;
              } else {
                // Trigger the pool to end.
                return null;
              }
            }

            // We do this in a promise pool for two reasons: 1) to limit the number of files that
            // are held in memory concurrently, and 2) without a pool, all upload promises are
            // created at the same time and request-promise timeout settings begin immediately,
            // which timeboxes ALL uploads to finish within one timeout period. With a pool, we
            // defer creation of the upload promises, which makes timeouts apply more individually.
            var concurrency = 2;
            var pool = new PromisePool(promiseGenerator, concurrency);

            // Wait for all build resource uploads before we allow the addon build step to complete.
            // If an upload failed, resolve anyway to unblock the building process.
            pool.start().then(resolve, resolve);
          } else {
            // No missing resources.
            resolve();
          }
        },

        function(error) {
          handlePercyFailure(error);

          // If Percy build creation fails, resolve anyway to unblock the building process.
          resolve();
        }
      );
    });
  },

  testemMiddleware: function(app) {
    // `ember test` can be run in two ways that we cater to.
    // 1) `ember test` can be run WITHOUT the `--path` flag, in which case ember test first runs the
    // ember build, and then runs the tests.  In this scenario outputReady would have already been
    // invoked, calling createPercyBuild.
    // 2) `ember test` can be supplied a `--path=dist` flag, which means the app has been pre-built
    // in a separate build step, and is being passed in with the `--path` flag.  In this scenario,
    // outputReady is not invoked by the `ember test` command, so we need to create the Percy build
    // here.
    //
    // The value passed to --path is available in process.env.EMBER_CLI_TEST_OUTPUT
    // We can also check we're executing the test command with process.env.EMBER_CLI_TEST_COMMAND

    if (!createPercyBuildInvoked) {
      if (process.env.EMBER_CLI_TEST_COMMAND === 'true' && process.env.EMBER_CLI_TEST_OUTPUT) {
        this.createPercyBuild(process.env.EMBER_CLI_TEST_OUTPUT);
      } else {
        console.warn(
          '[percy][WARNING] Disabling Percy as no ember build is available.'
        );
        isPercyEnabled = false;
      }
    }

    // Add middleware to add request.body because it is not populated in express by default.
    app.use(bodyParser.json({limit: '50mb'}));

    // Snapshot middleware, this is the endpoint that the percySnapshot() test helper hits.
    app.use('/_percy/snapshot', function(request, response) {
      var data = request.body;

      if (!isPercyEnabled) {
        // Percy is disabled, send response now to unblock the ajax call.
        response.status(200);
        response.contentType('application/json');
        response.send(JSON.stringify({}));
        return;
      }

      var widths = [];
      // Transform the `breakpoints` array of strings into an array of integer widths, mapped
      // by the breakpoints config. The 'breakpoints' arg takes precedence over 'widths'.
      if (!data.widths && data.breakpoints || percyConfig.defaultBreakpoints) {
        var snapshotBreakpoints = data.breakpoints || percyConfig.defaultBreakpoints;

        for (var i in snapshotBreakpoints) {
          var breakpointName = snapshotBreakpoints[i];
          var breakpointWidth = percyConfig.breakpointsConfig[breakpointName];

          if (!parseInt(breakpointWidth)) {
            response.status(400);
            response.send(
              'Breakpoint name "' + breakpointName + '" is not defined in Percy config.');
            return;
          }
          if (widths.indexOf(breakpointWidth) === -1) {
            widths.push(breakpointWidth);
          }
        }
      } else if (data.widths || percyConfig.defaultWidths) {
        // Deprecated: support a 'widths' list of integers.
        widths = data.widths || percyConfig.defaultWidths;
      }


      // Add a new promise to the list of resource uploads so that finalize_build can wait on
      // resource uploads. We MUST do this immediately here with a custom promise, not wait for
      // the nested `uploadResource()` promise below, to avoid creating a race condition where the
      // uploads array may be missing some possible upload promises.
      //
      // Nasty way to get a reference to the `resolve` method so that we can manually resolve this
      // promise below. http://stackoverflow.com/a/26150465/128597
      var resolveAfterResourceUploaded;
      var resourceUploadedPromise = new Promise(function(resolve) {
        resolveAfterResourceUploaded = resolve;
      });
      snapshotResourceUploadPromises.push(resourceUploadedPromise);

      percyBuildPromise.then(function(buildResponse) {
        var percyBuildData = buildResponse.body.data;

        // Construct the root resource and create the snapshot.
        var rootResource = percyClient.makeResource({
          resourceUrl: '/',
          content: data.content,
          isRoot: true,
          mimetype: 'text/html',
        });

        var snapshotPromise = percyClient.createSnapshot(
          percyBuildData.id,
          [rootResource],
          {
            name: data.name,
            widths: widths,
            enableJavaScript: data.enableJavaScript,
          }
        );

        // Upload missing resources (just the root resource HTML in this case).
        snapshotPromise.then(function(response) {
          var snapshotId = response.body.data.id;
          var missingResources = parseMissingResources(response);
          if (missingResources.length > 0) {
            // We assume there is only one missing resource here and it is the root resource.
            // All other resources should be build resources.
            percyClient.uploadResource(percyBuildData.id, rootResource.content).then(function() {
              resolveAfterResourceUploaded();

              // After we're sure all build resources are uploaded, finalize the snapshot.
              Promise.all(buildResourceUploadPromises).then(function() {
                percyClient.finalizeSnapshot(snapshotId);
              });
            });
          } else {
            // No missing resources, we can immediately finalize the snapshot after build resources.
            Promise.all(buildResourceUploadPromises).then(function() {
              percyClient.finalizeSnapshot(snapshotId);
            });

            // No resources to upload, so resolve immediately.
            resolveAfterResourceUploaded();
          }
        }, function(error) {
          if (error.statusCode && error.statusCode == 400) {
            console.warn(
              '[percy][WARNING] Bad request error, skipping snapshot: ' + data.name
            );
            console.warn(error.toString());
            // Skip this snapshot, resolve on error to unblock the finalization promise chain.
            resolveAfterResourceUploaded();
          } else {
            handlePercyFailure(error);
          }
        });
      });

      response.status(201);
      response.contentType('application/json');
      response.send(JSON.stringify({success: true}));
    });
    app.use('/_percy/finalize_build', function(request, response) {
      // Important, this middleware must always return a response because the ajax call to
      // finalize_build is "async: false" and prevents testem from shutting down the browser
      // until this response.
      function sendResponse(success) {
        success = success || false;
        response.status(200);
        response.contentType('application/json');
        response.send(JSON.stringify({success: success}));
      }

      function handleError(error) {
        handlePercyFailure(error);
        sendResponse(false);
      }

      if (!isPercyEnabled) {
        sendResponse(true);
        return;
      }

      // TODO: simplify this callback nesting, but retain strong ordering guarantees.
      console.log('[percy] Finalizing build...');
      percyBuildPromise.then(function(buildResponse) {
        var percyBuildData = buildResponse.body.data;
        // We need to wait until all build resources are uploaded before finalizing the build.
        Promise.all(buildResourceUploadPromises).then(function() {
          // We also need to wait until all snapshot resources have been uploaded. We do NOT need to
          // wait until the snapshot itself has been finalized, just until resources are uploaded.
          Promise.all(snapshotResourceUploadPromises).then(function() {
            // Finalize the build.
            percyClient.finalizeBuild(percyBuildData.id).then(function() {
              sendResponse(true);

              // Attempt to make our logging come last, giving time for test output to finish.
              var url = percyBuildData.attributes['web-url'];
              process.nextTick(function() {
                console.log('[percy] Visual diffs are now processing:', url);
              });
            }, handleError);
          }, handleError);
        }, handleError);
      }, handleError);
    });
  },
};
