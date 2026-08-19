# Longshot

A full-page screenshot extension for Chrome. It scrolls the page, captures each
screenful at your display's native resolution, and stitches them into one image.

Built as a replacement for GoFullPage, with a deliberately small blast radius:
two permissions, no host permissions, no network code, no accounts, no analytics.

## Install

1. Go to `chrome://extensions`
2. Turn on Developer mode (top right)
3. Load unpacked, then choose this folder

Pin it to the toolbar. Click the icon, or press Alt+Shift+P, to capture the page
you're on. A new tab opens with the result and buttons for PNG, JPG and
copy-to-clipboard.

## What happens while it captures

Capture takes several seconds and drives the page, so it says so rather than
letting the page appear to scroll on its own.

An overlay sits at the bottom of the page counting screenfuls. Your own
scrolling is switched off for the duration, because two people steering one
scrollbar produces torn screenshots. Wheel, touch and arrow keys are swallowed
and handed back the moment it finishes.

It stops early in three cases, and says which:

- you press Esc
- you switch to another tab, because `captureVisibleTab` photographs whichever
  tab is in front and carrying on would stitch the wrong page into your image
- the page navigates somewhere else

In every case the page is put back exactly as it was found: scroll position,
hidden elements, and scrolling handed back.

## Why it can't spy on you

The whole manifest asks for two things:

- `activeTab`, access to one tab, granted only at the moment you click the icon
  and revoked when you navigate away. It cannot read any page you didn't point
  it at, and it has no standing access to anything.
- `scripting`, permission to call the injection API at all. On its own it grants
  access to nothing.

There is no `host_permissions` entry, which is the field that would let an
extension read pages in the background. There is no `fetch`, `XMLHttpRequest`,
`WebSocket` or remote script anywhere in the code, so there is nothing that
could send an image off the machine even if it wanted to. Roughly 400 lines
total, so it's readable in a sitting.

## How it works

`background.js` runs on click:

1. Locks user scrolling, mounts the progress overlay, then scrolls the whole
   page once to trigger lazy-loaded images and waits for them to decode.
2. Walks down the page one viewport at a time, calling
   `chrome.tabs.captureVisibleTab` at each stop. Chrome rate-limits that to
   about two calls per second, which sets the pace, roughly 8s for a 10,000px
   page. The overlay is hidden for each frame and shown again after, so it never
   ends up in your screenshot.
3. After the first screenful, hides every `position: fixed` and
   `position: sticky` element, so a sticky header appears once at the top
   instead of being burned into every band below it.
4. Restores everything it touched, always, including on failure.

`viewer.js` pulls the screenfuls one at a time and draws them onto a canvas at
the offset each was actually taken from. Because it uses the real post-scroll
`window.scrollY` rather than the requested position, the final short screenful
at the bottom overlaps correctly instead of duplicating a band.

Resolution comes from your display and is never reduced. On a Retina Mac a
1512px-wide window produces a 3024px-wide PNG. Chrome cannot hold a canvas
taller than 65,535px, and past that it fails silently by handing back
transparent pixels, so pages beyond a safe 32,767px are split into several
full-resolution images rather than shrunk to fit. The pieces are equal bands
that join seamlessly top to bottom, and each gets its own download button
alongside a download-all in the toolbar.

## Known limits

- Only the main page scroller. Sites that scroll inside a `div` instead of the
  document will capture as one screenful.
- Only what fits the window's width. Anything off to the right isn't included,
  so widen the window and recapture.
- Chrome's own pages (`chrome://`, the Web Store, the PDF viewer) are blocked to
  every extension, not just this one. The icon shows a grey dash and the tooltip
  explains why. Local `file://` pages need "Allow access to file URLs" switched
  on under Details in `chrome://extensions`.
- Very tall pages arrive as several images rather than one. The viewer says so,
  and names the files `-1of3`, `-2of3` and so on.
- Fixed banners and chat bubbles show up once, in the first screenful.

## Tests

```
node tools/e2e-test.mjs                      # 1x, single image
node tools/e2e-test.mjs --dpr=2              # Retina path
node tools/e2e-test.mjs --dpr=2 --blocks=170 # 75,000px tall, forces a 3-way split
node tools/e2e-test.mjs --headed             # watch it happen
```

This installs the real extension into a throwaway Chrome profile via
`Extensions.loadUnpacked` over the DevTools Protocol, points it at a generated
page of uniquely-coloured blocks with a sticky header, a fixed banner and lazy
images, then samples the stitched canvases to prove every block landed at
exactly the right offset even across a split, that the output is exactly
devicePixelRatio times the page with no downscaling, that the sticky header
wasn't repeated at any seam, and that our own overlay never appears in the
result. It also drives the two stop paths for real, pressing Esc and switching
tabs mid-capture, and checks the page was left as it was found. It writes
`stitched-preview.jpg` so you can eyeball it.

The one thing it can't reproduce is the `activeTab` grant, which needs a real
toolbar click, so it tests a copy of the extension whose only difference is a
standing host permission.

Note that Chrome 142+ removed the `--load-extension` command-line flag from
branded builds, which is why the harness goes through the DevTools Protocol.

## Publishing

`STORE.md` has the Chrome Web Store submission package: single purpose
statement, per-permission justifications, listing copy, screenshot rules and a
pre-submit checklist. `PRIVACY.md` is the privacy policy, which needs to be
published at a public URL before submitting.

## Design

`PRODUCT.md` covers who it's for and what it refuses to become. `DESIGN.md` is
the visual system: tokens, type scale, component states and the bans.

## Icons

`node tools/make-icons.mjs` regenerates them. Shapes are signed-distance fields,
supersampled and written out through a small hand-rolled PNG encoder, so there
are no dependencies and no binary assets to trust.
