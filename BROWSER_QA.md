# Browser QA checklist

Jest and JSDOM cover helper logic and DOM behavior, but they cannot validate Instagram's live markup, the browser download shelf, pointer capture, or touch behavior. Run this checklist against a fresh production build (`npm run build`) loaded from `dist/`.

## Desktop

- [ ] Open the home feed, a profile, a post, a Reel feed, and Stories. Confirm TrendLoom controls appear where expected and opening history does not produce a false compatibility warning.
- [ ] Download a photo, a video, a carousel item, a full carousel, a Reel, a Story, and a profile avatar. Confirm files arrive in the browser download shelf and history moves from `downloading` to `completed`.
- [ ] Temporarily block or interrupt a media request. Confirm history shows `failed` with an actionable message instead of `completed`.
- [ ] On a Reel with a poster, download its thumbnail and confirm the image file and success announcement. On a Reel without a poster, confirm the failure announcement.
- [ ] Drag the floating control to each screen edge and corner. Confirm it snaps nearby, remains visible, and restores its position after a refresh.
- [ ] Resize the browser window after positioning the control. Confirm the control stays within the viewport.
- [ ] Use Tab, Shift+Tab, Enter, and Space. Confirm visible focus, working tooltips, and operable controls.
- [ ] Focus the history control and use Alt+Arrow; use Shift+Alt+Arrow for larger movement. Confirm position is saved.
- [ ] Enable the operating system's reduced-motion setting. Confirm panel and toast transitions stop.

## Touch and narrow viewports

- [ ] Use a touch device or browser device emulation at 320 px, 375 px, and 520 px widths.
- [ ] Tap the history control to expand/collapse it. Drag it without triggering a click and confirm the button remains reachable.
- [ ] Confirm the Reel thumbnail target remains 44 × 44 px and does not overlap Instagram's primary controls.
- [ ] Rotate or resize the viewport after moving the control; confirm it is clamped back on screen.
- [ ] Confirm status messages remain visible above the browser safe-area inset and do not cover the panel controls.

## Browser matrix

- [ ] Repeat the download, history, and keyboard checks in current Chrome, Edge, and Brave releases.
- [ ] Record browser version, Instagram route, and any failed control in the issue report. Instagram markup changes can affect only some routes.
