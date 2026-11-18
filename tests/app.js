import EmberRouter from '@ember/routing/router';
import Application from 'ember-strict-application-resolver';

class Router extends EmberRouter {
  location = 'none';
  rootURL = '/';
}

Router.map(function () {});

export default class App extends Application {
  modules = {
    './router': Router,
  };
}
