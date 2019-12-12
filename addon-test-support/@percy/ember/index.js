let isPercyRunning = true;

function envInfo() {
  return `ember`;
}

function clientInfo() {
  return `@percy/ember/v2.0.0`;
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

  async function fetchDOMLib() {
    try {
      return await fetch('http://localhost:5338/percy-agent.js').then(res => res.text());
    } catch (err) {
      console.log(`[percy] Error fetching DOM library, disabling: ${err}`);
      isPercyRunning = false;
      return '';
    }
  }

  function captureDOM() {
    // We only want to capture the ember application, not the testing UI
    let scopedSelector = options.scope || '#ember-testing';
    let script = document.createElement('script');
    script.innerText = agentJS;
    document.body.appendChild(script);

    return new window.PercyAgent({
      handleAgentCommunication: false,
      domTransformation: function(dom) {
        dom.querySelector('body').innerHTML = dom.querySelector(scopedSelector).innerHTML;

        return dom;
      }
    }).domSnapshot(document, options);
  }

  async function postDOM() {
    try {
      await fetch('http://localhost:5338/percy/snapshot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clientInfo: clientInfo(),
          environmentInfo: envInfo(),
          url: document.URL,
          domSnapshot,
          name,
          ...options
        })
      });
    } catch (err) {
      if (isPercyRunning) {
        console.log('[percy] Error POSTing DOM, disabling.');
        isPercyRunning = false;
      }
    }
  }

  let agentJS = await fetchDOMLib();
  if (!agentJS) return;
  let domSnapshot = captureDOM();
  // not awaited on to run in parallel
  postDOM();
}
