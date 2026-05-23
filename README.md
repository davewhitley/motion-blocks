# Motion Blocks

A WordPress plugin that adds CSS-driven animations to any block in the Site Editor — no custom block required. Pre-release.

## Animation modes

Each block gets one mode at a time, picked from the **Motion Effects** sub-panel in the block inspector.

- **On page load** — Plays once when the page loads. Supports `repeat: once / loop / alternate` and pauses when the element is off-screen.
- **Appear on scroll** — Slot-based model. Each block has independent **Entry** and **Exit** slots; either or both can be filled. Triggered by an Intersection Observer.
- **Interactive scroll** — Animation progress is tied to scroll position via CSS `animation-timeline: view()`. Supports custom range start/end (e.g. `entry 20%` → `exit 80%`).

## Effects

| Effect | Page Load | Scroll Appear (Entry) | Scroll Appear (Exit) | Scroll Interactive |
|---|:-:|:-:|:-:|:-:|
| Fade In / Out | ✓ | ✓ | ✓ | ✓ |
| Slide In / Out (4-axis) | ✓ | ✓ | ✓ | ✓ |
| Scale In / Out | ✓ | ✓ | ✓ | ✓ |
| Blur In / Out | ✓ | ✓ | ✓ | ✓ |
| Rotate In / Out (±360°) | ✓ | ✓ | ✓ | ✓ |
| Wipe / Curtain | ✓ | ✓ | ✓ | ✓ |
| Flip | ✓ | ✓ | — | ✓ |
| **Image Move (Beta)** | ✓ | ✓ | ✓ | ✓ |
| **Image Zoom (Beta)** | ✓ | ✓ | ✓ | ✓ |
| **Custom** (From / To) | ✓ | ✓ | ✓ | ✓ |

Image Move and Image Zoom are block-gated to `core/image` and `core/cover` only — they animate the first `<img>` descendant rather than the block wrapper. For Image blocks with a caption, a server-side `<div class="mb-img-frame">` wrapper is injected so the figcaption stays outside the clip region.

## Cross-cutting features

- **Stagger** — On parent blocks with multiple inner blocks (Group / Columns / Buttons / Gallery / List), the animation cascades to each child with a configurable step delay. Works with every effect including Custom (the synthesized keyframe is shared across children via a CSS custom property).
- **Custom From / To** — A 9-property editor (opacity, translateX/Y, scale, rotate, rotateX/Y, blur, clip-path) for arbitrary keyframes. Per-slot in Scroll Appear; shared in the other modes.
- **Editor preview** — Click the play button in any slot / mode to preview the animation in place. The eye icon on the Custom From / To editor freezes the block at the From or To state for visual inspection.
- **Auto-animate this page** — One-click apply: walks the block tree, applies a tasteful default to each top-level block, skips body content and nested blocks. Three style presets (Subtle / Smooth / Bold).
- **Saved animations library** — Save a configured animation as a recipe, apply it to other blocks. Stored in the `mb_saved_animations` site option. Comes seeded with a "Spin" recipe.
- **Per-device disable** — Three toggles in the Page panel (Desktop / Tablet / Mobile) selectively suppress animations at each breakpoint.
- **Reduced motion support** — All animations are disabled when `prefers-reduced-motion: reduce` is set at the OS level.
- **Page-level overflow protection** — A single `html { overflow-x: clip }` rule (gated on `body.mb-clip-page-overflow`) keeps horizontal scrollbars from appearing when animations transform elements off-screen. Filterable via `motion_blocks_apply_overflow_clip`.

## Architecture (brief)

The plugin extends existing blocks via three filters — it doesn't register any new block types.

| Concern | Where |
|---|---|
| Block attribute schema | `src/index.js` → `addAnimationAttributes` |
| Editor UI / preview HOC | `src/index.js` → `withAnimationPreview`, components in `src/components/` |
| Save-time HTML props | `src/index.js` → `addAnimationSaveProps`, `saveScrollAppearProps` |
| Server-side render filter | `animation-plugin.php` → `motion_blocks_render_block` (handles dynamic blocks + Image-effect wrap injection) |
| Frontend runtime | `src/frontend.js` → mode-specific init (`initPageLoadAnimations`, `initScrollAppearAnimations`, `initScrollInteractiveAnimations`) |
| Animation keyframes / class bindings | `css/animations.css` |
| Migration shim (legacy Scroll trigger model → Slot model) | `migrateScrollAppearAttrs` in `src/components/constants.js` (mirrored as `motion_blocks_migrate_scroll_appear_attrs` in PHP) |

## Requirements

- WordPress 6.4+
- PHP 7.4+
- Browser: any with CSS animation support. `animation-timeline: view()` (Scroll Interactive mode) gracefully degrades to a one-shot animation in browsers that don't support scroll-driven animations.

## Development

```bash
npm install
npm run build    # production build
npm run start    # watch mode
```

Build output goes to `build/`. Plugin entry is `animation-plugin.php`; symlink the plugin directory into your WP `wp-content/plugins/` for live development.

## License

GPL-2.0-or-later
