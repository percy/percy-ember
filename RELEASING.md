# Releasing

1. `git checkout master`
1. `git pull origin master`
1. Update the `package.json` version
1. Update the hard coded SDK version in
   `addon-test-support/@percy/ember/index.js`
1. Commit with the verson number
1. `git push`
1. `git push --tags`
1. Ensure tests have passed on that tag
1. Draft and publish a [new release on github](https://github.com/percy/ember-percy/releases)
1. `npm publish`
