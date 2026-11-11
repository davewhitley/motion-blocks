/**
 * Printing shows every animated block at rest (GH #127).
 *
 * Blocks waiting for their Entry are hidden with `opacity: 0`, blocks
 * an Exit has played on stay hidden, and neither changes when the page
 * is printed or saved as PDF, so they printed as blank gaps. The
 * `@media print` rule in css/animations.css pins every animated target
 * at rest with `!important`, which outranks a running animation's
 * value without removing the animation (removing it replays it when
 * the print dialog closes).
 *
 * Guards:
 *   - one print rule, gated like every other motion rule;
 *   - it resets the four properties the keyframes animate, and no
 *     keyframe animates a property it misses;
 *   - it never touches `animation`, so nothing replays after printing;
 *   - it covers the same targets the "Settled" rule does (wrapper,
 *     both Stagger child forms, both img-target forms), and leaves
 *     settled blocks alone.
 *
 * Run: npm run test:unit
 */
const fs = require( 'fs' );
const path = require( 'path' );
/* eslint-disable import/no-extraneous-dependencies -- PostCSS comes with @wordpress/scripts. */
const postcss = require( 'postcss' );
/* eslint-enable import/no-extraneous-dependencies */

const css = postcss.parse(
	fs.readFileSync(
		path.join( __dirname, '..', '..', 'css', 'animations.css' ),
		'utf8'
	)
);

const GATE = ':where(html.mb-motion) ';
const SETTLED = '.mb-triggered.mb-settled';
const NOT_SETTLED = ':where(:not(.mb-settled))';

const printRules = [];
css.walkAtRules( 'media', ( at ) => {
	if ( at.params === 'print' ) {
		at.walkRules( ( rule ) => printRules.push( rule ) );
	}
} );

/** A rule's selectors, one per line in the source. */
function selectorsOf( rule ) {
	return rule.selector.split( /,\n\s*/ ).map( ( s ) => s.trim() );
}

describe( 'print rule in animations.css (GH #127)', () => {
	it( 'is a single gated rule', () => {
		expect( printRules ).toHaveLength( 1 );
		selectorsOf( printRules[ 0 ] ).forEach( ( s ) =>
			expect( s.startsWith( GATE ) ).toBe( true )
		);
	} );

	it( 'pins the animated properties at rest with !important', () => {
		const decls = {};
		printRules[ 0 ].walkDecls( ( d ) => {
			decls[ d.prop ] = d.important ? `${ d.value } !important` : d.value;
		} );
		expect( decls ).toEqual( {
			opacity: '1 !important',
			transform: 'none !important',
			'clip-path': 'none !important',
			filter: 'none !important',
		} );
	} );

	it( 'resets every property a keyframe animates', () => {
		const reset = [];
		printRules[ 0 ].walkDecls( ( d ) => reset.push( d.prop ) );
		const animated = new Set();
		css.walkAtRules( 'keyframes', ( at ) =>
			at.walkDecls( ( d ) => animated.add( d.prop ) )
		);
		expect( [ ...animated ].sort() ).toEqual( reset.sort() );
	} );

	it( 'leaves the animation itself alone, so nothing replays', () => {
		printRules[ 0 ].walkDecls( ( d ) =>
			expect( d.prop ).not.toMatch( /^animation/ )
		);
	} );

	it( 'covers the targets the Settled rule covers, minus settled blocks', () => {
		let settled;
		css.walkRules( ( rule ) => {
			if (
				rule.parent.type === 'root' &&
				rule.selector.includes( SETTLED ) &&
				rule.nodes.some(
					( d ) => d.prop === 'animation' && d.value === 'none'
				)
			) {
				settled = rule;
			}
		} );
		expect( settled ).toBeDefined();
		const expected = selectorsOf( settled ).map( ( s ) => {
			expect( s ).toContain( SETTLED );
			return s.replace( SETTLED, NOT_SETTLED );
		} );
		expect( selectorsOf( printRules[ 0 ] ) ).toEqual( expected );
	} );
} );
