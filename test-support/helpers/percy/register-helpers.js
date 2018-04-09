import { percySnapshot } from 'ember-percy';
import Ember from 'ember';

Ember.Test.registerAsyncHelper('percySnapshot', function(app, name, options) {
  percySnapshot(name, options);
});

