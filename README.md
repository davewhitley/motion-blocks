# Motion Blocks

A WordPress plugin that adds CSS-driven animations to any block in the Site Editor, with no custom block required. Pre-release.

## Animation modes

Each block gets one mode at a time, picked from the **Motion Effects** sub-panel in the block inspector.

- **On page load**. Plays once when the page loads. Supports `repeat: once / loop / alternate` and pauses when the element is off-screen.
- **Appear on scroll**. Slot-based model. Each block has independent **Entry** and **Exit** slots; either or both can be filled. Triggered by an Intersection Observer.
- **Interactive scroll**. Animation progress is tied to scroll position via CSS `animation-timeline: view()`. Supports custom range start/end (for example, `entry 20%` to `exit 80%`).

## Effects

| Effect | Page Load | Scroll Appear (Entry) | Scroll Appear (Exit) | Scroll Interactive |
|---|:-:|:-:|:-:|:-:|
| Fade In / Out | ✓ | ✓ | ✓ | ✓ |
| Slide In / Out (4-axis) | ✓ | ✓ | ✓ | ✓ |
| Scale In / Out | ✓ | ✓ | ✓ | ✓ |
| Blur In / Out | ✓ | ✓ | ✓ | ✓ |
| Rotate In / Out (±360°) | ✓ | ✓ | ✓ | ✓ |
| Wipe / Curtain | ✓ | ✓ | ✓ | ✓ |
| Flip | ✓ | ✓ | ✓ | ✓ |
| **Image Move (Beta)** *(Cover only)* | ✓ | ✓ | ✓ | ✓ |
| **Image Zoom (Beta)** *(Cover only)* | ✓ | ✓ | ✓ | ✓ |
| **Custom** (From / To) | ✓ | ✓ | ✓ | ✓ |

**Image Move, Image Zoom, and Custom "Animate image only" target are v1-scoped to `core/cover` blocks.** Cover has a clean single-img markup contract (the `wp-block-cover__image-background` img) without figcaption or link variants, so the image-effect machinery composes reliably with the editor preview and frontend render path. Image blocks get the rest of the catalog (fade, slide, scale, blur, rotate, wipe, curtain, flip, and Custom on the entire figure) but can't currently use img-targeted effects. Re-introducing Image block support is on the roadmap once the wrap mechanism is unified across editor and frontend.

### Cover block: known interactions

The Cover block has a few settings that change how its background renders. Motion Blocks handles them as follows:

| Cover setting | What happens with motion effects |
|---|---|
| **Fixed background** (`hasParallax`) | Cover switches to a CSS `background-image` div, so there's no `<img>` element to target. Image Move, Image Zoom, and Custom (Image only) are disabled in the panel with a warning notice. Animate the entire block instead, or turn Fixed background off. |
| **Repeated background** (`isRepeated`) | Same as above. Cover uses CSS `background-image` instead of `<img>`, and image-targeted effects are disabled. |
| **Focal point** | Unaffected. `background-position` (or `object-position` on the inner img) composes cleanly with our transforms. |
| **Aspect ratio / dimensions** | Unaffected. Cover's `object-fit: cover` continues to fit the visible crop; transform animations apply on top. |

There's one CSS-spec interaction worth knowing about. Applying any `transform` animation (rotate, scale, etc.) to the entire block creates a new containing block, which un-fixes any descendant `position: fixed` or `background-attachment: fixed`. If you animate the whole Cover block with a transform AND have Fixed background enabled, the fixed background will scroll with the page while the animation runs. This is a CSS limitation, not specific to this plugin. Pick one or the other.

## Cross-cutting features

