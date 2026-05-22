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
        return $attrs;
    }

    // Normalize the legacy trigger value: v1 'both' aliases to v2 'mirror'.
    $raw_trigger = $attrs['animationScrollTrigger'] ?? 'enter';
    $trigger = ( $raw_trigger === 'both' ) ? 'mirror' : $raw_trigger;

    $raw_type = $attrs['animationType'] ?? '';
    $base_type = preg_replace( '/-out$/', '', $raw_type );

    $direction    = $attrs['animationDirection'] ?? '';
    $duration     = $attrs['animationDuration'] ?? 0.6;
    $delay        = $attrs['animationDelay'] ?? 0.4;
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

    if ( $trigger === 'enter' ) {
        $attrs = array_merge( $attrs, $fill( 'animationEntry', false ) );
    } elseif ( $trigger === 'exit' ) {
        $attrs = array_merge( $attrs, $fill( 'animationExit', true ) );
    } else {
        // mirror — fill both slots
        $attrs = array_merge( $attrs, $fill( 'animationEntry', false ) );
        $attrs = array_merge( $attrs, $fill( 'animationExit', true ) );
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
    // we don't need to do that work again. But we DO still need to
    // run the image-effect wrap pass on the raw content — that pass
    // injects new markup (a wrapper div), which can't be expressed via
    // the JS save-props filter (it only adds attributes to the wrapper,
    // not inner markup).
    $existing_class = $processor->get_attribute( 'class' ) ?? '';
    if ( str_contains( $existing_class, 'mb-animated' ) ) {
        $block_name_for_wrap = $block['blockName'] ?? '';
        if (
            $block_name_for_wrap === 'core/image' &&
            motion_blocks_uses_image_effect( $mode, $type, $entry_type, $exit_type )
        ) {
            return motion_blocks_wrap_image_for_effect( $block_content );
        }
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

    $custom_props = array(
        'opacity'    => 'opacity',
        'translateX' => 'translate-x',
        'translateY' => 'translate-y',
        'scale'      => 'scale',
        'rotate'     => 'rotate',
        'rotateX'    => 'rotate-x',
        'rotateY'    => 'rotate-y',
        'blur'       => 'blur',
        'clipPath'   => 'clip-path',
    );

    if ( $mode === 'scroll-appear' ) {
        // Slot model: emit per-slot data attributes for the filled
        // slot(s). The Custom From/To target is shared across slots
        // (only meaningful when at least one slot is Custom). Image
        // effects (image-move, image-zoom) always imply img-target.
        if ( $entry_type === 'custom' || $exit_type === 'custom' ) {
            $target = $attrs['animationFromToTarget'] ?? 'block';
            if ( $target === 'img' ) {
                $processor->set_attribute( 'data-mb-target', 'img' );
            }
        }
        if (
            $entry_type === 'image-move' || $entry_type === 'image-zoom' ||
            $exit_type === 'image-move' || $exit_type === 'image-zoom'
        ) {
            $processor->set_attribute( 'data-mb-target', 'img' );
        }

        $play_once = $attrs['animationPlayOnce'] ?? true;
        $processor->set_attribute(
            'data-mb-play-once',
            esc_attr( $play_once ? 'true' : 'false' )
        );

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

            $default_delay = ( $slot['name'] === 'entry' ) ? 0.4 : 0;
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

        if ( $type === 'image-move' || $type === 'image-zoom' ) {
            $processor->set_attribute( 'data-mb-target', 'img' );
        } elseif ( $type === 'custom' ) {
            $target = $attrs['animationFromToTarget'] ?? 'block';
            if ( $target === 'img' ) {
                $processor->set_attribute( 'data-mb-target', 'img' );
            }
        }

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
                esc_attr( (string) ( $attrs['animationDelay'] ?? 0.4 ) )
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
    // produced. Whitelisted parent block types only, and skipped for
    // animation types that don't compose with the cascade.
    $stagger_parent_blocks   = array(
        'core/group',
        'core/columns',
        'core/buttons',
        'core/gallery',
        'core/list',
    );
    // Custom is now compatible — the parent block's per-block keyframe
    // is bound to inner blocks via `--mb-stagger-anim-name` (CSS custom
    // property, set on the parent by the frontend script). Image
    // effects (image-move, image-zoom) stay out since they scope the
    // animation to the first img descendant, which doesn't cascade.
    $stagger_skip_types = array( 'image-move', 'image-zoom' );
    $stagger_enabled    = ! empty( $attrs['animationStaggerEnabled'] );
    $block_name         = $block['blockName'] ?? '';
    // Stagger gating reads from whichever type drives the cascade in
    // each mode. Scroll Appear cascades via the Entry slot's class
    // bindings; fall back to Exit if Entry is empty so an Exit-only
    // block still gets the stagger class (the inner blocks won't have
    // anything to animate on enter, but their exit phase still runs).
    $stagger_probe_type = ( $mode === 'scroll-appear' )
        ? ( $entry_type !== '' ? $entry_type : $exit_type )
        : $type;
    if (
        $stagger_enabled
        && in_array( $block_name, $stagger_parent_blocks, true )
        && ! in_array( $stagger_probe_type, $stagger_skip_types, true )
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

    $html = $processor->get_updated_html();

    // Wrap the first <img> inside core/image figures in a
    // .mb-img-frame div when an image effect is active. The wrapper
    // is what carries `overflow: clip` (via the existing :has(> img)
    // selector in animations.css), so the figcaption — which sits
    // outside the wrapper as a sibling — isn't pulled into the clip
    // region. Cover blocks are intentionally skipped (no figcaption,
    // and the background img is absolutely-positioned; wrapping
    // would require mirroring those positioning rules).
    $block_name_for_wrap = $block['blockName'] ?? '';
    if (
        $block_name_for_wrap === 'core/image' &&
        motion_blocks_uses_image_effect( $mode, $type, $entry_type, $exit_type )
    ) {
        $html = motion_blocks_wrap_image_for_effect( $html );
    }

    return $html;
}

/**
 * Detect whether the current block's resolved animation type is one
 * of the image-bound effects (image-move / image-zoom). For Scroll
 * Appear that means the Entry OR Exit slot type; for Page Load and
 * Scroll Interactive it's the shared animationType. Image effects
 * always imply `data-mb-target="img"` and need the wrapper for
 * proper caption isolation.
 */
function motion_blocks_uses_image_effect( $mode, $type, $entry_type, $exit_type = '' ) {
    $image_effects = array( 'image-move', 'image-zoom' );
    if ( $mode === 'scroll-appear' ) {
        return in_array( $entry_type, $image_effects, true )
            || in_array( $exit_type, $image_effects, true );
    }
    return in_array( $type, $image_effects, true );
}

/**
 * Wrap the first `<img>` element in `$html` with
 * `<div class="mb-img-frame">…</div>`. The wrapper goes around just
 * the img tag, so siblings (figcaption, additional content) stay
 * outside the clipped region. Handles self-closing (`<img />`) and
 * non-self-closing (`<img>`) forms.
 *
 * The wrap is opt-in per render (caller decides when to invoke), so
 * it doesn't need to inspect surrounding markup beyond locating the
 * first img.
 */
function motion_blocks_wrap_image_for_effect( $html ) {
    // Match the first <img …> tag (self-closing or not). Non-greedy
    // attribute match stops at the first unescaped `>`.
    return preg_replace(
        '/(<img\b[^>]*\/?>)/i',
        '<div class="mb-img-frame">$1</div>',
        $html,
        1
    );
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
 *   mb_animations_disabled_desktop  → ≥ 1024px viewports
 *   mb_animations_disabled_tablet   → 768px – 1023px viewports
 *   mb_animations_disabled_mobile   → ≤ 767px viewports
 *
 * Exposed in REST so the editor's `useEntityProp` can read/write
 * them. Registered on every public post type that supports the
 * block editor.
 */
function motion_blocks_register_meta() {
    $keys = array(
        'mb_animations_disabled_desktop',
        'mb_animations_disabled_tablet',
        'mb_animations_disabled_mobile',
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
 * 2. `mb-animations-disabled-{device}` — singular views only,
 *    sourced from per-post meta. Used by the device-disable
 *    setting in PageSettingsPanel.
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
        'mb_animations_disabled_desktop' => 'mb-animations-disabled-desktop',
        'mb_animations_disabled_tablet'  => 'mb-animations-disabled-tablet',
        'mb_animations_disabled_mobile'  => 'mb-animations-disabled-mobile',
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
 * Built-in "Spin" recipe seeded into the saved-animations library
 * on first plugin activation.
 *
 * Bundles the Page Load + Custom rotate (0° → 360°) + Loop + Linear
 * configuration that produces an infinite constant-speed spin — a
 * common pattern that would otherwise take ~six dial adjustments to
 * build from scratch. Lives in the user library (`mb_saved_animations`)
 * rather than the theme library so the user can rename / edit / delete
 * it like any animation they authored themselves.
 *
 * Seed strategy: one-shot. We set the companion flag
 * `mb_saved_animations_seeded` after running, so reactivating the
 * plugin (or activating after the user has deleted the Spin entry)
 * does NOT restore it. Respecting an explicit delete matters more
 * than ensuring the recipe is always present.
 */
function motion_blocks_seed_default_animations() {
    if ( get_option( 'mb_saved_animations_seeded', false ) ) {
        return;
    }
    $existing = get_option( 'mb_saved_animations', array() );
    if ( ! is_array( $existing ) ) {
        $existing = array();
    }
    $spin_uid = 'spin-default';
    if ( ! isset( $existing[ $spin_uid ] ) ) {
        $existing[ $spin_uid ] = array(
            'name'       => __( 'Spin', 'motion-blocks' ),
            'createdAt'  => gmdate( 'Y-m-d\TH:i:s\Z' ),
            'attributes' => motion_blocks_spin_recipe_attributes(),
        );
        update_option( 'mb_saved_animations', $existing );
    }
    update_option( 'mb_saved_animations_seeded', true );
}
register_activation_hook( __FILE__, 'motion_blocks_seed_default_animations' );

/**
 * Attribute bag for the seeded "Spin" recipe.
 *
 * Mirrors `DEFAULT_ATTRIBUTES` from `src/components/constants.js` —
 * every animation attribute the editor saves on a block is included
 * here so applying the recipe cleanly resets any leftover mode-
 * specific config (e.g. residual `animationEntryType` from Scroll
 * Appear, residual `animationRangeStart` from Scroll Interactive).
 *
 * Spin-specific overrides on top of the baseline defaults:
 *   - animationMode: 'page-load'      // fires on DOMContentLoaded
 *   - animationType: 'custom'         // per-block rotate keyframe
 *   - animationDuration: 2            // one full rotation / 2s
 *   - animationRepeat: 'loop'         // infinite cycle
 *   - animationAcceleration: 'linear' // constant angular velocity
 *   - animationFromRotate: 0          // start at 0°
 *   - animationToRotate: 360          // end at 360° (== 0° visually)
 *
 * UI-state keys (`animationFromToActiveSide`,
 * `animationFromToPreviewSide`, `animationPreviewSlot`,
 * `animationPreviewEnabled`, `animationPreviewPlaying`) are
 * intentionally omitted — `stripUiState` in savedAnimations.js
 * strips them on the JS save path too, so the seed matches what a
 * user save would produce.
 */
function motion_blocks_spin_recipe_attributes() {
    return array(
        // --- Mode + core animation ---
        'animationMode'                       => 'page-load',
        'animationType'                       => 'custom',
        'animationDirection'                  => '',
        'animationDuration'                   => 2,
        'animationDelay'                      => 0,
        'animationRepeat'                     => 'loop',
        'animationPauseOffscreen'             => true,
        'animationPlayOnce'                   => true,
        'animationScrollTrigger'              => 'enter',
        'animationAcceleration'               => 'linear',
        'animationCustomTimingFunction'       => 'cubic-bezier(0.25, 0.1, 0.25, 1)',
        'animationBlurAmount'                 => 8,
        'animationRotateAngle'                => 90,
        'animationRangeStart'                 => 'entry 0%',
        'animationRangeEnd'                   => 'exit 100%',

        // --- Shared Custom From/To (only Rotate is set) ---
        'animationFromOpacity'                => null,
        'animationFromTranslateX'             => null,
        'animationFromTranslateY'             => null,
        'animationFromScale'                  => null,
        'animationFromRotate'                 => 0,
        'animationFromRotateX'                => null,
        'animationFromRotateY'                => null,
        'animationFromBlur'                   => null,
        'animationFromClipPath'               => null,
        'animationToOpacity'                  => null,
        'animationToTranslateX'               => null,
        'animationToTranslateY'               => null,
        'animationToScale'                    => null,
        'animationToRotate'                   => 360,
        'animationToRotateX'                  => null,
        'animationToRotateY'                  => null,
        'animationToBlur'                     => null,
        'animationToClipPath'                 => null,

        'animationFromToTarget'               => 'block',
        'animationStaggerEnabled'             => false,
        'animationStaggerStep'                => 0.1,

        // --- Scroll Appear slot attrs (Spin is Page Load, so these
        //     are empty/defaults — applying Spin to a block that was
        //     previously configured for Scroll Appear should clear
        //     its per-slot config so the modes don't bleed together) ---
        'animationEntryType'                  => '',
        'animationEntryDirection'             => '',
        'animationEntryDuration'              => 0.6,
        'animationEntryDelay'                 => 0.4,
        'animationEntryAcceleration'          => 'ease',
        'animationEntryCustomTimingFunction'  => 'cubic-bezier(0.25, 0.1, 0.25, 1)',
        'animationEntryBlurAmount'            => 8,
        'animationEntryRotateAngle'           => 90,
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
        'animationExitType'                   => '',
        'animationExitDirection'              => '',
        'animationExitDuration'               => 0.6,
        'animationExitDelay'                  => 0,
        'animationExitAcceleration'           => 'ease',
        'animationExitCustomTimingFunction'   => 'cubic-bezier(0.25, 0.1, 0.25, 1)',
        'animationExitBlurAmount'             => 8,
        'animationExitRotateAngle'            => 90,
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
