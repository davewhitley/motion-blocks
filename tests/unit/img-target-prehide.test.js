/**
 * "Animate image only" Scroll Appear blocks pre-hide their image
 * (GH #53 image flash).
 *
 * The wrapper opts out of the Scroll Appear pre-hide, and every img
 * animation rule needs a trigger class, so without a matching image
 * rule the Cover image showed at full opacity until the Entry fired,
 * then snapped to the keyframe's hidden from-state. This guard keeps
 * that rule in place, behind the motion gate like the wrapper pre-hide,
 * so it never applies with reduced motion or on a disabled device (#53).
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

/**
 * Every rule as { prelude, body, media }, where `media` is the
 * prelude of the enclosing @media block (or '' at top level).
 *
 * @return {{prelude: string, body: string, media: string}[]} Rules.
 */
function rules() {
	const out = [];
	const stack = [];
	let prelude = '';
	let body = '';
	let inRule = false;
	for ( const ch of css ) {
		if ( ch === '{' ) {
			const p = prelude.replace( /\s+/g, ' ' ).trim();
			if ( p.startsWith( '@' ) ) {
				stack.push( p );
			} else {
				inRule = p;
				body = '';
			}
			prelude = '';
		} else if ( ch === '}' ) {
			if ( inRule !== false ) {
				out.push( {
					prelude: inRule,
					body: body.replace( /\s+/g, ' ' ).trim(),
					media: stack[ stack.length - 1 ] || '',
				} );
				inRule = false;
			} else {
				stack.pop();
			}
			prelude = '';
		} else if ( inRule !== false ) {
			body += ch;
		} else {
			prelude += ch;
		}
	}
	return out;
}

describe( 'img-target image pre-hide (GH #53)', () => {
	const all = rules();
	const prehide = all.filter(
		( r ) =>
			r.prelude.includes( '[data-mb-target="img"]' ) &&
			r.prelude.includes( '.mb-has-entry' ) &&
			r.prelude.endsWith( 'img:first-of-type' )
	);

	it( 'has exactly one image pre-hide rule', () => {
		expect( prehide ).toHaveLength( 1 );
	} );

	it( 'only matches before either trigger, and skips Image Move / Zoom', () => {
		const { prelude } = prehide[ 0 ];
		[
			'.mb-mode-scroll-appear',
			':not(.mb-triggered)',
			':not(.mb-exit-triggered)',
			':not(.mb-enter-image-move)',
			':not(.mb-enter-image-zoom)',
		].forEach( ( part ) => expect( prelude ).toContain( part ) );
	} );

	it( 'hides the image', () => {
		expect( prehide[ 0 ].body ).toMatch( /(^|;)\s*opacity:\s*0\s*;/ );
	} );

	it( 'is behind the motion gate, like the wrapper pre-hide', () => {
		const wrapper = all.find(
			( r ) =>
				r.prelude.includes(
					'.mb-mode-scroll-appear.mb-has-entry:where('
				) && /opacity:\s*0\s*;/.test( r.body )
		);
		expect( wrapper ).toBeDefined();
		[ wrapper, ...prehide ].forEach( ( r ) => {
			r.prelude
				.split( ',' )
				.forEach( ( sel ) =>
					expect(
						sel.trim().startsWith( ':where(html.mb-motion) ' )
					).toBe( true )
				);
			// No media query of its own: the gate already covers
			// reduced motion and per-device disable.
			expect( r.media ).toBe( '' );
		} );
	} );
} );
