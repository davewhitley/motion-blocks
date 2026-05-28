<?php
/**
 * Plugin Name: Motion Blocks
 * Description: Add CSS animations to any block in the Site Editor
 * Version: 0.1.0
 * Requires at least: 6.2
 * Requires PHP: 7.4
 * Author: Dave Whitley
 * License: GPL-2.0-or-later
 * Text Domain: motion-blocks
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

define( 'MOTION_BLOCKS_VERSION', '0.1.0' );

/**
 * Bundled saved-animation recipe schema version. Bump whenever the
 * set of recipes returned by `motion_blocks_bundled_recipes()`
 * changes (new recipe added, etc.). The `admin_init` version gate
 * re-runs the (idempotent) seeder once per bump so existing installs
 * receive newly-bundled recipes on update — not just fresh
 * activations.
 *
 * History:
 *   1 — Spin only (legacy one-shot `mb_saved_animations_seeded` flag)
 *   2 — + Iris Wipe, Diagonal Wipe
 */
define( 'MOTION_BLOCKS_RECIPE_VERSION', 2 );

/**
 * Load the shared-constants JSON file (single source of truth that
 * the JS side also imports via webpack). Cached per request — the
 * file is tiny and OPcache doesn't help here since it's not PHP.
 *
 * Returns an associative array keyed by the JSON property names
 * (e.g. `staggerParentBlocks`, `propertyCssVar`,
 * `staggerIncompatibleTypes`, `imageEffectTypes`). Falsy default
 * values if the file is missing or unreadable, so the plugin
 * degrades gracefully rather than fatal-erroring.
 */
function motion_blocks_shared_constants() {
    static $cache = null;
    if ( $cache !== null ) {
        return $cache;
    }
    $path = plugin_dir_path( __FILE__ ) . 'shared-constants.json';
    if ( ! file_exists( $path ) ) {
        $cache = array();
        return $cache;
    }
    $raw = file_get_contents( $path );
    $decoded = json_decode( $raw, true );
    $cache = is_array( $decoded ) ? $decoded : array();
    return $cache;
}

/**
 * Enqueue editor scripts and styles for block controls.
 *
 * JS + panel-only CSS go on enqueue_block_editor_assets (parent frame).
 */
function motion_blocks_enqueue_editor_assets() {
    $asset_file = plugin_dir_path( __FILE__ ) . 'build/index.asset.php';

    if ( ! file_exists( $asset_file ) ) {
        return;
    }

    $asset = include $asset_file;

    wp_enqueue_script(
        'motion-blocks-editor',
        plugins_url( 'build/index.js', __FILE__ ),
        $asset['dependencies'],
        $asset['version'],
        true
    );
}
add_action( 'enqueue_block_editor_assets', 'motion_blocks_enqueue_editor_assets' );

/**
 * Enqueue styles that need to load inside the editor iframe AND on the frontend.
 *
 * enqueue_block_assets fires in both contexts, so the animation preview
 * keyframes reach the iframe where blocks are rendered.
 */
function motion_blocks_enqueue_block_assets() {
    // Editor CSS — compiled from css/editor.scss via wp-scripts.
    // Includes preview keyframes + animation class rules.
    // Must load inside the iframe for BlockListBlock className preview to work.
    //
    // Use filemtime() as the version so every rebuild busts the
    // browser cache. Hardcoding MOTION_BLOCKS_VERSION (e.g. 0.1.0)
    // means the browser keeps the cached stylesheet across rebuilds
    // — fine for releases, breaks dev iteration. JS uses the asset
    // .php hash already; CSS gets the same treatment via mtime.
    $editor_css_path = plugin_dir_path( __FILE__ ) . 'build/index.css';
    $editor_css_ver  = file_exists( $editor_css_path )
        ? filemtime( $editor_css_path )
        : MOTION_BLOCKS_VERSION;
    wp_enqueue_style(
        'motion-blocks-editor-styles',
        plugins_url( 'build/index.css', __FILE__ ),
        array(),
        $editor_css_ver
    );

    // animations.css: the single source of truth for animation
    // class → keyframe bindings, duration/delay/fill-mode bindings,
    // and the stagger cascade. The `enqueue_block_assets` hook fires
    // for BOTH the editor iframe and the frontend, so loading it
    // here (outside the !is_admin guard) means editor preview and
    // saved-block rendering use the same CSS — no duplication, no
    // drift. editor.scss still ships duplicate @keyframes as a
    // safety net (and adds editor-only overrides for chrome).
    $anim_css_path = plugin_dir_path( __FILE__ ) . 'css/animations.css';
    $anim_css_ver  = file_exists( $anim_css_path )
        ? filemtime( $anim_css_path )
        : MOTION_BLOCKS_VERSION;
    wp_enqueue_style(
        'motion-blocks-styles',
        plugins_url( 'css/animations.css', __FILE__ ),
        array(),
        $anim_css_ver
    );

    if ( ! is_admin() ) {
        // Frontend-only assets.
        $frontend_asset_file = plugin_dir_path( __FILE__ ) . 'build/frontend.asset.php';

        if ( file_exists( $frontend_asset_file ) ) {
            $frontend_asset = include $frontend_asset_file;

            wp_enqueue_script(
                'motion-blocks-frontend',
                plugins_url( 'build/frontend.js', __FILE__ ),
                $frontend_asset['dependencies'],
                $frontend_asset['version'],
                true
            );
        }
    }
}
add_action( 'enqueue_block_assets', 'motion_blocks_enqueue_block_assets' );

