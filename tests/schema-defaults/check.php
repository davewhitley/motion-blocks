<?php
/**
 * Schema-defaults parity check: does the front end resolve omitted
 * block attributes the same way the editor does?
 *
 * WordPress omits any attribute equal to its schema default from the
 * saved block comment; the editor refills it from the schema, and the
 * PHP render filter has to do the same. This script renders the
 * fixtures in cases.php through the real `render_block` pipeline and
 * compares the emitted markup with what the editor panel shows.
 *
 * Run from a WordPress site that has the plugin active, via WP-CLI:
 *
 *   cd ~/Studio/animation-plugin
 *   studio wp eval-file ../animation-controls-plugin/tests/schema-defaults/check.php
 *
 * Modes (optional positional arg):
 *   (none)  Run the fixtures, then check that server-rendered block
 *           previews (block-renderer endpoint) accept the editor's
 *           attributes. Prints PASS/FAIL per case, exits 1 on failure.
 *   audit   Print one line per animated block on the site with the
 *           attributes the render filter emits for it. Capture before
 *           and after a change and `diff` the two files.
 *   page    Create/update the published page "Motion Blocks: defaults
 *           check" containing every fixture, labeled with what the
 *           editor should show, plus a live PASS/FAIL table.
 */

if ( ! function_exists( 'motion_blocks_render_block' ) ) {
	fwrite( STDERR, "Motion Blocks is not active on this site.\n" );
	exit( 1 );
}

$mb_cases = require __DIR__ . '/cases.php';
$mb_mode  = isset( $args[0] ) ? $args[0] : 'check';

/**
 * Build the saved markup for a fixture, exactly as the editor would
 * serialize it (serialize_block applies the same comment escaping).
 */
function mb_test_fixture_markup( $n, $case ) {
	$name  = isset( $case['block'] ) ? $case['block'] : 'core/paragraph';
	$attrs = $case['attrs'];
	$class = "mbtest mbtest-{$n}";
	$attrs['className'] = $class;

	if ( 'core/group' === $name ) {
		$attrs['layout'] = array( 'type' => 'constrained' );
		$count           = isset( $case['children'] ) ? $case['children'] : 1;
		$children        = array();
		$content         = array( '<div class="wp-block-group ' . $class . '">' );
		for ( $i = 1; $i <= $count; $i++ ) {
			$text       = $count > 1 ? "Case {$n}, child {$i}" : "Case {$n} (Group)";
			$children[] = array(
				'blockName'    => 'core/paragraph',
				'attrs'        => array(),
				'innerBlocks'  => array(),
				'innerHTML'    => "<p>{$text}</p>",
				'innerContent' => array( "<p>{$text}</p>" ),
			);
			$content[]  = null;
		}
		$content[] = '</div>';
		return serialize_block(
			array(
				'blockName'    => $name,
				'attrs'        => $attrs,
				'innerBlocks'  => $children,
				'innerHTML'    => '',
				'innerContent' => $content,
			)
		);
	}

	if ( 'core/paragraph' !== $name ) {
		// Server-rendered block: saved as a self-closing comment.
		return serialize_block(
			array(
				'blockName'    => $name,
				'attrs'        => $attrs,
				'innerBlocks'  => array(),
				'innerHTML'    => '',
				'innerContent' => array(),
			)
		);
	}

	$html = '<p class="' . $class . '">Case ' . $n . '</p>';
	return serialize_block(
		array(
			'blockName'    => $name,
			'attrs'        => $attrs,
			'innerBlocks'  => array(),
			'innerHTML'    => $html,
			'innerContent' => array( $html ),
		)
	);
}

/**
 * Compare the first tag of rendered HTML against a case's expectations.
 * Returns a list of human-readable mismatches (empty = pass).
 */
