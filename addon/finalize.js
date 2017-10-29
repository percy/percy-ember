import ajax from 'ember-fetch/ajax';

// See: https://github.com/github/fetch/issues/175#issuecomment-125779262
function responseTimeout(ms, promise) {
  return new Promise(function(resolve, reject) {
    setTimeout(function() {
      reject(new Error("Response timeout"))
    }, ms)
    promise.then(resolve, reject)
  })
}

// Percy finalizer to be called at the very end of the test suite.
// Note: it is important that this is called always, no matter if percySnapshot was used or not,
// to support parallelized test runners with Percy's aggregation of parallel finalize calls.
function finalizeBuildOnce(config, data, callback) {
  return responseTimeout(30000, ajax('/_percy/finalize_build', {
    method: 'POST'
  })).then(function() {
    if (callback) {
      return callback();
    }
  })
}

// When imported into test-body-footer, register Testem hook to know when all tests are finished.
export default function() {
  if (window.Testem.afterTests) {
    window.Testem.afterTests(finalizeBuildOnce);
  } else {
    // Testem < v1.6.0.
    window.Testem.on('all-test-results', finalizeBuildOnce);
  }
}
