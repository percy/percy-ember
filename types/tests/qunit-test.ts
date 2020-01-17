// The code in this module isn't ever actually run; it exists
// to exercise the type declarations and ensure that valid usage
// of the library typechecks and invalid usage produces errors.

import { module, test } from 'qunit';
import { percySnapshot } from '@percy/ember';

module('Type declarations with QUnit', function() {
  test('snapshot requires at least one param', async function() {
    await percySnapshot(); // $ExpectError
  });

  test('can snapshot with a string name', async function() {
    await percySnapshot('A snapshot'); // $ExpectType void
  });

  test('can snapshot using the test context', async function(assert) {
    await percySnapshot(assert); // $ExpectType void
  });

  test('cannot snapshot with an arbitrary object', async function() {
    await percySnapshot({}); // $ExpectError
  });

  test('can snapshot with a defined scope', async function(assert) {
    await percySnapshot(assert, { scope: '#foo' }); // $ExpectType void
  });
});
