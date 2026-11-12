<?php
/**
 * Device-breakpoint check: do the per-device disable toggles use
 * WordPress core's viewport breakpoints?
 *
 * motion_blocks_device_media_queries() returns the media condition each
 * toggle covers. On WordPress 7.1+ it uses core's builder
 * (WP_Theme_JSON::get_viewport_media_queries()) with the theme's
 * `settings.viewport`, so the toggles match core's per-block visibility
 * and responsive styles; before 7.1 it falls back to the plugin's own
 * ranges. This script checks core's defaults, a theme with custom
 * breakpoints and one that sets only `mobile` (both through the
 * `wp_theme_json_data_theme` filter), and the fallback.
 *
 * Run it with WP-CLI from the root of any WordPress site that has the
 * plugin active, e.g.:
 *
 *   wp eval-file wp-content/plugins/motion-blocks/tests/viewport-breakpoints/check.php
 *
 * On a WordPress Studio site, `studio wp` (run from the site's folder)
 * is one way to get WP-CLI: `studio wp eval-file <same path>`.
 *
 * Prints PASS/FAIL per case and exits 1 on failure. The theme cases are
 * skipped (and say so) on WordPress before 7.1.
 */

if ( ! function_exists( 'motion_blocks_device_media_queries' ) ) {
	fwrite( STDERR, "Motion Blocks is not active on this site.\n" );
	exit( 1 );
}

// WP-CLI runs this file inside a function, so the tally lives in $GLOBALS.
$GLOBALS['mb_vp_failures'] = 0;

function mb_vp_report( $name, $want, $got ) {
	if ( $want === $got ) {
		echo "PASS {$name}\n";
		return;
	}
	$GLOBALS['mb_vp_failures']++;
	echo "FAIL {$name}\n";
	echo '      want ' . wp_json_encode( $want, JSON_UNESCAPED_SLASHES ) . "\n";
	echo '      got  ' . wp_json_encode( $got, JSON_UNESCAPED_SLASHES ) . "\n";
}

/**
 * motion_blocks_device_media_queries() with the theme's `settings.viewport`
 * replaced (null: the theme sets none).
 */
function mb_vp_with_theme_viewport( $viewport ) {
	$filter = function ( $theme_json ) use ( $viewport ) {
		$data = $theme_json->get_data();
		if ( isset( $data['settings']['viewport'] ) ) {
			unset( $data['settings']['viewport'] );
		}
		if ( null !== $viewport ) {
			$data['settings']['viewport'] = $viewport;
		}
		return new WP_Theme_JSON_Data( $data, 'theme' );
	};
	add_filter( 'wp_theme_json_data_theme', $filter );
	wp_clean_theme_json_cache();
	$queries = motion_blocks_device_media_queries();
	remove_filter( 'wp_theme_json_data_theme', $filter );
	wp_clean_theme_json_cache();
	return $queries;
}

$mb_legacy = array(
	'mobile'  => '(max-width: 767px), (width < 768px)',
	'tablet'  => '(min-width: 768px) and (max-width: 1023px), (768px <= width < 1024px)',
	'desktop' => '(min-width: 1024px), (width >= 1024px)',
);

// Before 7.1 (no core builder): the plugin's own ranges.
mb_vp_report( 'pre-7.1 fallback', $mb_legacy, motion_blocks_device_media_queries_from( null ) );

// Core's output is turned into bare conditions, keys in order.
mb_vp_report(
	'core output, @media stripped',
	array(
		'mobile'  => '(width <= 480px)',
		'tablet'  => '(480px < width <= 782px)',
		'desktop' => '(width > 782px)',
	),
	motion_blocks_device_media_queries_from(
		array(
			'@desktop' => '@media (width > 782px)',
			'@mobile'  => '@media (width <= 480px)',
			'@tablet'  => '@media (480px < width <= 782px)',
		)
	)
);

if ( ! method_exists( 'WP_Theme_JSON', 'get_viewport_media_queries' ) ) {
	echo 'SKIP theme cases: WordPress ' . get_bloginfo( 'version' ) . " has no viewport breakpoints (needs 7.1).\n";
	mb_vp_report( 'live result is the fallback', $mb_legacy, motion_blocks_device_media_queries() );
} else {
	mb_vp_report(
		'core defaults (theme sets no viewport)',
		array(
			'mobile'  => '(width <= 480px)',
			'tablet'  => '(480px < width <= 782px)',
			'desktop' => '(width > 782px)',
		),
		mb_vp_with_theme_viewport( null )
	);
	mb_vp_report(
		'theme with custom breakpoints (600px / 1000px)',
		array(
			'mobile'  => '(width <= 600px)',
			'tablet'  => '(600px < width <= 1000px)',
			'desktop' => '(width > 1000px)',
		),
		mb_vp_with_theme_viewport( array( 'mobile' => '600px', 'tablet' => '1000px' ) )
	);
	mb_vp_report(
		'theme that sets only mobile (no tablet bucket)',
		array(
			'mobile'  => '(width <= 600px)',
			'desktop' => '(width > 600px)',
		),
		mb_vp_with_theme_viewport( array( 'mobile' => '600px' ) )
	);
	mb_vp_report(
		'theme that sets only tablet (no mobile bucket)',
		array(
			'tablet'  => '(width <= 900px)',
			'desktop' => '(width > 900px)',
		),
		mb_vp_with_theme_viewport( array( 'tablet' => '900px' ) )
	);
	mb_vp_report(
		'theme with em breakpoints',
		array(
			'mobile'  => '(width <= 30em)',
			'tablet'  => '(30em < width <= 50em)',
			'desktop' => '(width > 50em)',
		),
		mb_vp_with_theme_viewport( array( 'mobile' => '30em', 'tablet' => '50em' ) )
	);

	// The head script and the bundles get exactly these queries.
	$mb_printed = motion_blocks_device_queries_script();
	mb_vp_report(
		'printed for frontend.js and the editor',
		'window.motionBlocksDeviceQueries = ' . wp_json_encode( (object) motion_blocks_device_media_queries() ) . ';',
		$mb_printed
	);
}

$mb_failures = $GLOBALS['mb_vp_failures'];
echo $mb_failures ? "{$mb_failures} failing\n" : "all passing\n";
// CI runs this inside a Playground blueprint step, where exiting
// would stop the site from starting; it reads the output instead.
if ( $mb_failures && ! defined( 'MOTION_BLOCKS_CHECK_NO_EXIT' ) ) {
	exit( 1 );
}
