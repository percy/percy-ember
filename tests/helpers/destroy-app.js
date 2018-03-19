import { run } from '@ember/runloop';

export default function destroyApp(application) {
  // Strip data attributes added by the router so they don't leak between tests.
  document.querySelector('.ember-application').removeAttribute('data-route');

  run(application, 'destroy');
}
