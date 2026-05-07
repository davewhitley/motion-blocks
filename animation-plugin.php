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
function motion_blocks_render_block( $block_content, $block ) {
    $attrs = $block['attrs'] ?? array();
    $mode  = $attrs['animationMode'] ?? '';
    $type  = $attrs['animationType'] ?? '';

    if ( ! $mode || ! $type || empty( $block_content ) ) {
        return $block_content;
    }

    $processor = new WP_HTML_Tag_Processor( $block_content );

    if ( ! $processor->next_tag() ) {
        return $block_content;
    }

    // Check if classes are already present (static blocks saved with JS filter).
    $existing_class = $processor->get_attribute( 'class' ) ?? '';
    if ( str_contains( $existing_class, 'mb-animated' ) ) {
        return $block_content;
    }

    // --- Classes ---
    $classes = array( 'mb-animated', "mb-enter-{$type}", "mb-mode-{$mode}" );

    // Scroll-appear exit classes.
    if ( $mode === 'scroll-appear' ) {
        $trigger   = $attrs['animationScrollTrigger'] ?? 'enter';
        $exit_mode = $attrs['animationExitMode'] ?? 'mirror';

        if ( $trigger === 'exit' || $trigger === 'both' ) {
            if ( $exit_mode === 'custom' ) {
                $exit_type = $attrs['animationExitType'] ?? 'fade';
                $classes[] = "mb-exit-{$exit_type}";
            } else {
                $classes[] = "mb-exit-{$type}";
            }
        }

        // Exit-only: swap enter class to exit class.
        if ( $trigger === 'exit' ) {
            $enter_key = array_search( "mb-enter-{$type}", $classes, true );
            if ( false !== $enter_key ) {
                $classes[ $enter_key ] = "mb-exit-{$type}";
            }
        }
    }

    foreach ( $classes as $class ) {
        $processor->add_class( $class );
    }

    // --- Data attributes ---
    $processor->set_attribute( 'data-mb-mode', esc_attr( $mode ) );
    $processor->set_attribute( 'data-mb-type', esc_attr( $type ) );

    // Animation target ('img' vs 'block'). Saved so the frontend
    // script can switch to scoped CSS that animates the first <img>
    // descendant with `overflow: clip` on its parent.
    // `image-move` always implies img target.
    if ( $type === 'image-move' ) {
        $processor->set_attribute( 'data-mb-target', 'img' );
    } elseif ( $type === 'custom' ) {
        $target = $attrs['animationFromToTarget'] ?? 'block';
        if ( $target === 'img' ) {
            $processor->set_attribute( 'data-mb-target', 'img' );
        }
    }

    // Acceleration. Resolve the `custom` sentinel to the actual CSS
    // timing function string so the frontend doesn't need to know
    // about the sentinel.
    $acceleration = $attrs['animationAcceleration'] ?? 'ease';
    if ( $acceleration === 'custom' ) {
        $custom_tf = $attrs['animationCustomTimingFunction'] ?? '';
        $acceleration = trim( $custom_tf ) !== '' ? $custom_tf : 'cubic-bezier(0.25, 0.1, 0.25, 1)';
    }
    if ( $acceleration !== 'ease' ) {
        $processor->set_attribute( 'data-mb-acceleration', esc_attr( $acceleration ) );
    }

    // Direction.
    $direction = $attrs['animationDirection'] ?? '';
    if ( $direction ) {
        $processor->set_attribute( 'data-mb-direction', esc_attr( $direction ) );
    }

    // Blur amount.
    if ( $type === 'blur' ) {
        $blur_amount = $attrs['animationBlurAmount'] ?? 8;
        if ( (int) $blur_amount !== 8 ) {
            $processor->set_attribute( 'data-mb-blur-amount', esc_attr( (string) $blur_amount ) );
        }
    }

    // Rotate angle.
    if ( $type === 'rotate' ) {
        $rotate_angle = $attrs['animationRotateAngle'] ?? 90;
        if ( (int) $rotate_angle !== 90 ) {
            $processor->set_attribute( 'data-mb-rotate-angle', esc_attr( (string) $rotate_angle ) );
        }
    }

    // Custom (From/To) — emit a data attr per side per property.
    // Mirrors addAnimationSaveProps in src/index.js. The frontend
    // reads these and sets `--mb-from-*` / `--mb-to-*` CSS variables
    // consumed by the shared mbCustomEnter / mbCustomExit keyframes.
    if ( $type === 'custom' ) {
        $custom_props = array(
            'opacity'    => 'opacity',
            'translateX' => 'translate-x',
            'translateY' => 'translate-y',
            'scale'      => 'scale',
            'rotate'     => 'rotate',
            // 3D rotation (Flip support).
            'rotateX'    => 'rotate-x',
            'rotateY'    => 'rotate-y',
            // Filter blur.
            'blur'       => 'blur',
            // Clip path (Curtain / Wipe support).
            'clipPath'   => 'clip-path',
        );
        foreach ( $custom_props as $prop_id => $css_name ) {
            $from_key  = 'animationFrom' . ucfirst( $prop_id );
            $to_key    = 'animationTo' . ucfirst( $prop_id );
            $from_val  = $attrs[ $from_key ] ?? null;
            $to_val    = $attrs[ $to_key ] ?? null;
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

    // Page-load and scroll-appear: duration + delay.
    if ( $mode === 'page-load' || $mode === 'scroll-appear' ) {
        $processor->set_attribute( 'data-mb-duration', esc_attr( (string) ( $attrs['animationDuration'] ?? 0.6 ) ) );
        $processor->set_attribute( 'data-mb-delay', esc_attr( (string) ( $attrs['animationDelay'] ?? 0.4 ) ) );
    }

    // Page-load only: repeat + pause-offscreen.
    if ( $mode === 'page-load' ) {
        $processor->set_attribute( 'data-mb-repeat', esc_attr( $attrs['animationRepeat'] ?? 'once' ) );
        $pause = $attrs['animationPauseOffscreen'] ?? true;
        $processor->set_attribute( 'data-mb-pause-offscreen', esc_attr( $pause ? 'true' : 'false' ) );
    }

    // Scroll-appear: trigger, play-once, exit config.
    if ( $mode === 'scroll-appear' ) {
        $trigger = $attrs['animationScrollTrigger'] ?? 'enter';
        $processor->set_attribute( 'data-mb-scroll-trigger', esc_attr( $trigger ) );
        $play_once = $attrs['animationPlayOnce'] ?? true;
        $processor->set_attribute( 'data-mb-play-once', esc_attr( $play_once ? 'true' : 'false' ) );

        if ( $trigger === 'exit' || $trigger === 'both' ) {
            $exit_mode = $attrs['animationExitMode'] ?? 'mirror';
            $processor->set_attribute( 'data-mb-exit-mode', esc_attr( $exit_mode ) );

            if ( $exit_mode === 'custom' ) {
                $exit_type = $attrs['animationExitType'] ?? 'fade';
                $processor->set_attribute( 'data-mb-exit-type', esc_attr( $exit_type ) );

                $exit_direction = $attrs['animationExitDirection'] ?? '';
                if ( $exit_direction ) {
                    $processor->set_attribute( 'data-mb-exit-direction', esc_attr( $exit_direction ) );
                }

                $processor->set_attribute( 'data-mb-exit-duration', esc_attr( (string) ( $attrs['animationExitDuration'] ?? 0.6 ) ) );
                $processor->set_attribute( 'data-mb-exit-delay', esc_attr( (string) ( $attrs['animationExitDelay'] ?? 0 ) ) );

                $exit_accel = $attrs['animationExitAcceleration'] ?? 'ease';
                if ( $exit_accel === 'custom' ) {
                    $exit_custom_tf = $attrs['animationExitCustomTimingFunction'] ?? '';
                    $exit_accel = trim( $exit_custom_tf ) !== '' ? $exit_custom_tf : 'cubic-bezier(0.25, 0.1, 0.25, 1)';
                }
                if ( $exit_accel !== 'ease' ) {
                    $processor->set_attribute( 'data-mb-exit-acceleration', esc_attr( $exit_accel ) );
                }
            }
        }
    }

    // Scroll-interactive: range + direction.
    if ( $mode === 'scroll-interactive' ) {
        $processor->set_attribute( 'data-mb-range-start', esc_attr( $attrs['animationRangeStart'] ?? 'entry 0%' ) );
        $processor->set_attribute( 'data-mb-range-end', esc_attr( $attrs['animationRangeEnd'] ?? 'exit 100%' ) );

        $direction = $attrs['animationDirection'] ?? '';
        if ( $direction ) {
            $processor->set_attribute( 'data-mb-direction', esc_attr( $direction ) );
        }
    }

    return $processor->get_updated_html();
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
 * Emit body classes that the frontend CSS uses to disable
 * animations per device bucket.
 *
 * Singular views only — meta lives on the queried post; we don't
 * try to merge values across loops on archive/home pages.
 *
 * @param array $classes Existing body classes.
 * @return array
 */
function motion_blocks_body_class( $classes ) {
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
