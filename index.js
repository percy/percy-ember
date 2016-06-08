/* jshint node: true */
'use strict';

var bodyParser = require('body-parser');
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var PercyClient = require('percy-client');
var walk = require('walk');

// Set by the postBuild hook.
var buildDir;

// Some build assets we never want to upload.
var SKIPPED_ASSETS = [
  '/assets/tests.js',
  '/assets/tests.jsp',
  '/assets/tests.map',
  '/tests/index.html'
];

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

  // Synchronously walk the entire build directory, read each file and calculate its SHA 256
  // hash, and create a mapping of hashes to Resource objects.
  walk.walkSync(buildDir, walkOptions);

  return hashToResource;
};

function parseMissingResources(response) {
  return response.body.data &&
    response.body.data.relationships &&
    response.body.data.relationships['missing-resources'] &&
    response.body.data.relationships['missing-resources'].data || [];
}


module.exports = {
  name: 'ember-percy',

  postBuild: function(results) {
    buildDir = results.directory;
  },
  testemMiddleware: function(app) {
    var percyClient;
    var percyBuildPromise;
    var percyBuildId;
    var buildResourceUploadPromises = [];
    var snapshotFinalizePromises = [];

    // Add middleware to add request.body because it is not populated in express by default.
    app.use(bodyParser.json());

    var isEnabled = true;
    var token = process.env.PERCY_TOKEN;
    var repoSlug = process.env.PERCY_REPO_SLUG;  // TODO: pull this from CI environment.
    if (token && repoSlug) {
      percyClient = new PercyClient({token: token});

      var hashToResource = gatherBuildResources(percyClient, buildDir);
      var resources = [];
      Object.keys(hashToResource).forEach(function(key) {
        resources.push(hashToResource[key]);
      });

      // Initialize the percy client and a new build.
      percyBuildPromise = percyClient.createBuild(repoSlug, {resources: resources});
      percyBuildPromise.then(function(response) {
        // This assumes that this network request will finish before the percyBuildId is used below.
        // TODO(fotinakis): re-evaluate this assumption.
        percyBuildId = response.body.data.id;

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
    } else {
      // TODO: only show this warning in CI environments.
      if (!token) {
        console.warn('Warning: Percy is disabled, no PERCY_TOKEN environment variable found.')
      }
      if (!repoSlug) {
        console.warn('Warning: Percy is disabled, no PERCY_REPO_SLUG environment variable found.')
      }
      isEnabled = false;
    }

    // Snapshot middleware, this is the endpoint that the percySnapshot() test helper hits.
    app.use('/_percy/snapshot', function(request, response, next) {
      // Still install the middleware to avoid HTTP errors but stop everything else if disabled.
      if (!isEnabled) { return; }

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
        if (missingResources && missingResources.length > 0) {
          missingResources.forEach(function(missingResource) {
            // We assume there is only one missing resource here and it is the root resource.
            // TODO(fotinakis): use a common method for this and uploading missing build resources.
            percyClient.uploadResource(percyBuildId, rootResource.content).then(function() {
              // After all build resources are uploaded, finalize the snapshot.
              Promise.all(buildResourceUploadPromises).then(function() {
                snapshotFinalizePromises.push(percyClient.finalizeSnapshot(snapshotId));
              });
            });
          });
        } else {
          // No missing resources, we can immediately finalize the snapshot after build resources.
          Promise.all(buildResourceUploadPromises).then(function() {
            snapshotFinalizePromises.push(percyClient.finalizeSnapshot(snapshotId));
          });

        }
      });

      response.status(201);
      response.contentType('application/json');
      response.send(JSON.stringify({success: true}));
    });
    app.use('/_percy/finalize_build', function(request, response, next) {
      // Still install the middleware to avoid HTTP errors but stop everything else if disabled.
      if (!isEnabled) { return; }

      // After all build resources are uploaded, then after all snapshots are finalized,
      // finalize the build.
      Promise.all(buildResourceUploadPromises).then(function() {
        Promise.all(snapshotFinalizePromises).then(function() {
          percyClient.finalizeBuild(percyBuildId);
        });
      });
    });
  },
};