function mb_test_compare( $html, $expect ) {
	$p = new WP_HTML_Tag_Processor( $html );
	if ( ! $p->next_tag() ) {
		return array( 'no wrapper element rendered' );
	}
	$errors = array();
	foreach ( $expect as $key => $want ) {
		if ( 'animated' === $key ) {
			$got = null !== $p->get_attribute( 'data-mb-mode' );
			if ( $got !== $want ) {
				$errors[] = 'animated: want ' . var_export( $want, true ) . ', got ' . var_export( $got, true );
			}
		} elseif ( 'class' === $key ) {
			foreach ( $want as $class ) {
				if ( ! $p->has_class( $class ) ) {
					$errors[] = "missing class {$class}";
				}
			}
		} elseif ( 'style' === $key ) {
			$style = (string) $p->get_attribute( 'style' );
			if ( false === strpos( $style, $want ) ) {
				$errors[] = "style: want it to contain {$want}, got \"{$style}\"";
			}
		} else {
			$got = $p->get_attribute( $key );
			if ( null === $want && null !== $got ) {
				$errors[] = "{$key}: want absent, got {$got}";
			} elseif ( null !== $want && $got !== $want ) {
				$errors[] = "{$key}: want {$want}, got " . ( null === $got ? '(absent)' : $got );
			}
		}
	}
	return $errors;
}

/** Stable one-line summary of the animation markup on a wrapper. */
function mb_test_signature( $html ) {
	$p = new WP_HTML_Tag_Processor( $html );
	if ( ! $p->next_tag() ) {
		return '(no element)';
	}
	if ( null === $p->get_attribute( 'data-mb-mode' ) ) {
		return '(not animated)';
	}
	$parts = array();
	foreach ( (array) $p->get_attribute_names_with_prefix( 'data-mb-' ) as $name ) {
		$parts[] = $name . '=' . $p->get_attribute( $name );
	}
	sort( $parts );
	$classes = array();
	foreach ( $p->class_list() as $class ) {
		if ( 0 === strpos( $class, 'mb-' ) ) {
			$classes[] = $class;
		}
	}
	sort( $classes );
	$style = (string) $p->get_attribute( 'style' );
	if ( preg_match( '/--mb-stagger-step:[^;]+/', $style, $m ) ) {
		$parts[] = $m[0];
	}
	return implode( ' ', $classes ) . ' | ' . implode( ' ', $parts );
}

if ( 'audit' === $mb_mode ) {
	$ids = get_posts(
		array(
			'post_type'      => array( 'post', 'page', 'wp_block', 'wp_template', 'wp_template_part' ),
			'post_status'    => array( 'publish', 'draft', 'private', 'future', 'pending' ),
			'posts_per_page' => -1,
			'fields'         => 'ids',
			'orderby'        => 'ID',
			'order'          => 'ASC',
		)
	);
	$walk = function ( $blocks, $post_id, $path ) use ( &$walk ) {
		foreach ( $blocks as $i => $block ) {
			$here = '' === $path ? (string) $i : "{$path}.{$i}";
			if ( ! empty( $block['attrs']['animationMode'] ) ) {
				// Call the filter directly on the block's own saved
				// wrapper so the audit only reflects Motion Blocks'
				// attribute resolution (no other plugins, no dynamic
				// render side effects). Dynamic blocks with no saved
				// HTML get a bare stand-in wrapper.
				$inner = trim( (string) $block['innerHTML'] );
				$html  = motion_blocks_render_block( '' !== $inner ? $inner : '<div></div>', $block );
				echo "#{$post_id} {$here} {$block['blockName']}: " . mb_test_signature( $html ) . "\n";
			}
			if ( ! empty( $block['innerBlocks'] ) ) {
				$walk( $block['innerBlocks'], $post_id, $here );
			}
		}
	};
	foreach ( $ids as $id ) {
		$walk( parse_blocks( get_post_field( 'post_content', $id ) ), $id, '' );
	}
	return;
}

