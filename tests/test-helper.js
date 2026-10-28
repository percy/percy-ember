import { setApplication } from '@ember/test-helpers';
import { setTesting } from '@embroider/macros';
import { setupEmberOnerrorValidation, start as qunitStart } from 'ember-qunit';
import QUnit from 'qunit';
import { setup } from 'qunit-dom';

import Application from './app.js';

export function start() {
  setTesting(true);
  setApplication(
    Application.create({
      autoboot: false,
      rootElement: '#ember-testing',
    }),
  );

  setup(QUnit.assert);
  setupEmberOnerrorValidation();
  qunitStart();
}
