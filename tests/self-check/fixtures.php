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
 *   smoke   Only the smoke page: every effect in every mode, set up
 *           correctly. Run it after every update (see below).
 *   json    Same as (none), but print a JSON manifest instead (for a
 *           test runner), including each page's editor URL.
 *   delete  Remove every fixture page.
 *
 * Smoke test after an update: run `smoke`, open the page while logged in
 * and sweep it (expect no issues), then open it in the editor and run
 * `await motionBlocksEditorCheck()` in the console (expect no invalid
 * blocks, warnings or errors).
 *
 * Then turn on Settings → Motion Blocks → Self-check, open a page while
 * logged in, and run `await motionBlocksSelfCheck( { sweep: true } )` in
 * the console. Each result's `id` (plus `#issue`, when it has one)
 * should match the page's `expect` list. When a bug is fixed, delete its
 * expectation here: the page then has to come back clean.
 *
 * Automated run (what CI does): `tests/self-check/run.mjs` takes the
 * `json` manifest and does all of the above in headless Chrome, for
 * every page, with and without prefers-reduced-motion, plus the editor
 * check. Locally, against a Studio site with Self-check turned on:
 *
 *   studio wp eval-file ../animation-controls-plugin/tests/self-check/fixtures.php json > /tmp/manifest.json
 *   cd ../animation-controls-plugin
 *   npm run test:pages -- --manifest /tmp/manifest.json
 *
 * (`--login studio`, the default, logs in through Studio's auto-login
 * URL; `node tests/self-check/run.mjs --help` lists the options.)
 *
 * Outside WP-CLI: the script also runs from plain PHP once WordPress is
 * loaded, with `$args` set by the caller. CI's WordPress Playground
 * blueprint (tests/self-check/blueprint.json) does exactly that:
 *
 *   require '/wordpress/wp-load.php';
 *   $args = array( 'json' );
 *   require '.../tests/self-check/fixtures.php';
 *
 * WP-CLI's output helpers are used when present; without them messages
 * go to STDERR (or the PHP error log) and the table is printed as plain
 * text. Behaviour under WP-CLI is unchanged.
 */

/**
 * Prints a message for the person running the script: to STDERR, or to
 * the PHP error log when there is no STDERR (outside the CLI).
 */
function mb_self_check_warn( $message ) {
	if ( defined( 'STDERR' ) ) {
		fwrite( STDERR, $message . "\n" );
	} else {
		error_log( $message );
	}
}

/** WP_CLI::error() when available, otherwise warn and exit 1. */
function mb_self_check_fail( $message ) {
	if ( class_exists( 'WP_CLI' ) ) {
		WP_CLI::error( $message );
	}
	mb_self_check_warn( 'Error: ' . $message );
	exit( 1 );
}