/**
 * Add animation classes and data attributes to rendered block HTML.
 *
 * This mirrors the JS `addAnimationSaveProps` filter so that server-rendered
 * blocks (e.g. inside Query Loop) receive the same markup as static blocks.
 * Uses WP_HTML_Tag_Processor (WP 6.2+).
 *
 * @param string $block_content Rendered block HTML.
 * @param array  $block         Block data including attrs.
 * @return string Modified HTML.
 */
/**
 * Read-time migration shim for Scroll Appear blocks. Maps legacy
 * `animationScrollTrigger` + `animationType` attributes onto the
 * slot model (`animationEntry*` / `animationExit*`). Mirrors the JS
 * `migrateScrollAppearAttrs` in `src/components/constants.js` so
 * server-rendered blocks emit the same shape as editor-saved ones.
 *
 * Idempotent: if either `animationEntryType` or `animationExitType`
 * is already set, returns `$attrs` unchanged.
 *
 * @param array $attrs Block attributes.
 * @return array Normalized attributes.
 */
function motion_blocks_migrate_scroll_appear_attrs( $attrs ) {
    if ( ! is_array( $attrs ) ) {
        return $attrs;
    }
    $entry_set = isset( $attrs['animationEntryType'] )
        && $attrs['animationEntryType'] !== '';
    $exit_set = isset( $attrs['animationExitType'] )
        && $attrs['animationExitType'] !== '';
    if ( $entry_set || $exit_set ) {
        // Already slot-model. Derive per-slot Replay attrs if absent
        // — same idempotent logic as the JS migration helper.
        return motion_blocks_derive_replay_attrs(
            $attrs,
            $entry_set,
            $exit_set,
            $attrs
        );
    }

    // Normalize the legacy trigger value: v1 'both' aliases to v2 'mirror'.
    $raw_trigger = $attrs['animationScrollTrigger'] ?? 'enter';
    $trigger = ( $raw_trigger === 'both' ) ? 'mirror' : $raw_trigger;

    $raw_type = $attrs['animationType'] ?? '';
    $base_type = preg_replace( '/-out$/', '', $raw_type );

    $direction    = $attrs['animationDirection'] ?? '';
    $duration     = $attrs['animationDuration'] ?? 0.6;
    $delay        = $attrs['animationDelay'] ?? 0;
    $acceleration = $attrs['animationAcceleration'] ?? 'ease';
    $custom_tf    = $attrs['animationCustomTimingFunction']
        ?? 'cubic-bezier(0.25, 0.1, 0.25, 1)';
    $blur         = $attrs['animationBlurAmount'] ?? 8;
    $rotate       = $attrs['animationRotateAngle'] ?? 90;

    $custom_props = array(
        'Opacity',
        'TranslateX',
        'TranslateY',
        'Scale',
        'Rotate',
        'RotateX',
        'RotateY',
        'Blur',
        'ClipPath',
    );

    $fill = function ( $prefix, $is_exit_only ) use (
        $attrs,
        $base_type,
        $direction,
        $duration,
        $delay,
        $acceleration,
        $custom_tf,
        $blur,
        $rotate,
        $custom_props
    ) {
        $out = array(
            "{$prefix}Type"                  => $base_type,
            "{$prefix}Direction"             => $direction,
            "{$prefix}Duration"              => $duration,
            "{$prefix}Delay"                 => $is_exit_only ? 0 : $delay,
            "{$prefix}Acceleration"          => $acceleration,
            "{$prefix}CustomTimingFunction"  => $custom_tf,
            "{$prefix}BlurAmount"            => $blur,
            "{$prefix}RotateAngle"           => $rotate,
        );
        if ( $base_type === 'custom' ) {
            foreach ( $custom_props as $prop ) {
                $shared_from = "animationFrom{$prop}";
                $shared_to   = "animationTo{$prop}";
                $out[ "{$prefix}From{$prop}" ] = $attrs[ $shared_from ] ?? null;
                $out[ "{$prefix}To{$prop}" ]   = $attrs[ $shared_to ] ?? null;
            }
        }
        return $out;
    };

    $legacy_attrs = $attrs;
    if ( $trigger === 'enter' ) {
        $attrs = array_merge( $attrs, $fill( 'animationEntry', false ) );
    } elseif ( $trigger === 'exit' ) {
        $attrs = array_merge( $attrs, $fill( 'animationExit', true ) );
    } else {
        // mirror — fill both slots
        $attrs = array_merge( $attrs, $fill( 'animationEntry', false ) );
        $attrs = array_merge( $attrs, $fill( 'animationExit', true ) );
    }
    $final_entry_set = isset( $attrs['animationEntryType'] )
        && $attrs['animationEntryType'] !== '';
    $final_exit_set = isset( $attrs['animationExitType'] )
        && $attrs['animationExitType'] !== '';
    return motion_blocks_derive_replay_attrs(
        $attrs,
        $final_entry_set,
        $final_exit_set,
        $legacy_attrs
    );
}

/**
 * Derive per-slot Replay attrs from the pre-Replay schema.
 * Mirror of `deriveReplayAttrs` in src/components/constants.js —
 * same precedence and defaults so JS-emitted and PHP-emitted markup
 * agree.
 *
 * Idempotent: only writes attrs that aren't already set on the input.
 */
