/**
 * Flip's 3D context only applies while the animation is triggered
 * (2026-10-20 review, #53).
 *
 * `transform-style: preserve-3d` makes an element the containing block
 * for `position: fixed` descendants. It used to be set on the bare
 * `.mb-enter-flip` / `.mb-exit-flip` classes, so a Navigation overlay
 * inside a Flip block was trapped from first paint, before the block
 * was ever scrolled to.
 *
 * Run: npm run test:unit
 */
const fs = require( 'fs' );
const path = require( 'path' );

const css = fs
	.readFileSync(
		path.join( __dirname, '..', '..', 'css', 'animations.css' ),
		'utf8'
	)
	.replace( /\/\*[\s\S]*?\*\//g, '' );

/** Selectors of rules that set `transform-style: preserve-3d`. */
function preserve3dSelectors() {
	const out = [];
	const re = /([^{}]+)\{([^{}]*)\}/g;
	let m;
	while ( ( m = re.exec( css ) ) ) {
		if ( /transform-style\s*:\s*preserve-3d/.test( m[ 2 ] ) ) {
			m[ 1 ]
				.split( /,(?![^(]*\))/ )
				.map( ( s ) => s.replace( /\s+/g, ' ' ).trim() )
				.forEach( ( s ) => out.push( s ) );
		}
	}
	return out;
}

describe( "Flip's preserve-3d", () => {
	const selectors = preserve3dSelectors();

	it( 'is set somewhere (the flip still needs it while it plays)', () => {
		expect( selectors.length ).toBeGreaterThan( 0 );
	} );

	it( 'is only set on a triggered block (or a scroll-driven one)', () => {
		selectors.forEach( ( s ) => {
			expect( [
				s,
				/\.mb-triggered|\.mb-exit-triggered|\.mb-mode-scroll-interactive/.test(
					s
				),
			] ).toEqual( [ s, true ] );
		} );
	} );

	it( 'is never set on a Stagger parent or an "Animate image only" wrapper', () => {
		selectors
			.filter( ( s ) => ! /> /.test( s ) )
			.forEach( ( s ) => {
				expect( s ).toMatch( /:not\(\.mb-stagger-parent\)/ );
				expect( s ).toMatch( /:not\(\[data-mb-target="img"\]\)/ );
			} );
	} );
} );
