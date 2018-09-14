# Releasing

1. check that you are using the percy-admin npm account: `npm whoami`
1. If you are not, sign out and sign as percy-admin
1. `git checkout master`
1. `git pull origin master`
1. `git checkout -b x.x.x`
1. `npm version x.x.x`
1. `git push`
1. `git push --tags`
1. Ensure tests have passed on that branch
1. Open up a pull request titled with the new version number
1. Merge approved pull request
1. Draft and publish a [new release on github](https://github.com/percy/ember-percy/releases)
1. `npm publish`
1. [Visit NPM](https://www.npmjs.com/package/ember-percy) and see that your version is now live.
1. Update [percy-web](https://github.com/percy/percy-web) to use the new version.
