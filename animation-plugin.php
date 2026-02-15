<?php
/**
 * Plugin Name: Motion Blocks
 * Description: Add CSS animations to any block in the Site Editor
 * Version: 0.1.0
 * Requires at least: 6.0
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
