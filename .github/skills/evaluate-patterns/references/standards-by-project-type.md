# Standards by Project Type

Reference for the `ui-standards-reviewer` agent and `calibration-profile.json` generation. Defines what UI conformance means for each project category.

## SaaS Application

Target: modern, responsive, accessible web application. Think Stripe Dashboard, Linear, Notion.

**Required standards:**
- Responsive at 1280px (desktop) and 375px (mobile)
- WCAG AA color contrast (4.5:1 body, 3:1 large)
- 44px minimum touch targets on mobile
- Consistent 8px spacing grid
- Loading states on all async actions
- Inline form validation with field-level errors
- Empty states with illustrations and CTAs
- Error pages (404, 500) with recovery paths
- Consistent navigation on every page
- Clear typography hierarchy (H1 > H2 > body > caption)

**Not required:**
- Originality or distinctive visual identity
- Custom animations or micro-interactions
- Dark mode (unless specified in BRD)
- Accessibility beyond AA (AAA is aspirational)

## Enterprise / Internal Tool

Target: functional, efficient, data-dense. Think AWS Console, Jira, Grafana.

**Required standards:**
- Desktop layout at 1280px (no mobile requirement)
- WCAG AA color contrast
- Consistent 8px spacing grid
- Loading states on async actions
- Inline form validation
- Error pages with recovery paths
- Consistent navigation
- Clear typography hierarchy

**Not required:**
- Mobile responsiveness
- Touch targets (desktop-only)
- Empty states (recommended but non-blocking)
- Illustrations or decorative elements

## API-Only / Backend Service

No UI standards apply. `ui-standards-reviewer` is not invoked. `/design` phase skips mockups.
