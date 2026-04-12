## 2024-05-24 - Added ARIA labels to icon-only buttons
**Learning:** Found multiple instances of icon-only buttons (like modal closes and chat send) missing `aria-label`s, making them inaccessible to screen readers.
**Action:** When working on UI templates in `src/templates`, actively verify that any button with only SVG/icon content includes an explicit `aria-label`.
