'use strict';

const EmberAddon = require('ember-cli/lib/broccoli/ember-addon');
const semver = require('semver');
const fs = require('fs');

module.exports = function(defaults) {
  /*
    This build file specifies the options for the dummy test app of this
    addon, located in `/tests/dummy`
    This build file does *not* influence how the addon or the app using it
    behave. You most likely want to be modifying `./index.js` or app's build file
  */

  const emberSourcePackageJSON = fs.readFileSync(require.resolve('ember-source/package.json'));
  const emberSourceVersion = JSON.parse(emberSourcePackageJSON).version;
  const options = {};

  // Remove Ember.$ in the dummy test app, if using Ember > 3.
  if (semver.satisfies(emberSourceVersion, '>3')) {
    options.vendorFiles = { 'jquery.js': null };
  }

  let app = new EmberAddon(defaults, options);

  return app.toTree();
};
