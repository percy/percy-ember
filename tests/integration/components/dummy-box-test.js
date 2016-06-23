import { moduleForComponent, test } from 'ember-qunit';
import hbs from 'htmlbars-inline-precompile';
import { percySnapshot } from 'ember-percy';

moduleForComponent('dummy-box', 'Integration | Component | dummy box', {
  integration: true
});

test('it renders', function(assert) {
  this.render(hbs`{{dummy-box}}`);
  assert.equal(this.$().text().trim(), '');

  this.render(hbs`
    {{#dummy-box}}
      This is a dummy box!
    {{/dummy-box}}
  `);
  assert.equal(this.$().text().trim(), 'This is a dummy box!');

  percySnapshot('dummy box test');

  // Tests that per-snapshot widths override default widths.
  percySnapshot('dummy box test on small width only', {widths: [375]});
});
