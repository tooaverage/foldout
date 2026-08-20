# Foldout privacy policy

_Last updated: 19 August 2026_

## The short version

Foldout does not collect, store, transmit, or sell any data. There are no
servers, no accounts, no analytics, and no third parties. Your screenshots never
leave your computer.

## What Foldout does with page content

When you click the Foldout icon, it reads the visible content of that one tab in
order to photograph it, and assembles those photographs into an image inside your
own browser. That image is held in memory on your machine and is handed straight
to you to save or copy. It is discarded when you close the tab.

Nothing is written to a server, because Foldout contains no code capable of
making a network request. There is no `fetch`, no `XMLHttpRequest`, no
`WebSocket`, and no remotely loaded script anywhere in the extension. This is
verifiable: the entire source is a few hundred lines and is published alongside
the extension.

## What Foldout can and cannot see

Foldout requests two permissions:

- `activeTab` grants access to a single tab, only at the moment you click the
  icon, and that access ends when you navigate away or close the tab. Foldout
  has no standing access to any site and cannot read pages in the background.
- `scripting` allows the extension to call Chrome's script injection API at
  all. On its own it grants access to nothing.

Foldout deliberately requests no host permissions, which is the setting that
would otherwise allow an extension to read sites without being asked.

## Data collected

None. Specifically, Foldout does not collect or transmit personally
identifiable information, health information, financial information,
authentication information, personal communications, location, web history, user
activity, or website content.

## Changes

If this ever changes, the policy will be updated here and the change disclosed in
the Chrome Web Store listing before it takes effect.

## Contact

Questions about this policy can be sent to the developer through the Chrome Web
Store listing's support link.