function motion_blocks_derive_replay_attrs( $attrs, $entry_set, $exit_set, $legacy_attrs ) {
    if ( ! isset( $attrs['animationEntryReplay'] ) ) {
        if ( $entry_set && ! $exit_set ) {
            $attrs['animationEntryReplay'] = ! empty( $legacy_attrs['animationPlayOnce'] )
                ? 'once'
                : 'repeat';
        } elseif ( $entry_set && $exit_set ) {
            $attrs['animationEntryReplay'] = 'repeat';
        }
    }
    if ( ! isset( $attrs['animationExitReplay'] ) && $exit_set ) {
        $attrs['animationExitReplay'] = 'reverse';
    }
    return $attrs;
}

function motion_blocks_render_block( $block_content, $block ) {
    $attrs = $block['attrs'] ?? array();
    $mode  = $attrs['animationMode'] ?? '';

    if ( ! $mode || empty( $block_content ) ) {
        return $block_content;
    }

    // Scroll Appear uses the slot model (animationEntry* / animationExit*).
    // Migrate legacy `animationScrollTrigger` + `animationType` on read so
    // server-rendered blocks emit the new shape without rewriting saved
    // data. Idempotent — no-op once the block has been re-saved by the
    // editor.
    if ( $mode === 'scroll-appear' ) {
        $attrs = motion_blocks_migrate_scroll_appear_attrs( $attrs );
    }

    // Page Load / Scroll Interactive still use the shared animationType.
    // Scroll Appear's "is there anything to render" check is "does either
    // slot have a type" — different logic, handled below.
    $type = $attrs['animationType'] ?? '';
    $entry_type = $attrs['animationEntryType'] ?? '';
    $exit_type  = $attrs['animationExitType'] ?? '';

    if (
        ( $mode === 'scroll-appear' && $entry_type === '' && $exit_type === '' )
        || ( $mode !== 'scroll-appear' && ! $type )
    ) {
        return $block_content;
    }

    $processor = new WP_HTML_Tag_Processor( $block_content );

    if ( ! $processor->next_tag() ) {
        return $block_content;
    }

    // Check if classes are already present (static blocks saved with JS filter).
    // For static blocks, the editor's getSaveContent filter has already
    // added `mb-animated` and the data attributes to the saved HTML, so
    // we don't need to do that work again.
    $existing_class = $processor->get_attribute( 'class' ) ?? '';
    if ( str_contains( $existing_class, 'mb-animated' ) ) {
        return $block_content;
    }

    // --- Classes ---
    $classes = array( 'mb-animated', "mb-mode-{$mode}" );

    if ( $mode === 'scroll-appear' ) {
        // Slot model: add `mb-enter-{type}` for filled Entry slot,
        // `mb-exit-{type}` for filled Exit slot. `mb-has-entry` marks
        // the block as "Entry slot non-empty" so the CSS initial-hide
        // rule applies.
        if ( $entry_type !== '' ) {
            $classes[] = "mb-enter-{$entry_type}";
            $classes[] = 'mb-has-entry';
        }
        if ( $exit_type !== '' ) {
            $classes[] = "mb-exit-{$exit_type}";
        }
    } else {
        $classes[] = "mb-enter-{$type}";
    }

    foreach ( $classes as $class ) {
        $processor->add_class( $class );
    }

    // --- Data attributes ---
    $processor->set_attribute( 'data-mb-mode', esc_attr( $mode ) );

    // Mirrors PROPERTY_CSS_VAR in src/components/constants.js —
    // loaded from shared-constants.json so the lists can't drift.
    $shared       = motion_blocks_shared_constants();
    $custom_props = $shared['propertyCssVar'] ?? array();

    if ( $mode === 'scroll-appear' ) {
        // Note: `data-mb-target="img"` is NOT emitted here. Image
        // effects + the "Animate image only" toggle are restricted to
        // `core/cover`, which is a static block — the JS save filter
        // (`saveScrollAppearProps` in src/index.js) is the
        // authoritative writer of `data-mb-target` into post_content
        // for those cases. Dynamic blocks don't reach this code path
        // for img-target because the feature isn't available on them.

        $play_once = $attrs['animationPlayOnce'] ?? true;
        $processor->set_attribute(
            'data-mb-play-once',
            esc_attr( $play_once ? 'true' : 'false' )
        );

        // Per-slot Replay attrs. Only emit when the corresponding slot
        // is filled — empty slots have no replay behavior to control.
        // Defaults mirror `DEFAULT_ATTRIBUTES` in constants.js so the
        // JS save filter and PHP render filter agree.
        if ( $entry_type !== '' ) {
            $entry_replay = $attrs['animationEntryReplay'] ?? 'once';
            $processor->set_attribute(
                'data-mb-entry-replay',
                esc_attr( $entry_replay )
            );
        }
        if ( $exit_type !== '' ) {
            $exit_replay = $attrs['animationExitReplay'] ?? 'reverse';
            $processor->set_attribute(
                'data-mb-exit-replay',
                esc_attr( $exit_replay )
            );
        }

        // Per-slot attribute emission. Wrapped in a helper-like
        // structure to avoid duplicating logic across slots.
        $slots = array(
            array(
                'name'   => 'entry',
                'prefix' => 'animationEntry',
                'data'   => 'data-mb-entry',
                'type'   => $entry_type,
            ),
            array(
                'name'   => 'exit',
                'prefix' => 'animationExit',
                'data'   => 'data-mb-exit',
                'type'   => $exit_type,
            ),
        );

        foreach ( $slots as $slot ) {
            if ( $slot['type'] === '' ) {
                continue;
            }
            $slot_type = $slot['type'];
            $processor->set_attribute(
                "{$slot['data']}-type",
                esc_attr( $slot_type )
            );

            $slot_dir = $attrs[ "{$slot['prefix']}Direction" ] ?? '';
            if ( $slot_dir ) {
                $processor->set_attribute(
                    "{$slot['data']}-direction",
                    esc_attr( $slot_dir )
                );
            }

            $default_delay = 0;
            $processor->set_attribute(
                "{$slot['data']}-duration",
                esc_attr( (string) ( $attrs[ "{$slot['prefix']}Duration" ] ?? 0.6 ) )
            );
            $processor->set_attribute(
                "{$slot['data']}-delay",
                esc_attr( (string) ( $attrs[ "{$slot['prefix']}Delay" ] ?? $default_delay ) )
            );

            $slot_accel = $attrs[ "{$slot['prefix']}Acceleration" ] ?? 'ease';
            if ( $slot_accel === 'custom' ) {
                $custom_tf = $attrs[ "{$slot['prefix']}CustomTimingFunction" ] ?? '';
                $slot_accel = trim( $custom_tf ) !== ''
                    ? $custom_tf
                    : 'cubic-bezier(0.25, 0.1, 0.25, 1)';
            }
            if ( $slot_accel !== 'ease' ) {
                $processor->set_attribute(
                    "{$slot['data']}-acceleration",
                    esc_attr( $slot_accel )
                );
            }

            if ( $slot_type === 'blur' ) {
                $blur_amount = $attrs[ "{$slot['prefix']}BlurAmount" ] ?? 8;
                if ( (int) $blur_amount !== 8 ) {
                    $processor->set_attribute(
                        "{$slot['data']}-blur-amount",
                        esc_attr( (string) $blur_amount )
                    );
                }
            }

            if ( $slot_type === 'rotate' ) {
                $rotate_angle = $attrs[ "{$slot['prefix']}RotateAngle" ] ?? 90;
                if ( (int) $rotate_angle !== 90 ) {
                    $processor->set_attribute(
                        "{$slot['data']}-rotate-angle",
                        esc_attr( (string) $rotate_angle )
                    );
                }
            }

            if ( $slot_type === 'custom' ) {
                foreach ( $custom_props as $prop_id => $css_name ) {
                    $from_key = "{$slot['prefix']}From" . ucfirst( $prop_id );
                    $to_key   = "{$slot['prefix']}To" . ucfirst( $prop_id );
                    $from_val = $attrs[ $from_key ] ?? null;
                    $to_val   = $attrs[ $to_key ] ?? null;
                    if ( $from_val !== null && $from_val !== '' ) {
                        $processor->set_attribute(
                            "{$slot['data']}-from-{$css_name}",
                            esc_attr( (string) $from_val )
                        );
                    }
                    if ( $to_val !== null && $to_val !== '' ) {
                        $processor->set_attribute(
                            "{$slot['data']}-to-{$css_name}",
                            esc_attr( (string) $to_val )
                        );
                    }
                }
            }
        }
    } else {
        // Page Load + Scroll Interactive — shared attribute emission.
        $processor->set_attribute( 'data-mb-type', esc_attr( $type ) );

        // Note: `data-mb-target="img"` is NOT emitted here — see the
        // matching comment in the scroll-appear branch above.

        $acceleration = $attrs['animationAcceleration'] ?? 'ease';
        if ( $acceleration === 'custom' ) {
            $custom_tf = $attrs['animationCustomTimingFunction'] ?? '';
            $acceleration = trim( $custom_tf ) !== ''
                ? $custom_tf
                : 'cubic-bezier(0.25, 0.1, 0.25, 1)';
        }
        if ( $acceleration !== 'ease' ) {
            $processor->set_attribute( 'data-mb-acceleration', esc_attr( $acceleration ) );
        }

        $direction = $attrs['animationDirection'] ?? '';
        if ( $direction ) {
            $processor->set_attribute( 'data-mb-direction', esc_attr( $direction ) );
        }

        if ( $type === 'blur' ) {
            $blur_amount = $attrs['animationBlurAmount'] ?? 8;
            if ( (int) $blur_amount !== 8 ) {
                $processor->set_attribute( 'data-mb-blur-amount', esc_attr( (string) $blur_amount ) );
            }
        }

        if ( $type === 'rotate' ) {
            $rotate_angle = $attrs['animationRotateAngle'] ?? 90;
            if ( (int) $rotate_angle !== 90 ) {
                $processor->set_attribute( 'data-mb-rotate-angle', esc_attr( (string) $rotate_angle ) );
            }
        }

        if ( $type === 'custom' ) {
            foreach ( $custom_props as $prop_id => $css_name ) {
                $from_key = 'animationFrom' . ucfirst( $prop_id );
                $to_key   = 'animationTo' . ucfirst( $prop_id );
                $from_val = $attrs[ $from_key ] ?? null;
                $to_val   = $attrs[ $to_key ] ?? null;
                if ( $from_val !== null && $from_val !== '' ) {
                    $processor->set_attribute(
                        "data-mb-from-{$css_name}",
                        esc_attr( (string) $from_val )
                    );
                }
                if ( $to_val !== null && $to_val !== '' ) {
                    $processor->set_attribute(
                        "data-mb-to-{$css_name}",
                        esc_attr( (string) $to_val )
                    );
                }
            }
        }

        if ( $mode === 'page-load' ) {
            $processor->set_attribute(
                'data-mb-duration',
                esc_attr( (string) ( $attrs['animationDuration'] ?? 0.6 ) )
            );
            $processor->set_attribute(
                'data-mb-delay',
                esc_attr( (string) ( $attrs['animationDelay'] ?? 0 ) )
            );
            $processor->set_attribute( 'data-mb-repeat', esc_attr( $attrs['animationRepeat'] ?? 'once' ) );
            $pause = $attrs['animationPauseOffscreen'] ?? true;
            $processor->set_attribute( 'data-mb-pause-offscreen', esc_attr( $pause ? 'true' : 'false' ) );
        }

        if ( $mode === 'scroll-interactive' ) {
            $processor->set_attribute( 'data-mb-range-start', esc_attr( $attrs['animationRangeStart'] ?? 'entry 0%' ) );
            $processor->set_attribute( 'data-mb-range-end', esc_attr( $attrs['animationRangeEnd'] ?? 'exit 100%' ) );
        }
    }

    // Stagger cascade — mirrors the JS `addAnimationSaveProps` so the
    // server-rendered output matches what the editor save filter
    // produced. Whitelisted parent block types come from
    // shared-constants.json (same source as JS STAGGER_PARENT_BLOCKS).
    $stagger_parent_blocks = motion_blocks_shared_constants()['staggerParentBlocks'] ?? array();
    $stagger_enabled       = ! empty( $attrs['animationStaggerEnabled'] );
    $block_name            = $block['blockName'] ?? '';
    if (
        $stagger_enabled
        && in_array( $block_name, $stagger_parent_blocks, true )
        && motion_blocks_is_stagger_compatible( $attrs, $mode, $type, $entry_type, $exit_type )
    ) {
        $processor->add_class( 'mb-stagger-parent' );
        // Stagger step is stored in seconds (default 0.1). Pre-migration
        // blocks may have it in ms (default 100); the > 5 check folds
        // those down to seconds so old saves keep working. Mirrors the
        // JS `staggerStepSeconds()` helper in constants.js.
        $raw_step = $attrs['animationStaggerStep'] ?? 0.1;
        $step     = is_numeric( $raw_step ) ? (float) $raw_step : 0.1;
        if ( $step < 0 ) {
            $step = 0.1;
        }
        if ( $step > 5 ) {
            $step = $step / 1000;
        }
        // Append the CSS var to any existing inline style so we don't
        // clobber theme/block styles that were already there.
        $existing_style = trim( (string) ( $processor->get_attribute( 'style' ) ?? '' ) );
        if ( $existing_style !== '' && substr( $existing_style, -1 ) !== ';' ) {
            $existing_style .= ';';
        }
        $existing_style .= '--mb-stagger-step:' . $step . 's;';
        $processor->set_attribute( 'style', $existing_style );
    }

    return $processor->get_updated_html();
}

