import utils from '@percy/sdk-utils';
import { VERSION as emberVersion } from '@ember/version';
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

// Helper to scope a DOM snapshot to the ember-testing container
function scopeDOM(dom, { scope, domTransformation }) {
  if (domTransformation) domTransformation(dom);
  // we only want to capture the ember application, not the testing UI
  let $scoped = dom.querySelector(scope || '#ember-testing');
  let $body = dom.querySelector('body');
  if (!$scoped) return;

  // replace body content with scoped content
  $body.innerHTML = $scoped.innerHTML;

  // copy scoped attributes to the body element
  for (let i = 0; i < $scoped.attributes.length; i++) {
    let { name, value } = $scoped.attributes.item(i);
    // keep any existing body class
    if (name === 'class') value = `${$body.className} ${value}`.trim();
    $body.setAttribute(name, value);
  }

  // remove ember-testing styles by removing the id
  dom.querySelector('#ember-testing').removeAttribute('id');
}

export default async function percySnapshot(name, options = {}) {
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

    // Serialize and capture the DOM
    let domSnapshot = window.PercyDOM.serialize({
      enableJavaScript: options.enableJavaScript,
      domTransformation: dom => scopeDOM(dom, options)
    });

    // Post the DOM to the snapshot endpoint with snapshot options and other info
    await utils.postSnapshot({
      ...options,
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