if ( ! function_exists( 'motion_blocks_render_block' ) ) {
	mb_self_check_warn( 'Motion Blocks is not active on this site.' );
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
	// Smoke page: one tint per mode.
	'page-load'          => '#dcfce7',
	'scroll-appear'      => '#dbeafe',
	'scroll-interactive' => '#ede9fe',
	'stagger'            => '#ffedd5',
	'recipe'             => '#fce7f3',
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

function mb_self_check_cover( $image, $attrs, $label = 'Cover · Page Load · Image Zoom (looping)' ) {
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
		. mb_self_check_paragraph( $label )
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
	$page_load_flip = array(
		'animationMode'     => 'page-load',
		'animationType'     => 'flip',
		'animationDuration' => 0.3,
		'animationDelay'    => 0,
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
		'clean'               => array(
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
		'tall-block'          => array(
			'title'   => 'Tall block',
			'note'    => 'A Scroll Appear group (blue) about 9000px tall: more than 7 screens, so 10% of its height is more than the whole trigger zone. It must fade in once its top reaches the middle of the screen (GH #23), instead of staying blank.',
			'content' => mb_self_check_frame(
				mb_self_check_group(
					mb_self_check_paragraph( 'Group · Scroll Appear · Entry: Fade — top of the tall group' )
					. mb_self_check_spacer( 9000 )
					. mb_self_check_paragraph( 'Bottom of the tall group' ),
					$scroll_fade,
					MB_SELF_CHECK_COLORS['group']
				)
			),
			'expect'                => array(),
			'expect_reduced_motion' => array(),
		),
		'entry-once-exit'     => array(
			'title'   => 'Entry once + Exit',
			'note'    => 'Two Scroll Appear groups (blue) with Entry Replay "Once" and an Exit slot. Each fades in once; scroll past it and it fades out. Scroll back up and the first fades back in (Exit Replay "Reverse"), the second snaps back (Exit Replay "Repeat"); neither is blank on screen. Scrolling down to them again must not replay the fade-in.',
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
				. mb_self_check_group(
					mb_self_check_paragraph( 'Group · Scroll Appear · Entry: Fade (Replay: Once) · Exit: Fade (Replay: Repeat)' ),
					array_merge(
						$scroll_fade,
						array(
							'animationEntryReplay' => 'once',
							'animationExitType'    => 'fade',
							'animationExitReplay'  => 'repeat',
						)
					),
					MB_SELF_CHECK_COLORS['group']
				)
			),
			'expect'                => array(),
			'expect_reduced_motion' => array(),
		),
		'exit-delay'          => array(
			'title'   => 'Exit Delay',
			'note'    => 'Four Scroll Appear blocks with an Exit Fade and a 1s Exit Delay (GH #33): a group with Exit Replay "Reverse", a group with Exit Replay "Repeat" (blue), a staggered group (purple) and a Cover with "Animate image only". Scroll past each one: it stays visible for about a second after leaving, then fades out. Scroll back up: it comes back right away, with no 1s wait. Scroll past and back up within half a second: it never blinks.',
			'content' => mb_self_check_frame(
				mb_self_check_group(
					mb_self_check_paragraph( 'Group · Scroll Appear · Entry: Fade (Replay: Repeat) · Exit: Fade, Delay 1s (Replay: Reverse)' ),
					array_merge(
						$scroll_fade,
						array(
							'animationEntryReplay' => 'repeat',
							'animationExitType'    => 'fade',
							'animationExitDelay'   => 1,
						)
					),
					MB_SELF_CHECK_COLORS['group']
				)
				. mb_self_check_spacer( 300 )
				. mb_self_check_group(
					mb_self_check_paragraph( 'Group · Scroll Appear · Entry: Fade (Replay: Repeat) · Exit: Fade, Delay 1s (Replay: Repeat)' ),
					array_merge(
						$scroll_fade,
						array(
							'animationEntryReplay' => 'repeat',
							'animationExitType'    => 'fade',
							'animationExitDelay'   => 1,
							'animationExitReplay'  => 'repeat',
						)
					),
					MB_SELF_CHECK_COLORS['group']
				)
				. mb_self_check_spacer( 300 )
				. mb_self_check_group(
					mb_self_check_paragraph( 'Group · Scroll Appear · Stagger · Exit: Fade, Delay 1s — child 1' )
					. mb_self_check_paragraph( 'Child 2' )
					. mb_self_check_paragraph( 'Child 3' ),
					array_merge(
						$scroll_fade,
						array(
							'animationEntryReplay'    => 'repeat',
							'animationStaggerEnabled' => true,
							'animationExitType'       => 'fade',
							'animationExitDelay'      => 1,
						)
					),
					MB_SELF_CHECK_COLORS['list']
				)
				. mb_self_check_spacer( 300 )
				. mb_self_check_cover(
					$image,
					array_merge(
						$scroll_fade,
						array(
							'animationEntryReplay'  => 'repeat',
							'animationExitType'     => 'fade',
							'animationExitDelay'    => 1,
							'animationFromToTarget' => 'img',
						)
					),
					'Cover · Scroll Appear · Animate image only · Exit: Fade, Delay 1s'
				)
			),
			'expect'                => array(),
			'expect_reduced_motion' => array(),
		),
		'once-exit-near-top'  => array(
			'title'   => 'Entry once + Exit near the top',
			'note'    => 'Three tall Scroll Appear groups (blue, Entry Replay "Once" + Exit) at the very top of a short page, so after a jump back to the top (Home key, "back to top" link) each one sits partly on screen or just short of the trigger zone. They must come back already shown, not replay their fade-in when you scroll down again.',
			'content' => mb_self_check_group(
				mb_self_check_paragraph( 'Group · Scroll Appear · Entry: Fade (Once) · Exit: Fade — 1' ) . mb_self_check_spacer( 330 ),
				array_merge(
						$scroll_fade,
						array(
							'animationEntryReplay' => 'once',
							'animationExitType'    => 'fade',
						)
					),
				MB_SELF_CHECK_COLORS['group']
			)
				. mb_self_check_group(
					mb_self_check_paragraph( 'Group · Scroll Appear · Entry: Fade (Once) · Exit: Fade — 2' ) . mb_self_check_spacer( 330 ),
					array_merge(
						$scroll_fade,
						array(
							'animationEntryReplay' => 'once',
							'animationExitType'    => 'fade',
						)
					),
					MB_SELF_CHECK_COLORS['group']
				)
				. mb_self_check_paragraph( 'Spacer paragraph' )
				. mb_self_check_group(
					mb_self_check_paragraph( 'Group · Scroll Appear · Entry: Fade (Once) · Exit: Fade — 3' ) . mb_self_check_spacer( 330 ),
					array_merge(
						$scroll_fade,
						array(
							'animationEntryReplay' => 'once',
							'animationExitType'    => 'fade',
						)
					),
					MB_SELF_CHECK_COLORS['group']
				),
			'expect'                => array(),
			'expect_reduced_motion' => array(),
		),
		'stagger-long'        => array(
			'title'   => 'Long stagger',
			'note'    => 'A staggered list (purple) with 35 items. Every item should appear one after another, including items 31–35 (GH #53).',
			'content' => mb_self_check_frame(
				mb_self_check_list( 35, $stagger_list, MB_SELF_CHECK_COLORS['list'] )
			),
			'expect'  => array(),
		),
		'si-stagger-leftover' => array(
			'title'   => 'Scroll Interactive + leftover stagger',
			'note'    => 'A Scroll Interactive slide group (purple) whose Stagger flag was left on from another mode. Stagger isn\'t offered in Scroll Interactive, so the group itself should slide with the scroll (GH #48).',
			'content' => mb_self_check_frame(
				mb_self_check_group(
					mb_self_check_paragraph( 'Group · Scroll Interactive · Slide up · leftover Stagger flag' )
					. mb_self_check_paragraph( 'Child 2' )
					. mb_self_check_paragraph( 'Child 3' ),
					array(
						'animationMode'           => 'scroll-interactive',
						'animationType'           => 'slide',
						'animationDirection'      => 'btt',
						'animationStaggerEnabled' => true,
					),
					MB_SELF_CHECK_COLORS['scroll-interactive']
				)
			),
			'expect'  => array(),
		),
		'fixed-trap'          => array(
			'title'   => 'Fixed-position trap',
			'note'    => 'A Page Load slide group (orange) and a Page Load flip group (blue), each containing a dark "Fixed child" that should sit in the bottom-right corner of the screen. After the slide finishes it keeps a transform, so its fixed child is placed inside the orange group instead; the flip group keeps its 3D context the same way. With reduced motion on, both fixed children must sit in the screen corner.',
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
			)
				. mb_self_check_group(
					mb_self_check_paragraph( 'Group · Page Load · Flip' )
					. mb_self_check_block(
						'html',
						array(),
						'<div class="mb-self-check-fixed" style="position:fixed;right:12px;bottom:48px;padding:4px 8px;background:#1e1e1e;color:#fff;font-size:12px">Fixed child of the flip group (should be in the screen corner)</div>'
					),
					$page_load_flip,
					MB_SELF_CHECK_COLORS['group']
				),
			'expect'                => array( 'fixed-trap' ),
			'expect_reduced_motion' => array(),
		),
		'late-injected'       => array(
			'title'   => 'Injected after load',
			'note'    => 'A script adds a Scroll Appear paragraph (pink) shortly after the page loads, like pagination or a popup would. Motion Blocks never sets it up, so it stays invisible: the pink box below the fade paragraph never shows. The page has a server-rendered animation (the fade paragraph) so the CSS and JS load; on a page with none, they don\'t load and injected content stays visible instead.',
			'content' => mb_self_check_paragraph( 'Paragraph · Page Load · Fade (loads the runtime)', $page_load_fade )
				. mb_self_check_block(
					'html',
					array(),
					// Mirrors the markup motion_blocks_render_block emits for
					// a Scroll Appear fade paragraph, plus a tint.
					"<script>window.addEventListener('load',function(){setTimeout(function(){var p=document.createElement('p');p.className='mb-animated mb-mode-scroll-appear mb-enter-fade mb-has-entry has-background';p.setAttribute('data-mb-mode','scroll-appear');p.setAttribute('data-mb-entry-type','fade');p.style.cssText='background-color:" . MB_SELF_CHECK_COLORS['injected'] . ";padding:1.5rem';p.textContent='Paragraph · Scroll Appear · Entry: Fade — injected after load';var s=document.querySelector('script[data-mb-self-check-inject]');s.parentNode.insertBefore(p,s);},300);});</script><script data-mb-self-check-inject></script>"
				),
			'expect'  => array( 'never-wired#50' ),
		),
		'content-above-changes' => array(
			'title'   => 'Content above changes height',
			'note'    => 'A Details block near the top starts open and closes itself shortly after the page loads, like a reader collapsing it, which pulls the Scroll Appear paragraph (blue) about 800px further up. Scroll to the paragraph: it must fade in when it reaches the screen, not 800px later (GH #52).',
			'content' => mb_self_check_block(
				'details',
				array( 'showContent' => true ),
				'<details class="wp-block-details" open><summary>Details · closes itself after load</summary>'
				. mb_self_check_spacer( 800 )
				. '</details>'
			)
				. mb_self_check_block(
					'html',
					array(),
					"<script>window.addEventListener('load',function(){setTimeout(function(){document.querySelector('.wp-block-details').open=false;},300);});</script>"
				)
				. mb_self_check_frame(
					mb_self_check_paragraph( 'Paragraph · Scroll Appear · Entry: Fade — below the Details block', $scroll_fade, MB_SELF_CHECK_COLORS['group'] )
				),
			'expect'  => array(),
		),
		'content-above-grows'   => array(
			'title'   => 'Content above grows',
			'note'    => 'A Scroll Appear paragraph (blue) with Entry Replay "Once" and an Exit slot sits under a closed Details block. As soon as it starts to fade in, the Details opens itself, like a reader expanding it, and pushes the paragraph down to just below the trigger zone, still on screen. That moves it away from the reader, not past them, so it must not fade out; scroll on and it must not fade in a second time (GH #52).',
			'content' => mb_self_check_frame(
				mb_self_check_block(
					'details',
					array(),
					'<details class="wp-block-details"><summary>Details · opens itself once the paragraph below fades in</summary>'
					. mb_self_check_spacer( 100 )
					. '</details>'
				)
				. mb_self_check_paragraph(
					'Paragraph · Scroll Appear · Entry: Fade (Replay: Once) · Exit: Fade',
					array_merge(
						$scroll_fade,
						array(
							'animationEntryReplay' => 'once',
							'animationExitType'    => 'fade',
						)
					),
					MB_SELF_CHECK_COLORS['group']
				)
				. mb_self_check_block(
					'html',
					array(),
					// Sizes the Details content so the paragraph's top lands
					// at 94% of the screen height: below the trigger zone
					// (bottom edge 85%, with room for the admin bar), still
					// on screen, on any viewport.
					"<script>(function(){var t=setInterval(function(){var p=document.querySelector('.mb-mode-scroll-appear.mb-triggered');if(!p){return;}clearInterval(t);var d=document.querySelector('.wp-block-details');d.querySelector('.wp-block-spacer').style.height=Math.max(0,Math.round(innerHeight*0.94-p.getBoundingClientRect().top))+'px';d.open=true;},100);})();</script>"
				)
			),
			'expect'  => array(),
		),
	);

	if ( $image ) {
		$fixtures['motion-off'] = array(
			'title'   => 'Motion off',
			'note'    => 'Animations are turned off for this page on every device, so nothing should move: the looping Cover image zoom, the staggered list (purple), the flip group (blue) and the staggered flip group (orange) stay still and fully visible, with or without reduced motion. Both dark "Fixed child" boxes must sit in the bottom-right corner of the screen, not inside their group: Flip\'s 3D context is reset along with the animation.',
			'content' => mb_self_check_cover( $image, $cover_zoom )
				. mb_self_check_list( 8, $stagger_list, MB_SELF_CHECK_COLORS['list'] )
				. mb_self_check_group(
					mb_self_check_paragraph( 'Group · Page Load · Flip' )
					. mb_self_check_block(
						'html',
						array(),
						'<div class="mb-self-check-fixed" style="position:fixed;right:12px;bottom:12px;padding:4px 8px;background:#1e1e1e;color:#fff;font-size:12px">Fixed child of the flip group (should be in the screen corner)</div>'
					),
					$page_load_flip,
					MB_SELF_CHECK_COLORS['group']
				)
				. mb_self_check_group(
					mb_self_check_paragraph( 'Group · Page Load · Flip · Stagger (child 1)' )
					. mb_self_check_group(
						mb_self_check_paragraph( 'Child 2: a group holding a fixed element' )
						. mb_self_check_block(
							'html',
							array(),
							'<div class="mb-self-check-fixed" style="position:fixed;right:12px;bottom:48px;padding:4px 8px;background:#1e1e1e;color:#fff;font-size:12px">Fixed child of a staggered flip item (should be in the screen corner)</div>'
						)
					),
					array_merge( $page_load_flip, array( 'animationStaggerEnabled' => true ) ),
					MB_SELF_CHECK_COLORS['stagger']
				),
			'meta'    => array(
				'mb_disabled_desktop' => '1',
				'mb_disabled_tablet'  => '1',
				'mb_disabled_mobile'  => '1',
			),
			'expect'  => array(),
		);
	} else {
		mb_self_check_warn( 'No image available (empty media library and no GD): skipping the motion-off fixture.' );
	}

	$fixtures['no-animations'] = array(
		'title'   => 'No animations',
		'note'    => 'Plain paragraphs only, no animated blocks. The page must not load the Motion Blocks CSS, JS, self-check or the html.mb-js marker. The runner checks that instead of running the self-check (which isn\'t loaded here). The editor must still load the animation CSS for this page.',
		'content' => mb_self_check_paragraph( 'A plain paragraph with no animation.' )
			. mb_self_check_paragraph( 'Another plain paragraph.' ),
		'assets'  => false,
		'expect'  => array(),
	);

	return $fixtures;
}