/**
 * Whether stagger can cascade for a block's current animation config.
 *
 * Mirrors `isStaggerCompatible()` in src/components/constants.js so
 * server-rendered output matches the editor's stagger decisions.
 * For Page Load / Scroll Interactive: checks the shared
 * `animationType`. For Scroll Appear: checks both slots — if EITHER
 * slot is incompatible, the cascade can't apply meaningfully across
 * the round trip and stagger is suppressed.
 */
function motion_blocks_is_stagger_compatible( $attrs, $mode, $type, $entry_type, $exit_type = '' ) {
    // Mirrors STAGGER_INCOMPATIBLE_TYPES in constants.js (same JSON).
    $incompatible = motion_blocks_shared_constants()['staggerIncompatibleTypes'] ?? array();
    if ( $mode === 'scroll-appear' ) {
        if ( $entry_type !== '' && in_array( $entry_type, $incompatible, true ) ) {
            return false;
        }
        if ( $exit_type !== '' && in_array( $exit_type, $incompatible, true ) ) {
            return false;
        }
        return true;
    }
    return ! in_array( $type, $incompatible, true );
}

add_filter( 'render_block', 'motion_blocks_render_block', 10, 2 );

/**
 * Register page-level settings as post meta.
 *
 * Three independent flags, one per device bucket. To "disable
 * everywhere" the user checks all three; that keeps the model
 * symmetric and avoids a fourth "all" key whose state would have
 * to stay in sync with the others.
 *
 *   mb_disabled_desktop  → ≥ 1024px viewports
 *   mb_disabled_tablet   → 768px – 1023px viewports
 *   mb_disabled_mobile   → ≤ 767px viewports
 *
 * Exposed in REST so the editor's `useEntityProp` can read/write
 * them. Registered on every public post type that supports the
 * block editor.
 */
