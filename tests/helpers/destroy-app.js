import { run } from '@ember/runloop';
import $ from 'jquery';

export default function destroyApp(application) {
  // Strip data attributes added by the router so they don't leak between tests.
  $('.ember-application').attr('data-route', null);

  run(application, 'destroy');
}
