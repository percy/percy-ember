/* jshint node: true */
'use strict';

var fs = require('fs');
var bodyParser = require('body-parser');
var subprocess = require('child_process');

var buildDir;

module.exports = {
  name: 'ember-percy',

  postBuild: function(results) {
    buildDir = results.directory;
  },
  testemMiddleware: function(app) {
    // Add middleware to add request.body because it is not populated in express by default.
    app.use(bodyParser.json());

    app.use('/_percy/snapshot', function(request, response, next) {
      var data = request.body;
      var snapshotsDir = buildDir + '/_percy_snapshots';
      if (!fs.existsSync(snapshotsDir)){
        fs.mkdirSync(snapshotsDir);
      }

      fs.writeFile(buildDir + '/_percy_snapshots/' + data.name + '.html', data.content, function(err) {
        if (err) {
          return console.log(err);
        }
      });

      response.status(201);
      response.contentType('application/json');
      response.send(JSON.stringify({success: true}));
    });

    app.use('/_percy/finalize_build', function(request, response, next) {
      subprocess.spawnSync('percy', ['snapshot', buildDir], {stdio: [0, 1, 2]});

      response.status(201);
      response.contentType('application/json');
      response.send(JSON.stringify({success: true}));
    });
  },
};
