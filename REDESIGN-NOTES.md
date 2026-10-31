# 2CE frontend redesign

> Historical UI handoff from 30 October, before the backend migration. Authentication and persistence statements below describe that earlier version. Use README.md and docs/ARCHITECTURE.md for the current implementation. Original UI tests/results are archived under tests/legacy/.

Updated 30 October 2026. The application remains HTML, CSS, and vanilla JavaScript. Open `index.html` directly, or serve this directory with `python3 -m http.server 4173` and visit `http://127.0.0.1:4173`.

## Changed application files

- `index.html`: Vietnamese page headings, clearer login branding, semantic main landmarks and table headings, accessible form/dialog labels, calendar containers, safe-area viewport support, and local SVG favicon. Original element IDs and action handlers are retained.
- `style.css`: shared design tokens, white surfaces, coffee accents, larger typography, spacious cards, subtle status treatments, visible focus, minimum 44px button targets, responsive layouts, scrollable dialogs, safe areas, and reduced-motion support.
- `app.js`: presentation changes in the manager/employee renderers, live overview counts, date-field synchronization, day/group selection, keyboard focus preservation, progress accessibility, and dialog focus management. Scheduling, account validation, registration, approvals, staff data, constraints, and the `appState` definition remain unchanged.

## Responsive behavior

| Width | Calendar and panels |
| --- | --- |
| Below 768px | Scrollable seven-day selector; exactly three shift cards for the chosen day; single-column panels; bottom-sheet request dialog. |
| 768–1199px | Three-day calendar with previous/next groups; all seven days remain reachable; secondary panels below the calendar. Employee assigned shifts sit on the left, registration progress and submission on the right. |
| 1200–1599px | Full seven-day calendar; management panels below it to preserve legibility. |
| 1600px and above | Full seven-day calendar and management sidebar, inside a 1600px maximum-width workspace. |

The tablet groups are Monday–Wednesday, Thursday–Saturday, and Friday–Sunday. The final group overlaps to keep three full days visible.

All layouts reuse the original table cells and action handlers. No duplicate mobile calendar, dataset, or scheduling logic is introduced. Only the visible day/group is stored separately as presentation state. CSS handles resizing; a breakpoint listener keeps the selected day visible in the mobile selector. Resizing and rotating preserve selection.

Dialogs support Tab/Shift+Tab wrapping, Escape, background click, inert background content, focus restoration, internal scrolling, and safe-area padding. Inputs use 16px text. Native browser confirmation/alert flows remain intact.

## Verification

**Latest executed result:** 29 checks passed; all 18 dashboard viewport/role combinations passed, plus login at all nine sizes. No application console/runtime errors were recorded. The suite handled 17 native dialogs.

`tests/ui-regression.cjs` runs browser interactions and layout assertions in Chrome through Playwright. `tests/results.json` contains the latest executed results. Test code and fixtures affect only browser test sessions.

The suite checks:

1. Manager login, including invalid password/account validation.
2. Employee login, including the numeric account alias.
3. Logout.
4. Previous/next/current week navigation.
5. Date selection and synchronized date-field presentation.
6. All four workflow steps, including publication confirmation acceptance and cancellation.
7. Automatic scheduling using existing seeded registrations.
8. Staffing calculations for morning, afternoon, and evening shifts.
9. Employee registration through the mobile calendar.
10. Cancellation through the mobile calendar.
11. Hour/night-shift totals, invalid submission, and department restrictions.
12. Supplementary shift registration.
13. Emergency leave and shift-change requests, including empty-reason and missing-target validation.
14. Manager approval/rejection, reassignment, and resulting staff membership.
15. Original native confirmation/validation flows exercised by the cases above.

Additional checks cover all nine requested viewport sizes for both roles, login at all sizes, button touch dimensions, overflow inside management panels, duplicate IDs, visible shift counts, tablet navigation to Sunday, orientation changes, reduced motion, keyboard dialog behavior, a 320×360 reduced-height dialog viewport, and a 200% zoom-equivalent layout viewport.

Source checks compare 28 original function hashes, plus the employee list, day definitions, shift configuration, initial state definition, and original DOM IDs. The two dialog functions exclude only their new presentation-hook calls when comparing hashes. The three rendering functions are intentionally excluded from the function hash comparison.

Run after starting the local server:

```sh
node tests/ui-regression.cjs
```

Requires Playwright and Chrome. The script uses installed Playwright, with a fallback to this computer's bundled Codex runtime. Set `CHROME_PATH` if Chrome is elsewhere. No dependencies are needed to run the website itself.

Screenshots are in `screenshots/`: login, validation, manager desktop (1440px and 1920px), tablet (768px), mobile (393px), employee mobile, and the mobile request dialog. Dashboard screenshots show state produced by exercising the original scheduling and request flows; no new production data was added.

## Existing behavior and limits

- **Original scheduling issue preserved:** the app starts in phase 2. `runSchedulingAlgorithm()` clears assignments and then validates employees using assigned hours in that phase, so the initial pass excludes everyone. Running the scheduler from phase 1 uses registered hours and assigns staff. This redesign does not repair or bypass that algorithm.
- Week navigation changes displayed dates over the existing shared schedule; the original application does not maintain separate data per week.
- State is held in memory and resets on reload, as before.
- Browser checks use desktop Chrome with responsive viewport sizes. Physical iPhone/iPad Safari, its virtual keyboard, hardware safe areas, and native 200% browser zoom were not directly tested. The suite tests a reduced-height dialog and a half-width CSS viewport instead.
- Plus Jakarta Sans still loads through the existing Google Fonts connection; system fonts are available offline.
