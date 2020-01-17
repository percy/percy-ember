// The code in this module isn't ever actually run; it exists
// to exercise the type declarations and ensure that valid usage
// of the library typechecks and invalid usage produces errors.

describe('Type declarations with Mocha', function() {
  it('can snapshot using the test context', async function() {
    await percySnapshot(this.test!); // $ExpectType void
  });
});
