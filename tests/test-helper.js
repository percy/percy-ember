import QUnit from 'qunit';
import Application from 'dummy/app';
import config from 'dummy/config/environment';
import { setApplication } from '@ember/test-helpers';
import { start } from 'ember-qunit';

QUnit.assert.matches = function matches(actual, regex, message) {
  var result = !!regex && !!actual && (new RegExp(regex)).test(actual);
  var expected = `String matching ${regex.toString()}`;
  this.pushResult({ result, actual, expected, message });
};

QUnit.assert.contains = function matches(actual, subset, message) {
  var result = !!actual && !!subset && subset.every(i => actual.includes(i));
  var expected = `Array containing [${subset.join(', ')}]`;
  this.pushResult({ result, actual, expected, message });
};

setApplication(Application.create(config.APP));
start({ setupEmberOnerrorValidation: false });
