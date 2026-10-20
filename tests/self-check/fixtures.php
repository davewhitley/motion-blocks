<?php
/**
 * Self-check fixtures: one published page per front-end self-check
 * scenario (GH #60), each with the checks it is expected to trip.
 *
 * The self-check (src/self-check.js) reports runtime problems on the
 * published page. These pages give it known inputs: a control page that
 * must come back clean, and one page per known failure. Re-running the
 * script updates the pages in place, so they can be rebuilt on any site.
 *
 * Run from a WordPress site that has the plugin active, via WP-CLI:
 *
 *   cd ~/Studio/animation-plugin
 *   studio wp eval-file ../animation-controls-plugin/tests/self-check/fixtures.php
 *
 * Modes (optional positional arg):
 *   (none)  Create or update the fixture pages and print a table of URLs
 *           and expected checks.
 *   json    Same, but print a JSON manifest instead (for a test runner).
 *   delete  Remove every fixture page.
 *
 * Then turn on Settings → Motion Blocks → Self-check, open a page while
 * logged in, and run `await motionBlocksSelfCheck( { sweep: true } )` in
 * the console. Each result's `id` (plus `#issue`, when it has one)
 * should match the page's `expect` list. When a bug is fixed, delete its
 * expectation here: the page then has to come back clean.
 */

if ( ! function_exists( 'motion_blocks_render_block' ) ) {
	fwrite( STDERR, "Motion Blocks is not active on this site.\n" );
	exit( 1 );
}

$mb_mode = isset( $args[0] ) ? $args[0] : 'create';

const MB_SELF_CHECK_SLUG_PREFIX = 'mb-self-check-';

/**
 * An image attachment for the Cover fixtures. Reuses the first image in
 * the media library; on an empty site, generates a plain one with GD.
 *
 * @return array{id:int,url:string}|null
 */
function mb_self_check_image() {
	$existing = get_posts(
		array(
			'post_type'      => 'attachment',
			'post_mime_type' => 'image',
			'posts_per_page' => 1,
			'post_status'    => 'inherit',
			'fields'         => 'ids',
		)
	);
	if ( $existing ) {
		return array(
			'id'  => (int) $existing[0],
			'url' => wp_get_attachment_url( $existing[0] ),
		);
	}

	if ( ! function_exists( 'imagecreatetruecolor' ) ) {
		return null;
	}
	$img = imagecreatetruecolor( 1200, 800 );
	imagefill( $img, 0, 0, imagecolorallocate( $img, 56, 88, 233 ) );
	ob_start();
	imagepng( $img );
	$png = ob_get_clean();
	imagedestroy( $img );

	$upload = wp_upload_bits( 'mb-self-check.png', null, $png );
	if ( ! empty( $upload['error'] ) ) {
		return null;
	}
	$id = wp_insert_attachment(
		array(
			'post_title'     => 'Motion Blocks self-check image',
			'post_mime_type' => 'image/png',
			'post_status'    => 'inherit',
		),
		$upload['file']
	);
	return array(
		'id'  => (int) $id,
		'url' => $upload['url'],
	);
}

/**
 * Block markup helpers. Attributes are JSON-encoded the way the editor
 * serializes them, so the render filter sees what a real post contains.
 */
function mb_self_check_block( $name, $attrs, $html ) {
	$json = $attrs ? ' ' . wp_json_encode( $attrs, JSON_UNESCAPED_SLASHES ) : '';
	return "<!-- wp:{$name}{$json} -->\n{$html}\n<!-- /wp:{$name} -->\n";
}

function mb_self_check_paragraph( $text, $attrs = array() ) {
	return mb_self_check_block( 'paragraph', $attrs, '<p>' . esc_html( $text ) . '</p>' );
}

function mb_self_check_group( $inner, $attrs = array() ) {
	$attrs['layout'] = array( 'type' => 'constrained' );
	return mb_self_check_block( 'group', $attrs, "<div class=\"wp-block-group\">\n{$inner}</div>" );
}

function mb_self_check_list( $count, $attrs ) {
	$items = '';
	for ( $i = 1; $i <= $count; $i++ ) {
		$items .= "<!-- wp:list-item --><li>Item {$i}</li><!-- /wp:list-item -->";
	}
	return mb_self_check_block( 'list', $attrs, "<ul class=\"wp-block-list\">{$items}</ul>" );
}

function mb_self_check_spacer( $px ) {
	return mb_self_check_block(
		'spacer',
		array( 'height' => "{$px}px" ),
		"<div style=\"height:{$px}px\" aria-hidden=\"true\" class=\"wp-block-spacer\"></div>"
	);
}

