# Changelog

Notable changes to Motion Blocks. Releases are tagged on GitHub; the notes for each release are also on the [Releases page](https://github.com/davewhitley/motion-blocks/releases).

## Unreleased (0.6.0-dev)

### Changed

- "Acceleration" is now "Easing", and the Page Load "Repeat" setting is now "Loop" (Off, Loop continuously, Back and forth). The block attributes and the AI recipe field changed with them (`animationEasing`, `animationLoop`, recipe `loop`). Blocks saved with the old names fall back to the defaults for those two settings.
- Stored data moved from `mb_*` names to `motion_blocks_*` (options and the per-device post meta). Existing data is moved once, the first time the site loads.
- Scroll Interactive: Image Move, Image Zoom, and Custom default to Linear easing, so the motion follows the scroll evenly.
- Auto-animate: the Smooth style is now Balanced; a new option includes the header, footer, and other template parts; each style has a one-line description; and the curve it uses is a named Easing option, Smooth Out.
- Interactive scroll: the preview is a labelled "Scroll preview" toggle.
- Switching animation type keeps each type's own settings, so switching back restores them.
- AI abilities: `set-animations` is refused while the post is open in the post editor or was saved since it was read, and returns `previous_revision_id` for undo. `list-saved-animations` returns the theme's animations to anyone who can edit. `set-animations` now rewrites only the blocks it changes, and `get-animations` warns about saved animations it would refuse.

### Performance

- Page Load blocks are revealed as soon as the plugin's script runs, not after every deferred script on the page.
- The animation stylesheet is served minified (about 2.9 KB gzipped, down from about 14 KB).

### Fixed

- Content that could stay blank or frozen: after anchor jumps and reloads, in pinned headers and fixed containers, in print, in loops, and with Curtain Close.
- Scroll modes inside boxes that crop or scroll.
- Synced patterns, and blocks whose markup starts with a style tag.
- Exit direction arrows, and Entry Replay Reverse combined with an Exit.
- The editor preview now matches the front end in seven more places.
- Saving, applying, and reading saved animations, and applying an animation to several blocks.
- Keyboard focus moving into a hidden animated block now shows it at once; fast loops are slowed to a safe minimum; sideways scrolling is clipped only while motion is on.
- Keyboard and screen-reader use of the Motion Effects panel.
- Editor fields no longer round or drop typed values (Scale, Stagger offset, Move, Duration, Blur).
- Auto-animate planner edge cases: Query Loops, long Covers, busy first screens, template parts, and intro paragraphs.
- The render filter, the per-device switches, and editor data handling: an animated Comment Template, comma-decimal locales, custom roles, and unknown animation values.

### Development

- Linting, a CI workflow with page and editor checks, and a test that runs every Scroll Appear setup through the same scroll journeys.

## 0.5.0 and earlier

See the [Releases page](https://github.com/davewhitley/motion-blocks/releases).
