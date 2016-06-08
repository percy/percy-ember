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
    Ember.$.ajax('/_percy/finalize_build', {method: 'POST'});
    hasFinalizedBuild = true;
  }
}

export default function(name) {
  // Avoid trying to add snapshots to an already-finalized build. This might happen when running
  // tests locally and refreshing the browser after the end of a test run. Generally, this is not
  // a problem because tests only run in CI and only once.
  if (hasFinalizedBuild) {
    return;
  }

  if (window.Testem.afterTests) {
    // Testem >= v1.6.0
    window.Testem.afterTests(finalizeBuildOnce)
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