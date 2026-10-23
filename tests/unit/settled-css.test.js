/**
 * The `.mb-settled` rules in css/animations.css (GH #20).
 *
 * frontend.js adds `.mb-settled` to a finished one-shot block. The CSS
 * must then drop the animation on every element it ran on (the wrapper,
 * Stagger children in both forms, the img-target image), or the filled
 * last frame keeps trapping `position: fixed` descendants, and must
 * flatten Flip's 3D context, which comes from class rules rather than
 * the keyframe.
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

const collapse = ( text ) => text.replace( /\s+/g, ' ' ).trim();

function settledRules() {
	const found = [];
	const re = /([^{}]+)\{([^{}]*)\}/g;
	let match;
	while ( ( match = re.exec( css ) ) ) {
		const selector = collapse( match[ 1 ] );
		if ( selector.includes( '.mb-settled' ) ) {
			found.push( {
				selectors: selector.split( /,(?![^(]*\))/ ).map( collapse ),
				body: collapse( match[ 2 ] ),
			} );
		}
	}
	return found;
}

const IC = '.wp-block-group__inner-container';

describe( 'settled state CSS (GH #20)', () => {
	const rules = settledRules();
	const dropRule = rules.find( ( r ) =>
		r.body.includes( 'animation: none !important' )
	);
	const flatRule = rules.find( ( r ) =>
		r.body.includes( 'transform-style: flat !important' )
	);

	it( 'drops the animation on all four target forms', () => {
		expect( dropRule ).toBeDefined();
		expect( dropRule.selectors ).toEqual( [
			'.mb-animated.mb-settled',
			`.mb-stagger-parent.mb-settled > :where(:not(${ IC }))`,
			`.mb-stagger-parent.mb-settled > :where(${ IC }) > *`,
			'[data-mb-target="img"].mb-settled img:first-of-type',
		] );
	} );

	it( 'flattens Flip on the same four target forms', () => {
		expect( flatRule ).toBeDefined();
		expect( flatRule.body ).toContain(
			'backface-visibility: visible !important'
		);
		expect( flatRule.selectors ).toEqual( [
			'.mb-enter-flip.mb-settled',
			`.mb-stagger-parent.mb-enter-flip.mb-settled > :where(:not(${ IC }))`,
			`.mb-stagger-parent.mb-enter-flip.mb-settled > :where(${ IC }) > *`,
			'[data-mb-target="img"].mb-enter-flip.mb-settled img:first-of-type',
		] );
	} );

	it( 'never pins opacity, transform or clip-path (no snap to a rest value)', () => {
		rules.forEach( ( { body } ) => {
			expect( body ).not.toMatch(
				/(^|;\s*)(opacity|transform|clip-path|filter):/
			);
		} );
	} );
} );
