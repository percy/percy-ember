import Ember from 'ember';
import percySnapshot from './snapshot';

export default Ember.Test.registerAsyncHelper('percySnapshot', function(app, name) {
  console.log('[percy] Snapshotting:', name);
  percySnapshot(name);
});
