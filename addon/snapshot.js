import { run } from '@ember/runloop';
import percyJQuery from 'percy-jquery';
import { getNativeXhr } from './native-xhr';
import {
  maybeDisableMockjax,
  maybeResetMockjax
} from './mockjax-wrapper';

function getDoctype() {
  let doctypeNode = document.doctype;
  if (!doctypeNode || !doctypeNode.name) {
    return '<!DOCTYPE html>';
  }
  let doctype = "<!DOCTYPE " +
    doctypeNode.name +
    (doctypeNode.publicId ? ' PUBLIC "' + doctypeNode.publicId + '"' : '') +
    (!doctypeNode.publicId && doctypeNode.systemId ? ' SYSTEM' : '') +
    (doctypeNode.systemId ? ' "' + doctypeNode.systemId + '"' : '') +
    '>';
  return doctype;
}

const FORM_ELEMENTS_SELECTOR = 'input, textarea, select';

function mutateOriginalDOM(dom) {
  function createUID($el) {
    const ID = `_${Math.random().toString(36).substr(2, 9)}`;

    $el.setAttribute('data-percy-element-id', ID)
  }

  let formNodes = dom.querySelectorAll(FORM_ELEMENTS_SELECTOR)
  let formElements = Array.from(formNodes);

  // loop through each form element and apply an ID for serialization later
  formElements.forEach((elem) => {
    if (!elem.getAttribute('data-percy-element-id')) {
      createUID(elem)
    }
  })
}

// Set the property value into the attribute value for snapshotting inputs
function setAttributeValues(originalDOM, clonedDOM) {
  let formNodes = originalDOM.querySelectorAll(FORM_ELEMENTS_SELECTOR)
  let formElements = Array.from(formNodes);

  formElements.forEach(elem => {
    let inputId = elem.getAttribute('data-percy-element-id')
    let selector = `[data-percy-element-id="${inputId}"]`;
    let cloneEl = clonedDOM.querySelector(selector)

    if(!cloneEl) return;

    switch (elem.type) {
      case 'checkbox':
      case 'radio':
        if (elem.checked) {
          cloneEl.setAttribute('checked', '')
        }
        break
      case 'select-one':
        if (elem.selectedIndex !== -1) {
          cloneEl.options[elem.selectedIndex].setAttribute('selected', 'true');
        }
        break
      case 'select-multiple':
        let selectedOptions = Array.from(elem.selectedOptions); // eslint-disable-line
        let clonedOptions = Array.from(cloneEl.options); // eslint-disable-line

        if (selectedOptions.length) {
          selectedOptions.forEach((option) => {
            const matchingOption = clonedOptions.find((cloneOption) => option.text === cloneOption.text)
            matchingOption.setAttribute('selected', 'true')
          })
        }

        break
      case 'textarea':
        // setting text or value does not work but innerHTML does
        cloneEl.innerHTML = elem.value
        break
      default:
        cloneEl.setAttribute('value', elem.value)
    }
  })
}

// Copy attributes from Ember's rootElement to the DOM snapshot <body> tag. Some applications rely
// on setting attributes on the Ember rootElement (for example, to drive dynamic per-route
// styling). In tests these attributes are added to the #ember-testing container and would be lost
// in the DOM hoisting, so we copy them to the to the snapshot's <body> tag to
// make sure that they persist in the DOM snapshot.
function copyAttributesToBodyCopy(bodyCopy, testingContainer) {
  let attributesToCopy = testingContainer.prop('attributes');
  percyJQuery.each(attributesToCopy, function() {
    // Special case for the class attribute - append new classes onto existing body classes
    if (this.name === 'class') {
      bodyCopy.attr(this.name, bodyCopy.attr('class') + ' ' + this.value);
    } else {
      bodyCopy.attr(this.name, this.value);
    }
  });
}


export function percySnapshot(name, options) {
  // Skip if Testem is not available (we're probably running from `ember server` and Percy is not
  // enabled anyway).
  if (!window.Testem) {
    return;
  }

  // Automatic name generation for QUnit tests by passing in the `assert` object.
  if (name.test && name.test.module && name.test.module.name && name.test.testName) {
    name = `${name.test.module.name} | ${name.test.testName}`;
  } else if (name.fullTitle) {
    // Automatic name generation for Mocha tests by passing in the `this.test` object.
    name = name.fullTitle();
  }

  let snapshotRoot;
  options = options || {};
  let scope = options.scope;

  // Create a full-page DOM snapshot from the current testing page.
  let dom = percyJQuery('html');
  mutateOriginalDOM(dom[0]);
  let domCopy = dom.clone();
  let bodyCopy = domCopy.find('body');
  let testingContainer = domCopy.find('#ember-testing');

  copyAttributesToBodyCopy(bodyCopy, testingContainer);

  if (scope) {
    snapshotRoot = testingContainer.find(scope);
  } else {
    snapshotRoot = testingContainer;
  }

  // Pass the actual DOM nodes, not the jquery object
  setAttributeValues(dom[0], snapshotRoot[0]);

  let snapshotHtml = snapshotRoot.html();

  // Hoist the testing container contents up to the body.
  // We need to use the original DOM to keep the head stylesheet around.
  bodyCopy.html(snapshotHtml);

  run(function() {
    maybeDisableMockjax();
    percyJQuery.ajax('/_percy/snapshot', {
      xhr: getNativeXhr,
      method: 'POST',
      contentType: 'application/json; charset=utf-8',
      data: JSON.stringify({
        name: name,
        content: getDoctype() + domCopy[0].outerHTML,
        widths: options.widths,
        breakpoints: options.breakpoints,
        enableJavaScript: options.enableJavaScript,
      }),
      statusCode: {
        400: function(jqXHR) {
          // Bubble up 400 errors, ie. when given options are invalid.
          throw jqXHR.responseText;
        },
      }
    });
    maybeResetMockjax();
  });
}
