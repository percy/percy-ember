import Ember from 'ember';
import percySnapshot from './snapshot';

Ember.Test.registerAsyncHelper('percySnapshot', function(app, name) {
  percySnapshot(name);
});

