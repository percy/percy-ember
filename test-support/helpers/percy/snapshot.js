import Ember from 'ember';

function getDoctype() {
  let doctypeNode = document.doctype;
  if (!doctypeNode || !doctypeNode.name) {
    return '<!DOCTYPE html>'
  }
  let doctype = "<!DOCTYPE "
    + doctypeNode.name
    + (doctypeNode.publicId ? ' PUBLIC "' + doctypeNode.publicId + '"' : '')
    + (!doctypeNode.publicId && doctypeNode.systemId ? ' SYSTEM' : '')
    + (doctypeNode.systemId ? ' "' + doctypeNode.systemId + '"' : '')
    + '>';
  return doctype;
}

let hasFinalizedBuild = false;
function finalizeBuildOnce() {
  // The Testem after tests hook fires many times, so we flag and only do it once.
  if (!hasFinalizedBuild) {
    hasFinalizedBuild = true;
    // Use "async: false" to block the browser from shutting down until the finalize_build call
    // has fully returned. This prevents testem from shutting down the express server until
    // our middleware has finished uploading resources and resolving promises.
    Ember.$.ajax('/_percy/finalize_build', {method: 'POST', async: false, timeout: 30000});
  }
}

export default function(name) {
  if (window.Testem.afterTests) {
    // Testem >= v1.6.0. Technically we should just use afterTests, but it is such broken much wow.
    window.Testem.on('after-tests-complete', finalizeBuildOnce);
  } else {
    // Testem < v1.6.0.
    window.Testem.on('all-test-results', finalizeBuildOnce);
  }
  // Create a full-page DOM snapshot from the current testing page.
  // TODO(fotinakis): more memory-efficient way to do this?
  let domCopy = Ember.$('html').clone();
  // TODO(fotinakis): this is Mocha specific, need to support other testing frameworks.
  let html = domCopy.find('#ember-testing-container').html();
  // Hoist the testing container contents up to the body.
  domCopy.find('body').html(html);

  Ember.$.ajax('/_percy/snapshot', {
    method: 'POST',
    contentType: 'application/json; charset=utf-8',
    data: JSON.stringify({
      name: name,
      content: getDoctype() + domCopy[0].outerHTML,
    }),
  });
}