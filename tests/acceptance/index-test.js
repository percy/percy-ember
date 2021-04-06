import { module, test } from 'qunit';
import { setupApplicationTest } from 'ember-qunit';
import helpers from '@percy/sdk-utils/test/client';
import percySnapshot from '@percy/ember';

module('percySnapshot', hooks => {
  setupApplicationTest(hooks);

  hooks.beforeEach(async () => {
    await helpers.setup();
    // mock mocha env info
    window.mocha = { version: '1.2.3' };
  });

  hooks.afterEach(async () => {
    await helpers.teardown();
  });

  test('disables snapshots when the healthcheck fails', async assert => {
    await helpers.testFailure('/percy/healthcheck');

    await percySnapshot('Snapshot 1');
    await percySnapshot('Snapshot 2');

    assert.deepEqual(await helpers.getRequests(), [
      ['/percy/healthcheck']
    ]);

    assert.deepEqual(helpers.logger.stderr, []);
    assert.deepEqual(helpers.logger.stdout, [
      '[percy] Percy is not running, disabling snapshots'
    ]);
  });

  test('disables snapshots when the healthcheck encounters an error', async assert => {
    await helpers.testError('/percy/healthcheck');

    await percySnapshot('Snapshot 1');
    await percySnapshot('Snapshot 2');

    assert.deepEqual(await helpers.getRequests(), [
      ['/percy/healthcheck']
    ]);

    assert.deepEqual(helpers.logger.stderr, []);
    assert.deepEqual(helpers.logger.stdout, [
      '[percy] Percy is not running, disabling snapshots'
    ]);
  });

  test('posts snapshots to the local percy server', async assert => {
    await percySnapshot('Snapshot 1');
    await percySnapshot('Snapshot 2');

    let reqs = await helpers.getRequests();

    assert.equal(reqs[0][0], '/percy/healthcheck');
    assert.equal(reqs[1][0], '/percy/dom.js');
    assert.equal(reqs[2][0], '/percy/snapshot');
    assert.equal(reqs[3][0], '/percy/snapshot');

    assert.equal(reqs[2][1].name, 'Snapshot 1');
    assert.matches(reqs[2][1].url, /^http:\/\/localhost:7357/);
    assert.matches(reqs[2][1].domSnapshot, /<body class="ember-application"><\/body>/);
    assert.matches(reqs[2][1].clientInfo, /@percy\/ember\/.+/);
    assert.matches(reqs[2][1].environmentInfo[0], /ember\/.+/);
    assert.matches(reqs[2][1].environmentInfo[1], /qunit\/.+/);

    assert.equal(reqs[3][1].name, 'Snapshot 2');
  });

  test('generates a snapshot name from qunit assert', async assert => {
    await percySnapshot(assert);
    assert.equal((await helpers.getRequests())[1][1].name, (
      'percySnapshot | generates a snapshot name from qunit assert'));
  });

  test('generates a snapshot name from mocha\'s test', async assert => {
    // mocked since this is not a mocha test
    await percySnapshot({ fullTitle: () => 'Mocha | generated name' });
    assert.equal((await helpers.getRequests())[1][1].name, 'Mocha | generated name');
  });

  test('copies scoped attributes to the body element', async assert => {
    let $scope = document.querySelector('#ember-testing');
    $scope.classList.add('custom-classname');
    $scope.setAttribute('data-test', 'true');

    await percySnapshot('Snapshot 1');

    assert.matches((await helpers.getRequests())[1][1].domSnapshot, (
      /<body class="ember-application custom-classname" data-test="true"><\/body>/));
  });

  test('handles snapshot errors', async assert => {
    await helpers.testFailure('/percy/snapshot', 'testing');

    await percySnapshot('Snapshot 1');

    assert.deepEqual(helpers.logger.stdout, []);
    assert.deepEqual(helpers.logger.stderr[0], '[percy] Could not take DOM snapshot "Snapshot 1"');
    assert.matches(helpers.logger.stderr[1], /^\[percy] Error: testing/);
  });
});
