/* jshint node: true */
'use strict';

var crypto = require('crypto');
var fs = require('fs');
var path = require('path');

var bodyParser = require('body-parser');
var PercyClient = require('percy-client');
var Environment = require('percy-client/dist/environment');
var PromisePool = require('es6-promise-pool');
var walk = require('walk');


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
  '/package.json',
  /\.map$/,
  /\.DS_Store$/
];

// Synchronously walk the build directory, read each file and calculate its SHA 256 hash,
// and create a mapping of hashes to Resource objects.
function gatherBuildResources(percyClient, buildDir) {
  var hashToResource = {};
  var walkOptions = {
    // Follow symlinks because many assets in the ember build directory are just symlinks.
    followLinks: true,

    listeners: {
      file: function (root, fileStats, next) {
        var absolutePath = path.join(root, fileStats.name);
        var resourceUrl = absolutePath.replace(buildDir, '');

        for (var i in SKIPPED_ASSETS) {
          if (resourceUrl.match(SKIPPED_ASSETS[i])) {
            next();
            return;
          }
        }

        // TODO(fotinakis): this is synchronous and potentially memory intensive, but we don't
        // keep a reference to the content around so this should be garbage collected. Re-evaluate?
        var content = fs.readFileSync(absolutePath);
        var sha = crypto.createHash('sha256').update(content).digest('hex');

        var resource = percyClient.makeResource({
          resourceUrl: resourceUrl,
          sha: sha,
          localPath: absolutePath,
        });

        hashToResource[sha] = resource;
        next();
      }
    }
  };
  walk.walkSync(buildDir, walkOptions);

  return hashToResource;
};

// Helper method to parse missing-resources from an API response.
function parseMissingResources(response) {
  return response.body.data &&
    response.body.data.relationships &&
    response.body.data.relationships['missing-resources'] &&
    response.body.data.relationships['missing-resources'].data || [];
}

function handlePercyFailure(error) {
  isPercyEnabled = false;
  console.warn('\n[percy] ERROR: API call failed, Percy has been disabled for this build.')
  if (error) {
    console.warn(error.toString());  // Stringify to prevent full response output.
  }
}

// TODO: refactor to break down into a more modular design with less global state.
var percyClient;
var percyConfig;
var percyBuildPromise;
var buildResourceUploadPromises = [];
var snapshotResourceUploadPromises = [];
var isPercyEnabled = true;


module.exports = {
  name: 'ember-percy',

  // Only allow the addon to be incorporated in non-production envs.
  isEnabled: function() {
    // This cannot be just 'test', because people often run tests from development servers, and the
    // helper imports will fail since ember-cli excludes addon files entirely if not enabled.
    return (process.env.EMBER_ENV !== 'production');
  },
  // Grab and store the `percy` config set in an app's config/environment.js.
  config: function(env, baseConfig) {
    percyConfig = baseConfig.percy || {};

    // Make sure the percy config has a 'breakpoints' object.
    percyConfig.breakpointsConfig = percyConfig.breakpointsConfig || {};
  },
  // After build output is ready, create a Percy build and upload missing build resources.
  outputReady: function(result) {
    // Disable Percy when running Fastboot builds (for now).
    if (typeof process.env.EMBER_CLI_FASTBOOT !== 'undefined') {
      console.warn('[percy] Disabling Percy in Fastboot build.')
      return;
    }

    var token = process.env.PERCY_TOKEN;
    var apiUrl = process.env.PERCY_API; // Optional.
    var environment = new Environment(process.env);
    var repo = environment.repo;

    if (process.env.PERCY_ENABLE == '0') {
      isPercyEnabled = false;
    }

    if (token && repo && isPercyEnabled) {
      percyClient = new PercyClient({token: token, apiUrl: apiUrl});
    } else {
      isPercyEnabled = false;

      if (environment.ci && !token) {
        console.warn(
          '[percy] Warning: Percy is disabled, no PERCY_TOKEN environment variable found.')
      }
      if (environment.ci && !repo) {
        console.warn(
          '[percy] Warning: Percy is disabled, no PERCY_PROJECT environment variable found.')
      }
    }
    if (!isPercyEnabled) { return; }

    var hashToResource = gatherBuildResources(percyClient, result.directory);
    var resources = [];
    Object.keys(hashToResource).forEach(function(key) {
      resources.push(hashToResource[key]);
    });

    // Initialize the percy client and a new build.
    percyBuildPromise = percyClient.createBuild(repo, {resources: resources});

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
                promise.then(function(response) {
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
    // Add middleware to add request.body because it is not populated in express by default.
    app.use(bodyParser.json({limit: '50mb'}));

    // Snapshot middleware, this is the endpoint that the percySnapshot() test helper hits.
    app.use('/_percy/snapshot', function(request, response, next) {
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
          }
        );

        // Upload missing resources (just the root resource HTML in this case).
        snapshotPromise.then(function(response) {
          var snapshotId = response.body.data.id;
          var missingResources = parseMissingResources(response);
          if (missingResources.length > 0) {
            // We assume there is only one missing resource here and it is the root resource.
            // All other resources should be build resources.
            var missingResource = missingResources[0];
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
        }, handlePercyFailure);
      });

      response.status(201);
      response.contentType('application/json');
      response.send(JSON.stringify({success: true}));
    });
    app.use('/_percy/finalize_build', function(request, response, next) {
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

              // Avoid trying to add snapshots to an already-finalized build. This might happen when
              // running tests locally and the browser gets refreshed after the end of a test run.
              // Generally, this is not a problem because tests only run in CI and only once.
              isPercyEnabled = false;

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
