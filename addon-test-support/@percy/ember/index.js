import utils from '@percy/sdk-utils';
import { VERSION as emberVersion } from '@ember/version';
import { settled } from '@ember/test-helpers';
import SDKENV from '@percy/ember/env';

// Collect client and environment information
const CLIENT_INFO = `@percy/ember/${SDKENV.VERSION}`;
const ENV_INFO = [`ember/${emberVersion}`];

if (window.QUnit) ENV_INFO.push(`qunit/${window.QUnit.version}`);
if (window.mocha) ENV_INFO.push(`mocha/${window.mocha.version}`);

// Maybe set the CLI API address from the environment
utils.percy.address = SDKENV.PERCY_SERVER_ADDRESS;

// Helper to generate a snapshot name from the test suite
function generateName(assertOrTestOrName) {
  if (assertOrTestOrName.test?.module?.name && assertOrTestOrName.test?.testName) {
    // generate name from qunit assert object
    return `${assertOrTestOrName.test.module.name} | ${assertOrTestOrName.test.testName}`;
  } else if (assertOrTestOrName.fullTitle) {
    // generate name from mocha test object
    return assertOrTestOrName.fullTitle();
  } else {
    // fallback to string
    return assertOrTestOrName.toString();
  }
}

// Helper to add pseudoClassEnabledElements that are in .percy.yml file to snapshot options.
// when options.pseudoClassEnabledElements is not set in percySnapshot options
function addPseudoClassEnabledELements(options) {
  if (!options.pseudoClassEnabledElements && utils.percy?.config?.snapshot?.pseudoClassEnabledElements) {
    options.pseudoClassEnabledElements = utils.percy.config.snapshot.pseudoClassEnabledElements;
  }
}

// Helper to scope a DOM snapshot to the ember-testing container to capture the
// ember application without the testing UI
function scopeDOM(scope, dom) {
  let $scoped = dom.querySelector(scope);
  let $body = dom.querySelector('body');
  if (!$scoped) return;

  // replace body content with scoped content
  $body.replaceChildren(...$scoped.children);

  // copy scoped attributes to the body element
  for (let i = 0; i < $scoped.attributes.length; i++) {
    let { name, value } = $scoped.attributes.item(i);
    // keep any existing body class
    if (name === 'class') value = `${$body.className} ${value}`.trim();
    $body.setAttribute(name, value);
  }

  // remove #ember-testing styles by removing the id
  dom.querySelector('#ember-testing')?.removeAttribute('id');
}

export default async function percySnapshot(name, {
  // separate SDK specific options from snapshot options
  emberTestingScope = '#ember-testing',
  domTransformation,
  ...options
} = {}) {
  // Check if Percy is enabled
  if (!(await utils.isPercyEnabled())) return;
  let log = utils.logger('ember');
  name = generateName(name);

  try {
    // Inject @percy/dom
    if (!window.PercyDOM) {
      // eslint-disable-next-line no-eval
      eval(await utils.fetchPercyDOM());
    }
    // Stable reference: another percySnapshot() call (or QUnit teardown) can rebind
    // window.PercyDOM mid-flight if the caller forgot to await — capture once.
    const PercyDOM = window.PercyDOM;

    addPseudoClassEnabledELements(options);

    // Readiness gate (PER-7348). Backward-compat:
    //   - Older CLI bundles lack PercyDOM.waitForReady — typeof guard handles that.
    //   - Older @percy/sdk-utils lacks getReadinessConfig/isReadinessDisabled —
    //     typeof checks fall back to local resolution so a stale sdk-utils version
    //     never crashes snapshot capture.
    let readinessDiagnostics;
    const readinessDisabled = typeof utils.isReadinessDisabled === 'function'
      ? utils.isReadinessDisabled(options)
      : ((options?.readiness || utils.percy?.config?.snapshot?.readiness)?.preset === 'disabled');
    if (!readinessDisabled && typeof PercyDOM?.waitForReady === 'function') {
      const readinessConfig = typeof utils.getReadinessConfig === 'function'
        ? utils.getReadinessConfig(options)
        : { ...(utils.percy?.config?.snapshot?.readiness || {}), ...(options?.readiness || {}) };
      try {
        readinessDiagnostics = await PercyDOM.waitForReady(readinessConfig);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        readinessDiagnostics = { error: errMsg, proceeded: true };
        log.warn(`waitForReady failed, proceeding to serialize: ${errMsg}`);
      }
      // The CLI's waitForReady installs MutationObserver, PerformanceObservers,
      // and rAF/timeout callbacks — those microtasks can re-tick Backburner and
      // schedule a glimmer rerender right before we serialize. settled() drains
      // the runloop so we capture a frame the user would actually see painted.
      //
      // Hard timeout: settled() can hang indefinitely if the observers keep
      // firing (they're the very things we're waiting for to quiesce, but
      // settled() can't tell the difference between "still ticking" and "test
      // waiting for input"). 200ms is long enough for one paint boundary
      // without freezing the test suite.
      if (typeof settled === 'function') {
        await Promise.race([
          settled(),
          new Promise(resolve => setTimeout(resolve, 200))
        ]);
      }
    }

    // Serialize and capture the DOM
    let domSnapshot = PercyDOM.serialize({
      domTransformation: dom => scopeDOM(emberTestingScope, (
        domTransformation ? domTransformation(dom) : dom
      )),
      ...options
    });

    // Attach readiness diagnostics so the CLI can log timing and pass/fail.
    // `!== undefined` preserves legitimate falsy returns (e.g. `null` to mean
    // "gate ran, no diagnostics"). JSON.stringify probe catches future regressions
    // returning unserializable shapes (circular refs, BigInt, DOM nodes) that
    // would otherwise throw inside postSnapshot and take down the snapshot.
    if (readinessDiagnostics !== undefined) {
      try {
        JSON.stringify(readinessDiagnostics);
        domSnapshot.readiness_diagnostics = readinessDiagnostics;
      } catch (e) {
        log.warn(`dropping unserializable readiness diagnostics: ${e?.message || e}`);
      }
    }

    // Strip `readiness` before posting — it's SDK-local and the CLI already
    // has it from .percy.yml healthcheck. Avoids round-tripping config.
    // eslint-disable-next-line no-unused-vars
    const { readiness: _readiness, ...forwardOpts } = options;

    // Post the DOM to the snapshot endpoint with snapshot options and other info
    await utils.postSnapshot({
      ...forwardOpts,
      environmentInfo: ENV_INFO,
      clientInfo: CLIENT_INFO,
      url: document.URL,
      domSnapshot,
      name
    });
  } catch (error) {
    // Handle errors
    log.error(`Could not take DOM snapshot "${name}"`);
    log.error(error);
  }
}
