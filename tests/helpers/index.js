import utils from '@percy/sdk-utils';
import helpers from '@percy/sdk-utils/test/helpers';
import QUnit from 'qunit';

export function setupPercyEmberTest(hooks) {
  utils.percy.address = 'http://localhost:5338';

  if (typeof window !== 'undefined') {
    // Make @percy/sdk-utils globally available for the test helpers
    window.PercySDKUtils = utils;
  }

  QUnit.assert.matches = function matches(actual, regex, message) {
    var result = !!regex && !!actual && new RegExp(regex).test(actual);
    var expected = `String matching ${regex.toString()}`;
    this.pushResult({ result, actual, expected, message });
  };

  QUnit.assert.contains = function matches(actual, subset, message) {
    var result =
      !!actual && !!subset && subset.every((i) => actual.includes(i));
    var expected = `Array containing [${subset.join(', ')}]`;
    this.pushResult({ result, actual, expected, message });
  };

  hooks.beforeEach(async function () {
    await helpers.setupTest();

    // mock mocha env info
    window.mocha = { version: '1.2.3' };
  });
}
