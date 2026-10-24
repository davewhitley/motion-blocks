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

There's one CSS-spec interaction worth knowing about. Applying any `transform` animation (rotate, scale, etc.) to the entire block creates a new containing block, which un-fixes any descendant `position: fixed` or `background-attachment: fixed`. If you animate the whole Cover block with a transform AND have Fixed background enabled, the fixed background will scroll with the page while the animation runs. This is a CSS limitation, not specific to this plugin. Pick one or the other. Once a one-shot entry animation finishes (Page Load with Repeat Once, or Scroll Appear with Entry Replay Once and no Exit) and the block is back at its normal look, Motion Blocks drops the animation, so a Navigation block's mobile overlay or a Cover's Fixed background inside the block works normally again. Animations that can play again (Repeat or Reverse replay, an Exit animation, loops, Scroll Interactive) keep the interaction.

## Cross-cutting features

- **Stagger**. On parent blocks with multiple inner blocks (Group, Columns, Buttons, Gallery, List), the animation cascades to each child with a configurable step delay. Works with every effect including Custom; the synthesized keyframe is shared across children via a CSS custom property.
- **Custom From / To**. A 9-property editor (opacity, translateX/Y, scale, rotate, rotateX/Y, blur, clip-path) for arbitrary keyframes. Per-slot in Scroll Appear; shared in the other modes.
- **Editor preview**. Click the play button in any slot or mode to preview the animation in place. The eye icon on the Custom From / To editor freezes the block at the From or To state for visual inspection.
- **Live scroll preview (beta)**. Off by default — enable under Settings → Motion Blocks → Beta features. When on, Interactive scroll blocks animate live in the editor canvas as you scroll, matching the front end. Toggle it per block with the eye icon; drag the scrub slider to freeze a frame, then scroll to resume live. Gated on the opt-in only — browsers without scroll-driven animation support fall back to the scrub slider, and the off switch lives on the settings page (separate from the editor) so it's always reachable.
- **Auto-animate this page**. One-click apply that walks the block tree and applies a default to each top-level block, skipping body content and nested blocks. Three style presets (Subtle, Smooth, Bold).
- **Saved animations library**. Save a configured animation as a recipe, apply it to other blocks. Stored in the `mb_saved_animations` site option (sanitized on write; removed on uninstall along with all other plugin data). Comes seeded with Spin, Iris Wipe, and Diagonal Wipe recipes. Saving and deleting library entries needs the `manage_options` capability (Administrators by default), because the library is a site setting; other roles don't see Save or Delete.
- **Per-device disable**. Three toggles in the Page panel (Desktop, Tablet, Mobile) selectively suppress animations at each breakpoint.
- **Reduced motion support**. All animations are disabled when `prefers-reduced-motion: reduce` is set at the OS level.
- **Page-level overflow protection**. A single zero-specificity `body { overflow-x: clip }` rule (gated on `body.mb-clip-page-overflow`) keeps horizontal scrollbars from appearing when animations transform elements off-screen. Filterable via `motion_blocks_apply_overflow_clip`.
- **Content added after load**. Animated blocks that appear after the page loads (Query Loop pagination without a full reload, infinite scroll, AJAX, popups) are picked up and animated automatically. For changes the plugin can't see coming, such as a script that moves blocks without resizing the page, call `window.motionBlocks.refresh()` to re-scan and re-measure; pass an element to only re-scan inside it.
- **No-JS fallback**. The initial-hide rules are gated on an `html.mb-js` marker set by a synchronous head script — if JavaScript is disabled or blocked, animated content is never invisible; it simply renders statically.
- **Loads only where it's used**. The front-end stylesheet, the runtime script and the `html.mb-js` marker load only on pages that have animated blocks; other pages carry none of it (about 68 KB, 17 KB gzipped, and two requests saved). Block themes are detected from the rendered template; classic themes pre-scan the queried posts, the synced patterns and patterns they use, block widgets and block template parts. An animated block that still turns up after `<head>` (e.g. from a shortcode) loads the CSS and JS after the content instead, with a brief flash on load. For content that arrives after the page loads (AJAX pagination, infinite scroll, popups), force the assets on with `add_filter( 'motion_blocks_load_frontend_assets', '__return_true' );`, or turn them off with `__return_false`. The editor always loads its CSS.

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

## AI agents and automation

Animations are plain JSON, and AI agents (or any script) can read and change them through WordPress's Abilities API (WordPress 6.9+).

### Recipes: one animation as JSON

A **recipe** is the agent-readable form of one block's animation. It's versioned and documented by a JSON Schema ([`schema/animation-recipe.v1.json`](schema/animation-recipe.v1.json)), and it maps to and from the block's attributes without loss:

