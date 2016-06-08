/* jshint node: true */
'use strict';

var bodyParser = require('body-parser');
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var PercyClient = require('percy-client');
var walk = require('walk');

// Some build assets we never want to upload.
var SKIPPED_ASSETS = [
  '/assets/tests.js',
  '/assets/tests.jsp',
  '/assets/tests.map',
  '/tests/index.html'
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

        if (SKIPPED_ASSETS.indexOf(resourceUrl) > -1) {
          next();
          return;
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

var percyClient;
var percyBuildId;
var buildResourceUploadPromises = [];
var snapshotResourceUploadPromises = [];
var isEnabled = true;


module.exports = {
  name: 'ember-percy',

  postBuild: function(results) {
    var token = process.env.PERCY_TOKEN;
    var repoSlug = process.env.PERCY_REPO_SLUG;  // TODO: pull this from CI environment.
    if (token && repoSlug) {
      percyClient = new PercyClient({token: token});
    } else {
      // TODO: only show this warning in CI environments.
      if (!token) {
        console.warn('[percy] Warning: Percy is disabled, no PERCY_TOKEN environment variable found.')
      }
      if (!repoSlug) {
        console.warn('[percy] Warning: Percy is disabled, no PERCY_REPO_SLUG environment variable found.')
      }
      isEnabled = false;
    }
    if (!isEnabled) { return; }

    var hashToResource = gatherBuildResources(percyClient, results.directory);
    var resources = [];
    Object.keys(hashToResource).forEach(function(key) {
      resources.push(hashToResource[key]);
    });

    // Initialize the percy client and a new build.
    var percyBuildPromise = percyClient.createBuild(repoSlug, {resources: resources});

    // This assumes that this promise will resolve before the percyBuildId is used below.
    // TODO(fotinakis): re-evaluate this assumption.
    percyBuildPromise.then(function(response) {
      percyBuildId = response.body.data.id;
      console.log('[percy] Starting build ' + percyBuildId);
    });

    // Upload all missing build resources.
    percyBuildPromise.then(function(response) {
      var missingResources = parseMissingResources(response);
      if (missingResources && missingResources.length > 0) {
        missingResources.forEach(function(missingResource) {
          var resource = hashToResource[missingResource.id];
          var content = fs.readFileSync(resource.localPath);

          // Start the build resource upload and add it to a collection we can block on later
          // because build resources must be fully uploaded before snapshots are finalized.
          var promise = percyClient.uploadResource(percyBuildId, content);
          promise.then(function(response) {
            console.log('[percy] Uploaded new build resource: ' + resource.resourceUrl);
          });
          buildResourceUploadPromises.push(promise);
        });
      }
    });
  },
  testemMiddleware: function(app) {
    // Add middleware to add request.body because it is not populated in express by default.
    app.use(bodyParser.json());

    // Snapshot middleware, this is the endpoint that the percySnapshot() test helper hits.
    app.use('/_percy/snapshot', function(request, response, next) {
      // Still install the middleware to avoid HTTP errors but stop everything else if disabled.
      if (!isEnabled) { return; }

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

      // Construct the root resource and create the snapshot.
      var data = request.body;
      var rootResource = percyClient.makeResource({
        resourceUrl: '/',
        content: data.content,
        isRoot: true,
        mimetype: 'text/html',
      });
      console.log('[percy] Snapshot:', data.name);
      var snapshotPromise = percyClient.createSnapshot(
        percyBuildId,
        [rootResource],
        {name: data.name}
      );

      // Upload missing resources (just the root resource HTML in this case).
      snapshotPromise.then(function(response) {
        var snapshotId = response.body.data.id;
        var missingResources = parseMissingResources(response);
        if (missingResources.length > 0) {
          // We assume there is only one missing resource here and it is the root resource.
          // All other resources should be build resources.
          var missingResource = missingResources[0];
          percyClient.uploadResource(percyBuildId, rootResource.content).then(function() {
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
      });

      response.status(201);
      response.contentType('application/json');
      response.send(JSON.stringify({success: true}));
    });
    app.use('/_percy/finalize_build', function(request, response, next) {
      // Still install the middleware to avoid HTTP errors but stop everything else if disabled.
      if (!isEnabled) { return; }

      // We need to wait until all build resources are uploaded before finalizing the build.
      Promise.all(buildResourceUploadPromises).then(function() {
        // We also need to wait until all snapshot resources have been uploaded. We do NOT need to
        // wait until the snapshot itself has been finalized, just until resources are uploaded.
        Promise.all(snapshotResourceUploadPromises).then(function() {
          // Finalize the build.
          percyClient.finalizeBuild(percyBuildId).then(function() {
            // Avoid trying to add snapshots to an already-finalized build. This might happen when
            // running tests locally and the browser gets refreshed after the end of a test run.
            // Generally, this is not a problem because tests only run in CI and only once.
            isEnabled = false;

            // This is important, the ajax call to finalize_build is "async: false" and prevents
            // testem from shutting down the browser until this response.
            response.status(200);
            response.contentType('application/json');
            response.send(JSON.stringify({success: true}));
          });
        });
      });
    });
  },
};
