let isPercyRunning = true;
let agentJS;
// Capture fetch before it's mutated by Pretender
let PercyFetch = window.fetch;

async function fetchDOMLib() {
  if (agentJS) return agentJS;

  try {
    return await PercyFetch('http://localhost:5338/percy-agent.js').then(res => res.text());
  } catch (err) {
    console.log(`[percy] Error fetching DOM library, disabling: ${err}`);
    isPercyRunning = false;
  }
}

function envInfo() {
  function frameworkVersion() {
    if (window.QUnit) {
      return `qunit/${window.QUnit.version}`;
    } else if (window.Mocha) {
      // Doesn't look easy to grab the version while in the browser
      return `mocha/unknown`;
    }

    return 'unknown';
  }

  return `ember/${window.Ember.VERSION}; ${frameworkVersion()};`;
}

function clientInfo() {
  return `@percy/ember@v2.0.0`;
}

// This will only remove the transform applied by Ember's defaults
// If there are custom styles applied, use Percy CSS to overwrite
function removeEmberTestStyles(dom) {
  dom
    .querySelector('#ember-testing')
    .setAttribute(
      'style',
      [
        'width: initial !important',
        'height: initial !important',
        'transform: initial !important',
        'zoom: initial !important'
      ].join('; ')
    );
}

function autoGenerateName(name) {
  // Automatic name generation for QUnit tests by passing in the `assert` object.
  if (name.test && name.test.module && name.test.module.name && name.test.testName) {
    return `${name.test.module.name} | ${name.test.testName}`;
  } else if (name.fullTitle) {
    // Automatic name generation for Mocha tests by passing in the `this.test` object.
    return name.fullTitle();
  } else {
    return name;
  }
}

export default async function percySnapshot(name, options = {}) {
  // Skip if Testem is not available (we're probably running from `ember server` and Percy is not
  // enabled anyway).
  if (!window.Testem) {
    return;
  }

  if (!isPercyRunning) {
    return false;
  }

  // cache the JS lib
  agentJS = await fetchDOMLib();
  if (!agentJS) return;

  let scopedSelector = options.scope || '#ember-testing';
  let $script = document.querySelector('.percy-agent-js');

  if (!$script) {
    $script = document.createElement('script');
    $script.classList.add('percy-agent-js');
    $script.innerText = agentJS;
    document.body.appendChild($script);
  }

  // This takes the embeded Ember apps DOM and hoists it
  // up and out of the test output UI. Without this Percy
  // would capture the Ember test output too
  function hoistAppDom(dom) {
    let $scopedRoot = dom.querySelector(scopedSelector);
    let $body = dom.querySelector('body');
    let bodyClass = $body.getAttribute('class') || '';

    $body.innerHTML = $scopedRoot.innerHTML;

    // Copy over the attributes from the ember applications root node
    for (let i = 0; i < $scopedRoot.attributes.length; i++) {
      let attr = $scopedRoot.attributes.item(i);
      // Merge the two class lists
      if (attr.nodeName === 'class') {
        $body.setAttribute('class', `${bodyClass} ${attr.nodeValue}`);
      } else {
        $body.setAttribute(attr.nodeName, attr.nodeValue);
      }
    }

    removeEmberTestStyles(dom);
    return dom;
  }

  let domSnapshot = new window.PercyAgent({
    handleAgentCommunication: false,
    // We only want to capture the ember application, not the testing UI
    domTransformation: function(clonedDom) {
      if (options.domTransformation) {
        options.domTransformation(clonedDom);
      }

      return hoistAppDom(clonedDom);
    }
  }).domSnapshot(document, options);

  // Must be awaited on or you run the risk of doing asset discovery
  // when the ember server has already shut down
  await PercyFetch('http://localhost:5338/percy/snapshot', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      clientInfo: clientInfo(),
      environmentInfo: envInfo(),
      url: document.URL,
      domSnapshot,
      name: autoGenerateName(name),
      ...options
    })
  }).catch(err => {
    if (isPercyRunning) {
      console.log(`[percy] Error POSTing DOM, disabling: ${err}`);
      isPercyRunning = false;
    }
  });
}
