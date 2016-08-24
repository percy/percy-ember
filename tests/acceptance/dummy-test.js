import { test } from 'qunit';
import moduleForAcceptance from '../../tests/helpers/module-for-acceptance';

moduleForAcceptance('Acceptance | dummy');

test('visiting /', function(assert) {
  visit('/');
  andThen(function() {
    assert.equal(currentURL(), '/');
  });
  percySnapshot('dummy homepage test');
});
test('duplicate snapshots are skipped', function(assert) {
  visit('/');
  andThen(function() {
    assert.equal(currentURL(), '/');
  });
  percySnapshot('dupe test');
  // Test duplicate name (should log warning and skip this snapshot):
  percySnapshot('dupe test');
});
