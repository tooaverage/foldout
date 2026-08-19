// Opening the popup is what starts a capture, and the popup is where progress
// is shown. Because this is browser UI rather than page content, it cannot end
// up inside the screenshot it is reporting on.

const el = (id) => document.getElementById(id);
const port = chrome.runtime.connect({ name: 'longshot' });

port.onMessage.addListener(render);
el('stop').addEventListener('click', () => {
  port.postMessage({ type: 'stop' });
  el('stop').textContent = 'Stopping…';
  el('stop').disabled = true;
});

(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  port.postMessage({ type: 'start', tab });
})();

function render(status) {
  if (!status) return;

  if (status.phase === 'capturing' && status.total) {
    const pct = Math.round((status.done / status.total) * 100);
    show({
      headline: status.done
        ? `Capturing section ${status.done} of ${status.total}`
        : `Capturing ${status.total} sections`,
      detail: 'Scrolling and photographing each screenful',
      pct,
    });
    return;
  }

  if (status.phase === 'priming') {
    show({ headline: 'Loading the whole page', detail: 'Giving lazy images time to arrive' });
    return;
  }

  if (status.phase === 'assembling') {
    show({ headline: 'Assembling the image', detail: 'Stitching the screenfuls together', pct: 100 });
    return;
  }

  if (status.phase === 'done') {
    show({ headline: 'Done', detail: 'Opening your screenshot', pct: 100, stopped: true });
    return;
  }

  if (status.phase === 'error') {
    show({
      headline: status.expected ? 'Cannot capture this page' : 'Something went wrong',
      detail: status.message,
      stopped: true,
      quiet: true,
    });
    return;
  }

  show({ headline: 'Getting ready', detail: 'Measuring the page' });
}

function show({ headline, detail, pct, stopped, quiet }) {
  el('headline').textContent = headline;
  el('detail').textContent = detail;

  const track = el('track');
  track.hidden = Boolean(quiet);
  const known = typeof pct === 'number';
  track.classList.toggle('waiting', !known);
  el('fill').style.width = known ? pct + '%' : '';
  el('pct').hidden = !known;
  el('pct').textContent = known ? pct + '%' : '';
  if (known) track.setAttribute('aria-valuenow', String(pct));

  el('row').hidden = Boolean(stopped);
}
