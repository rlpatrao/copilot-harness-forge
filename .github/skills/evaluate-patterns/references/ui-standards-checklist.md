# UI Standards Checklist

Industry-standard UI requirements by project type. Used by `ui-standards-reviewer` agent for single-pass conformance checking.

## SaaS Application

All checks required. FAIL blocks the gate.

| # | Check | How to Verify | Common Fix |
|---|-------|--------------|------------|
| 1 | Responsive layout | Screenshot at 1280px and 375px. No horizontal scroll, no overlapping elements, no clipped text. | Add breakpoint media queries. Use flex/grid with `min-width: 0`. |
| 2 | Consistent spacing | Visual alignment on 4px or 8px grid. No random gaps between sections. | Use Tailwind spacing scale (`p-2`, `gap-4`). Remove arbitrary pixel values. |
| 3 | Color contrast (WCAG AA) | Body text ≥ 4.5:1 ratio. Large text (18px+) ≥ 3:1. Placeholder text ≥ 4.5:1. | Change light grays (#999) to accessible (#767676 or darker). |
| 4 | Interactive feedback | Buttons have hover + focus states. Forms show loading during submit. Actions confirm success/error. | Add `hover:` and `focus:` variants. Add loading spinner on submit. Add toast/alert on complete. |
| 5 | Form validation | Inline errors below fields (not just alerts). Required fields marked. Errors on blur or submit. | Add field-level error state. Show error message below input. Add asterisk or "required" label. |
| 6 | Navigation consistency | Same nav on every page. Active page highlighted. Back navigation where needed. | Extract nav to shared component. Add `aria-current="page"` to active link. |
| 7 | Empty states | Pages with zero items show message + action, not blank space. | Add empty state component with illustration/icon + "No items yet" + CTA button. |
| 8 | Error pages | 404 and error states have recovery path (link home, retry button). | Add catch-all route with friendly error page. Include "Go home" and "Try again" buttons. |
| 9 | Typography hierarchy | Clear visual distinction: H1 > H2 > body > caption. Consistent font. | Use heading utility classes. Ensure font-size decreases with heading level. |
| 10 | Touch targets | Interactive elements ≥ 44px on mobile. | Add `min-h-[44px] min-w-[44px]` to buttons and links on mobile. |

## Enterprise / Internal Tool

| # | Check | Required | Notes |
|---|-------|----------|-------|
| 1 | Responsive layout | Desktop only (1280px) | Mobile not required |
| 2 | Consistent spacing | Yes | |
| 3 | Color contrast | Yes (WCAG AA) | |
| 4 | Interactive feedback | Yes | |
| 5 | Form validation | Yes | |
| 6 | Navigation consistency | Yes | |
| 7 | Empty states | Recommended | Non-blocking if absent |
| 8 | Error pages | Yes | |
| 9 | Typography hierarchy | Yes | |
| 10 | Touch targets | No | Desktop-only app |

## API-Only / Backend Service

Skip all UI standards checks. `ui-standards-reviewer` is not invoked.
