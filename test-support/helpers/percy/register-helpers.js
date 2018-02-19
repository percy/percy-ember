import Ember from 'ember';
import { percySnapshot } from 'ember-percy';
import { registerAsyncHelper } from '@ember/test';

Ember.Test.registerAsyncHelper('percySnapshot', function(app, name, options) {
  percySnapshot(name, options);
});

