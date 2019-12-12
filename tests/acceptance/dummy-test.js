import { currentURL, visit } from '@ember/test-helpers';
import { module, test } from 'qunit';
import { setupApplicationTest } from 'ember-qunit';
import percySnapshot from '@percy/ember';

module('Acceptance | dummy', function(hooks) {
  setupApplicationTest(hooks);

  test('visiting /', async function(assert) {
    await visit('/');
    assert.equal(currentURL(), '/');
    await percySnapshot('dummy homepage test');
  });

  test('duplicate snapshots are skipped', async function(assert) {
    await visit('/');
    assert.equal(currentURL(), '/');
    await percySnapshot('dupe test');
    // Test duplicate name (should log warning and skip this snapshot):
    await percySnapshot('dupe test');
  });

  test('enableJavaScript option can pass through', async function(assert) {
    await visit('/');
    assert.equal(currentURL(), '/');
    await percySnapshot('enableJavaScript', { enableJavaScript: true });
  });

  test('attributes on rootElement are copied to the DOM snapshot', async function(assert) {
    await visit('/test-route-styles');
    assert.equal(currentURL(), '/test-route-styles');
    await percySnapshot('Copied attirbutes');
  });

  test('class on body that turns it green is preserved the DOM snapshot', async function(assert) {
    await visit('/');
    // find's default scope is the testing container, so be sure to rescope to html
    let body = document.querySelector('body');
    body.setAttribute('class', 'AllGreen');
    assert.equal(currentURL(), '/');
    await percySnapshot('body class preserved');

    // Remove AllGreen so it doesn't impact other tests
    assert.equal(body.getAttribute('class').includes('AllGreen'), true);
    body.removeAttribute('class');
  });
});
