# @percy/ember
[![Version](https://img.shields.io/npm/v/@percy/ember.svg)](https://npmjs.org/package/@percy/ember)
![Test](https://github.com/percy/percy-ember/workflows/Test/badge.svg)

[Percy](https://percy.io) visual testing for Google Puppeteer.

## Installation

```sh-session
$ npm install --save-dev @percy/cli @percy/ember
```

## Usage

This is an example using the `percySnapshot` function.

```javascript
import percySnapshot from '@percy/ember';

describe('My ppp', () => {
  // ...app setup

  it('about page should look good', () => {
    await visit('/about');
    await percySnapshot('My Snapshot');
  });
});
```

Running the test above directly will result in the following logs:

```sh-session
$ ember test
...
[percy] Percy is not running, disabling snapshots
...
```

When running with [`percy
exec`](https://github.com/percy/cli/tree/master/packages/cli-exec#percy-exec), and your project's
`PERCY_TOKEN`, a new Percy build will be created and snapshots will be uploaded to your project.

```sh-session
$ export PERCY_TOKEN=[your-project-token]
$ percy exec -- ember test
[percy] Percy has started!
[percy] Created build #1: https://percy.io/[your-project]
[percy] Running "ember test"
...
[percy] Snapshot taken "My Snapshot"
...
[percy] Stopping percy...
[percy] Finalized build #1: https://percy.io/[your-project]
[percy] Done!
```

## Configuration

`percySnapshot(name[, options])`

- `name` (**required**) - The snapshot name; must be unique to each snapshot
- `options` - [See per-snapshot configuration options](https://docs.percy.io/docs/cli-configuration#per-snapshot-configuration)

### Automatic snapshot names

The `name` argument can optionally be provided as `QUnit.assert` or an instance of `Mocha.Test`
which will automatically generate a snapshot name based on the full test name.

**Important: _Snapshot names must be unique._ If you have multiple tests with the same title, or
call `percySnapshot` multiple times inside a single test, _you must provide a unique name_.**

#### QUnit

``` javascript
import { module, test } from 'qunit';
import { setupApplicationTest } from 'ember-qunit';
import { visit, currentURL } from '@ember/test-helpers';

module('Acceptance: My app', function(hooks) {
  setupApplicationTest(hooks);

  test('About page should look good', async function(assert) {
    await visit('/about');
    assert.equal(currentURL(), '/about');
    await percySnapshot(assert);
    // => Snapshot taken: "Acceptance: My app | About page should look good"
  });
});
```

#### Mocha

``` javascript
describe('Acceptance: My app', () => {
  // ...app setup

  describe('about page', () => {
    it('should look good', () => {
      await visit('/about');
      await percySnapshot(assert);
      // => Snapshot taken: "Acceptance: My app about page should look good"
    });
  });
});
```

## Upgrading

### Automatically with `@percy/migrate`

We built a tool to help automate migrating to the new CLI toolchain! Migrating
can be done by running the following commands and following the prompts:

``` shell
$ npx @percy/migrate
? Are you currently using @percy/ember? Yes
? Install @percy/cli (required to run percy)? Yes
? Migrate Percy config file? Yes
? Upgrade SDK to @percy/ember@3.0.0? Yes
```

This will automatically run the changes described below for you.

### Manually

#### Installing `@percy/cli`

If you're coming from a pre-3.0 version of this package, make sure to install `@percy/cli` after
upgrading to retain any existing scripts that reference the Percy CLI command.

```sh-session
$ npm install --save-dev @percy/cli
```

#### Migrating Config

If you have a previous Percy configuration file, migrate it to the newest version with the
[`config:migrate`](https://github.com/percy/cli/tree/master/packages/cli-config#percy-configmigrate-filepath-output) command:

```sh-session
$ percy config:migrate
```
