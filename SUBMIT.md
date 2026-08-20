# Submitting Foldout

Two separate things, in this order. The first submission has to be done by hand
in the dashboard; the API only helps with the updates after it.

---

# Part 1: the first submission (about 20 minutes, all yours)

## Before you start

- **Decide the name.** It has to match `manifest.json` and the listing title.
- **Turn on 2-Step Verification** on the Google account you will publish from.
  Google now refuses to publish or update without it. Do this first, because it
  blocks everything else.
- **Register at** <https://chrome.google.com/webstore/devconsole> and pay the
  one-time **$5** registration fee.

## Build the upload

```
node tools/preflight.mjs
```

Checks the manifest, that nothing still carries an old name, that the listing
images are the right dimensions, that every URL in the docs resolves, and then
builds the zip. Run this rather than `package.mjs` directly.

Produces `foldout-1.0.0.zip`, runtime files only. If you renamed the extension,
edit `manifest.json` first and re-run.

## Dashboard, tab by tab

Click **Add new item** and upload the zip. Then five tabs:

### Package
Read-only confirmation of what you uploaded. Nothing to fill in.

### Store listing

| Field | What to put |
|---|---|
| Title | Your final name |
| Summary | `Capture a whole web page as one image at your screen's full resolution. Nothing is uploaded.` (92 chars, limit is 132) |
| Description | The long description in [STORE.md](STORE.md), copy verbatim |
| Category | Workflow & Planning |
| Language | English |
| Screenshots | All four 1280x800 PNGs from [store-assets/](store-assets/) |
| Small promo tile | `store-assets/5-promo-tile-440x280.png` |
| Homepage URL | <https://tooaverage.github.io/foldout/> |
| Support URL | <https://github.com/tooaverage/foldout/issues> |

Do **not** mention GoFullPage anywhere. Trading on their trademark invites the
same delisting, and it reads as keyword spam under the metadata policy.

### Privacy

| Field | What to put |
|---|---|
| Single purpose | The single-purpose paragraph in [STORE.md](STORE.md) |
| `activeTab` justification | The activeTab paragraph in [STORE.md](STORE.md) |
| `scripting` justification | The scripting paragraph in [STORE.md](STORE.md) |
| Remote code | **No** |
| Data collection | Tick **nothing**. All nine categories are "no" |
| Three certifications | Tick all three |
| Privacy policy URL | <https://tooaverage.github.io/foldout/privacy.html> |

### Distribution
Free. Public visibility. All regions unless you want otherwise.

### Test instructions
Leave blank. There is no login and nothing hidden, so reviewers need nothing.

## Submit

Click **Submit for review**. There is a checkbox to hold publishing until you
release it manually, good for up to 30 days after approval. Tick it if you want
to line up a launch; leave it clear to go live the moment it passes.

Expect a few days, occasionally a few weeks. First-time developers and new
extensions get more scrutiny. If three weeks pass with no movement, contact
developer support.

---

# Part 2: setting me up with the API (about 10 minutes, then I can ship updates)

**What this does and does not buy you.** The API can upload a new version,
publish it, check review status, and cancel a submission. It **cannot** touch
the listing text, screenshots, category, or privacy answers. So this does
nothing for Part 1, but afterwards a version bump becomes one instruction to me
instead of a dashboard session.

Do this after Part 1, or in parallel if you like.

### 1. Create a Google Cloud project
Go to <https://console.cloud.google.com/projectcreate>, name it anything
(`foldout-publishing` is fine), create it, and make sure it is selected.

### 2. Enable the API
Go to <https://console.cloud.google.com/apis/library/chromewebstore.googleapis.com>
and click **Enable**.

### 3. Configure the consent screen
**APIs & Services → OAuth consent screen**. Choose **External**. Fill in an app
name and your email where required. Under **Audience**, add your own Google
account as a **test user**. It never needs verifying or publishing, because you
are the only user.

### 4. Create the OAuth client
**APIs & Services → Credentials → Create credentials → OAuth client ID**.

- Application type: **Web application**
- Authorised redirect URI: `https://developers.google.com/oauthplayground`

Web application rather than Desktop, because the redirect URI above is what the
next step needs. Copy the **client ID** and **client secret**.

### 5. Get a refresh token
Open <https://developers.google.com/oauthplayground>.

1. Click the **gear icon**, top right.
2. Tick **Use your own OAuth credentials**, paste the client ID and secret.
3. In the left panel's **Input your own scopes** box, enter:
   `https://www.googleapis.com/auth/chromewebstore`
4. Click **Authorise APIs**, sign in, and approve. You will see an "unverified
   app" warning; continue past it, since it is your own app.
5. Click **Exchange authorization code for tokens**.
6. Copy the **refresh token**.

### 6. Send me three values

- client ID
- client secret
- refresh token
- and the **item ID** of the listing, which is the long letter string in the
  dashboard URL once the item exists

**These are credentials for publishing under your name.** Treat them like a
password. Do not commit them; I will keep them out of the repo and out of the
zip, and `tools/package.mjs` already refuses to ship anything outside the
runtime file list.

Once I have them, "ship a new version" becomes: I bump the manifest version, run
the tests, build the zip, upload it, and publish, all from here.
