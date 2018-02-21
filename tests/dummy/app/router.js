import $ from 'jquery';
import { on } from '@ember/object/evented';
import EmberRouter from '@ember/routing/router';
import config from './config/environment';

const Router = EmberRouter.extend({
  location: config.locationType,
  rootURL: config.rootURL,

  addDataRoute: on('didTransition', function() {
    $('.ember-application').attr('data-route', this.currentRouteName);
  }),
});

Router.map(function() {
  this.route('test-route-styles');
});

export default Router;
