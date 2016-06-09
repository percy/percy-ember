# ember-percy

[![Package Status](https://img.shields.io/npm/v/ember-percy.svg)](https://www.npmjs.com/package/ember-percy)

(work in progress)

Percy addon for Ember apps.

## Installation

* `ember install ember-percy`
* Set up the `PERCY_TOKEN` and `PERCY_REPO_SLUG` environment variables in your CI settings.
* Add `import '../helpers/percy/register-helpers';` to your `module-for-acceptance.js` to register helpers.
* Use the `percySnapshot('homepage')` async helper in acceptance tests.
  * With mocha, you can do `percySnapshot(this.test.fullTitle());` to autogenerate the name arg.

## Contributing

1. Fork it ( https://github.com/percy/ember-percy/fork )
2. Create your feature branch (`git checkout -b my-new-feature`)
3. Commit your changes (`git commit -am 'Add some feature'`)
4. Push to the branch (`git push origin my-new-feature`)
5. Create a new Pull Request

Throw a ★ on it! :)

### Running Tests

* `npm test` (Runs `ember try:testall` to test your addon against multiple Ember versions)
* `ember test`
* `ember test --server`
