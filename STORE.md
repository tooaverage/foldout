# Chrome Web Store submission

Everything a reviewer will ask for, with the answers written out. Copy these into
the developer dashboard fields directly.

## Verdict

Publishable, and unusually low risk. The 2026 policy tightening that took effect
on 1 August is almost entirely about user data: the Limited Use policy, prominent
disclosure of collection, and reviewers cross-checking the Privacy tab against
actual extension behaviour. Foldout collects nothing and contains no code that
could, so the part of review that fails most extensions does not apply.

The three things that most often slow a review are broad host permissions,
obfuscated or minified code, and missing listing metadata. Foldout has no host
permissions, ships readable unminified source, and the metadata is written below.

## What happened to the extension this replaces, and why it is not our risk

The well-known incumbent was pulled on 10 August 2026 over a **copyright
complaint about a design element in its branding**, not a security or privacy
failure. The lesson is narrow and worth taking seriously: the listing and the
artwork are as reviewable as the code.

So: the icon is generated from our own `tools/make-icons.mjs`, there are no
borrowed glyphs or fonts, and **the listing must not name the incumbent**.
Writing "alternative to X" trades on someone else's trademark and reads as
keyword spam under the metadata policy. Describe what this does instead.

## Before you submit

- [ ] Decide the final name. It must match `manifest.json`, the listing title,
      and ideally the repo. Search the store for it first.
- [ ] Pay the one-time $5 developer registration fee and verify the account.
- [x] Privacy policy is live at <https://tooaverage.github.io/foldout/privacy.html>. Paste that into the Privacy tab.
- [ ] Produce listing screenshots (see below).
- [ ] Run `node tools/package.mjs` and upload the resulting zip.

**Privacy policy URL:** <https://tooaverage.github.io/foldout/privacy.html>

**Homepage URL:** <https://tooaverage.github.io/foldout/>

**Source:** <https://github.com/tooaverage/foldout>

## Listing copy

**Category:** Workflow & Planning

**Title and summary come from the manifest, not from dashboard fields.** Chrome
reads the title from `name` and the summary from `description`, so changing
either means editing `manifest.json` and uploading a new zip. Currently:

> **Foldout: Full Page & Scrolling Screenshot**
>
> Capture a whole page as one image at your screen's full resolution. Nothing is uploaded, nothing is downscaled.

That summary is 111 characters, against a limit of 132.

**Detailed description:**

> Foldout photographs an entire web page, not just the part that fits on screen.
> Click the toolbar icon and it scrolls the page for you, captures each screenful,
> and stitches them into a single image you can save or copy.
>
> Full resolution, always. Foldout captures at your display's native pixel
> density, so a Retina screen produces a Retina image. It never scales anything
> down to make it fit. When a page is taller than Chrome can hold in one image, it
> splits the result into several full-resolution pieces that join edge to edge
> rather than blurring everything to squeeze it into one.
>
> Sticky headers are handled properly, so your navigation bar appears once at the
> top instead of being stamped across every screenful. Lazy-loaded images are
> given time to arrive before the shot is taken.
>
> It tells you what it is doing. A panel on the page shows progress, explains that
> the page is being scrolled for you, and lets you stop with the Escape key. Your
> own scrolling is held still while it runs so a stray gesture cannot corrupt the
> result, and everything is put back exactly as it was when it finishes.
>
> Nothing leaves your computer. There is no account, no server, no analytics and
> no upgrade prompt. Foldout asks for two permissions and no host permissions at
> all, which means it has no standing access to any website. It can only read the
> single tab you point it at, only at the moment you click, and it contains no
> network code of any kind.
>
> Chrome does not allow any extension to run on its own pages, so chrome:// pages,
> the Web Store and the built-in PDF viewer cannot be captured.

## Single purpose

> Foldout has one purpose: capturing a complete web page as an image file. Every
> permission and every line of code serves that one function. It does not modify
> pages, block content, manage tabs, or provide any unrelated feature.

## Permission justifications

**`activeTab`:**

> Foldout must read the rendered content of the page the user wants to
> photograph. activeTab grants that access only for the single tab the user
> invoked the extension on, only at the moment they click the toolbar icon, and it
> lapses when they navigate away. This was chosen deliberately over host
> permissions so the extension has no standing access to any site.

**`scripting`:**

> Required to call chrome.scripting.executeScript. Foldout injects short
> functions into the invoked tab to measure the page height, scroll it one
> screenful at a time, temporarily hide sticky and fixed elements so they are not
> repeated down the image, show the progress panel, and then restore the page to
> exactly the state it was found in. No content scripts are declared, so nothing
> is injected until the user clicks.

**Remote code:** answer **No**. All code is contained in the package. There is no
`eval`, no `new Function`, no `importScripts`, and no remotely hosted script or
stylesheet. `node tools/package.mjs` refuses to build if any of these appear.

## Data usage disclosures

Tick **nothing** in the data categories, and certify all three statements.

Chrome defines collection as transmitting data off the user's device. Foldout
reads page pixels in order to draw them onto a canvas in the user's own browser
and hands the result straight back to them. Nothing is transmitted, persisted to
a server, or shared, so every category is correctly answered "no":

| Category | Collected |
|---|---|
| Personally identifiable information | No |
| Health information | No |
| Financial and payment information | No |
| Authentication information | No |
| Personal communications | No |
| Location | No |
| Web history | No |
| User activity | No |
| Website content | No |

Certifications, all three true:

- Does not sell or transfer user data to third parties, outside of approved use cases
- Does not use or transfer user data for purposes unrelated to the item's single purpose
- Does not use or transfer user data to determine creditworthiness or for lending purposes

A reviewer may verify these against the code. They will hold up: there is no
network-capable API anywhere in the package.

## Screenshots

Four are built and sitting in [`store-assets/`](store-assets/), all exactly
1280x800 PNG, which is what the store wants:

| File | Shows |
|---|---|
| `1-whole-page.png` | The viewer holding a finished capture |
| `2-full-resolution.png` | The size readout plus a 1:1 crop of the real saved PNG |
| `3-tells-you.png` | The popup and the on-page panel, both mid-capture |
| `4-private.png` | The permission story, spelled out |

They were shot against **getthybread.com**, which you own, so no third-party
branding appears anywhere. That matters: showing someone else's page in a
listing is the same category of risk that got the incumbent delisted. The one
crop that caught the GitHub and Microsoft logos in your footer was rejected and
re-taken higher up the page.

**Deliberately missing: a fifth showing a page split into several images.**
Neither of your sites is tall enough to trigger it. getthybread.com came back
9,509 CSS pixels tall and vancouverdanceevents.com 2,649, against a threshold of
16,384. Faking it would be a misleading screenshot under the metadata policy, so
the split is described in the listing text instead. If you capture a genuinely
enormous page later, add it as a fifth.

Still worth making by hand: the **440x280 small promo tile**, which is what the
store shows in search results and category listings.

To regenerate the four after a UI change, the scripts are in the session
scratchpad (`storeshots.mjs` captures the raw UI, `compose.mjs` lays them out).

## After submission

Review usually takes a few days but can run to a few weeks, and the store has
been running slow through 2026. New developers and new extensions get more
scrutiny than established ones, so expect the first submission to be the slowest.
If it passes three weeks with no movement, contact developer support.
