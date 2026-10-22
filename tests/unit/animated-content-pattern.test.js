/**
 * Conditional front-end assets: the pre-scan in animation-plugin.php
 * (motion_blocks_content_has_animation_mode) decides from saved block
 * markup whether a classic-theme page needs the animation CSS and JS.
 * Runs the real regex from the PHP file.
 *
 * Run: npm run test:unit
 */
const fs = require( 'fs' );
const path = require( 'path' );

/** The pattern passed to preg_match() in the PHP helper, as a RegExp. */
function readPattern() {
	const php = fs.readFileSync(
		path.join( __dirname, '../../animation-plugin.php' ),
		'utf8'
	);
	const fn = php.match(
		/function motion_blocks_content_has_animation_mode\([\s\S]*?preg_match\(\s*'\/((?:[^'\\]|\\.)*)\/'/
	);
	expect( fn ).not.toBeNull();
	return new RegExp( fn[ 1 ] );
}

const pattern = readPattern();
const has = ( markup ) => pattern.test( markup );

describe( 'animated-content pre-scan pattern', () => {
	it( 'matches a block saved with an animation mode', () => {
		expect(
			has(
				'<!-- wp:paragraph {"animationMode":"page-load","animationType":"fade"} --><p>x</p><!-- /wp:paragraph -->'
			)
		).toBe( true );
		expect(
			has(
				'<!-- wp:group {"layout":{"type":"constrained"},"animationMode":"scroll-appear","animationEntryType":"fade"} -->'
			)
		).toBe( true );
		expect( has( '{"animationMode":"scroll-interactive"}' ) ).toBe( true );
	} );

	it( 'tolerates whitespace around the colon', () => {
		expect( has( '{"animationMode" : "page-load"}' ) ).toBe( true );
	} );

	it( 'finds an animated block nested deep in other markup', () => {
		expect(
			has(
				'<!-- wp:columns --><div><!-- wp:column --><div><!-- wp:image {"id":3,"animationMode":"page-load"} /--></div><!-- /wp:column --></div><!-- /wp:columns -->'
			)
		).toBe( true );
	} );

	it( 'ignores blocks without an animation mode', () => {
		expect(
			has( '<!-- wp:paragraph --><p>Hello</p><!-- /wp:paragraph -->' )
		).toBe( false );
		expect( has( '' ) ).toBe( false );
	} );

	it( 'ignores an empty (default) animation mode', () => {
		expect(
			has( '<!-- wp:paragraph {"animationMode":""} --><p>x</p>' )
		).toBe( false );
	} );

	it( 'ignores other animation attributes on their own', () => {
		// A block whose mode was cleared keeps nothing that should load
		// the runtime, even if stray per-slot values linger.
		expect(
			has(
				'<!-- wp:paragraph {"animationType":"fade","animationDelay":0} -->'
			)
		).toBe( false );
	} );
} );
