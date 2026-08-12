# Design system

## Source

The palette and type are taken from **birdie & partners** (birdiemena.com), read from
screenshots supplied by the team — the site itself is blocked by this environment's
network policy, so the values below were matched by eye rather than sampled from CSS.
They are close, not certified: if you have the brand's exact hex values or a brand book,
put those in and the whole app follows.

| Role | Value | Where it comes from |
| --- | --- | --- |
| Brand turquoise | `#2BC9C6` | The oversized b mark, hero shapes, CTA buttons |
| Deep teal (text) | `#0C7A78` | Darkened for links and small text — see the contrast note below |
| Charcoal | `#3B3A38` | The masthead bar |
| Near-black ink | `#111414` | Headline type |
| Near-white ground | `#F7F7F7` | Page background |

### The one deliberate departure

Birdie's turquoise is a *fill* colour. At `#2BC9C6` it carries about 2.1:1 against white,
so using it for body-sized text or links would fail WCAG AA badly. The site itself never
does this — its CTA buttons are turquoise with **dark** text, not white.

So the tokens split the brand in two, and the app follows the site's own logic:

- `--color-brand` — the true turquoise, used for fills, with `--color-brand-fg` (near-black)
  on top, exactly as the site's buttons do.
- `--color-brand-strong` — a darkened teal used wherever the brand colour has to be *text*
  (links, small labels, score figures). In dark mode this inverts to a lighter teak so it
  stays legible on the dark ground.

## Typography

**Montserrat** for everything, in the weights the site uses: 700–800 for headings with
tight tracking, 400–500 for body, and uppercase with wide letter-spacing for nav and
labels.

Montserrat has no Arabic glyphs, and this product writes Arabic outreach. So the stack is:

```css
--font-sans: 'Montserrat', 'Tajawal', ui-sans-serif, system-ui, sans-serif;
```

The browser resolves per glyph: Latin renders in Montserrat, Arabic falls through to
Tajawal, which is a geometric Arabic face that sits comfortably beside it. Neither
language gets a broken fallback.

The typeface was identified from the screenshots by its letterforms (double-storey `a`,
single-storey `g`, geometric round bowls). If the brand actually licenses something else,
changing the `@import` and the two font tokens is the whole job.

## How the tokens work

Colours are stored as **space-separated RGB channels**, not hex:

```css
:root {
  --color-brand: 29 78 216;
  --color-surface: 255 255 255;
}
```

`tailwind.config.ts` wraps each one:

```ts
const token = (name: string) => `rgb(var(${name}) / <alpha-value>)`;
```

That indirection is what makes Tailwind's opacity modifiers work against CSS variables —
`bg-surface/95`, `ring-brand/25`, `bg-brand-soft` all resolve correctly. Hex tokens cannot
do this, which is why the channel format is used.

### Token reference

| Token | Role |
| --- | --- |
| `--color-bg` | Page background |
| `--color-surface` | Cards, inputs, header |
| `--color-surface-2` | Table headers, subtle fills |
| `--color-border` | All borders and dividers |
| `--color-fg` | Body text |
| `--color-muted` | Secondary text, captions |
| `--color-brand` / `-fg` / `-soft` | Turquoise fills, buttons, brand chips |
| `--color-brand-strong` | The brand colour where it must be readable text |
| `--color-header` / `-fg` | The charcoal masthead |
| `--color-accent` / `-fg` / `-soft` | Approve actions, AI-interpretation chips |
| `--color-success` / `-soft` | Passing checks, live status |
| `--color-warning` / `-soft` | Needs review, skipped steps |
| `--color-danger` / `-soft` | Failures, rejections |
| `--color-info` / `-soft` | Measured-fact chips, running state |
| `--radius-sm` … `--radius-xl` | Corner radii |
| `--shadow-card` / `--shadow-pop` | Elevation |

Semantic colours carry meaning in this product and should stay distinguishable from the
brand colour: the report leans on `info` for *measured* and `accent` for *AI interpreted*,
and collapsing those into one hue would undo the distinction the UI exists to make.

### Changing the palette

1. Convert each hex to RGB channels (`#2BC9C6` → `43 201 198`).
2. Replace the values in the `:root` block.
3. Replace them again in the two dark blocks (`@media (prefers-color-scheme: dark)` and
   `:root[data-theme='dark']`) — dark values are separate on purpose, since a light brand
   colour rarely survives inversion.
4. Change `--font-sans` / `--font-display` and the `@import` at the top of the file.

No component changes are needed.

---

## Dark mode

Three states are handled, in this order:

1. `:root` — the complete light palette (always defined, never conditional).
2. `@media (prefers-color-scheme: dark)` scoped to `:root:not([data-theme='light'])` — the
   system default.
3. `:root[data-theme='dark']` — an explicit override that wins in both directions.

No colour has its only definition inside a media query, so the light palette is never
missing.

---

## Components

`src/components/ui.tsx` holds a small shadcn-style set: `Button`, `Card`, `Badge`,
`Field`, `Input`, `Textarea`, `Select`, `Progress`, `EmptyState`, `PageHeader`,
`SourceChip`, `ScoreDial`. Variants use `class-variance-authority`; class merging uses
`tailwind-merge`.

Two are product-specific and worth knowing about:

- **`SourceChip`** renders how a claim was established — "Measured · HTTP", "Measured ·
  page source", "Measured · PageSpeed", "AI interpretation", "Human / playbook", "Demo
  fixture". It appears beside every finding, score item and competitor signal, and it is
  the main mechanism by which the UI keeps measurement and inference apart.
- **`ScoreDial`** renders a component score, and displays **"not measured"** rather than
  `0` when the value is null — the visual counterpart of the scoring engine's refusal to
  treat an unmeasured component as a failed one.
