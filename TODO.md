# Longshot: what is left

## Only you can do these

1. **Pick the final name.** It has to match `manifest.json`, the store listing
   title, and the repo. Search the Web Store for it first. Everything else is
   ready to go the moment this is decided; the filename prefix and the popup
   wordmark both read from the manifest, so a rename carries through by itself.
2. **Create the Chrome Web Store developer account and pay the one-time $5.**
   Google requires a real person with a payment method and does an email
   verification. There is no API for this step.
3. **Approve the GitHub repo** (see below). The privacy policy needs a public URL
   before you can submit, and GitHub Pages is the cheapest way to get one.

## Already done, nothing needed from you

- Extension built, 1,299 lines, `activeTab` and `scripting` only, no host
  permissions, no network-capable code anywhere.
- 29 automated checks across four page shapes, all passing.
- Listing copy, single-purpose statement, both permission justifications and the
  full data-disclosure table, all written out in `STORE.md`.
- Privacy policy written in `PRIVACY.md`.
- Five listing images in `store-assets/`: four 1280x800 screenshots plus the
  440x280 promo tile.
- `node tools/package.mjs` builds the upload and blocks the build if a permission
  or anything resembling remote code appears.

## Things you could set up so I can do more

Listed by how much work they take off you.

### 1. Chrome Web Store API (worth it)

Lets me upload new versions and publish from the command line, so shipping an
update becomes one instruction instead of a dashboard session. Setup, roughly
ten minutes, once:

1. Create a project at <https://console.cloud.google.com>.
2. Enable the **Chrome Web Store API** for it.
3. Create an **OAuth client ID**, application type **Desktop app**.
4. Send me the client ID and client secret, and I will walk you through the
   single consent click that produces a refresh token.

Then I can upload, publish, and read review status directly. Note this still
needs the paid developer account from step 2 above to exist first.

### 2. Authorise the Figma connector

Your claude.ai Figma connector is connected but not authorised, so I cannot use
it. If you want listing artwork or the icon designed in Figma rather than
generated from code, authorise it in your claude.ai connector settings and I can
work from your file directly. The Google Drive connector is in the same state.

### Already available, no setup needed

`gh` is installed and signed in as **tooaverage**, so I can create the repo, push
the code, and turn on GitHub Pages for the privacy policy without you touching
anything. I have not done it yet because publishing a public repo under your
account is your call. Note that Pages on a private repo needs a paid plan, so a
public repo is the practical route, which also happens to back up the privacy
claim: anyone can read the source and confirm there is no network code.

## Nice to have, not blocking

- A fifth screenshot showing a page split into several images. Neither of your
  sites is tall enough to trigger it and faking it would breach the metadata
  policy, so it is described in the listing text instead.
- Support for pages that scroll inside a `div` rather than the document. These
  currently capture as a single screenful.