/**
 * The smoke page: every effect in every mode, set up correctly, on one
 * page. Run it after any update; it should come back clean on the front
 * end (self-check sweep) and in the editor (motionBlocksEditorCheck).
 *
 * Effect values come from shared-constants.json, the same lists the
 * Motion Effects panel offers, so a new effect lands here automatically.
 */
function mb_self_check_smoke( $image ) {
	$shared     = motion_blocks_shared_constants();
	$image_only = $shared['imageEffectTypes'];
	$colors     = MB_SELF_CHECK_COLORS;

	// Custom From/To values that visibly move, per attribute prefix.
	$custom = function ( $from_prefix, $to_prefix ) {
		return array(
			"{$from_prefix}Opacity"    => 0,
			"{$from_prefix}TranslateY" => '40px',
			"{$from_prefix}Rotate"     => '-8deg',
			"{$to_prefix}Opacity"      => 1,
			"{$to_prefix}TranslateY"   => '0px',
			"{$to_prefix}Rotate"       => '0deg',
		);
	};

	// One entry per effect × direction (or just the effect when it has
	// no direction control).
	$variants = function ( $types ) use ( $shared, $image_only ) {
		$out = array();
		foreach ( $types as $type ) {
			if ( in_array( $type, $image_only, true ) ) {
				continue;
			}
			$directions = isset( $shared['directions'][ $type ] ) ? $shared['directions'][ $type ] : array( '' );
			foreach ( $directions as $direction ) {
				$out[] = array( $type, $direction );
			}
		}
		return $out;
	};

	// Drop unset directions so the block saves like the editor would.
	$clean = function ( $attrs ) {
		return array_filter(
			$attrs,
			function ( $v ) {
				return '' !== $v;
			}
		);
	};
	$label = function ( $parts ) {
		return implode( ' · ', array_filter( $parts ) );
	};
	$heading = function ( $text ) {
		return mb_self_check_block( 'heading', array(), '<h2 class="wp-block-heading">' . esc_html( $text ) . '</h2>' );
	};
	// Each section is a group with a gap, so tinted blocks don't touch.
	$section = function ( $title, $inner ) use ( $heading ) {
		return $heading( $title )
			. mb_self_check_block(
				'group',
				array(
					'style'  => array( 'spacing' => array( 'blockGap' => '0.75rem' ) ),
					'layout' => array( 'type' => 'constrained' ),
				),
				"<div class=\"wp-block-group\">\n{$inner}</div>"
			);
	};

	$body  = '';
	$count = 0;

	// --- Page Load: the panel offers every type except the -out variants.
	$inner = '';
	$page_load_types = array_values(
		array_filter(
			$shared['animationTypes'],
			function ( $type ) {
				return '-out' !== substr( $type, -4 );
			}
		)
	);
	foreach ( $variants( $page_load_types ) as list( $type, $direction ) ) {
		$attrs = array(
			'animationMode'      => 'page-load',
			'animationType'      => $type,
			'animationDirection' => $direction,
			'animationDelay'     => 0,
		);
		if ( 'custom' === $type ) {
			$attrs = array_merge( $attrs, $custom( 'animationFrom', 'animationTo' ) );
		}
		$inner .= mb_self_check_paragraph( $label( array( 'Page Load', $type, $direction ) ), $clean( $attrs ), $colors['page-load'] );
		$count++;
	}
	foreach ( array( 'loop', 'alternate' ) as $repeat ) {
		$inner .= mb_self_check_paragraph(
			$label( array( 'Page Load', 'fade', "Repeat: {$repeat}" ) ),
			array(
				'animationMode'   => 'page-load',
				'animationType'   => 'fade',
				'animationDelay'  => 0,
				'animationRepeat' => $repeat,
			),
			$colors['page-load']
		);
		$count++;
	}
	$body .= $section( 'Page Load', $inner );

	// --- Scroll Appear: every Entry effect, every Exit effect, Replay modes.
	$inner = '';
	foreach ( $variants( $shared['entryTypes'] ) as list( $type, $direction ) ) {
		$attrs = array(
			'animationMode'           => 'scroll-appear',
			'animationEntryType'      => $type,
			'animationEntryDirection' => $direction,
			'animationEntryDelay'     => 0,
			'animationEntryReplay'    => 'repeat',
		);
		if ( 'custom' === $type ) {
			$attrs = array_merge( $attrs, $custom( 'animationEntryFrom', 'animationEntryTo' ) );
		}
		$inner .= mb_self_check_paragraph( $label( array( 'Scroll Appear', "Entry: {$type}", $direction ) ), $clean( $attrs ), $colors['scroll-appear'] );
		$count++;
	}
	foreach ( $variants( $shared['exitTypes'] ) as list( $type, $direction ) ) {
		$attrs = array(
			'animationMode'          => 'scroll-appear',
			'animationEntryType'     => 'fade',
			'animationEntryDelay'    => 0,
			// Repeat keeps Entry-repeat + Exit covered for every exit
			// effect; Entry once + Exit has its own rows below.
			'animationEntryReplay'   => 'repeat',
			'animationExitType'      => $type,
			'animationExitDirection' => $direction,
		);
		if ( 'custom' === $type ) {
			// Exit runs visible → hidden, so the "from" values go on To.
			$attrs = array_merge( $attrs, $custom( 'animationExitTo', 'animationExitFrom' ) );
		}
		$inner .= mb_self_check_paragraph( $label( array( 'Scroll Appear', 'Entry: fade', "Exit: {$type}", $direction ) ), $clean( $attrs ), $colors['scroll-appear'] );
		$count++;
	}
	$replays = array(
		array( 'Entry Replay: reverse (no Exit)', array( 'animationEntryReplay' => 'reverse' ) ),
		array( 'Entry Replay: once (no Exit)', array( 'animationEntryReplay' => 'once' ) ),
		array( 'Entry Replay: once + Exit', array( 'animationEntryReplay' => 'once', 'animationExitType' => 'fade' ) ),
		// Scrolling back up must snap it back to visible, not leave it
		// blank in the zone (GH #39 follow-up).
		array( 'Entry Replay: once + Exit Replay: repeat', array( 'animationEntryReplay' => 'once', 'animationExitType' => 'fade', 'animationExitReplay' => 'repeat' ) ),
		array( 'Exit Replay: once', array( 'animationEntryReplay' => 'repeat', 'animationExitType' => 'fade', 'animationExitReplay' => 'once' ) ),
		array( 'Exit Replay: repeat', array( 'animationEntryReplay' => 'repeat', 'animationExitType' => 'fade', 'animationExitReplay' => 'repeat' ) ),
		array( 'Exit only (no Entry)', array( 'animationEntryType' => '', 'animationExitType' => 'fade' ) ),
		// GH #33: the forward Exit waits for its Delay.
		array( 'Exit delay 1s', array( 'animationEntryReplay' => 'repeat', 'animationExitType' => 'fade', 'animationExitDelay' => 1 ) ),
		// GH #45: an Exit slot at its defaults must not inherit the
		// Entry slot's blur / rotate / timing values.
		array( 'Entry: blur 20 + linear · Exit: blur at defaults (GH #45)', array( 'animationEntryType' => 'blur', 'animationEntryBlurAmount' => 20, 'animationEntryAcceleration' => 'linear', 'animationEntryReplay' => 'repeat', 'animationExitType' => 'blur' ) ),
		array( 'Entry: rotate 180 · Exit: rotate at defaults (GH #45)', array( 'animationEntryType' => 'rotate', 'animationEntryRotateAngle' => 180, 'animationEntryReplay' => 'repeat', 'animationExitType' => 'rotate' ) ),
	);
	foreach ( $replays as list( $text, $extra ) ) {
		$attrs = array_merge(
			array(
				'animationMode'       => 'scroll-appear',
				'animationEntryType'  => 'fade',
				'animationEntryDelay' => 0,
			),
			$extra
		);
		$inner .= mb_self_check_paragraph( $label( array( 'Scroll Appear', $text ) ), $attrs, $colors['scroll-appear'] );
		$count++;
	}
	$body .= $section( 'Scroll Appear', $inner );

	// --- Scroll Interactive: every type, plus a custom range.
	$inner = '';
	foreach ( $variants( $shared['animationTypes'] ) as list( $type, $direction ) ) {
		$attrs = array(
			'animationMode'      => 'scroll-interactive',
			'animationType'      => $type,
			'animationDirection' => $direction,
		);
		if ( 'custom' === $type ) {
			$attrs = array_merge( $attrs, $custom( 'animationFrom', 'animationTo' ) );
		}
		$inner .= mb_self_check_paragraph( $label( array( 'Scroll Interactive', $type, $direction ) ), $clean( $attrs ), $colors['scroll-interactive'] );
		$count++;
	}
	$inner .= mb_self_check_paragraph(
		$label( array( 'Scroll Interactive', 'fade', 'Range: entry 20% → exit 80%' ) ),
		array(
			'animationMode'       => 'scroll-interactive',
			'animationType'       => 'fade',
			'animationRangeStart' => 'entry 20%',
			'animationRangeEnd'   => 'exit 80%',
		),
		$colors['scroll-interactive']
	);
	$count++;
	$body .= $section( 'Scroll Interactive', $inner );

	// --- Stagger on every container that supports it.
	$inner     = '';
	$stagger   = array(
		'animationMode'           => 'page-load',
		'animationType'           => 'slide',
		'animationDirection'      => 'btt',
		'animationDelay'          => 0,
		'animationStaggerEnabled' => true,
		'animationStaggerStep'    => 0.1,
	);
	$children  = function ( $n, $what ) {
		$out = '';
		for ( $i = 1; $i <= $n; $i++ ) {
			$out .= mb_self_check_paragraph( "{$what} {$i}" );
		}
		return $out;
	};
	foreach ( $shared['staggerParentBlocks'] as $parent ) {
		$name = substr( $parent, 5 );
		switch ( $parent ) {
			case 'core/group':
				$inner .= mb_self_check_group( mb_self_check_paragraph( 'Stagger · Group · Page Load · slide' ) . $children( 3, 'Child' ), $stagger, $colors['stagger'] );
				$inner .= mb_self_check_group(
					mb_self_check_paragraph( 'Stagger · Group · Scroll Appear · Entry: scale' ) . $children( 3, 'Child' ),
					array(
						'animationMode'           => 'scroll-appear',
						'animationEntryType'      => 'scale',
						'animationEntryDelay'     => 0,
						'animationEntryReplay'    => 'repeat',
						'animationStaggerEnabled' => true,
					),
					$colors['stagger']
				);
				// Exit Replay left at its default ('reverse') on purpose:
				// scrolling back up must reverse-play the children's Exit
				// keyframe, not replay it forward and leave them hidden (#51).
				$inner .= mb_self_check_group(
					mb_self_check_paragraph( 'Stagger · Group · Scroll Appear · Entry: fade (Replay: Repeat) · Exit: fade (Replay: Reverse)' ) . $children( 3, 'Child' ),
					array(
						'animationMode'           => 'scroll-appear',
						'animationEntryType'      => 'fade',
						'animationEntryDelay'     => 0,
						'animationEntryReplay'    => 'repeat',
						'animationExitType'       => 'fade',
						'animationStaggerEnabled' => true,
					),
					$colors['stagger']
				);
				// Same with Entry Replay 'once' (the default): the block
				// stays observed for its Exit, and the children must come
				// back after an Exit round trip (GH #39, #51).
				$inner .= mb_self_check_group(
					mb_self_check_paragraph( 'Stagger · Group · Scroll Appear · Entry: fade (Replay: Once) · Exit: fade (Replay: Reverse)' ) . $children( 3, 'Child' ),
					array(
						'animationMode'           => 'scroll-appear',
						'animationEntryType'      => 'fade',
						'animationEntryDelay'     => 0,
						'animationEntryReplay'    => 'once',
						'animationExitType'       => 'fade',
						'animationStaggerEnabled' => true,
					),
					$colors['stagger']
				);
				// Legacy markup: Groups saved before WordPress 5.9 keep
				// the `wp-block-group__inner-container` wrapper in their
				// content, on every theme. Classic themes add the same
				// wrapper at render time. The children inside it must
				// still stagger, and the wrapper must not animate (#66).
				$inner .= mb_self_check_block(
					'group',
					$stagger,
					'<div class="wp-block-group"><div class="wp-block-group__inner-container">' .
						mb_self_check_paragraph( 'Stagger · Group (legacy inner-container markup) · Page Load · slide' ) .
						$children( 3, 'Child' ) .
						'</div></div>'
				);
				$count += 5;
				break;
			case 'core/columns':
				$columns = '';
				for ( $i = 1; $i <= 3; $i++ ) {
					$columns .= mb_self_check_block( 'column', array(), '<div class="wp-block-column">' . mb_self_check_paragraph( "Stagger · Columns · column {$i}" ) . '</div>' );
				}
				$inner .= mb_self_check_block( 'columns', $stagger, "<div class=\"wp-block-columns\">{$columns}</div>" );
				$count++;
				break;
			case 'core/buttons':
				$buttons = '';
				for ( $i = 1; $i <= 3; $i++ ) {
					$buttons .= mb_self_check_block( 'button', array(), "<div class=\"wp-block-button\"><a class=\"wp-block-button__link wp-element-button\">Stagger · Buttons · {$i}</a></div>" );
				}
				$inner .= mb_self_check_block( 'buttons', $stagger, "<div class=\"wp-block-buttons\">{$buttons}</div>" );
				$count++;
				break;
			case 'core/gallery':
				if ( ! $image ) {
					break;
				}
				$images = '';
				$url    = esc_url( $image['url'] );
				for ( $i = 1; $i <= 3; $i++ ) {
					$images .= mb_self_check_block(
						'image',
						array(
							'id'              => $image['id'],
							'sizeSlug'        => 'full',
							'linkDestination' => 'none',
						),
						"<figure class=\"wp-block-image size-full\"><img src=\"{$url}\" alt=\"\" class=\"wp-image-{$image['id']}\"/></figure>"
					);
				}
				$inner .= mb_self_check_block(
					'gallery',
					array_merge( array( 'linkTo' => 'none' ), $stagger ),
					"<figure class=\"wp-block-gallery has-nested-images columns-default is-cropped\">{$images}</figure>"
				);
				$count++;
				break;
			case 'core/list':
				$inner .= mb_self_check_list( 4, $stagger, $colors['stagger'] );
				$count++;
				break;
			default:
				// A container added to staggerParentBlocks that this page
				// doesn't know how to build yet: say so on the page.
				$inner .= mb_self_check_paragraph( "Not covered yet: stagger on {$parent}" );
		}
	}
	$body .= $section( 'Stagger', $inner );

	// --- Cover image effects and "Animate image only".
	if ( $image ) {
		$inner  = '';
		$covers = array(
			array( 'Page Load · image-zoom', array( 'animationMode' => 'page-load', 'animationType' => 'image-zoom', 'animationDelay' => 0 ) ),
			array( 'Page Load · image-move · btt', array( 'animationMode' => 'page-load', 'animationType' => 'image-move', 'animationDirection' => 'btt', 'animationDelay' => 0 ) ),
			array( 'Page Load · slide · Animate image only', array( 'animationMode' => 'page-load', 'animationType' => 'slide', 'animationDirection' => 'btt', 'animationDelay' => 0, 'animationFromToTarget' => 'img' ) ),
			array( 'Scroll Appear · Entry: image-zoom', array( 'animationMode' => 'scroll-appear', 'animationEntryType' => 'image-zoom', 'animationEntryDelay' => 0, 'animationEntryReplay' => 'repeat' ) ),
			array( 'Scroll Appear · Entry: scale · Animate image only', array( 'animationMode' => 'scroll-appear', 'animationEntryType' => 'scale', 'animationEntryDelay' => 0, 'animationEntryReplay' => 'repeat', 'animationFromToTarget' => 'img' ) ),
			// The image is pre-hidden until the Entry fires, so it fades in
			// without first showing at full opacity (GH #53 image flash).
			array( 'Scroll Appear · Entry: fade · Animate image only', array( 'animationMode' => 'scroll-appear', 'animationEntryType' => 'fade', 'animationEntryDelay' => 0, 'animationEntryReplay' => 'repeat', 'animationFromToTarget' => 'img' ) ),
			// Exit only: no pre-hide, the image stays visible until it leaves.
			array( 'Scroll Appear · Exit: fade · Animate image only', array( 'animationMode' => 'scroll-appear', 'animationEntryType' => '', 'animationExitType' => 'fade', 'animationExitReplay' => 'reverse', 'animationFromToTarget' => 'img' ) ),
			// Image Move starts from a visible image, so it is not pre-hidden.
			array( 'Scroll Appear · Entry: image-move · btt', array( 'animationMode' => 'scroll-appear', 'animationEntryType' => 'image-move', 'animationEntryDirection' => 'btt', 'animationEntryDelay' => 0, 'animationEntryReplay' => 'repeat' ) ),
			array( 'Scroll Interactive · image-move · btt', array( 'animationMode' => 'scroll-interactive', 'animationType' => 'image-move', 'animationDirection' => 'btt' ) ),
			array( 'Scroll Interactive · image-zoom', array( 'animationMode' => 'scroll-interactive', 'animationType' => 'image-zoom' ) ),
			array( 'Scroll Interactive · fade-out · Animate image only', array( 'animationMode' => 'scroll-interactive', 'animationType' => 'fade-out', 'animationFromToTarget' => 'img' ) ),
		);
		foreach ( $covers as list( $text, $attrs ) ) {
			$inner .= mb_self_check_cover( $image, $attrs, "Cover · {$text}" );
			$count++;
		}
		$body .= $section( 'Cover image effects', $inner );
	}

	// --- Bundled recipes, with the exact attributes they apply.
	$inner = '';
	foreach ( motion_blocks_bundled_recipes() as $recipe ) {
		$attrs = array_filter(
			$recipe['attributes'],
			function ( $v ) {
				return null !== $v;
			}
		);
		$inner .= mb_self_check_paragraph( 'Recipe · ' . $recipe['name'], $attrs, $colors['recipe'] );
		$count++;
	}
	$body .= $section( 'Recipes', $inner );

	return array(
		'title'   => 'Smoke test',
		'note'    => "Every effect in every mode, set up correctly: {$count} animated blocks, tinted by mode (green Page Load, blue Scroll Appear, purple Scroll Interactive, orange Stagger, pink Recipes). Run it after every update. On the front end the sweep should report nothing. Then open this page in the editor and run: await motionBlocksEditorCheck() — it should report no invalid blocks or errors.",
		'content' => $body . mb_self_check_spacer( 600 ),
		'expect'  => array(),
	);
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
	$mb_deleted = count( $pages ) . ' fixture page(s) deleted.';
	if ( class_exists( 'WP_CLI' ) ) {
		WP_CLI::success( $mb_deleted );
	} else {
		echo 'Success: ' . $mb_deleted . "\n";
	}
	return;
}

