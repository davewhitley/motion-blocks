/**
 * "Animate image only" Scroll Appear blocks pre-hide their image
 * (GH #53 image flash).
 *
 * The wrapper opts out of the Scroll Appear pre-hide, and every img
 * animation rule needs a trigger class, so without a matching image
 * rule the Cover image showed at full opacity until the Entry fired,
 * then snapped to the keyframe's hidden from-state. This guard keeps
 * that rule in place, scoped the same way as the wrapper pre-hide, and
 * checks Reduced Motion and per-device disable still win over it.
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

const IMG = '[data-mb-target="img"] img:first-of-type';

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

	it( 'is scoped like the wrapper pre-hide (mb-js, no-preference)', () => {
		expect( prehide[ 0 ].prelude.startsWith( ':where(html.mb-js)' ) ).toBe(
			true
		);
		expect( prehide[ 0 ].media ).toBe(
			'@media (prefers-reduced-motion: no-preference)'
		);
	} );

	it( 'is still overridden by Reduced Motion and per-device disable', () => {
		const overrides = all.filter(
			( r ) =>
				r.prelude.includes( ':is(' ) &&
				r.prelude.includes( IMG ) &&
				r.body.includes( 'opacity: 1 !important' )
		);
		const media = overrides.map( ( r ) => r.media ).sort();
		expect( media ).toEqual(
			[
				'@media (width < 768px)',
				'@media (width >= 1024px)',
				'@media (768px <= width < 1024px)',
				'@media (prefers-reduced-motion: reduce)',
			].sort()
		);
	} );
} );