function motion_blocks_register_meta() {
    $keys = array(
        'mb_disabled_desktop',
        'mb_disabled_tablet',
        'mb_disabled_mobile',
    );
    $post_types = get_post_types( array( 'public' => true ), 'names' );
    foreach ( $post_types as $post_type ) {
        if ( ! post_type_supports( $post_type, 'editor' ) ) {
            continue;
        }
        foreach ( $keys as $key ) {
            register_post_meta( $post_type, $key, array(
                'show_in_rest'  => true,
                'single'        => true,
                'type'          => 'boolean',
                'default'       => false,
                'auth_callback' => function () {
                    return current_user_can( 'edit_posts' );
                },
            ) );
        }
    }
}
add_action( 'init', 'motion_blocks_register_meta' );

/**
 * Emit body classes used by the frontend CSS.
 *
 * Two independent groups of classes:
 *
 * 1. `mb-clip-page-overflow` — applied on EVERY page (not just
 *    singular). Triggers a CSS rule that clips `<html>`'s
 *    horizontal overflow, preventing off-screen animation
 *    transforms (slide-in from the left, large translates, etc.)
 *    from extending the document width and creating a horizontal
 *    scrollbar. Intermediate containers (Group / Column / Section)
 *    keep `overflow: visible` so animations can still visibly break
 *    out of their local container — only the page boundary clips.
 *
 *    Opt-out for sites that intentionally allow document-level
 *    horizontal scroll:
 *        add_filter( 'motion_blocks_apply_overflow_clip', '__return_false' );
 *
 * 2. `mb-disabled-{device}` — singular views only, sourced from
 *    per-post meta. Used by the device-disable setting in
 *    PageSettingsPanel.
 *
 * @param array $classes Existing body classes.
 * @return array
 */
