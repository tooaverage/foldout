# Product

## Register

product

## Users

People who need a faithful picture of an entire web page, not just the part that
fits on screen. Designers capturing reference and competitor work, developers
filing visual bugs, anyone archiving a receipt, listing, or thread before it
disappears.

They arrive already mid-task and slightly annoyed: the page is long, the obvious
tools give back something blurry or cut off, and the popular extension they used
for years was pulled from the store in August 2026 with no replacement they
trust. Many are actively looking for one that will not quietly ship their
browsing history somewhere.

The job is narrow. Point at a page, get the whole thing back at full resolution,
save it, move on. Success is measured in seconds and in never having to check
whether the bottom of the page actually made it.

## Product Purpose

Capture a complete web page as an image at the display's native resolution,
entirely on the user's own machine.

Two commitments define it. **Nothing is ever downscaled**, because a soft
screenshot is a useless one; pages too tall for a single canvas are split into
several full-resolution images instead. And **nothing leaves the machine**,
enforced structurally rather than promised: two permissions, no host
permissions, and no network-capable code anywhere in the source.

Success looks like someone installing it once, forgetting it exists, and it
working every time they reach for it.

## Brand Personality

Precise, unhurried, quietly opinionated.

It behaves like a good piece of hardware. It tells you exactly what it is doing
while it does it, admits plainly when it cannot help, and never dresses up a
limitation as a feature. Copy is written the way a competent colleague would
explain something, in full sentences, without exclamation marks or cheerleading.

The character shows up in restraint and in the small moments other tools skip:
the honest progress state, the error that says what to do next, the note
explaining exactly why a page had to be split.

## Anti-references

- Screenshot tools that are really funnels. Accounts, cloud galleries,
  upgrade nags, watermarks on the free tier. The whole point is that this asks
  nothing of you.
- The privacy-theatre security aesthetic. Shields, padlocks, matrix green,
  "military-grade" language. Privacy is proven by the permission list, not
  decorated with iconography.
- Generated-looking SaaS chrome. Gradient headers, glassmorphism, tracked
  uppercase eyebrows over every section, side-stripe accent borders on callouts,
  identical icon-heading-text card grids.
- Heavy editor UI. Toolbars full of shapes and arrows for a tool whose job
  ends at "here is your image, saved."

## Design Principles

1. **The screenshot is the interface.** Everything else is support and should
   recede. If a control is not needed to get the image out, it does not ship.
2. **Say what is happening, always.** Capture hijacks the page and takes several
   seconds. Silence during that is a bug. So is a badge that signals failure
   without naming a cause.
3. **Never trade quality for convenience.** Splitting into more files is the
   correct answer; blurring to fit in one is not.
4. **Prove the privacy claim, do not assert it.** Point at the manifest and the
   absence of network code. No badges, no seals.
5. **Degrade honestly.** When Chrome blocks a page, or a page is wider than the
   window, say so plainly in the interface rather than returning something
   subtly wrong.

## Accessibility & Inclusion

WCAG 2.2 AA. Body text at 4.5:1 or better in both themes, controls at 3:1, and a
visible focus ring on everything reachable by keyboard. Every control is a real
button, reachable by Tab, with the whole flow operable without a mouse.

Status must never be carried by colour alone: the progress and error states use
text and shape as well. Honour `prefers-reduced-motion` by replacing movement
with instant state changes. Follow the system light or dark preference rather
than imposing a theme.
