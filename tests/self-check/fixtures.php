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

/**
 * Background tints, so it's obvious on the page which blocks are the
 * animated ones under test (and which kind each is).
 */
const MB_SELF_CHECK_COLORS = array(
	'callout'   => '#fef9c3',
	'paragraph' => '#dcfce7',
	'group'     => '#dbeafe',
	'list'      => '#ede9fe',
	'slide'     => '#ffedd5',
	'injected'  => '#fce7f3',
);

/**
 * Adds a background colour and padding to a block's attributes and
 * returns the matching class and inline style for its wrapper, the way
 * the editor would save them.
 *
 * @return array{0:array,1:string,2:string} Attributes, class, style.
 */
function mb_self_check_tint( $attrs, $color ) {
	if ( ! $color ) {
		return array( $attrs, '', '' );
	}
	$attrs['style'] = array(
		'color'   => array( 'background' => $color ),
		'spacing' => array(
			'padding' => array(
				'top'    => '1.5rem',
				'right'  => '1.5rem',
				'bottom' => '1.5rem',
				'left'   => '1.5rem',
			),
		),
	);
	$style = "background-color:{$color};padding-top:1.5rem;padding-right:1.5rem;padding-bottom:1.5rem;padding-left:1.5rem";
	return array( $attrs, ' has-background', " style=\"{$style}\"" );
}

function mb_self_check_paragraph( $text, $attrs = array(), $color = null ) {
	list( $attrs, $class, $style ) = mb_self_check_tint( $attrs, $color );
	$class_attr = $class ? ' class="' . trim( $class ) . '"' : '';
	return mb_self_check_block( 'paragraph', $attrs, "<p{$class_attr}{$style}>" . esc_html( $text ) . '</p>' );
}

function mb_self_check_group( $inner, $attrs = array(), $color = null ) {
	$attrs['layout'] = array( 'type' => 'constrained' );
	list( $attrs, $class, $style ) = mb_self_check_tint( $attrs, $color );
	return mb_self_check_block( 'group', $attrs, "<div class=\"wp-block-group{$class}\"{$style}>\n{$inner}</div>" );
}

function mb_self_check_list( $count, $attrs, $color = null ) {
	list( $attrs, $class, $style ) = mb_self_check_tint( $attrs, $color );
	$items = '';
	for ( $i = 1; $i <= $count; $i++ ) {
		$items .= "<!-- wp:list-item --><li>Item {$i}</li><!-- /wp:list-item -->";
	}
	return mb_self_check_block( 'list', $attrs, "<ul class=\"wp-block-list{$class}\"{$style}>{$items}</ul>" );
}

/**
 * The yellow box at the top of each page: what it tests and what the
 * self-check should report.
 */
function mb_self_check_callout( $fixture ) {
	$describe = function ( $expect ) {
		if ( ! $expect ) {
			return 'nothing (the page should come back clean)';
		}
		return implode( ', ', $expect );
	};
	$reduced = isset( $fixture['expect_reduced_motion'] ) ? $fixture['expect_reduced_motion'] : $fixture['expect'];

	$inner = mb_self_check_block(
		'heading',
		array( 'level' => 3 ),
		'<h3 class="wp-block-heading">What this page tests</h3>'
	)
		. mb_self_check_paragraph( $fixture['note'] )
		. mb_self_check_paragraph( 'Self-check should report: ' . $describe( $fixture['expect'] ) . '.' )
		. mb_self_check_paragraph( 'With reduced motion on: ' . $describe( $reduced ) . '.' )
		. mb_self_check_paragraph( 'Coloured blocks are the animated ones under test. To check the whole page, run: await motionBlocksSelfCheck( { sweep: true } )' );

	return mb_self_check_group( $inner, array(), MB_SELF_CHECK_COLORS['callout'] );
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
		. mb_self_check_paragraph( 'Cover · Page Load · Image Zoom (looping)' )
		. '</div></div>';
	return mb_self_check_block( 'cover', $attrs, $html );
}

/**
 * Lead-in so the animated blocks start below the fold and the page has
 * room to scroll past them in both directions.
 */
