# Design

## Theme

A quiet instrument: a neutral paper-and-ink surface that gets out of the way of
the image it is showing. Structure comes from hairline rules and generous space,
never from tinted panels, gradients, or accent stripes. The only saturated colour
in the interface is the progress fill and the focus ring; everything else is
neutral, so the screenshot is always the most colourful thing on screen.

## Color

Defined as tokens on bare `:root`, redefined for dark under
`@media (prefers-color-scheme: dark)` and `[data-theme]` is not used (the viewer
follows the system).

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#f6f6f4` | `#121214` | Page ground |
| `--surface` | `#ffffff` | `#1a1a1d` | Header, cards, figure backgrounds |
| `--line` | `#e2e2dd` | `#2f2f35` | Hairline borders and dividers |
| `--text` | `#1a1a18` | `#eeeef1` | Primary text |
| `--muted` | `#5f5f5a` | `#a0a0a9` | Secondary text, metadata |
| `--accent` | `#a8431d` | `#e8804f` | Progress fill, focus ring only |
| `--btn` / `--btn-text` | `#1a1a18` / `#fafaf9` | `#eeeef1` / `#151518` | Primary button |

Contrast (measured, not estimated): `--muted` on `--surface` is 6.42:1 light and
6.69:1 dark, both above the 4.5:1 body-text floor. Primary text clears 15:1 in
both themes and the focus ring clears 6:1. `--line` is decorative only; no information is carried by
it. Accent is never used as a background behind text.

Accent is not decoration. It appears in exactly two places: the progress bar
fill and the `:focus-visible` ring. No accent borders, no accent headings, no
tinted callouts.

## Typography

One family: the system UI stack (`ui-sans-serif, -apple-system, "SF Pro Text",
system-ui, sans-serif`). Fixed rem-ish px scale, not fluid.

| Role | Size / weight | Notes |
|---|---|---|
| Page title | 14px / 550 | Sits in the header, truncates with ellipsis |
| Metadata line | 12px / 400 | `--muted`, tabular numerals for dimensions |
| Body & notices | 13px / 400 | Full sentences, never sentence fragments |
| Buttons | 14px / 500 | Sentence case, never uppercase |
| Figure captions | 12px / 400 | `--muted`, tabular numerals |

`font-variant-numeric: tabular-nums` on every number that can change, so the
metadata line does not jitter as it updates.

## Layout

Single column, `max-width: 1100px`, centred. A sticky header holds identity on
the left and actions on the right. Content is one stack of figures with 20px
between them.

Spacing scale: 4, 8, 12, 16, 20, 28, 64. Nothing between these values.

Radii: 6px on small controls, 8px on buttons, 10px on figures. No pill shapes.

## Components

Every interactive element ships default, hover, focus-visible, active, and
disabled. Buttons are real `<button>` elements in tab order.

- Button: 34px tall, 1px `--line` border, `--surface` background. Primary
  variant inverts to `--btn`. Small variant is 26px for per-figure actions.
- Focus ring: 2px `--accent` outline with a 2px offset, on `:focus-visible`
  only, never suppressed.
- Progress: a 3px track with an accent fill, paired with a text percentage.
  Status is never carried by colour alone.
- Notice: hairline border on all four sides, `--surface` background, muted
  text, and a small outline glyph that says which kind of notice it is (split,
  truncated, too wide). The glyph is informational, not decorative: it is the
  non-colour half of the signal. **No left accent stripe, no coloured
  background, no severity tint.**
- Figure: hairline border, 10px radius, optional caption bar above the
  image separated by a hairline.

## Motion

150–200ms on state changes only. The progress fill uses a 150ms width
transition. There are no entrance animations, no staggered reveals, and no
spinners.

Under `prefers-reduced-motion: reduce`, all transitions collapse to `0.01ms` and
state changes land instantly.

## Bans

Carried from PRODUCT.md anti-references, enforced here:

- No eyebrows: no tracked uppercase micro-labels above headings, and no
  accent side-stripes on callouts, notices, or cards.
- No gradients, glassmorphism, or tinted panels.
- No icon-heading-text card grids.
- No emoji or decorative iconography in the UI.
- No shields, padlocks, or security-theatre imagery.
- No custom scrollbars or reinvented form controls.

## Popup

The toolbar popup is the progress display, and it is the reason progress is
legible at all: it lives in browser UI, so unlike anything drawn on the page it
can never be photographed by the capture it is reporting on.

320px wide, same tokens as the viewer, duplicated inline so the popup stays a
self-contained file. It shows the stage (`Capturing section 4 of 11`), a
determinate bar with a percentage in mono, and a Stop button. Before the first
screenful there is no honest percentage to show, so the bar sweeps rather than
inventing one. A footer strip carries the privacy line, which is the one place
the product makes its central claim in the interface itself.

## On-page panel

A shadow-root card pinned bottom-centre of the captured page, built node by node
rather than with `innerHTML` so sites enforcing Trusted Types do not throw. It
exists for the case where the popup has been dismissed: without it the page
would scroll by itself with nothing explaining why.

It must not appear in the screenshot, so it is hidden for the instant each
screenful is taken. Ordering matters more than it looks: hiding it before the
520ms capture-quota wait left it dark for roughly 85% of every cycle, which read
as a strobe. The quota is now served first and the panel blinks only around the
shutter, measured at 95% visible across a run.
