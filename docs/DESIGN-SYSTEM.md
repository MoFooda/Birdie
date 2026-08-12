# Design system

## Status: placeholder palette, single-file swap

The intended reference was **birdiemena.com**. That domain is blocked by this
environment's network egress policy, so its palette and type could not be read, and
inventing "their" brand colours would have been worse than admitting it.

What is here instead is a neutral, accessible palette, structured so that dropping in the
real brand is a **one-file edit**. Nothing else in the codebase hard-codes a colour.

To apply the real design system, edit only the token block at the top of
`src/app/globals.css`.

---

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
| `--color-brand` / `-strong` / `-fg` / `-soft` | Primary actions, score emphasis |
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

### Applying a brand palette

1. Convert each brand hex to RGB channels (`#1D4ED8` → `29 78 216`).
2. Replace the values in the `:root` block.
3. Replace them again in the two dark blocks (`@media (prefers-color-scheme: dark)` and
   `:root[data-theme='dark']`) — dark values are separate on purpose, since a light brand
   colour rarely survives inversion.
4. Change `--font-sans` / `--font-display` and the `@import` at the top of the file.

No component changes are needed.

---

## Typography

**Tajawal**, loaded from Google Fonts. Chosen because campaigns run in both English and
Arabic and it carries a complete Arabic glyph set alongside Latin — the outreach editor
renders Arabic bodies with `dir="rtl"`, and a Latin-only face would fall back
inconsistently mid-interface.

Weights: 400 body, 500 labels, 700 headings, 800 page titles.

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