function motion_blocks_body_class( $classes ) {
    // Page-level overflow clip — every page, not just singular.
    // Animations on archive / search / home / 404 pages also need
    // this protection.
    if ( apply_filters( 'motion_blocks_apply_overflow_clip', true ) ) {
        $classes[] = 'mb-clip-page-overflow';
    }

    // Per-page device-disable classes are singular-only; the meta
    // lives on the queried post.
    if ( ! is_singular() ) {
        return $classes;
    }
    $post_id = get_queried_object_id();
    if ( ! $post_id ) {
        return $classes;
    }
    $map = array(
        'mb_disabled_desktop' => 'mb-disabled-desktop',
        'mb_disabled_tablet'  => 'mb-disabled-tablet',
        'mb_disabled_mobile'  => 'mb-disabled-mobile',
    );
    foreach ( $map as $meta_key => $class_name ) {
        if ( get_post_meta( $post_id, $meta_key, true ) ) {
            $classes[] = $class_name;
        }
    }
    return $classes;
}
add_filter( 'body_class', 'motion_blocks_body_class' );

/**
 * Register the saved-animation library as a site option.
 *
 * Stored as a uid-keyed map of saved configurations:
 *
 *   {
 *       "ab12cd34": {
 *           "name":       "Slow fade up",
 *           "createdAt":  "2026-05-06T15:42:00Z",
 *           "attributes": { animationMode: "scroll-appear", … }
 *       },
 *       …
 *   }
 *
 * Uid-keyed (not name-keyed) so renames don't break references and
 * overlapping names don't collide. Exposed in REST so the editor's
 * `useEntityProp('root', 'site', …)` can read/write it.
 *
 * `additionalProperties: true` on `attributes` because we don't want
 * the schema to block forward-compat when new animation attributes
 * are added — the editor is the canonical schema for what's inside.
 *
 * Capability: `edit_theme_options` matches "site design" ownership
 * so non-admin Editors with that cap can manage the library.
 */
function motion_blocks_register_settings() {
    register_setting(
        'options',
        'mb_saved_animations',
        array(
            'type'         => 'object',
            'description'  => __( 'Motion Blocks saved animation library.', 'motion-blocks' ),
            'default'      => array(),
            // Editors with `edit_theme_options` (admins by default,
            // optionally Editors via membership plugins) can read and
            // write the library through the REST options endpoint.
            // Without this gate, any logged-in user with
            // `manage_options` access — including custom roles that
            // shouldn't have been granted that — could PUT arbitrary
            // recipe payloads via /wp/v2/settings.
            'auth_callback' => function () {
                return current_user_can( 'edit_theme_options' );
            },
            'show_in_rest' => array(
                'schema' => array(
                    'type'                 => 'object',
                    'additionalProperties' => array(
                        'type'       => 'object',
                        'properties' => array(
                            'name'       => array( 'type' => 'string' ),
                            'createdAt'  => array( 'type' => 'string' ),
                            'attributes' => array(
                                'type'                 => 'object',
                                'additionalProperties' => true,
                            ),
                        ),
                    ),
                ),
            ),
        )
    );
}
add_action( 'init', 'motion_blocks_register_settings' );

/**
 * Bundled saved-animation recipes that ship with the plugin.
 *
 * Each is keyed by a stable uid and lives in the user library
 * (`mb_saved_animations`) — the user can rename / edit / delete any
 * of them like an animation they authored. The seeder
 * (`motion_blocks_seed_default_animations`) reads this registry to
 * decide what to add.
 *
 *   spin-default          — Page Load + Custom rotate 0°→360° + Loop
 *                           + Linear: an infinite constant-speed spin.
 *   iris-wipe-default     — Scroll Appear (Entry) Custom clip-path
 *                           circle(0%) → circle(150%): a center-out
 *                           iris reveal (silent-film grammar).
 *   diagonal-wipe-default — Scroll Appear (Entry) Custom clip-path
 *                           polygon sweep TL→BR: a 45° diagonal wipe
 *                           (Star Wars-era film grammar).
 */
function motion_blocks_bundled_recipes() {
    return array(
        'spin-default'          => array(
            'name'       => __( 'Spin', 'motion-blocks' ),
            'attributes' => motion_blocks_spin_recipe_attributes(),
        ),
        'iris-wipe-default'     => array(
            'name'       => __( 'Iris Wipe', 'motion-blocks' ),
            'attributes' => motion_blocks_iris_wipe_recipe_attributes(),
        ),
        'diagonal-wipe-default' => array(
            'name'       => __( 'Diagonal Wipe', 'motion-blocks' ),
            'attributes' => motion_blocks_diagonal_wipe_recipe_attributes(),
        ),
    );
}

