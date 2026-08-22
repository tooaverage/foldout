// The page used in the store listing images: a landing page for Foldout itself.
// Capturing our own page means nothing in the listing competes with the product,
// and no third party's branding appears. It is long on purpose, so the size
// claim the images make is worth making.
//
// Run: node tools/demo-page.mjs <outdir>
import fs from 'node:fs';

const FEATURES = [
  ['Every pixel your screen has', 'Foldout captures at your display’s own pixel density. A Retina screen gives you a Retina image, and nothing is ever scaled down to make it fit.'],
  ['Sticky headers, handled', 'Your navigation bar appears once at the top, instead of being stamped across every screenful on the way down.'],
  ['Lazy images, waited for', 'The page is walked once to wake anything that loads on scroll, so the shot is not full of empty placeholders.'],
  ['Too tall for one image?', 'Pages beyond what a browser can hold are split into several full-resolution pieces that join edge to edge, rather than blurred to squeeze into one.'],
  ['It says what it is doing', 'Live progress while it runs, an explanation on the page itself, and Escape to stop. Your own scrolling is held still so a stray gesture cannot spoil the shot.'],
  ['Put back exactly as found', 'Scroll position, hidden elements and page state are all restored when it finishes, including when it fails.'],
  ['Your scrolling is held', 'While it runs, your own scroll input is paused, so a stray trackpad gesture cannot land halfway through and corrupt the result.'],
  ['Switch tabs and it stops', 'A browser can only photograph whichever tab is in front. Rather than quietly stitching in somebody else\u2019s page, it stops and says why.'],
  ['Named for what it captured', 'Files arrive as foldout-page-title-date.png, so a folder of them is still readable in a month.'],
  ['Copy straight to the clipboard', 'For when the image is going into a message rather than a folder.'],
];

const LOG = [
  ['1.0.0', 'First release.'],
  ['0.9.4', 'Paint waits are capped, so a backgrounded tab can no longer hang a capture with the page held still.'],
  ['0.9.3', 'Progress moved into the toolbar popup, where it cannot end up inside the photograph it is reporting on.'],
  ['0.9.2', 'Short pages are captured without announcing themselves, since a panel that appears and vanishes reads as a glitch.'],
  ['0.9.1', 'The lazy-load pass is covered while it runs, instead of showing the page racing past.'],
  ['0.9.0', 'Pages too tall for one canvas are split at full resolution rather than scaled to fit.'],
  ['0.8.2', 'Sticky and fixed elements are hidden after the first screenful.'],
  ['0.8.0', 'Rate limiting reworked so the on-page panel is visible for the whole run.'],
];

const STEPS = [
  ['Click once', 'From the toolbar, or press Alt+Shift+P.'],
  ['Leave it alone', 'It scrolls and photographs each screenful. A few seconds for most pages.'],
  ['Save or copy', 'The finished image opens in a new tab, ready as PNG or JPG.'],
];

const LIMITS = [
  ['Chrome\u2019s own pages', 'Extensions are blocked on chrome:// pages, the Web Store and the built-in PDF viewer. That applies to every extension, not just this one.'],
  ['Panels that scroll on their own', 'Sites that scroll inside a box rather than the page itself capture as a single screenful. Support for those is the next thing on the list.'],
  ['Anything off to the right', 'Only what fits the window\u2019s width is included. Widen the window and capture again.'],
  ['Pages that grow forever', 'Feeds that load more as you scroll are captured up to a limit, and the result says so rather than pretending it reached the end.'],
];

const SPECS = [
  ['Output', 'PNG or JPG, at your display\u2019s pixel density'],
  ['Split threshold', '32,767 pixels tall, beyond which the image is divided'],
  ['Shortcut', 'Alt+Shift+P, or the toolbar icon'],
  ['Permissions', 'activeTab and scripting. No host access'],
  ['Network calls', 'None. There is no networking code in the package'],
  ['Account', 'Not required, not offered'],
  ['Price', 'Free'],
  ['Source', 'Public, and short enough to read in a sitting'],
];

