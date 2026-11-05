---
name: css-ui-review
description: "Review and validate CSS and UI styling changes. Use when editing stylesheets, investigating layout regressions, reviewing responsive behavior, or checking visual consistency."
---

# CSS and UI Review

## Procedure

1. Read the relevant markup, stylesheet rules, and nearby component behavior before changing styles. Search for shared selectors and responsive overrides that may affect other screens.
2. Identify the specific visual requirement and the states it affects, including open, closed, hover, focus, loading, empty, and error states where applicable.
3. Make the smallest coherent style change. Prefer existing design tokens and component patterns; avoid broad selectors or duplicate overrides.
4. Validate in the real browser or Electron renderer when available. Use screenshots for visual comparison and inspect computed styles and element geometry when layout or popup positioning is involved.
5. Add or update UI tests for observable behavior: visibility, anchoring, dimensions, overflow, and whether surrounding layout shifts. Do not rely only on checking that a CSS class or property exists.
6. Run the targeted UI test and relevant project test suite. Check the final diff for unrelated styling changes.

## Review Checklist

- Related controls share dimensions, spacing, typography, borders, and interaction cues.
- Popovers and overlays are positioned relative to the intended control and do not unexpectedly alter document flow.
- Existing content remains visible and usable during background work.
- Layout remains usable at the application's supported window sizes and with long or missing content.
- Focus, hover, disabled, and reduced-motion states remain understandable and accessible.
- CSS changes preserve unrelated behavior and themes.
