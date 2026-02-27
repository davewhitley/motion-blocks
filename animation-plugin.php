<?php
/**
 * Plugin Name: Motion Blocks
 * Description: Add CSS animations to any block in the Site Editor
 * Version: 0.1.0
 * Requires at least: 6.2
 * Requires PHP: 7.4
 * Author: Your Name
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
    wp_enqueue_style(
        'motion-blocks-editor-styles',
        plugins_url( 'build/index.css', __FILE__ ),
        array(),
        MOTION_BLOCKS_VERSION
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

        wp_enqueue_style(
            'motion-blocks-styles',
            plugins_url( 'css/animations.css', __FILE__ ),
            array(),
            MOTION_BLOCKS_VERSION
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
    $processor->set_attribute( 'data-mb-mode', $mode );
    $processor->set_attribute( 'data-mb-type', $type );

    // Acceleration.
    $acceleration = $attrs['animationAcceleration'] ?? 'ease';
    if ( $acceleration !== 'ease' ) {
        $processor->set_attribute( 'data-mb-acceleration', $acceleration );
    }

    // Direction.
    $direction = $attrs['animationDirection'] ?? '';
    if ( $direction ) {
        $processor->set_attribute( 'data-mb-direction', $direction );
    }

    // Blur amount.
    if ( $type === 'blur' ) {
        $blur_amount = $attrs['animationBlurAmount'] ?? 8;
        if ( (int) $blur_amount !== 8 ) {
            $processor->set_attribute( 'data-mb-blur-amount', (string) $blur_amount );
        }
    }

    // Page-load and scroll-appear: duration + delay.
    if ( $mode === 'page-load' || $mode === 'scroll-appear' ) {
        $processor->set_attribute( 'data-mb-duration', (string) ( $attrs['animationDuration'] ?? 0.6 ) );
        $processor->set_attribute( 'data-mb-delay', (string) ( $attrs['animationDelay'] ?? 0.4 ) );
    }

    // Page-load only: repeat + pause-offscreen.
    if ( $mode === 'page-load' ) {
        $processor->set_attribute( 'data-mb-repeat', $attrs['animationRepeat'] ?? 'once' );
        $pause = $attrs['animationPauseOffscreen'] ?? true;
        $processor->set_attribute( 'data-mb-pause-offscreen', $pause ? 'true' : 'false' );
    }

    // Scroll-appear: trigger, play-once, exit config.
    if ( $mode === 'scroll-appear' ) {
        $trigger = $attrs['animationScrollTrigger'] ?? 'enter';
        $processor->set_attribute( 'data-mb-scroll-trigger', $trigger );
        $play_once = $attrs['animationPlayOnce'] ?? true;
        $processor->set_attribute( 'data-mb-play-once', $play_once ? 'true' : 'false' );

        if ( $trigger === 'exit' || $trigger === 'both' ) {
            $exit_mode = $attrs['animationExitMode'] ?? 'mirror';
            $processor->set_attribute( 'data-mb-exit-mode', $exit_mode );

            if ( $exit_mode === 'custom' ) {
                $exit_type = $attrs['animationExitType'] ?? 'fade';
                $processor->set_attribute( 'data-mb-exit-type', $exit_type );

                $exit_direction = $attrs['animationExitDirection'] ?? '';
                if ( $exit_direction ) {
                    $processor->set_attribute( 'data-mb-exit-direction', $exit_direction );
                }

                $processor->set_attribute( 'data-mb-exit-duration', (string) ( $attrs['animationExitDuration'] ?? 0.6 ) );
                $processor->set_attribute( 'data-mb-exit-delay', (string) ( $attrs['animationExitDelay'] ?? 0 ) );

                $exit_accel = $attrs['animationExitAcceleration'] ?? 'ease';
                if ( $exit_accel !== 'ease' ) {
                    $processor->set_attribute( 'data-mb-exit-acceleration', $exit_accel );
                }
            }
        }
    }

    // Scroll-interactive: range + direction.
    if ( $mode === 'scroll-interactive' ) {
        $processor->set_attribute( 'data-mb-range-start', $attrs['animationRangeStart'] ?? 'entry 0%' );
        $processor->set_attribute( 'data-mb-range-end', $attrs['animationRangeEnd'] ?? 'exit 100%' );

        $direction = $attrs['animationDirection'] ?? '';
        if ( $direction ) {
            $processor->set_attribute( 'data-mb-direction', $direction );
        }
    }

    return $processor->get_updated_html();
}
add_filter( 'render_block', 'motion_blocks_render_block', 10, 2 );
