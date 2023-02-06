import { module, test } from 'qunit';
import { setupApplicationTest } from 'ember-qunit';
import helpers from '@percy/sdk-utils/test/helpers';
import percySnapshot from '@percy/ember';

module('percySnapshot', hooks => {
  setupApplicationTest(hooks);

  hooks.beforeEach(async () => {
    await helpers.setupTest();
    // mock mocha env info
    window.mocha = { version: '1.2.3' };
  });

  test('disables snapshots when the healthcheck fails', async assert => {
    await helpers.test('error', '/percy/healthcheck');

    await percySnapshot('Snapshot 1');
    await percySnapshot('Snapshot 2');

    assert.contains(helpers.logger.stdout, [
      '[percy] Percy is not running, disabling snapshots'
    ]);
  });

  test('disables snapshots when the healthcheck encounters an error', async assert => {
    await helpers.test('disconnect', '/percy/healthcheck');

    await percySnapshot('Snapshot 1');
    await percySnapshot('Snapshot 2');

    assert.contains(helpers.logger.stdout, [
      '[percy] Percy is not running, disabling snapshots'
    ]);
  });

  test('posts snapshots to the local percy server', async assert => {
    await percySnapshot('Snapshot 1');
    await percySnapshot('Snapshot 2');

    let reqs = await helpers.get('requests');

    assert.equal(reqs[0].url, '/percy/healthcheck');
    assert.equal(reqs[1].url, '/percy/dom.js');
    assert.equal(reqs[2].url, '/percy/snapshot');
    assert.equal(reqs[3].url, '/percy/snapshot');

    assert.equal(reqs[2].body.name, 'Snapshot 1');
    assert.matches(reqs[2].body.url, /^http:\/\/localhost:7357/);
    assert.matches(reqs[2].body.domSnapshot.html, /<body class="ember-application"><\/body>/);
    assert.matches(reqs[2].body.clientInfo, /@percy\/ember\/\d.+/);
    assert.matches(reqs[2].body.environmentInfo[0], /ember\/.+/);
    assert.matches(reqs[2].body.environmentInfo[1], /qunit\/.+/);

    assert.equal(reqs[3].body.name, 'Snapshot 2');
  });

  test('generates a snapshot name from qunit assert', async assert => {
    await percySnapshot(assert);
    assert.equal((await helpers.get('requests'))[1].body.name, (
      'percySnapshot | generates a snapshot name from qunit assert'));
  });

  test('generates a snapshot name from mocha\'s test', async assert => {
    // mocked since this is not a mocha test
    await percySnapshot({ fullTitle: () => 'Mocha | generated name' });
    assert.equal((await helpers.get('requests'))[1].body.name, 'Mocha | generated name');
  });

  test('copies scoped attributes to the body element', async assert => {
    let $scope = document.querySelector('#ember-testing');
    $scope.classList.add('custom-classname');
    $scope.setAttribute('data-test', 'true');

    await percySnapshot('Snapshot 1');

    assert.matches((await helpers.get('requests'))[1].body.domSnapshot.html, (
      /<body class="ember-application custom-classname" data-test="true"><\/body>/));
  });

  test('handles snapshot errors', async assert => {
    await helpers.test('error', '/percy/snapshot');

    await percySnapshot('Snapshot 1');

    assert.contains(helpers.logger.stderr, [
      '[percy] Could not take DOM snapshot "Snapshot 1"'
    ]);
  });

  module('with options passed to dom serialize', hooks => {
    let $scope;

    hooks.beforeEach(() => {
      $scope = document.querySelector('#ember-testing');
      $scope.appendChild(document.createElement('canvas'));
    });

    test("serialize canvas when enableJavascript is not present", async assert => {
      await percySnapshot('Snapshot 1');
      assert.matches((await helpers.get('requests'))[1].body.domSnapshot.html, (
        /<body class="ember-application"><img src=".*" data-percy-element-id=".*" data-percy-canvas-serialized="" style="max-width: 100%;"><\/body>/));
    });

    test("doesn't serialize canvas when enableJavascript is true", async assert => {
      await percySnapshot('Snapshot 1', { enableJavaScript: true });
      assert.matches((await helpers.get('requests'))[1].body.domSnapshot.html, (
        /<body class="ember-application"><canvas data-percy-element-id=".*"><\/canvas><\/body>/));     
    });

    test("removes canvas element when dom transformation is passed", async assert => {
      await percySnapshot('Snapshot 1', {
        domTransformation: (html) => { html.querySelector('canvas')?.remove(); return html; },
        enable_javascript: true
      });
      assert.matches((await helpers.get('requests'))[1].body.domSnapshot.html, (
        /<body class="ember-application"><\/body>/));
    });
  });

  module('with an alternate ember-testing scope', hooks => {
    let $scope;

    hooks.beforeEach(() => {
      $scope = document.querySelector('#ember-testing');
      $scope.id = 'testing-container';
    });

    hooks.afterEach(() => {
      $scope.id = 'ember-testing';
    });

    test('uses the alternate scope', async assert => {
      await percySnapshot('Snapshot 1', {
        emberTestingScope: '#testing-container'
      });

      assert.matches((await helpers.get('requests'))[1].body.domSnapshot.html, (
        /<body id="testing-container" class="ember-application">/));
    });
  });
});
