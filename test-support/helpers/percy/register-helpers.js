import { percySnapshot } from 'ember-percy';
import { registerAsyncHelper } from '@ember/test';

registerAsyncHelper('percySnapshot', function(app, name, options) {
  percySnapshot(name, options);
});