/**
 * Seed the bundled recipes into the saved-animations library.
 *
 * Per-uid tracking: `mb_saved_animations_seeded_uids` records which
 * recipe uids have ever been seeded. A uid in that list is never
 * re-added — so an explicit user delete is respected (deleting "Iris
 * Wipe" won't see it reappear on the next update), while genuinely
 * new recipes still reach installs that seeded earlier ones.
 *
 * Migration: prior versions used a one-shot boolean
 * `mb_saved_animations_seeded`. The first time this runs without the
 * new uids option present, we translate that flag into "spin-default
 * was already seeded" so the legacy Spin entry isn't duplicated and a
 * user who deleted Spin under the old scheme doesn't get it back.
 *
 * Idempotent — safe to call repeatedly (the `admin_init` version gate
 * just avoids running it on every page load).
 */
function motion_blocks_seed_default_animations() {
    $seeded_uids = get_option( 'mb_saved_animations_seeded_uids', null );

    if ( null === $seeded_uids ) {
        $seeded_uids = array();
        if ( get_option( 'mb_saved_animations_seeded', false ) ) {
            $seeded_uids[] = 'spin-default';
        }
    }
    if ( ! is_array( $seeded_uids ) ) {
        $seeded_uids = array();
    }

    $existing = get_option( 'mb_saved_animations', array() );
    if ( ! is_array( $existing ) ) {
        $existing = array();
    }

    $changed = false;
    foreach ( motion_blocks_bundled_recipes() as $uid => $recipe ) {
        if ( in_array( $uid, $seeded_uids, true ) ) {
            continue; // Already seeded once — respects a user delete.
        }
        if ( ! isset( $existing[ $uid ] ) ) {
            $existing[ $uid ] = array(
                'name'       => $recipe['name'],
                'createdAt'  => gmdate( 'Y-m-d\TH:i:s\Z' ),
                'attributes' => $recipe['attributes'],
            );
            $changed = true;
        }
        $seeded_uids[] = $uid;
    }

    if ( $changed ) {
        update_option( 'mb_saved_animations', $existing );
    }
    update_option( 'mb_saved_animations_seeded_uids', $seeded_uids );
}

// Fresh installs: seed on activation and stamp the recipe version so
// the admin_init gate below doesn't redundantly re-run on first load.
register_activation_hook( __FILE__, function () {
    motion_blocks_seed_default_animations();
    update_option( 'mb_saved_animations_recipe_version', MOTION_BLOCKS_RECIPE_VERSION );
} );

// Existing installs: version-gated re-seed so newly-bundled recipes
// reach sites that activated before they existed. Runs once per
// MOTION_BLOCKS_RECIPE_VERSION bump, not on every admin page load.
add_action( 'admin_init', function () {
    if ( (int) get_option( 'mb_saved_animations_recipe_version', 0 ) < MOTION_BLOCKS_RECIPE_VERSION ) {
        motion_blocks_seed_default_animations();
        update_option( 'mb_saved_animations_recipe_version', MOTION_BLOCKS_RECIPE_VERSION );
    }
} );

/**
 * Baseline attribute bag for bundled recipes — a full mirror of
 * `DEFAULT_ATTRIBUTES` in `src/components/constants.js` at default
 * values. Every recipe `array_merge`s its overrides on top of this so
 * applying it cleanly resets any leftover mode-specific config (e.g.
 * residual `animationEntryType` from a prior Scroll Appear setup,
 * residual `animationRangeStart` from Scroll Interactive) and so all
 * recipes stay in sync as new attributes land — they're added here
 * once, not in each recipe.
 *
 * UI-state keys (`animationFromToActiveSide`,
 * `animationFromToPreviewSide`, `animationPreviewSlot`,
 * `animationPreviewEnabled`, `animationPreviewPlaying`) are
 * intentionally omitted — `stripUiState` in savedAnimations.js strips
 * them on the JS save path too, so a seed matches what a user save
 * would produce.
 */
