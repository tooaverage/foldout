// A deliberately generic long page for the listing images. Nobody's brand, so
// nothing competes with the product, and the height is ours to choose, which is
// what makes the split-into-several-images claim demonstrable at all.
import fs from 'node:fs';

const SECTIONS = [
  ['Foundations', 'Spacing, colour and type, and the reasoning behind each choice.'],
  ['Layout', 'Grids, breakpoints, and how density changes between them.'],
  ['Typography', 'One family, six steps, and the line lengths they are meant for.'],
  ['Colour', 'A restrained palette with a single accent, and where it is allowed.'],
  ['Buttons', 'Every state, written down, so nothing ships half finished.'],
  ['Forms', 'Labels, help text, validation, and the order they appear in.'],
  ['Tables', 'Dense data without losing the row you were reading.'],
  ['Navigation', 'Where people are, where they can go, and how they get back.'],
  ['Feedback', 'Progress, empty states, and errors that say what to do next.'],
  ['Motion', 'Durations, easing, and the cases where nothing should move at all.'],
  ['Icons', 'One weight, one grid, and the handful of exceptions.'],
  ['Writing', 'Sentence case, plain words, and no exclamation marks.'],
];

const ROWS = [
  ['space-1', '4px', 'Icon gaps, inline padding'],
  ['space-2', '8px', 'Control padding, tight stacks'],
  ['space-3', '12px', 'Between related fields'],
  ['space-4', '16px', 'Card padding, list gaps'],
  ['space-6', '24px', 'Between groups'],
  ['space-8', '32px', 'Section padding'],
  ['space-12', '48px', 'Between sections'],
  ['space-16', '64px', 'Page gutters at desktop'],
];

const swatches = ['#1A1A18', '#3F3F42', '#6B6B66', '#A8431D', '#D8D8D2', '#F1F1EE'];

const section = (name, blurb, i) => `
<section id="s${i}">
  <div class="num">${String(i + 1).padStart(2, '0')}</div>
  <h2>${name}</h2>
  <p class="blurb">${blurb}</p>
  <div class="cards">
    ${[0, 1, 2].map((c) => `<div class="card">
      <div class="chip"></div>
      <h3>${name} rule ${c + 1}</h3>
      <p>Written down so it can be checked rather than remembered. Applies at every breakpoint unless the component says otherwise.</p>
    </div>`).join('')}
  </div>
  <table>
    <thead><tr><th>Token</th><th>Value</th><th>Used for</th></tr></thead>
    <tbody>${ROWS.map((r) => `<tr><td><code>${r[0]}</code></td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')}</tbody>
  </table>
  <div class="swatches">${swatches.map((s) => `<div><span style="background:${s}"></span><code>${s}</code></div>`).join('')}</div>
</section>`;

const html = `<!doctype html><meta charset="utf-8">
<title>Design system handbook</title>
<style>
  *{box-sizing:border-box;margin:0}
  body{background:#fff;color:#1A1A18;
       font:400 16px/1.6 ui-sans-serif,-apple-system,"SF Pro Text",system-ui,sans-serif;
       -webkit-font-smoothing:antialiased}
  header{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:12px;
         padding:18px 64px;background:rgba(255,255,255,.92);backdrop-filter:blur(8px);
         border-bottom:1px solid #E8E8E3}
  .mark{width:24px;height:24px;border-radius:6px;background:#1A1A18}
  header b{font-size:15px;font-weight:600;letter-spacing:-0.01em;flex:1}
  header nav{display:flex;gap:22px;font-size:14px;color:#6B6B66}
  .hero{padding:88px 64px 64px;border-bottom:1px solid #E8E8E3}
  .hero h1{font-size:52px;line-height:1.08;font-weight:700;letter-spacing:-0.03em;max-width:18ch}
  .hero p{margin-top:18px;font-size:19px;color:#6B6B66;max-width:60ch}
  main{padding:0 64px}
  section{padding:56px 0;border-bottom:1px solid #EFEFEA}
  .num{font:500 13px ui-monospace,SFMono-Regular,Menlo,monospace;color:#A8431D;margin-bottom:10px}
  h2{font-size:30px;font-weight:650;letter-spacing:-0.022em}
  .blurb{margin-top:8px;color:#6B6B66;max-width:62ch}
  .cards{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:26px 0}
  .card{border:1px solid #E8E8E3;border-radius:12px;padding:20px}
  .chip{width:26px;height:26px;border-radius:7px;background:#F1F1EE;margin-bottom:12px}
  .card h3{font-size:15px;font-weight:600;margin-bottom:6px}
  .card p{font-size:14px;color:#6B6B66;line-height:1.55}
  table{width:100%;border-collapse:collapse;margin:8px 0 26px;font-size:14.5px}
  th{text-align:left;padding:10px 12px;border-bottom:1px solid #E8E8E3;color:#6B6B66;font-weight:600}
  td{padding:10px 12px;border-bottom:1px solid #F2F2EE}
  code{font:500 13.5px ui-monospace,SFMono-Regular,Menlo,monospace;color:#A8431D}
  .swatches{display:flex;gap:14px;flex-wrap:wrap}
  .swatches div{display:flex;align-items:center;gap:8px}
  .swatches span{width:26px;height:26px;border-radius:7px;border:1px solid rgba(0,0,0,.08);display:block}
  footer{padding:56px 64px 96px;color:#6B6B66;font-size:14px}
</style>
<header><span class="mark"></span><b>Design system handbook</b>
  <nav><span>Foundations</span><span>Components</span><span>Patterns</span><span>Changelog</span></nav></header>
<div class="hero">
  <h1>A handbook for building things that match</h1>
  <p>Every rule written down once, with the reasoning attached, so decisions are checked rather than remembered. This page is a sample document used to demonstrate full-page capture.</p>
</div>
<main>${SECTIONS.map((s, i) => section(s[0], s[1], i)).join('')}</main>
<footer>Sample document. Nothing here describes a real product.</footer>`;

const out = process.argv[2] || 'demo';
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(`${out}/index.html`, html);
console.log(`${out}/index.html written,`, SECTIONS.length, 'sections');
