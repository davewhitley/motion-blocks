<?php
/**
 * Motion Blocks uninstall cleanup.
 *
 * Deletes all site data the plugin ever writes:
 *   - Options: the saved-animation library + seeder bookkeeping + the
 *     self-check (debug) toggle.
 *   - Post meta: the three per-device disable flags written by the
 *     editor's Page Settings panel.
 *
 * FUTURE OPTIONS: any new option MUST be added to
 * motion_blocks_uninstall_site_data() below when it lands.
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
    exit;
}

/**
 * Remove every option and post-meta row Motion Blocks owns on the
 * current site. Called once on single site, once per site on multisite.
 */
function motion_blocks_uninstall_site_data() {
    delete_option( 'motion_blocks_saved_animations' );
    delete_option( 'motion_blocks_saved_animations_seeded_uids' );
    // Legacy pre-uid one-shot seeding flag (see the seeder's migration
    // shim) — can persist in installs that upgraded from recipe v1.
    delete_option( 'motion_blocks_saved_animations_seeded' );
    delete_option( 'motion_blocks_saved_animations_recipe_version' );
    delete_option( 'motion_blocks_debug_markers' );
    delete_option( 'motion_blocks_debug_trigger_lines' );
    delete_option( 'motion_blocks_beta_live_scroll_preview' );

    delete_post_meta_by_key( 'motion_blocks_disabled_desktop' );
    delete_post_meta_by_key( 'motion_blocks_disabled_tablet' );
    delete_post_meta_by_key( 'motion_blocks_disabled_mobile' );
    delete_option( 'motion_blocks_storage_version' );

    // The same data under its names before 0.6.0, on a site that was
    // never loaded after the update that renamed it.
    foreach ( array( 'saved_animations', 'saved_animations_seeded_uids', 'saved_animations_seeded', 'saved_animations_recipe_version', 'debug_markers', 'debug_trigger_lines', 'beta_live_scroll_preview' ) as $motion_blocks_suffix ) {
        delete_option( 'mb_' . $motion_blocks_suffix );
    }
    foreach ( array( 'desktop', 'tablet', 'mobile' ) as $motion_blocks_device ) {
        delete_post_meta_by_key( 'mb_disabled_' . $motion_blocks_device );
    }
}

if ( is_multisite() ) {
    // 'number' => 0 lifts WP_Site_Query's default 100-site limit.
    $motion_blocks_site_ids = get_sites(
        array(
            'fields' => 'ids',
            'number' => 0,
        )
    );
    foreach ( $motion_blocks_site_ids as $motion_blocks_site_id ) {
        switch_to_blog( $motion_blocks_site_id );
        motion_blocks_uninstall_site_data();
        restore_current_blog();
    }
} else {
    motion_blocks_uninstall_site_data();
}