function mb_self_check_cover( $image, $attrs ) {
	$attrs = array_merge(
		array(
			'url'      => $image['url'],
			'id'       => $image['id'],
			'dimRatio' => 0,
		),
		$attrs
	);
	$url  = esc_url( $image['url'] );
	$html = '<div class="wp-block-cover">'
		. "<img class=\"wp-block-cover__image-background wp-image-{$image['id']}\" alt=\"\" src=\"{$url}\" data-object-fit=\"cover\"/>"
		. '<span aria-hidden="true" class="wp-block-cover__background has-background-dim-0 has-background-dim"></span>'
		. '<div class="wp-block-cover__inner-container">'
		. mb_self_check_paragraph( 'Cover with Image Zoom (looping)' )
		. '</div></div>';
	return mb_self_check_block( 'cover', $attrs, $html );
}

/**
 * Lead-in so the animated blocks start below the fold and the page has
 * room to scroll past them in both directions.
 */
function mb_self_check_frame( $intro, $body ) {
	return mb_self_check_paragraph( $intro )
		. mb_self_check_spacer( 900 )
		. $body
		. mb_self_check_spacer( 1200 );
}

/**
 * The fixtures. `expect` lists the checks the page should trip, as
 * `id` or `id#issue`; `expect_reduced_motion` replaces it when the page
 * is viewed with reduced motion on (nothing should animate then, so
 * most pages expect nothing). Remove an entry when its bug is fixed.
 */
function mb_self_check_fixtures( $image ) {
	$scroll_fade = array(
		'animationMode'       => 'scroll-appear',
		'animationEntryType'  => 'fade',
		'animationEntryDelay' => 0,
	);
	$page_load_fade = array(
		'animationMode'  => 'page-load',
		'animationType'  => 'fade',
		'animationDelay' => 0,
	);
	$cover_zoom = array(
		'animationMode'     => 'page-load',
		'animationType'     => 'image-zoom',
		'animationRepeat'   => 'loop',
		'animationDuration' => 3,
		'animationDelay'    => 0,
	);
	$stagger_list = array_merge(
		$page_load_fade,
		array(
			'animationStaggerEnabled' => true,
			'animationStaggerStep'    => 0.05,
		)
	);

	$fixtures = array(
		'clean'           => array(
			'title'   => 'Clean (control)',
			'note'    => 'Everyday settings that must never trip a check.',
			'content' => mb_self_check_frame(
				'Control page: nothing here should be reported.',
				mb_self_check_paragraph( 'Page Load fade', $page_load_fade )
				. mb_self_check_group(
					mb_self_check_paragraph( 'Scroll Appear fade, Entry Replay = Repeat, no Exit' ),
					array_merge( $scroll_fade, array( 'animationEntryReplay' => 'repeat' ) )
				)
				. mb_self_check_list( 5, $stagger_list )
			),
			'expect'  => array(),
		),
		'tall-block'      => array(
			'title'   => 'Tall block',
			'note'    => 'A Scroll Appear group far taller than the screen never reaches the trigger ratio.',
			'content' => mb_self_check_frame(
				'A 9000px Scroll Appear group follows.',
				mb_self_check_group(
					mb_self_check_paragraph( 'Tall group: top' )
					. mb_self_check_spacer( 9000 )
					. mb_self_check_paragraph( 'Tall group: bottom' ),
					$scroll_fade
				)
			),
			'expect'                => array( 'can-never-play#23', 'invisible-on-screen' ),
			'expect_reduced_motion' => array(),
		),
		'entry-once-exit' => array(
			'title'   => 'Entry once + Exit',
			'note'    => 'Entry Replay "Once" stops watching the block, so its Exit never plays.',
			'content' => mb_self_check_frame(
				'A Scroll Appear group with Entry Replay "Once" and an Exit slot follows.',
				mb_self_check_group(
					mb_self_check_paragraph( 'Entry fade (Once), Exit fade' ),
					array_merge(
						$scroll_fade,
						array(
							'animationEntryReplay' => 'once',
							'animationExitType'    => 'fade',
						)
					)
				)
			),
			'expect'                => array( 'can-never-play#39' ),
			'expect_reduced_motion' => array(),
		),
		'stagger-limit'   => array(
			'title'   => 'Stagger limit',
			'note'    => 'Stagger delays stop at 30 children.',
			'content' => mb_self_check_frame(
				'A 35-item staggered list follows.',
				mb_self_check_list( 35, $stagger_list )
			),
			'expect'  => array( 'stagger-limit' ),
		),
		'fixed-trap'      => array(
			'title'   => 'Fixed-position trap',
			'note'    => 'A finished slide keeps its transform, so a fixed child is placed relative to the block.',
			'content' => mb_self_check_paragraph( 'A Page Load slide group with a fixed-position child follows.' )
				. mb_self_check_group(
					mb_self_check_paragraph( 'Slide group' )
					. mb_self_check_block(
						'html',
						array(),
						'<div class="mb-self-check-fixed" style="position:fixed;right:12px;bottom:12px;padding:4px 8px;background:#1e1e1e;color:#fff;font-size:12px">Fixed child</div>'
					),
					array(
						'animationMode'      => 'page-load',
						'animationType'      => 'slide',
						'animationDirection' => 'btt',
						'animationDuration'  => 0.3,
						'animationDelay'     => 0,
					)
				),
			'expect'                => array( 'fixed-trap' ),
			'expect_reduced_motion' => array(),
		),
		'late-injected'   => array(
			'title'   => 'Injected after load',
			'note'    => 'A Scroll Appear block added after DOMContentLoaded is never wired up.',
			'content' => mb_self_check_paragraph( 'A script on this page adds a Scroll Appear paragraph shortly after load.' )
				. mb_self_check_block(
					'html',
					array(),
					// Mirrors the markup motion_blocks_render_block emits
					// for a Scroll Appear fade paragraph.
					"<script>window.addEventListener('load',function(){setTimeout(function(){var p=document.createElement('p');p.className='mb-animated mb-mode-scroll-appear mb-enter-fade mb-has-entry';p.setAttribute('data-mb-mode','scroll-appear');p.setAttribute('data-mb-entry-type','fade');p.textContent='Injected after load';var s=document.querySelector('script[data-mb-self-check-inject]');s.parentNode.insertBefore(p,s);},300);});</script><script data-mb-self-check-inject></script>"
				),
			'expect'  => array( 'never-wired#50' ),
		),
	);

	if ( $image ) {
		$fixtures['motion-off'] = array(
			'title'                 => 'Motion off',
			'note'                  => 'Animations are disabled on every device for this page, and reduced motion must stop everything. Image targets and stagger children still move.',
			'content'               => mb_self_check_cover( $image, $cover_zoom )
				. mb_self_check_list( 8, $stagger_list ),
			'meta'                  => array(
				'mb_disabled_desktop' => '1',
				'mb_disabled_tablet'  => '1',
				'mb_disabled_mobile'  => '1',
			),
			'expect'                => array( 'disabled-device-leak#44' ),
			'expect_reduced_motion' => array( 'disabled-device-leak#44', 'reduced-motion-leak#26' ),
		);
	} else {
		fwrite( STDERR, "No image available (empty media library and no GD): skipping the motion-off fixture.\n" );
	}

	return $fixtures;
}

