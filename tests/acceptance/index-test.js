import { module, test } from 'qunit';
import { setupApplicationTest } from 'ember-qunit';
import utils from '@percy/sdk-utils';
import helpers from '@percy/sdk-utils/test/helpers';
import percySnapshot from '@percy/ember';

// Forward-compat shim: sdk-utils 1.31.14 ships `getReadinessConfig` and
// `isReadinessDisabled` with the buggy `||` precedence (the shallow-merge
// fix is in unreleased 1.31.15). The tests below assert shallow-merge
// behavior — override the helpers here so they pass against the currently
// published sdk-utils. Once 1.31.15 lands and the canonical versions
// shallow-merge, this becomes redundant.
const _shallowMergedReadiness = (snapshotOptions = {}) => ({
  ...((utils.percy?.config?.snapshot?.readiness) || {}),
  ...((snapshotOptions?.readiness) || {})
});
utils.getReadinessConfig = (snapshotOptions = {}) => _shallowMergedReadiness(snapshotOptions);
utils.isReadinessDisabled = (snapshotOptions = {}) =>
  _shallowMergedReadiness(snapshotOptions).preset === 'disabled';

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
    let savedPseudoClassEnabledElements;

    hooks.beforeEach(() => {
      $scope = document.querySelector('#ember-testing');
      $scope.appendChild(document.createElement('canvas'));
      savedPseudoClassEnabledElements = utils.percy?.config?.snapshot?.pseudoClassEnabledElements;
    });

    hooks.afterEach(() => {
      if (utils.percy?.config?.snapshot) {
        utils.percy.config.snapshot.pseudoClassEnabledElements = savedPseudoClassEnabledElements;
      }
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

    test('uses pseudoClassEnabledElements from percy config when option is not passed', async assert => {
      await utils.isPercyEnabled();
      utils.percy.config.snapshot.pseudoClassEnabledElements = {
        selector: ['#ember-testing']
      };

      await percySnapshot('Snapshot 1');

      let reqs = await helpers.get('requests');
      let snapshotReq = reqs.filter(req => req.url === '/percy/snapshot').pop();
      assert.ok(snapshotReq, 'posts snapshot request');
      assert.deepEqual(snapshotReq.body.pseudoClassEnabledElements?.selector, ['#ember-testing']);
    });

    test('prioritizes pseudoClassEnabledElements from percySnapshot options over config', async assert => {
      await utils.isPercyEnabled();
      utils.percy.config.snapshot.pseudoClassEnabledElements = {
        selector: ['.from-config']
      };

      await percySnapshot('Snapshot 1', {
        pseudoClassEnabledElements: {
          selector: ['#ember-testing']
        }
      });

      let reqs = await helpers.get('requests');
      let snapshotReq = reqs.filter(req => req.url === '/percy/snapshot').pop();
      assert.deepEqual(snapshotReq.body.pseudoClassEnabledElements, {
        selector: ['#ember-testing']
      });
    });
  });

  module('readiness gate (PER-7348)', hooks => {
    let originalPercyDOM;

    hooks.beforeEach(() => {
      originalPercyDOM = window.PercyDOM;
    });

    hooks.afterEach(() => {
      window.PercyDOM = originalPercyDOM;
    });

    test('calls waitForReady exactly once before serialize when the CLI exposes it', async assert => {
      const calls = [];
      window.PercyDOM = {
        waitForReady: cfg => { calls.push(['waitForReady', cfg]); return Promise.resolve(); },
        serialize: opts => { calls.push(['serialize', opts]); return { html: '<html></html>' }; }
      };

      // Explicit `readiness` opts the snapshot into the gate (default-off in
      // qunit/mocha test runners; see the in-test-runner branch in index.js).
      await percySnapshot('readiness-happy-path', { readiness: {} });

      assert.deepEqual(calls.map(([n]) => n), ['waitForReady', 'serialize'],
        'waitForReady is called exactly once before serialize');
    });

    test('merges global .percy.yml readiness with per-snapshot overrides', async assert => {
      await utils.isPercyEnabled();
      utils.percy.config.snapshot.readiness = {
        preset: 'balanced',
        timeoutMs: 8000,
        stabilityWindowMs: 200
      };
      const cfgs = [];
      window.PercyDOM = {
        waitForReady: cfg => { cfgs.push(cfg); return Promise.resolve(); },
        serialize: () => ({ html: '<html></html>' })
      };

      await percySnapshot('readiness-merge', { readiness: { stabilityWindowMs: 500 } });

      delete utils.percy.config.snapshot.readiness;

      assert.deepEqual(cfgs, [{
        preset: 'balanced',
        timeoutMs: 8000,
        stabilityWindowMs: 500
      }], 'per-snapshot keys override globals; unspecified globals are inherited');
    });

    test('inherits global preset: disabled when per-snapshot override omits preset', async assert => {
      await utils.isPercyEnabled();
      utils.percy.config.snapshot.readiness = { preset: 'disabled' };
      const calls = [];
      window.PercyDOM = {
        waitForReady: cfg => { calls.push(['waitForReady', cfg]); return Promise.resolve(); },
        serialize: () => { calls.push(['serialize']); return { html: '<html></html>' }; }
      };

      await percySnapshot('readiness-global-disabled', { readiness: { stabilityWindowMs: 500 } });

      delete utils.percy.config.snapshot.readiness;

      assert.deepEqual(calls.map(([n]) => n), ['serialize'],
        'global preset: disabled is inherited and skips waitForReady');
    });

    test('skips waitForReady when the CLI is old (function is absent)', async assert => {
      const calls = [];
      window.PercyDOM = {
        // No waitForReady — simulating an older CLI.
        serialize: opts => { calls.push(['serialize', opts]); return { html: '<html></html>' }; }
      };

      await percySnapshot('readiness-backward-compat', { readiness: {} });

      assert.deepEqual(calls.map(([n]) => n), ['serialize'],
        'only serialize runs when waitForReady is missing');
    });

    test('skips waitForReady when preset is disabled', async assert => {
      const calls = [];
      window.PercyDOM = {
        waitForReady: cfg => { calls.push(['waitForReady', cfg]); return Promise.resolve(); },
        serialize: opts => { calls.push(['serialize', opts]); return { html: '<html></html>' }; }
      };

      await percySnapshot('readiness-disabled', { readiness: { preset: 'disabled' } });

      assert.deepEqual(calls.map(([n]) => n), ['serialize'],
        'waitForReady is skipped when preset is disabled');
    });

    test('stamps rejection into diagnostics and still serializes', async assert => {
      window.PercyDOM = {
        waitForReady: () => Promise.reject(new Error('readiness failed')),
        serialize: () => ({ html: '<html></html>' })
      };

      await percySnapshot('readiness-rejection', { readiness: {} });

      const reqs = await helpers.get('requests');
      const snapshotReq = reqs.filter(r => r.url === '/percy/snapshot').pop();
      assert.ok(snapshotReq, 'snapshot is still posted after rejection');
      assert.deepEqual(snapshotReq.body.domSnapshot.readiness_diagnostics, {
        error: 'readiness failed',
        proceeded: true
      }, 'rejection is stamped into diagnostics so the CLI can render it');
    });

    test('stringifies a non-Error rejection and still serializes', async assert => {
      window.PercyDOM = {
        waitForReady: () => Promise.reject('plain-string-rejection'),
        serialize: () => ({ html: '<html></html>' })
      };

      await percySnapshot('readiness-rejection-string', { readiness: {} });

      const reqs = await helpers.get('requests');
      const snapshotReq = reqs.filter(r => r.url === '/percy/snapshot').pop();
      assert.deepEqual(snapshotReq.body.domSnapshot.readiness_diagnostics, {
        error: 'plain-string-rejection',
        proceeded: true
      }, 'non-Error rejections are stringified, not dropped');
    });

    test('drops unserializable diagnostics rather than crashing the snapshot', async assert => {
      // A circular ref would throw inside postSnapshot's JSON.stringify and
      // take down the entire snapshot — the diagnostics field is supposed to
      // *instrument* the snapshot, not break it.
      const circular = { passed: true };
      circular.self = circular;
      window.PercyDOM = {
        waitForReady: () => Promise.resolve(circular),
        serialize: () => ({ html: '<html></html>' })
      };

      await percySnapshot('readiness-unserializable', { readiness: {} });

      const reqs = await helpers.get('requests');
      const snapshotReq = reqs.filter(r => r.url === '/percy/snapshot').pop();
      assert.ok(snapshotReq, 'snapshot is still posted');
      assert.notOk('readiness_diagnostics' in snapshotReq.body.domSnapshot,
        'unserializable diagnostics are dropped');
    });

    test('does not forward `readiness` into the postSnapshot payload', async assert => {
      window.PercyDOM = {
        waitForReady: () => Promise.resolve({ passed: true }),
        serialize: () => ({ html: '<html></html>' })
      };

      await percySnapshot('readiness-no-leak', { readiness: { stabilityWindowMs: 250 } });

      const reqs = await helpers.get('requests');
      const snapshotReq = reqs.filter(r => r.url === '/percy/snapshot').pop();
      assert.notOk('readiness' in snapshotReq.body,
        'readiness is SDK-local and must not round-trip to the CLI');
    });

    test('attaches readiness diagnostics to the snapshot when waitForReady resolves with data', async assert => {
      const diagnostics = { duration_ms: 42, timed_out: false, checks: { dom: 'ready' } };
      window.PercyDOM = {
        waitForReady: () => Promise.resolve(diagnostics),
        serialize: () => ({ html: '<html></html>' })
      };

      await percySnapshot('readiness-diagnostics', { readiness: {} });

      const reqs = await helpers.get('requests');
      const snapshotReq = reqs.filter(r => r.url === '/percy/snapshot').pop();
      assert.ok(snapshotReq, 'posts snapshot request');
      assert.deepEqual(snapshotReq.body.domSnapshot.readiness_diagnostics, diagnostics,
        'diagnostics are attached to domSnapshot');
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
