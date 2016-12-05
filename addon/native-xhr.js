export function getNativeXhr() {
  return new window._percyNativeXhr();
}

// When imported into test-body-footer, grab a reference to the native XHR object so we can avoid
// common ajax hijackers like mirage/pretender.
export default function() {
  window._percyNativeXhr = window.XMLHttpRequest;
}
