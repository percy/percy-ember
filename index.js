/* jshint node: true */
'use strict';

var bodyParser = require('body-parser');
var PercyClient = require('percy-client');


module.exports = {
  name: 'ember-percy',

  testemMiddleware: function(app) {
    var percyClient;
    var percyBuildPromise;
    var percyBuildId;

    // Add middleware to add request.body because it is not populated in express by default.
    app.use(bodyParser.json());

    var isEnabled = true;
    var token = process.env.PERCY_TOKEN;
    if (token) {
      // Initialize the percy client and a new build.
      percyClient = new PercyClient({token: token});
      percyBuildPromise = percyClient.createBuild('fotinakis/percy-web');

      percyBuildPromise.then(function(response) {
        // This assumes that this network request will finish before the percyBuildId is used below.
        // TODO(fotinakis): re-evaluate this assumption.
        percyBuildId = response.body.data.id;
      });
    } else {
      // TODO: only show this warning in CI environments.
      console.warn('Warning: Percy is disabled, no PERCY_TOKEN environment variable found.')
      isEnabled = false;
    }

    // Snapshot middleware, this is the endpoint that the percySnapshot() test helper hits.
    app.use('/_percy/snapshot', function(request, response, next) {
      if (!isEnabled) {
        return;
      }

      // Construct the root resource and create the snapshot.
      var data = request.body;
      var rootResource = percyClient.makeResource({
        resourceUrl: '/',
        content: data.content,
        isRoot: true,
        mimetype: 'text/html',
      });
      var snapshotPromise = percyClient.createSnapshot(
        percyBuildId,
        [rootResource],
        {name: data.name}
      );

      // Upload missing resources (just the root resource HTML in this case).
      snapshotPromise.then(function(response) {
        var missingResources = response.body.data &&
          response.body.data.relationships &&
          response.body.data.relationships['missing-resources'] &&
          response.body.data.relationships['missing-resources'].data;

        if (missingResources && missingResources.length > 0) {
          missingResources.forEach(function(missingResource) {
            // We assume there is only one missing resource here and it is the root resource.
            // TODO(fotinakis): use a common method for this and uploading missing build resources.
            percyClient.uploadResource(percyBuildId, rootResource.content).then(function() {
              percyClient.finalizeSnapshot(response.body.data.id);
            });
          });
        } else {
          percyClient.finalizeSnapshot(response.body.data.id);
        }
      });

      response.status(201);
      response.contentType('application/json');
      response.send(JSON.stringify({success: true}));
    });

    // Finalize build handler.
    if (isEnabled) {
      process.on('beforeExit', function() {
        percyClient.finalizeBuild(percyBuildId);
      });
    }
  },
};
