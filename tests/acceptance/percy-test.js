import { module, test } from 'qunit';
import { visit } from '@ember/test-helpers';
import { setupApplicationTest } from 'ember-qunit';
import percySnapshot from '@percy/ember';

module('Acceptance | percy', function(hooks) {
  setupApplicationTest(hooks);

  test('visiting ', async function(assert) {
    await visit('/');
    await percySnapshot(assert);
    await percySnapshot('Name 1');
    await percySnapshot('Name 2');
    assert.ok(true);
  });
});