- **Stagger**. On parent blocks with multiple inner blocks (Group, Columns, Buttons, Gallery, List), the animation cascades to each child with a configurable step delay. Works with every effect including Custom; the synthesized keyframe is shared across children via a CSS custom property.
- **Custom From / To**. A 9-property editor (opacity, translateX/Y, scale, rotate, rotateX/Y, blur, clip-path) for arbitrary keyframes. Per-slot in Scroll Appear; shared in the other modes.
- **Editor preview**. Click the play button in any slot or mode to preview the animation in place. The eye icon on the Custom From / To editor freezes the block at the From or To state for visual inspection.
- **Live scroll preview (beta)**. Off by default — enable under Settings → Motion Blocks → Beta features. When on, Interactive scroll blocks animate live in the editor canvas as you scroll, matching the front end. Toggle it per block with the eye icon; drag the scrub slider to freeze a frame, then scroll to resume live. Gated on the opt-in only — browsers without scroll-driven animation support fall back to the scrub slider, and the off switch lives on the settings page (separate from the editor) so it's always reachable.
- **Auto-animate this page**. One-click apply that walks the block tree and applies a default to each top-level block, skipping body content and nested blocks. Three style presets (Subtle, Smooth, Bold).
- **Saved animations library**. Save a configured animation as a recipe, apply it to other blocks. Stored in the `mb_saved_animations` site option (sanitized on write; removed on uninstall along with all other plugin data). Comes seeded with Spin, Iris Wipe, and Diagonal Wipe recipes.
- **Per-device disable**. Three toggles in the Page panel (Desktop, Tablet, Mobile) selectively suppress animations at each breakpoint.
- **Reduced motion support**. All animations are disabled when `prefers-reduced-motion: reduce` is set at the OS level.
- **Page-level overflow protection**. A single `html { overflow-x: clip }` rule (gated on `body.mb-clip-page-overflow`) keeps horizontal scrollbars from appearing when animations transform elements off-screen. Filterable via `motion_blocks_apply_overflow_clip`.
- **No-JS fallback**. The initial-hide rules are gated on an `html.mb-js` marker set by a synchronous head script — if JavaScript is disabled or blocked, animated content is never invisible; it simply renders statically.

## Theme-shipped animation recipes (`theme.json`)

Themes can ship animation recipes at `settings.custom.motionBlocks.savedAnimations`. The editor surfaces them in the Motion panel's kebab menu under "Theme animations" alongside the user library.

```json
{
  "version": 3,
  "settings": {
    "custom": {
      "motionBlocks": {
        "savedAnimations": {
          "spin-loop": {
            "name": "Spin (continuous)",
            "attributes": {
              "animationMode": "page-load",
              "animationType": "custom",
              "animationDuration": 2,
              "animationAcceleration": "linear",
              "animationRepeat": "loop",
              "animationFromRotate": "0deg",
              "animationToRotate": "360deg"
            }
          },
          "fade-up-on-scroll": {
            "name": "Fade Up on Scroll",
            "attributes": {
              "animationMode": "scroll-appear",
              "animationEntryType": "custom",
              "animationEntryDuration": 0.6,
              "animationEntryFromOpacity": 0,
              "animationEntryToOpacity": 1,
              "animationEntryFromTranslateY": "40px",
              "animationEntryToTranslateY": "0px"
            }
          }
        }
      }
    }
  }
}
```

**Storage format for Custom From/To values:**
- `opacity`, `scale`. Bare numbers (`0`, `1`, `0.5`, `1.2`).
- `translateX`, `translateY`. Strings with unit (`"40px"`, `"50%"`, `"2vw"`).
- `rotate`, `rotateX`, `rotateY`. Strings with `deg` (`"45deg"`, `"-10deg"`, `"360deg"`).
- `blur`. String with `px` (`"8px"`).
- `clipPath`. Raw CSS string (`"inset(0 50% 0 50%)"`).

Recipe `attributes` are copied verbatim into the block, so the format above is exactly what the editor stores after a user configures the same animation through the panel.

## Architecture (brief)

The plugin extends existing blocks via three filters. It doesn't register any new block types.

| Concern | Where |
|---|---|
| Block attribute schema | `src/index.js` → `addAnimationAttributes` |
| Editor UI / preview HOC | `src/index.js` → `withAnimationPreview`, components in `src/components/` |
| Class + data-attribute emission | `animation-plugin.php` → `motion_blocks_render_block`. Render-time only; `save()` no longer emits. Editor preview gets the same classes via the HOC above. |
| Frontend runtime | `src/frontend.js` → mode-specific init (`initPageLoadAnimations`, `initScrollAppearAnimations`, `initScrollInteractiveAnimations`) |
| Animation keyframes / class bindings | `css/animations.css` |
| Migration shim (legacy Scroll trigger model → Slot model) | `migrateScrollAppearAttrs` in `src/components/constants.js`, mirrored as `motion_blocks_migrate_scroll_appear_attrs` in PHP |

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
