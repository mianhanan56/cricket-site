---
name: Design Standards (Senior Designer — 5 Years Experience)
description: Use this skill for ALL UI/design tasks. Enforce modern, opinionated, production-level design. Reject generic, outdated, or templated outputs.
---

## Who I Am
I have 5 years of hands-on design and frontend experience. I know what bad design looks like — Bootstrap defaults, cookie-cutter layouts, generic shadows, outdated color palettes. I reject all of that. Every design I make must feel intentional, modern, and unique.

Do NOT give me beginner-level or generic design. Treat me as a senior who will immediately notice lazy choices.

---

## Core Design Philosophy

- Every UI must have a **clear visual identity** — not a template
- Design decisions must be **justified**, not accidental
- **Modern ≠ trendy** — it means clean, purposeful, and timeless
- Spend boldness in **one signature element** — keep everything else disciplined
- If a design could belong to any other project, it has failed

---

## What I REJECT (Never Do This)

- Generic Bootstrap/Material UI look with no customization
- Default blue buttons, gray backgrounds, Times New Roman or Arial fonts
- Overused patterns: hero + 3 cards + footer with zero personality
- Warm cream (#F4F1EA) background with terracotta accent — AI default, avoid
- Near-black bg + acid-green accent — overused, avoid unless specifically asked
- Dense newspaper columns with hairline rules — avoid as default
- Numbered markers (01/02/03) unless content is literally a real sequence
- Decorations that serve no purpose — every element must earn its place
- Scattered animations — if motion is used, it must be orchestrated and meaningful

---

## What I EXPECT (Always Do This)

### Typography
- Pair **2 deliberate typefaces**: one characterful display face + one clean body face
- Use Google Fonts or system fonts — but make the pairing feel intentional
- Set a clear type scale: display, heading, subheading, body, caption
- Typography must carry personality — it is NOT a neutral delivery vehicle

### Color
- Define **4–6 named hex values** as a token system before designing
- Palette must feel specific to THIS project, not reusable anywhere
- Always include: background, surface, primary, accent, text, muted-text
- Contrast must meet accessibility standards (WCAG AA minimum)

### Layout
- Structure must **encode information**, not just decorate
- Use whitespace aggressively — crowded layouts are amateur
- Grid must be consistent — no random margins
- Mobile-first always

### Interaction & Motion
- Micro-interactions on hover/focus — but subtle and purposeful
- Page-load or scroll-triggered reveals only if they serve the content
- Respect `prefers-reduced-motion`
- Less is more — extra animation makes it feel AI-generated

### Components
- Buttons must have clear states: default, hover, active, disabled, loading
- Form inputs must have: label, placeholder, focus ring, error state
- Every component must feel like it belongs to the same design system

---

## Design Process (Always Follow This)

1. **Identify** the product, its audience, and the page's single job
2. **Brainstorm** palette + type pairing + layout concept + ONE signature element
3. **Critique** — does any part look like a generic AI default? Revise it
4. **Build** — derive every decision from the plan, no improvisation
5. **Review** — Chanel rule: look in the mirror and remove one unnecessary thing

---

## Signature Element Rule
Every design must have **one memorable thing** that makes it unmistakably THIS project. Everything else should be quiet and disciplined around it. State what that signature element is before building.

---

## Output Format Expected
When I ask for a design or UI:
1. State the design plan first (palette tokens, type pairing, layout concept, signature element)
2. Critique the plan — flag anything that reads as generic, revise it
3. Build the code — HTML/CSS or component, fully implemented
4. No placeholder lorem ipsum unless content is truly unknown
5. Responsive by default — mobile breakpoint included

---

## SCSS Architecture (MANDATORY — 4 Files Only)

Every project uses EXACTLY these 4 SCSS files — no more, no less:

```
src/styles/
├── variables.scss   ← ONLY variables declared here
├── global.scss      ← font sizes, resets, globally shared styles
├── components.scss  ← all component-level styles
└── main.scss        ← all page-level styles
```

### File Responsibilities (STRICT)

**`variables.scss`**
- ALL SCSS variables declared here — colors, fonts, spacing, breakpoints, shadows, z-index
- No actual CSS rules — only `$variable: value;`
- Every other file imports this first
- Example:
```scss
// Colors
$color-bg:       #0f0f0f;
$color-surface:  #1a1a1a;
$color-primary:  #6c63ff;
$color-accent:   #00d4aa;
$color-text:     #f0f0f0;
$color-muted:    #888888;

// Typography
$font-display:   'Clash Display', sans-serif;
$font-body:      'Inter', sans-serif;

// Spacing
$spacing-xs:     4px;
$spacing-sm:     8px;
$spacing-md:     16px;
$spacing-lg:     32px;
$spacing-xl:     64px;

// Breakpoints
$bp-mobile:      576px;
$bp-tablet:      768px;
$bp-desktop:     1200px;
```

---

**`global.scss`**
- Import `variables.scss` at top — always
- Bootstrap overrides/customization go here (before Bootstrap import)
- Font imports (Google Fonts `@import`)
- CSS reset or base element styles (`body`, `*`, `a`, `h1–h6`, `p`)
- Global utility classes used across entire app
- Example structure:
```scss
@import 'variables';
@import 'bootstrap/scss/bootstrap';  // Bootstrap after our overrides

@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');

*, *::before, *::after { box-sizing: border-box; }

body {
  font-family: $font-body;
  background-color: $color-bg;
  color: $color-text;
  font-size: 16px;
  line-height: 1.6;
}

h1, h2, h3, h4, h5, h6 {
  font-family: $font-display;
  font-weight: 700;
}

// Type scale
.text-display  { font-size: clamp(2.5rem, 5vw, 4rem); }
.text-heading  { font-size: clamp(1.5rem, 3vw, 2.25rem); }
.text-sub      { font-size: 1.125rem; }
.text-body     { font-size: 1rem; }
.text-caption  { font-size: 0.875rem; color: $color-muted; }
```

---

**`components.scss`**
- Import `variables.scss` at top
- ALL reusable component styles go here: buttons, cards, modals, inputs, badges, navbars, etc.
- Never write page-specific styles here
- Each component has its own clearly commented block
- Example:
```scss
@import 'variables';

// ── Button ──────────────────────────────────
.btn-primary-custom {
  background-color: $color-primary;
  color: #fff;
  border: none;
  padding: $spacing-sm $spacing-lg;
  border-radius: 8px;
  font-family: $font-body;
  font-weight: 600;
  transition: opacity 0.2s ease;

  &:hover   { opacity: 0.85; }
  &:active  { opacity: 0.7; }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
}

// ── Card ────────────────────────────────────
.card-custom {
  background-color: $color-surface;
  border-radius: 12px;
  padding: $spacing-lg;
  border: 1px solid rgba(255,255,255,0.06);
}
```

---

**`main.scss`**
- Import `variables.scss` at top
- ALL page-specific styles go here: `.home-page`, `.dashboard-page`, `.login-page`, etc.
- Each page has its own clearly commented block
- Never put component styles here — components always go in `components.scss`
- Example:
```scss
@import 'variables';

// ── Home Page ────────────────────────────────
.home-page {
  .hero-section {
    min-height: 100vh;
    display: flex;
    align-items: center;
    padding: $spacing-xl 0;
  }
}

// ── Dashboard Page ───────────────────────────
.dashboard-page {
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: $spacing-md;
  }
}
```

---

## Bootstrap Rules (MANDATORY)

- Always use **Bootstrap 5** (not Bootstrap 4 or 3)
- Import Bootstrap via SCSS (not CDN link) so we can override variables
- **Override Bootstrap variables in `global.scss` BEFORE the Bootstrap import**
- NEVER use Bootstrap's default colors directly — always override with our `$variables`
- Allowed to use Bootstrap's grid, utilities, and components
- But ALWAYS customize them — raw Bootstrap look is REJECTED
- Override example in `global.scss`:
```scss
// Override Bootstrap before importing it
$primary:    $color-primary;
$body-bg:    $color-bg;
$body-color: $color-text;
$font-family-base: $font-body;
$border-radius: 8px;

@import 'bootstrap/scss/bootstrap';
```

---

## Strict Enforcement
If any of the following is missing, the output is INCOMPLETE:
- Intentional type pairing ❌
- Named color token system ❌
- Signature element ❌
- Mobile responsiveness ❌
- Hover/focus states on interactive elements ❌
- SCSS split into exactly 4 files ❌
- Bootstrap overridden via SCSS variables (not raw defaults) ❌

I will notice. Do not cut corners.