if ( 'page' === $mb_mode ) {
	wp_set_current_user( 1 ); // Admin, so the inline <script> survives kses.

	$expectations = array();
	$body         = '';
	foreach ( $mb_cases as $i => $case ) {
		$n              = $i + 1;
		$expectations[] = array(
			'n'      => $n,
			'label'  => $case['label'],
			'expect' => (object) $case['expect'],
		);
		$body .= '<!-- wp:heading {"level":3} --><h3 class="wp-block-heading">' . $n . '. ' . esc_html( $case['label'] ) . "</h3><!-- /wp:heading -->\n\n";
		$body .= '<!-- wp:paragraph --><p>Editor panel should show: <strong>' . esc_html( $case['panel'] ) . '</strong><br>Front end: ' . esc_html( $case['behavior'] ) . "</p><!-- /wp:paragraph -->\n\n";
		$body .= mb_test_fixture_markup( $n, $case ) . "\n\n";
		$body .= '<!-- wp:spacer {"height":"40vh"} --><div style="height:40vh" aria-hidden="true" class="wp-block-spacer"></div><!-- /wp:spacer -->' . "\n\n";
	}

	$json    = wp_json_encode( $expectations, JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_SLASHES );
	$checker = <<<HTML
<!-- wp:html -->
<style>.mbtest{padding:1.5rem;background:#eef0f7;border-radius:8px}#mbtest-results table{border-collapse:collapse;font:13px/1.4 ui-monospace,monospace;width:100%}#mbtest-results td{border-top:1px solid #ddd;padding:4px 6px;vertical-align:top}</style>
<div id="mbtest-results"><p>Front-end check runs here (JavaScript required).</p></div>
<script>
(function () {
	var cases = {$json};
	function check(c) {
		var el = document.querySelector('.mbtest-' + c.n);
		if (!el) { return ['block not found']; }
		var errs = [];
		Object.keys(c.expect).forEach(function (k) {
			var want = c.expect[k], got;
			if (k === 'animated') {
				got = el.hasAttribute('data-mb-mode');
				if (got !== want) { errs.push('animated: want ' + want + ', got ' + got); }
			} else if (k === 'class') {
				want.forEach(function (cl) { if (!el.classList.contains(cl)) { errs.push('missing class ' + cl); } });
			} else if (k === 'style') {
				got = el.getAttribute('style') || '';
				if (got.indexOf(want) === -1) { errs.push('style lacks ' + want); }
			} else {
				got = el.getAttribute(k);
				if (want === null && got !== null) { errs.push(k + ': want absent, got ' + got); }
				else if (want !== null && got !== want) { errs.push(k + ': want ' + want + ', got ' + (got === null ? '(absent)' : got)); }
			}
		});
		return errs;
	}
	function run() {
		var passed = 0, rows = cases.map(function (c) {
			var errs = check(c), ok = errs.length === 0;
			if (ok) { passed++; }
			return '<tr><td style="color:' + (ok ? '#1a7f37' : '#cf222e') + ';font-weight:600">' + (ok ? 'PASS' : 'FAIL') + '</td><td>' + c.n + '. ' + c.label + (ok ? '' : '<br><span style="color:#cf222e">' + errs.join('<br>') + '</span>') + '</td></tr>';
		});
		document.getElementById('mbtest-results').innerHTML = '<p><strong>' + passed + ' / ' + cases.length + ' cases match the editor</strong></p><table>' + rows.join('') + '</table>';
	}
	if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', run); } else { run(); }
})();
</script>
<!-- /wp:html -->
HTML;

	$intro   = '<!-- wp:paragraph --><p>Each block below is saved exactly as the editor saves it, with every default-valued setting omitted. Open this page in the editor and click each block: its Motion Effects panel should match the label above it. On the front end, the table checks the rendered markup against the same expectations, and scrolling shows the behavior.</p><!-- /wp:paragraph -->' . "\n\n";
	$content = $intro . $checker . "\n\n" . $body;

	$existing = get_page_by_path( 'motion-blocks-defaults-check', OBJECT, 'page' );
	$post_id  = wp_insert_post(
		array(
			'ID'           => $existing ? $existing->ID : 0,
			'post_type'    => 'page',
			'post_status'  => 'publish',
			'post_name'    => 'motion-blocks-defaults-check',
			'post_title'   => 'Motion Blocks: defaults check',
			'post_content' => wp_slash( $content ),
		),
		true
	);
	if ( is_wp_error( $post_id ) ) {
		fwrite( STDERR, $post_id->get_error_message() . "\n" );
		exit( 1 );
	}
	echo ( $existing ? 'Updated' : 'Created' ) . " page #{$post_id}\n";
	echo 'View: ' . get_permalink( $post_id ) . "\n";
	echo 'Edit: ' . admin_url( "post.php?post={$post_id}&action=edit" ) . "\n";
	return;
}

$failed = 0;
foreach ( $mb_cases as $i => $case ) {
	$n      = $i + 1;
	$html   = do_blocks( mb_test_fixture_markup( $n, $case ) );
	$errors = mb_test_compare( $html, $case['expect'] );
	echo ( $errors ? 'FAIL' : 'PASS' ) . "  {$n}. {$case['label']}\n";
	foreach ( $errors as $error ) {
		echo "        {$error}\n";
	}
	if ( $errors ) {
		$failed++;
	}
}
$total = count( $mb_cases );
echo "\n" . ( $total - $failed ) . " / {$total} cases match the editor\n";

// --- Server-rendered previews (GH #24) ---
// ServerSideRender sends every block attribute, including the ones this
// plugin adds on the client, to the block-renderer endpoint. It must
// accept them, and the preview must not carry animation markup (the
// editor animates the block wrapper instead).
echo "\nServer-rendered previews in the editor\n";
wp_set_current_user( 1 ); // The endpoint requires edit_posts.
$editor_attrs = array_merge(
	motion_blocks_schema_defaults(),
	array(
		'animationMode'              => 'scroll-appear',
		'animationEntryType'         => 'fade',
		'animationFromOpacity'       => null,
		'animationPreviewPlaying'    => false,
		'animationFromToPreviewSide' => 'off',
	)
);
// Control: a third-party block that registers its own animation*
// attribute server-side. That one must reach its render callback.
register_block_type(
	'mb-test/own-animation',
	array(
		'attributes'      => array( 'animationSpeed' => array( 'type' => 'number' ) ),
		'render_callback' => function ( $attrs ) {
			return '<div>speed:' . ( $attrs['animationSpeed'] ?? 'none' ) . '</div>';
		},
	)
);
$previews = array(
	array( 'core/archives', array(), null ),
	array( 'core/calendar', array(), null ),
	array( 'core/latest-comments', array(), null ),
	array( 'core/tag-cloud', array(), null ),
	array( 'mb-test/own-animation', array( 'animationSpeed' => 3 ), 'speed:3' ),
);
$preview_failed = 0;
foreach ( $previews as $i => list( $name, $own, $must_contain ) ) {
	$request = new WP_REST_Request( 'GET', "/wp/v2/block-renderer/{$name}" );
	$request->set_query_params(
		array(
			'context'    => 'edit',
			'attributes' => array_merge( $editor_attrs, $own ),
		)
	);
	$response = rest_do_request( $request );
	$data     = $response->get_data();
	$html     = is_array( $data ) ? (string) ( $data['rendered'] ?? '' ) : '';
	$errors   = array();
	if ( 200 !== $response->get_status() ) {
		$errors[] = 'HTTP ' . $response->get_status() . ': ' . ( $data['code'] ?? '' ) . ' ' . ( $data['message'] ?? '' );
	} elseif ( false !== strpos( $html, 'data-mb-' ) ) {
		$errors[] = 'preview contains animation markup';
	} elseif ( $must_contain && false === strpos( $html, $must_contain ) ) {
		$errors[] = "the block's own attribute was dropped (want \"{$must_contain}\" in the preview)";
	}
	echo ( $errors ? 'FAIL' : 'PASS' ) . '  P' . ( $i + 1 ) . ". {$name} preview loads with the editor's attributes\n";
	foreach ( $errors as $error ) {
		echo "        {$error}\n";
	}
	if ( $errors ) {
		$preview_failed++;
	}
}
unregister_block_type( 'mb-test/own-animation' );
$preview_total = count( $previews );
echo "\n" . ( $preview_total - $preview_failed ) . " / {$preview_total} previews load\n";

if ( $failed || $preview_failed ) {
	exit( 1 );
}
