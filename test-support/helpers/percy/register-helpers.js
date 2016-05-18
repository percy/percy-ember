import Ember from 'ember';
import percySnapshot from './snapshot';
import percyFinalizeBuild from './finalize';

Ember.Test.registerAsyncHelper('percySnapshot', function(app, name) {
  percySnapshot(name);
});

Ember.Test.registerAsyncHelper('percyFinalizeBuild', function(app) {
  percyFinalizeBuild();
});
