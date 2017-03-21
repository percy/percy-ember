import Ember from 'ember';
import { getNativeXhr } from './native-xhr';
import { maybeDisableMockjax, maybeResetMockjax } from './mockjax-wrapper';

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

  let snapshotHtml;
  options = options || {};
  let scope = options.scope;

  // Create a full-page DOM snapshot from the current testing page.
  // TODO(fotinakis): more memory-efficient way to do this?
  let domCopy = Ember.$('html').clone();
  let testingContainer = domCopy.find('#ember-testing');

  if (scope) {
    snapshotHtml = Ember.$('#ember-testing').find(scope).html();
  } else {
    snapshotHtml = testingContainer.html();
  }

  // Hoist the testing container contents up to the body.
  // We need to use the original DOM to keep the head stylesheet around.
  domCopy.find('body').html(snapshotHtml);

  Ember.run(function() {
    maybeDisableMockjax();
    Ember.$.ajax('/_percy/snapshot', {
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