const FAQ = [
  ['Where do my screenshots go?', 'Nowhere. They are drawn in your own browser and handed straight back to you. There is no server to send them to.'],
  ['What can it read?', 'One tab, at the moment you click. It requests no host permissions, so it has no standing access to any site.'],
  ['Are there pages it cannot capture?', 'Chrome blocks every extension on its own pages, so chrome:// pages, the Web Store and the built-in PDF viewer are out of reach.'],
  ['Does it cost anything?', 'No. There is no account, no upgrade prompt and no analytics.'],
  ['Why not just use the browser\u2019s own screenshot?', 'You can, and for short pages it is fine. It captures at one device pixel per CSS pixel though, so on a high-density display the result is half the resolution you expected, and very tall pages come back truncated.'],
  ['What happens to a page that is too tall?', 'It is split into several full-resolution pieces that join edge to edge. The alternative would be shrinking everything to fit, which defeats the point.'],
  ['Can I stop it halfway?', 'Press Escape. The page is put back exactly as it was found and nothing is saved.'],
  ['Does it work on local files?', 'Yes, once you turn on Allow access to file URLs in the extension\u2019s details.'],
  ['What about pages behind a login?', 'They capture normally. Foldout photographs whatever your browser is already showing you.'],
];

const html = `<!doctype html><meta charset="utf-8"><title>Foldout</title>
<style>
  *{box-sizing:border-box;margin:0}
  body{background:#fff;color:#1A1A18;
       font:400 17px/1.65 ui-sans-serif,-apple-system,"SF Pro Text",system-ui,sans-serif;
       -webkit-font-smoothing:antialiased}
  header{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:12px;
         padding:18px 72px;background:rgba(255,255,255,.93);border-bottom:1px solid #ECECE8}
  .mark{width:26px;height:26px;border-radius:7px;background:#A8431D}
  header b{font-size:16px;font-weight:600;letter-spacing:-0.012em;flex:1}
  header nav{display:flex;gap:24px;font-size:15px;color:#65655F}
  .cta{background:#1A1A18;color:#fff;border-radius:9px;padding:9px 18px;font-size:15px;font-weight:500}
  .hero{padding:96px 72px 72px;border-bottom:1px solid #ECECE8}
  .hero h1{font-size:58px;line-height:1.05;font-weight:700;letter-spacing:-0.033em;max-width:17ch}
  .hero p{margin-top:20px;font-size:20px;color:#65655F;max-width:56ch}
  .row{display:flex;gap:14px;margin-top:32px;align-items:center}
  .ghost{border:1px solid #DEDED8;border-radius:9px;padding:9px 18px;font-size:15px}
  main{padding:0 72px}
  section{padding:64px 0;border-bottom:1px solid #F2F2EE}
  h2{font-size:34px;font-weight:650;letter-spacing:-0.024em;max-width:20ch}
  section > p{margin-top:12px;color:#65655F;max-width:62ch}
  .feats{display:grid;grid-template-columns:1fr 1fr;gap:26px;margin-top:34px}
  .feat{border:1px solid #ECECE8;border-radius:14px;padding:26px 28px}
  .feat h3{font-size:18px;font-weight:600;margin-bottom:8px}
  .feat p{font-size:15.5px;color:#65655F;line-height:1.6}
  .steps{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;margin-top:34px}
  .step .n{font:600 13px ui-monospace,SFMono-Regular,Menlo,monospace;color:#A8431D;margin-bottom:10px}
  .step h3{font-size:19px;font-weight:600;margin-bottom:6px}
  .step p{font-size:15.5px;color:#65655F}
  .perm{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:30px}
  .perm div{border:1px solid #ECECE8;border-radius:14px;padding:24px 26px}
  code{font:500 14.5px ui-monospace,SFMono-Regular,Menlo,monospace;color:#A8431D}
  .faq{margin-top:30px;border-top:1px solid #F0F0EC}
  .q{padding:24px 0;border-bottom:1px solid #F0F0EC}
  .q h3{font-size:18px;font-weight:600;margin-bottom:6px}
  .q p{color:#65655F;max-width:64ch}
  .rows{margin-top:28px;border:1px solid #ECECE8;border-radius:14px;overflow:hidden}
  .specrow{display:flex;gap:32px;padding:16px 24px;border-bottom:1px solid #F2F2EE;font-size:16px}
  .specrow:last-child{border-bottom:0}
  .specrow span:first-child{flex:0 0 30%;color:#65655F}
  footer{padding:64px 72px 110px;color:#65655F;font-size:15px;display:flex;gap:20px}
</style>
<header><span class="mark"></span><b>Foldout</b>
  <nav><span>How it works</span><span>Privacy</span><span>Questions</span></nav>
  <span class="cta">Add to Chrome</span></header>
<div class="hero">
  <h1>Save any page exactly as it looks</h1>
  <p>Foldout scrolls the page for you, photographs every screenful, and stitches them into a single image at your screen’s full resolution. Nothing is uploaded.</p>
  <div class="row"><span class="cta">Add to Chrome</span><span class="ghost">See how it works</span></div>
</div>
<main>
  <section><h2>Built for pages that do not fit</h2>
    <p>${FEATURES.length} things it gets right that most screenshot tools do not.</p>
    <div class="feats">${FEATURES.map(([h, p]) => `<div class="feat"><h3>${h}</h3><p>${p}</p></div>`).join('')}</div></section>
  <section><h2>How it works</h2>
    <div class="steps">${STEPS.map(([h, p], i) => `<div class="step"><div class="n">0${i + 1}</div><h3>${h}</h3><p>${p}</p></div>`).join('')}</div></section>
  <section><h2>Two permissions, and no host access</h2>
    <p>Most screenshot extensions ask to read every site you visit. Foldout does not.</p>
    <div class="perm">
      <div><p><code>activeTab</code></p><p>Access to one tab, only at the moment you click the icon, and it lapses when you navigate away.</p></div>
      <div><p><code>scripting</code></p><p>Permission to run the capture steps. On its own it grants access to nothing.</p></div>
      <div><p><code>host_permissions</code></p><p>Not requested. This is the setting that would let an extension read sites in the background.</p></div>
      <div><p><code>fetch</code>, <code>WebSocket</code></p><p>Absent from the source entirely, so there is no code path that could send an image anywhere.</p></div>
    </div></section>
  <section><h2>What it does not do</h2>
    <p>Written down so you find out here rather than halfway through a capture.</p>
    <div class="feats">${LIMITS.map(([h, p]) => `<div class="feat"><h3>${h}</h3><p>${p}</p></div>`).join('')}</div></section>
  <section><h2>The details</h2>
    <div class="rows">${SPECS.map(([k, v]) => `<div class="specrow"><span>${k}</span><span>${v}</span></div>`).join('')}</div></section>
  <section><h2>Questions</h2>
    <div class="faq">${FAQ.map(([q, a]) => `<div class="q"><h3>${q}</h3><p>${a}</p></div>`).join('')}</div></section>
  <section><h2>What changed</h2>
    <div class="rows">${LOG.map(([v, t]) => `<div class="specrow"><span><code>${v}</code></span><span>${t}</span></div>`).join('')}</div></section>
  <section><h2>Ready when you are</h2>
    <p>Free, open source, and it asks for nothing.</p>
    <div class="row"><span class="cta">Add to Chrome</span><span class="ghost">Read the source</span></div></section>
</main>
<footer><span>Foldout</span><span>Privacy</span><span>Source</span></footer>`;

const out = process.argv[2] || 'demo-b';
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(`${out}/index.html`, html);
console.log(`${out}/index.html written (Foldout landing page)`);