```json
{
  "version": 1,
  "mode": "scroll-appear",
  "entry": {
    "type": "custom",
    "duration": 0.8,
    "easing": "cubic-bezier(0.16, 1, 0.3, 1)",
    "from": { "opacity": 0, "translateY": 24 },
    "to": { "opacity": 1, "translateY": 0 }
  },
  "exit": null,
  "stagger": { "step": 0.1 }
}
```

- `mode`: `page-load` and `scroll-interactive` take an `effect`; `scroll-appear` takes an `entry`, an `exit`, or both.
- Times are seconds. Omitted fields take documented defaults: duration 0.6, delay 0, easing `ease`.
- `easing`: `ease`, `linear`, `ease-in`, `ease-out`, `ease-in-out`, `spring`, `bouncy`, `snappy`, or any CSS `cubic-bezier()`, `steps()` or `linear()`.
- Custom `from` / `to` numbers get their default unit: px for translate and blur, deg for rotations. Strings can carry their own unit (`"50%"`, `"0.5turn"`).
- Numbers and booleans may also be sent as strings (`"0.6"`, `"true"`), as they arrive from query strings.
- `target: "image"` animates only a Cover's background image. `stagger` cascades the children of a Group, Columns, Buttons, Gallery or List.

`null` means no animation.

### Abilities

