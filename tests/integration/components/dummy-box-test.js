import { skip, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { render, findAll, click, fillIn } from '@ember/test-helpers';
import hbs from 'htmlbars-inline-precompile';
import percySnapshot from '@percy/ember';

skip('Integration | Component | dummy box', function(hooks) {
  setupRenderingTest(hooks);

  test('it renders', async function(assert) {
    await render(hbs`{{dummy-box}}`);
    assert.equal(this.element.textContent.trim(), '');

    await render(hbs`
      {{#dummy-box}}
        This is a dummy box!
      {{/dummy-box}}
    `);
    assert.equal(this.element.textContent.trim(), 'This is a dummy box!');

    await percySnapshot('dummy box test');

    // Tests that per-snapshot breakpoints override default breakpoints.
    await percySnapshot('dummy box test on small width only', { breakpoints: ['mobile'] });
  });

  ['text', 'search', 'tel', 'url', 'email', 'password', 'number'].forEach(function(inputType) {
    test(`it snapshots input ${inputType} values`, async function(assert) {
      this.set('inputType', inputType);
      this.set('inputValue', `Testing ${inputType} input type`);

      await render(hbs`{{input value="Testing" type="inputType"}}`);

      assert.equal(findAll('input')[0].value, 'Testing', 'value property is set');
      assert.equal(findAll('input')[0].getAttribute('value'), null, 'value attribute is not set');

      await percySnapshot(`${inputType} input with value`);
    });
  });

  test('it snapshots checkbox values', async function(assert) {
    this.set('isChecked', false);
    await render(hbs`{{input type="checkbox" checked=isChecked}}`);
    assert.equal(findAll('input')[0].checked, false, 'checkbox is not checked');
    await percySnapshot('checkbox without check');

    await click('input');
    assert.equal(findAll('input')[0].checked, true, 'checkbox is checked');
    await percySnapshot('checkbox with check');
  });

  test('it snapshots radio button values', async function(assert) {
    this.set('isChecked', false);
    await render(hbs`{{input type="radio" checked=isChecked}}`);
    assert.equal(findAll('input')[0].checked, false, 'radio button is not checked');
    await percySnapshot('radio unselected');

    await click('input');
    assert.equal(findAll('input')[0].checked, true, 'radio button is checked');
    percySnapshot('radio selected');
  });

  test('it snapshots textarea values', async function(assert) {
    await render(hbs`{{textarea value="Testing"}}`);

    assert.equal(findAll('textarea')[0].value, 'Testing', 'value property is set');
    assert.equal(findAll('textarea')[0].textContent, '', 'text content is not set');

    percySnapshot('textarea with value');
  });

  test('it snapshots select values', async function(assert) {
    await render(
      hbs`<select>
            <option value="one">One</option>
            <option value="two">Two</option>
          </select>
    `
    );

    await percySnapshot('select without value');
    await fillIn('select', 'two');
    await percySnapshot('select with value');

    assert.ok(true);
  });

  test('it handles identical assets with different paths', async function(assert) {
    await render(hbs`
      {{#dummy-box}}
        This box should have two identical images below:
        <img src="/test-root-url/images/identical-image-1.png">
        <img src="/test-root-url/images/identical-image-2.png">
      {{/dummy-box}}
    `);

    await percySnapshot('dummy box test with identical assets');
    assert.ok(true);
  });
});