function mb_self_check_frame( $body ) {
	return mb_self_check_paragraph( '↓ Scroll down: the blocks under test start below the fold.' )
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
			'note'    => 'Everyday settings that must never trip a check: a Page Load fade (green), a Scroll Appear fade that repeats (blue), and a short staggered list (purple).',
			'content' => mb_self_check_frame(
				mb_self_check_paragraph( 'Paragraph · Page Load · Fade', $page_load_fade, MB_SELF_CHECK_COLORS['paragraph'] )
				. mb_self_check_group(
					mb_self_check_paragraph( 'Group · Scroll Appear · Entry: Fade (Replay: Repeat) · no Exit' ),
					array_merge( $scroll_fade, array( 'animationEntryReplay' => 'repeat' ) ),
					MB_SELF_CHECK_COLORS['group']
				)
				. mb_self_check_list( 5, $stagger_list, MB_SELF_CHECK_COLORS['list'] )
			),
			'expect'  => array(),
		),
		'tall-block'      => array(
			'title'   => 'Tall block',
			'note'    => 'A Scroll Appear group (blue) about 9000px tall. It can never overlap the trigger zone by 10% of its height, so it never fades in: scroll into it and the blue area stays blank.',
			'content' => mb_self_check_frame(
				mb_self_check_group(
					mb_self_check_paragraph( 'Group · Scroll Appear · Entry: Fade — top of the tall group' )
					. mb_self_check_spacer( 9000 )
					. mb_self_check_paragraph( 'Bottom of the tall group' ),
					$scroll_fade,
					MB_SELF_CHECK_COLORS['group']
				)
			),
			'expect'                => array( 'can-never-play#23', 'invisible-on-screen' ),
			'expect_reduced_motion' => array(),
		),
		'entry-once-exit' => array(
			'title'   => 'Entry once + Exit',
			'note'    => 'A Scroll Appear group (blue) with Entry Replay "Once" and an Exit slot. It fades in, but when you scroll past it the Exit never plays, because "Once" stops watching the block.',
			'content' => mb_self_check_frame(
				mb_self_check_group(
					mb_self_check_paragraph( 'Group · Scroll Appear · Entry: Fade (Replay: Once) · Exit: Fade' ),
					array_merge(
						$scroll_fade,
						array(
							'animationEntryReplay' => 'once',
							'animationExitType'    => 'fade',
						)
					),
					MB_SELF_CHECK_COLORS['group']
				)
			),
			'expect'                => array( 'can-never-play#39' ),
			'expect_reduced_motion' => array(),
		),
		'stagger-limit'   => array(
			'title'   => 'Stagger limit',
			'note'    => 'A staggered list (purple) with 35 items. Stagger delays stop at 30, so items 31–35 all appear at the same moment.',
			'content' => mb_self_check_frame(
				mb_self_check_list( 35, $stagger_list, MB_SELF_CHECK_COLORS['list'] )
			),
			'expect'  => array( 'stagger-limit' ),
		),
		'fixed-trap'      => array(
			'title'   => 'Fixed-position trap',
			'note'    => 'A Page Load slide group (orange) containing a dark "Fixed child" that should sit in the bottom-right corner of the screen. After the slide finishes it keeps a transform, so the fixed child is placed inside the orange group instead.',
			'content' => mb_self_check_group(
				mb_self_check_paragraph( 'Group · Page Load · Slide up' )
				. mb_self_check_block(
					'html',
					array(),
					'<div class="mb-self-check-fixed" style="position:fixed;right:12px;bottom:12px;padding:4px 8px;background:#1e1e1e;color:#fff;font-size:12px">Fixed child (should be in the screen corner)</div>'
				),
				array(
					'animationMode'      => 'page-load',
					'animationType'      => 'slide',
					'animationDirection' => 'btt',
					'animationDuration'  => 0.3,
					'animationDelay'     => 0,
				),
				MB_SELF_CHECK_COLORS['slide']
			),
			'expect'                => array( 'fixed-trap' ),
			'expect_reduced_motion' => array(),
		),
		'late-injected'   => array(
			'title'   => 'Injected after load',
			'note'    => 'A script adds a Scroll Appear paragraph (pink) shortly after the page loads, like pagination or a popup would. Motion Blocks never sets it up, so it stays invisible: the pink box below this one never shows.',
			'content' => mb_self_check_block(
				'html',
				array(),
				// Mirrors the markup motion_blocks_render_block emits for
				// a Scroll Appear fade paragraph, plus a tint.
				"<script>window.addEventListener('load',function(){setTimeout(function(){var p=document.createElement('p');p.className='mb-animated mb-mode-scroll-appear mb-enter-fade mb-has-entry has-background';p.setAttribute('data-mb-mode','scroll-appear');p.setAttribute('data-mb-entry-type','fade');p.style.cssText='background-color:" . MB_SELF_CHECK_COLORS['injected'] . ";padding:1.5rem';p.textContent='Paragraph · Scroll Appear · Entry: Fade — injected after load';var s=document.querySelector('script[data-mb-self-check-inject]');s.parentNode.insertBefore(p,s);},300);});</script><script data-mb-self-check-inject></script>"
			),
			'expect'  => array( 'never-wired#50' ),
		),
	);

	if ( $image ) {
		$fixtures['motion-off'] = array(
			'title'                 => 'Motion off',
			'note'                  => 'Animations are turned off for this page on every device, so nothing should move. The Cover image still zooms and the staggered list (purple) still fades in item by item. Turn on reduced motion and they should stop too; they don\'t.',
			'content'               => mb_self_check_cover( $image, $cover_zoom )
				. mb_self_check_list( 8, $stagger_list, MB_SELF_CHECK_COLORS['list'] ),
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
		'post_content' => mb_self_check_callout( $fixture ) . $fixture['content'],
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