function motion_blocks_base_recipe_attributes() {
    return array(
        // --- Mode + core animation ---
        'animationMode'                       => '',
        'animationType'                       => 'fade',
        'animationDirection'                  => '',
        'animationDuration'                   => 0.6,
        'animationDelay'                      => 0,
        'animationRepeat'                     => 'once',
        'animationPauseOffscreen'             => true,
        'animationPlayOnce'                   => true,
        'animationScrollTrigger'              => 'enter',
        'animationAcceleration'               => 'ease',
        'animationCustomTimingFunction'       => 'cubic-bezier(0.25, 0.1, 0.25, 1)',
        'animationBlurAmount'                 => 8,
        'animationRotateAngle'                => 90,
        'animationRangeStart'                 => 'entry 0%',
        'animationRangeEnd'                   => 'exit 100%',

        // --- Shared Custom From/To (Page Load / Scroll Interactive) ---
        'animationFromOpacity'                => null,
        'animationFromTranslateX'             => null,
        'animationFromTranslateY'             => null,
        'animationFromScale'                  => null,
        'animationFromRotate'                 => null,
        'animationFromRotateX'                => null,
        'animationFromRotateY'                => null,
        'animationFromBlur'                   => null,
        'animationFromClipPath'               => null,
        'animationToOpacity'                  => null,
        'animationToTranslateX'               => null,
        'animationToTranslateY'               => null,
        'animationToScale'                    => null,
        'animationToRotate'                   => null,
        'animationToRotateX'                  => null,
        'animationToRotateY'                  => null,
        'animationToBlur'                     => null,
        'animationToClipPath'                 => null,

        'animationFromToTarget'               => 'block',
        'animationStaggerEnabled'             => false,
        'animationStaggerStep'                => 0.1,

        // --- Scroll Appear Entry slot ---
        'animationEntryType'                  => '',
        'animationEntryDirection'             => '',
        'animationEntryDuration'              => 0.6,
        'animationEntryDelay'                 => 0,
        'animationEntryAcceleration'          => 'ease',
        'animationEntryCustomTimingFunction'  => 'cubic-bezier(0.25, 0.1, 0.25, 1)',
        'animationEntryBlurAmount'            => 8,
        'animationEntryRotateAngle'           => 90,
        'animationEntryReplay'                => 'once',
        'animationEntryFromOpacity'           => null,
        'animationEntryFromTranslateX'        => null,
        'animationEntryFromTranslateY'        => null,
        'animationEntryFromScale'             => null,
        'animationEntryFromRotate'            => null,
        'animationEntryFromRotateX'           => null,
        'animationEntryFromRotateY'           => null,
        'animationEntryFromBlur'              => null,
        'animationEntryFromClipPath'          => null,
        'animationEntryToOpacity'             => null,
        'animationEntryToTranslateX'          => null,
        'animationEntryToTranslateY'          => null,
        'animationEntryToScale'               => null,
        'animationEntryToRotate'              => null,
        'animationEntryToRotateX'             => null,
        'animationEntryToRotateY'             => null,
        'animationEntryToBlur'                => null,
        'animationEntryToClipPath'            => null,

        // --- Scroll Appear Exit slot ---
        'animationExitType'                   => '',
        'animationExitDirection'              => '',
        'animationExitDuration'               => 0.6,
        'animationExitDelay'                  => 0,
        'animationExitAcceleration'           => 'ease',
        'animationExitCustomTimingFunction'   => 'cubic-bezier(0.25, 0.1, 0.25, 1)',
        'animationExitBlurAmount'             => 8,
        'animationExitRotateAngle'            => 90,
        'animationExitReplay'                 => 'reverse',
        'animationExitFromOpacity'            => null,
        'animationExitFromTranslateX'         => null,
        'animationExitFromTranslateY'         => null,
        'animationExitFromScale'              => null,
        'animationExitFromRotate'             => null,
        'animationExitFromRotateX'            => null,
        'animationExitFromRotateY'            => null,
        'animationExitFromBlur'               => null,
        'animationExitFromClipPath'           => null,
        'animationExitToOpacity'              => null,
        'animationExitToTranslateX'           => null,
        'animationExitToTranslateY'           => null,
        'animationExitToScale'                => null,
        'animationExitToRotate'               => null,
        'animationExitToRotateX'              => null,
        'animationExitToRotateY'              => null,
        'animationExitToBlur'                 => null,
        'animationExitToClipPath'             => null,
    );
}

/**
 * "Spin" recipe — Page Load + Custom rotate (0° → 360°) + Loop +
 * Linear: an infinite constant-speed spin. A common pattern that
 * would otherwise take ~six dial adjustments to build from scratch.
 */
function motion_blocks_spin_recipe_attributes() {
    return array_merge(
        motion_blocks_base_recipe_attributes(),
        array(
            'animationMode'        => 'page-load',
            'animationType'        => 'custom',
            'animationDuration'    => 2,
            'animationRepeat'      => 'loop',
            'animationAcceleration' => 'linear',
            'animationFromRotate'  => '0deg',
            'animationToRotate'    => '360deg',
        )
    );
}

/**
 * "Iris Wipe" recipe — Scroll Appear (Entry) Custom clip-path that
 * grows a circle from the center outward, revealing the element.
 * `circle(150%)` exceeds the half-diagonal at any aspect ratio, so
 * the final frame fully reveals. Silent-film / classic-cinema grammar.
 */
function motion_blocks_iris_wipe_recipe_attributes() {
    return array_merge(
        motion_blocks_base_recipe_attributes(),
        array(
            'animationMode'              => 'scroll-appear',
            'animationEntryType'         => 'custom',
            'animationEntryDuration'     => 1,
            'animationEntryReplay'       => 'once',
            'animationEntryFromClipPath' => 'circle(0% at 50% 50%)',
            'animationEntryToClipPath'   => 'circle(150% at 50% 50%)',
        )
    );
}

/**
 * "Diagonal Wipe" recipe — Scroll Appear (Entry) Custom clip-path that
 * sweeps a 45° boundary from the top-left corner to the bottom-right.
 * A 4-vertex polygon with two vertices pinned at the TL corner and two
 * sweeping outward in lockstep keeps the boundary a true diagonal at
 * every frame. Star Wars / Saul Bass-era film grammar.
 */
function motion_blocks_diagonal_wipe_recipe_attributes() {
    return array_merge(
        motion_blocks_base_recipe_attributes(),
        array(
            'animationMode'              => 'scroll-appear',
            'animationEntryType'         => 'custom',
            'animationEntryDuration'     => 0.9,
            'animationEntryReplay'       => 'once',
            'animationEntryFromClipPath' => 'polygon(0% 0%, 0% 0%, 0% 0%, 0% 0%)',
            'animationEntryToClipPath'   => 'polygon(0% 0%, 200% 0%, 0% 200%, 0% 0%)',
        )
    );
}