All are public abilities in the `motion-blocks` category. They're available over REST at `/wp-json/wp-abilities/v1/abilities/<name>/run`, and to MCP clients (Claude, ChatGPT and others) through WordPress's [MCP Adapter](https://github.com/WordPress/mcp-adapter). Each runs as the signed-in user, with the same permissions as the editor.

| Ability | What it does | Needs |
|---|---|---|
| `motion-blocks/get-effects` | Modes, effects, directions and easings, the recipe schema, and examples. Read this first. | `edit_posts` |
| `motion-blocks/get-animations` | Every block of a post, page, template or pattern, with its `path`, type, a text excerpt and its recipe. | edit that post |
| `motion-blocks/validate-recipe` | Checks a recipe and returns each problem with its path and a hint. Changes nothing. | `edit_posts` |
| `motion-blocks/set-animations` | Sets or removes the animation of one or more blocks and saves straight away, published pages included. | edit that post |
| `motion-blocks/list-saved-animations` | The saved library and the theme's recipes, as recipes. | `manage_options` (like the library in the editor) |
| `motion-blocks/save-animation` | Adds a recipe to the saved library. | `manage_options` |

How `set-animations` behaves:
- **All or nothing.** Every change is validated before anything is saved. If any change is invalid, nothing is written and every problem is returned.
- **One revision.** Valid changes are saved together as one revision, so they can be rolled back from the editor's Revisions screen.
- **Stale-path guard.** Each change names the `block_name` that `get-animations` reported at that path. If the page changed since, it's refused.
- **No conflicting edits.** It's refused while another user has the post open in the editor.
- **Block content only.** Revisions, autosaves and attachments can't be read or changed.

```bash
# Read a page's blocks and animations (cookie or Application Password auth).
curl -u admin:APP_PASSWORD "https://example.com/wp-json/wp-abilities/v1/abilities/motion-blocks/get-animations/run?input%5Bpost_id%5D=42"

# Make the first block slide up as it scrolls into view.
curl -u admin:APP_PASSWORD -X POST -H "Content-Type: application/json" \
  "https://example.com/wp-json/wp-abilities/v1/abilities/motion-blocks/set-animations/run" \
  -d '{"input":{"post_id":42,"changes":[{"path":[0],"block_name":"core/heading","recipe":{"version":1,"mode":"scroll-appear","entry":{"type":"slide","direction":"btt"}}}]}}'
```

In PHP, `motion_blocks_attributes_to_recipe()` and `motion_blocks_recipe_to_attributes()` (in `includes/recipe.php`) do the same conversion, with validation.

## Architecture (brief)

The plugin extends existing blocks via three filters. It doesn't register any new block types.

| Concern | Where |
|---|---|
| Block attribute schema | `src/index.js` → `addAnimationAttributes`. Defaults come from `schemaDefaults` in `shared-constants.json`, which the PHP render filter also applies, so omitted attributes resolve the same in the editor and on the front end. |
| Agent recipes and abilities | `includes/recipe.php` (recipe ↔ attributes, validation, JSON Schema), `includes/abilities.php` (the `motion-blocks/*` abilities). The published schema is generated from PHP: `wp eval-file tests/recipe/check.php schema`. |
| Editor UI / preview HOC | `src/index.js` → `withAnimationPreview`, components in `src/components/` |
| Class + data-attribute emission | `animation-plugin.php` → `motion_blocks_render_block`. Render-time only; `save()` no longer emits. Editor preview gets the same classes via the HOC above. |
| Frontend runtime | `src/frontend.js` → mode-specific init (`initPageLoadAnimations`, `initScrollAppearAnimations`, `initScrollInteractiveAnimations`) |
| Animation keyframes / class bindings | `css/animations.css` |
| Migration shim (legacy Scroll trigger model → Slot model) | `migrateScrollAppearAttrs` in `src/components/constants.js`, mirrored as `motion_blocks_migrate_scroll_appear_attrs` in PHP |

## Requirements

- WordPress 6.6+ (the editor script needs core's `react-jsx-runtime` script and `@wordpress/editor`'s `PluginDocumentSettingPanel`, both added in 6.6)
- PHP 7.4+
- Browser: any with CSS animation support. Scroll Interactive mode needs scroll-driven animations (`animation-timeline: view()`); in browsers without them (e.g. Firefox, Safari before 26), Scroll Interactive blocks are shown at rest, without the effect.

## Development

```bash
npm install
npm run build    # production build
npm run start    # watch mode
```

Build output goes to `build/`. A release zip holds `LICENSE`, `README.md`, `animation-plugin.php`, `uninstall.php`, `shared-constants.json`, `css/`, `build/`, `includes/` and `schema/` under a top-level `motion-blocks/` folder (for example `git archive --prefix=motion-blocks/ <tag> LICENSE README.md animation-plugin.php uninstall.php shared-constants.json css build includes schema`). Plugin entry is `animation-plugin.php`; symlink the plugin directory into your WP `wp-content/plugins/` for live development.

`tests/schema-defaults/check.php` checks that the front end renders saved blocks the way the editor panel shows them, and that server-rendered block previews (Archives, Calendar, and so on) load in the editor. Run it with WP-CLI from a site that has the plugin active (add `page` to generate a visual test page, or `audit` to list the output of every animated block on the site):

```bash
wp eval-file path/to/motion-blocks/tests/schema-defaults/check.php
```

## Tests

**Unit tests** (Jest, `tests/unit/`), a few seconds:

```bash
npm run test:unit
```

**Page & editor checks** (`tests/self-check/`): `fixtures.php` builds a set of published pages, one per self-check scenario plus a smoke page with every effect in every mode, and `run.mjs` opens each one in headless Chrome, runs the self-check sweep with and without reduced motion, compares the result with what the page expects, then opens it in the editor and runs the editor check. It needs Google Chrome (or set `CHROME_PATH`) and Node 22+. Against a local Studio site with the plugin active and Settings → Motion Blocks → Self-check turned on (`studio wp option update mb_debug_markers 1`):

```bash
cd ~/Studio/<site>
studio wp eval-file <path-to>/motion-blocks/tests/self-check/fixtures.php json > /tmp/mb-manifest.json
cd <path-to>/motion-blocks
npm run test:pages -- --manifest /tmp/mb-manifest.json
```

It logs in through Studio's auto-login URL; on another local site use `--login form --user <name> --password <pw>`. `node tests/self-check/run.mjs --help` lists every option (Chrome path, number of pages checked at once, `--only smoke,clean`, …).

**Recipe and abilities check** (`tests/recipe/check.php`, WP-CLI): round-trips every schema-defaults fixture through a recipe and back and checks the front-end markup is unchanged. It also checks validation errors, and runs each ability end to end on a temporary page, including over REST. `wp eval-file <path-to>/motion-blocks/tests/recipe/check.php`.

**CI** (`.github/workflows/ci.yml`) runs on every pull request and every push to `main`:

1. *Build & unit tests* (about 1 minute): `npm ci`, `npm run build`, fails if the committed `build/` differs from a fresh build (run `npm run build` and commit `build/`), then `npm run test:unit`.
2. *Page & editor checks* (about 4 minutes, only after job 1 passes): starts WordPress 7.1 in [WordPress Playground](https://wordpress.github.io/wordpress-playground/developers/local-development/wp-playground-cli) with this repo mounted as the plugin. `tests/self-check/blueprint.json` activates the plugin, turns on Self-check and runs `fixtures.php json`; then `run.mjs` checks every page. The output is attached to the run as the `page-checks` artifact.

To run the CI setup itself locally (needs Node 24+ for the Playground CLI), from the repo root:

```bash
mkdir -p ci-output
npx @wp-playground/cli@3.1.60 server --port=9400 --wp=7.1 \
  --mount="$PWD:/wordpress/wp-content/plugins/motion-blocks" \
  --mount="$PWD/ci-output:/ci-output" \
  --blueprint=tests/self-check/blueprint.json
# in another terminal, once it prints "Ready!":
npm run test:pages -- --manifest ci-output/manifest.json --login form
```

## License

GPL-2.0-or-later