function mb_self_check_find_page( $slug ) {
	$page = get_page_by_path( $slug, OBJECT, 'page' );
	return $page ? (int) $page->ID : 0;
}

if ( 'delete' === $mb_mode ) {
	$pages = get_posts(
		array(
			'post_type'      => 'page',
			'post_status'    => 'any',
			'posts_per_page' => -1,
			'meta_key'       => '_mb_self_check_fixture',
		)
	);
	foreach ( $pages as $page ) {
		wp_delete_post( $page->ID, true );
	}
	WP_CLI::success( count( $pages ) . ' fixture page(s) deleted.' );
	return;
}

// The late-injected fixture needs a <script>; WP-CLI runs without a
// user, so kses would otherwise strip it.
kses_remove_filters();

$mb_manifest = array();
foreach ( mb_self_check_fixtures( mb_self_check_image() ) as $key => $fixture ) {
	$slug    = MB_SELF_CHECK_SLUG_PREFIX . $key;
	$post_id = mb_self_check_find_page( $slug );
	$postarr = array(
		'ID'           => $post_id,
		'post_type'    => 'page',
		'post_status'  => 'publish',
		'post_name'    => $slug,
		'post_title'   => 'MB self-check: ' . $fixture['title'],
		'post_content' => $fixture['content'],
	);
	$post_id = $post_id ? wp_update_post( wp_slash( $postarr ), true ) : wp_insert_post( wp_slash( $postarr ), true );
	if ( is_wp_error( $post_id ) ) {
		WP_CLI::error( "{$slug}: " . $post_id->get_error_message() );
	}

	update_post_meta( $post_id, '_mb_self_check_fixture', $key );
	foreach ( array( 'mb_disabled_desktop', 'mb_disabled_tablet', 'mb_disabled_mobile' ) as $meta_key ) {
		if ( isset( $fixture['meta'][ $meta_key ] ) ) {
			update_post_meta( $post_id, $meta_key, $fixture['meta'][ $meta_key ] );
		} else {
			delete_post_meta( $post_id, $meta_key );
		}
	}

	$mb_manifest[] = array(
		'key'                   => $key,
		'url'                   => get_permalink( $post_id ),
		'note'                  => $fixture['note'],
		'expect'                => $fixture['expect'],
		'expect_reduced_motion' => isset( $fixture['expect_reduced_motion'] )
			? $fixture['expect_reduced_motion']
			: $fixture['expect'],
	);
}

if ( 'json' === $mb_mode ) {
	echo wp_json_encode( $mb_manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) . "\n";
	return;
}

WP_CLI\Utils\format_items(
	'table',
	array_map(
		function ( $row ) {
			return array(
				'fixture' => $row['key'],
				'url'     => $row['url'],
				'expect'  => $row['expect'] ? implode( ', ', $row['expect'] ) : '(clean)',
			);
		},
		$mb_manifest
	),
	array( 'fixture', 'url', 'expect' )
);
WP_CLI::log( 'Turn on Settings → Motion Blocks → Self-check, then run `await motionBlocksSelfCheck( { sweep: true } )` on each page.' );
