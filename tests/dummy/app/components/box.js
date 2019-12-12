import Component from '@ember/component';
import layout from '../templates/components/box';
import { inject as service } from '@ember/service';

export default Component.extend({
  layout,
  router: service(),
  classNames: ['DummyBox'],

  didInsertElement() {
    document.querySelector('.ember-application').setAttribute('data-route', this.router.currentURL);
  }
});
