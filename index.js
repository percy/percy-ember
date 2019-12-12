'use strict';

const BroccoliDebug = require('broccoli-debug');
const debugTree = BroccoliDebug.buildDebugCallback('@percy/ember');

module.exports = {
  name: require('./package').name,
  // Inspired by `@ember/test-helpers`:
  // https://github.com/emberjs/ember-test-helpers/blob/master/index.js#L28-L57
  treeForAddonTestSupport(tree) {
    // intentionally not calling _super here (TODO, check?)
    let input = debugTree(tree, 'addon-test-support:input');
    let output = this.preprocessJs(input, '/', this.name, {
      registry: this.registry
    });

    return debugTree(output, 'addon-test-support:output');
  }
};
