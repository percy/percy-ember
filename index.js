'use strict';

/* eslint-disable node/no-extraneous-require */
const WriteFile = require('broccoli-file-creator');
const MergeTrees = require('broccoli-merge-trees');
const BroccoliDebug = require('broccoli-debug');
const debugTree = BroccoliDebug.buildDebugCallback('@percy/ember');
const pkg = require('./package');

module.exports = {
  name: pkg.name,

  included() {
    this._super.included.apply(this, arguments);
    this.import('node_modules/@percy/sdk-utils/dist/bundle.js', {
      using: [{ transformation: 'amd', as: '@percy/sdk-utils' }],
      type: 'test'
    });
  },

  treeForAddonTestSupport(tree) {
    let meta = new WriteFile('@percy/ember/meta.js', (
      `export default ${JSON.stringify({
        VERSION: pkg.version,
        PERCY_SERVER_ADDRESS: process.env.PERCY_SERVER_ADDRESS
      })};\n`
    ));

    let input = debugTree(new MergeTrees([tree, meta]), 'addon-test-support:input');
    let output = this.preprocessJs(input, '/', this.name, { registry: this.registry });
    return debugTree(output, 'addon-test-support:output');
  }
};