// The late-injected and content-above fixtures need a <script>;
// WP-CLI runs without a user, so kses would otherwise strip it.
kses_remove_filters();

$mb_manifest = array();
$mb_image    = mb_self_check_image();
$mb_fixtures = 'smoke' === $mb_mode
	? array( 'smoke' => mb_self_check_smoke( $mb_image ) )
	: array_merge( array( 'smoke' => mb_self_check_smoke( $mb_image ) ), mb_self_check_fixtures( $mb_image ) );
foreach ( $mb_fixtures as $key => $fixture ) {
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
		mb_self_check_fail( "{$slug}: " . $post_id->get_error_message() );
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
		'edit_url'              => admin_url( "post.php?post={$post_id}&action=edit" ),
		'note'                  => $fixture['note'],
		'expect'                => $fixture['expect'],
		'expect_reduced_motion' => isset( $fixture['expect_reduced_motion'] )
			? $fixture['expect_reduced_motion']
			: $fixture['expect'],
		'assets'                => $fixture['assets'] ?? true,
	);
}

if ( 'json' === $mb_mode ) {
	echo wp_json_encode( $mb_manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) . "\n";
	return;
}

$mb_rows = array_map(
	function ( $row ) {
		return array(
			'fixture' => $row['key'],
			'url'     => $row['url'],
			'expect'  => $row['expect'] ? implode( ', ', $row['expect'] ) : '(clean)',
		);
	},
	$mb_manifest
);
$mb_hint = 'Turn on Settings → Motion Blocks → Self-check, then run `await motionBlocksSelfCheck( { sweep: true } )` on each page.';
if ( class_exists( 'WP_CLI' ) ) {
	WP_CLI\Utils\format_items( 'table', $mb_rows, array( 'fixture', 'url', 'expect' ) );
	WP_CLI::log( $mb_hint );
} else {
	foreach ( $mb_rows as $row ) {
		echo implode( "\t", $row ) . "\n";
	}
	echo $mb_hint . "\n";
}
