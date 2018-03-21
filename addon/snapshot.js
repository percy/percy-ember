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

// Set the property value into the attribute value for snapshotting inputs
function setAttributeValues(dom) {
  // List of input types here https://www.w3.org/TR/html5/forms.html#the-input-element

  // Limit scope to inputs only as textareas do not retain their value when cloned
  let elems = dom.find(
    `input[type=text], input[type=search], input[type=tel], input[type=url], input[type=email],
     input[type=password], input[type=number], input[type=checkbox], input[type=radio]`
  );

  percyJQuery(elems).each(function() {
    let elem = percyJQuery(this);
    switch(elem.attr('type')) {
      case 'checkbox':
      case 'radio':
        if (elem.is(':checked')) {
          elem.attr('checked', '');
        }
        break;
      default:
        elem.attr('value', elem.val());
    }
  });

  return dom;
}

// jQuery clone() does not copy textarea contents, so we explicitly do it here.
function setTextareaContent(dom) {
  dom.find('textarea').each(function() {
    let elem = percyJQuery(this);
    elem.text(elem.val());
  });

  return dom;
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
  let domCopy = percyJQuery('html').clone();
  let bodyCopy = domCopy.find('body');
  let testingContainer = domCopy.find('#ember-testing');

  copyAttributesToBodyCopy(bodyCopy, testingContainer);

  if (scope) {
    snapshotRoot = testingContainer.find(scope);
  } else {
    snapshotRoot = testingContainer;
  }

  snapshotRoot = setAttributeValues(snapshotRoot);
  snapshotRoot = setTextareaContent(snapshotRoot);

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
