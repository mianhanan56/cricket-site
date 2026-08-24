# Cricket Site — Claude Code Instructions

## Design Standards
Before ANY UI/design task, read and follow:
.claude/skills/design-standards.md

## Project Structure
- Frontend: Next.js 14 App Router + SCSS Modules
- Backend: Node.js + Express
- Database: PostgreSQL (Neon.tech) + Prisma
- Monorepo: npm workspaces

## Key Rules
- NEVER push to git — user does that manually
- SCSS only — no Tailwind, no inline styles
- No inline styles anywhere
- Mobile first always
- Read design-standards.md before every UI change
- **Few comments.** No paragraph-long prose blocks above components or styles, no
  narrating what the code already says. Comment only a non-obvious *why* — a
  workaround, a data quirk, a rule that isn't visible from the code — and keep it
  to a line or two.

## Banned Patterns (never add — remove on sight)
- **No accent bar on headings.** Never put a small vertical stripe beside a
  section title (`border-left: 3px solid $accent`, or a `::before` bar). A
  heading is typography — size and weight carry it. Same for any thin decorative
  rule that only exists to mark a block.
- **No tiny hint links.** No 10–12px muted micro-link tucked in a corner —
  "Full schedule", "View all", "See more", "More →". If the destination matters,
  it is a real, readable link or button in the flow of the layout; if it doesn't,
  it doesn't ship. Section headings at normal heading size are fine — the rule is
  about the small greyed-out text, not about the words.