import Ember from 'ember';

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

function finalizeBuildOnce() {
  // Use "async: false" to block the browser from shutting down until the finalize_build call
  // has fully returned. This prevents testem from shutting down the express server until
  // our middleware has finished uploading resources and resolving promises.
  Ember.$.ajax('/_percy/finalize_build', {method: 'POST', async: false, timeout: 30000});
}

let hasRegisteredFinalizer = false;
export function percySnapshot(name, options) {
  let snaphotHtml;
  options = options || {};
  let scope = options.scope;

  // On the first call to percySnapshot, register a Testem hook to know when all tests are finished.
  if (!hasRegisteredFinalizer) {
    hasRegisteredFinalizer = true;
    if (window.Testem.afterTests) {
      // Testem >= v1.6.0. (We should just use afterTests, but it does not work as expected).
      window.Testem.on('after-tests-complete', finalizeBuildOnce);
    } else {
      // Testem < v1.6.0.
      window.Testem.on('all-test-results', finalizeBuildOnce);
    }
  }

  // Create a full-page DOM snapshot from the current testing page.
  // TODO(fotinakis): more memory-efficient way to do this?
  let domCopy = Ember.$('html').clone();
  let testingContainer = domCopy.find('#ember-testing-container');

  if (scope) {
    snaphotHtml = Ember.$('#ember-testing-container').find(scope).html();
  } else {
    snaphotHtml = testingContainer.html();
  }

  // Hoist the testing container contents up to the body.
  // We need to use the original DOM to keep the head stylesheet around.
  domCopy.find('body').html(snaphotHtml);

  Ember.run(function() {
    Ember.$.ajax('/_percy/snapshot', {
      method: 'POST',
      contentType: 'application/json; charset=utf-8',
      data: JSON.stringify({
        name: name,
        content: getDoctype() + domCopy[0].outerHTML,
      }),
    });
  });
}