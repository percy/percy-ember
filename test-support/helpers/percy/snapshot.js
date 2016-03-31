import Ember from 'ember';

function getDoctype() {
  let doctypeNode = document.doctype;
  let doctype = "<!DOCTYPE "
    + doctypeNode.name
    + (doctypeNode.publicId ? ' PUBLIC "' + doctypeNode.publicId + '"' : '')
    + (!doctypeNode.publicId && doctypeNode.systemId ? ' SYSTEM' : '')
    + (doctypeNode.systemId ? ' "' + doctypeNode.systemId + '"' : '')
    + '>';
  return doctype;
}

export default function(name) {
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