<?php
/**
 * Motion Blocks uninstall cleanup.
 *
 * Deletes all site data the plugin ever writes:
 *   - Options: the saved-animation library + seeder bookkeeping + the
 *     debug-markers toggle.
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
    delete_option( 'mb_saved_animations' );
    delete_option( 'mb_saved_animations_seeded_uids' );
    // Legacy pre-uid one-shot seeding flag (see the seeder's migration
    // shim) — can persist in installs that upgraded from recipe v1.
    delete_option( 'mb_saved_animations_seeded' );
    delete_option( 'mb_saved_animations_recipe_version' );
    delete_option( 'mb_debug_markers' );
    delete_option( 'mb_beta_live_scroll_preview' );

    delete_post_meta_by_key( 'mb_disabled_desktop' );
    delete_post_meta_by_key( 'mb_disabled_tablet' );
    delete_post_meta_by_key( 'mb_disabled_mobile' );
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
