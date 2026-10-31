/**
 * The `.mb-settled` rules in css/animations.css (GH #20).
 *
 * frontend.js adds `.mb-settled` to a finished one-shot block. The CSS
 * must then drop the animation on every element it ran on (the wrapper,
 * Stagger children in both forms, the img-target image), or the filled
 * last frame keeps trapping `position: fixed` descendants, and Flip's
 * 3D context, which comes from class rules rather than the keyframe,
 * must stop applying.
 *
 * The rules win by weight and position, not `!important` (#53): each
 * one weighs at least as much as every rule that can bind an animation
 * to the same target and comes after it, and the img rules frontend.js
 * injects at runtime (in a later stylesheet) weigh less.
 *
 * Run: npm run test:unit
 */
const fs = require( 'fs' );
const path = require( 'path' );
const postcss = require( 'postcss' );
const selectorParser = require( 'postcss-selector-parser' );
const { selectorSpecificity } = require( '@csstools/selector-specificity' );
import { imgTargetSelector } from '../../src/img-target';

const root = postcss.parse(
	fs.readFileSync(
		path.join( __dirname, '..', '..', 'css', 'animations.css' ),
		'utf8'
	)
);

const collapse = ( text ) => text.replace( /\s+/g, ' ' ).trim();

/** Every style rule outside @keyframes, in source order. */
function styleRules() {
	const rules = [];
	root.walkRules( ( rule ) => {
		if ( /keyframes$/.test( rule.parent?.name || '' ) ) {
			return;
		}
		const selectors = [];
		selectorParser( ( list ) => {
			list.each( ( sel ) => {
				selectors.push( {
					text: collapse( sel.toString() ),
					weight: selectorSpecificity( sel ),
				} );
			} );
		} ).processSync( rule.selector );
		const decls = [];
		rule.walkDecls( ( d ) =>
			decls.push( {
				prop: d.prop,
				value: d.value,
				important: !! d.important,
			} )
		);
		rules.push( { line: rule.source.start.line, selectors, decls } );
	} );
	return rules;
}

function weightOf( selector ) {
	let weight;
	selectorParser( ( list ) => {
		weight = selectorSpecificity( list.first );
	} ).processSync( selector );
	return weight;
}

const compare = ( x, y ) => x.a - y.a || x.b - y.b || x.c - y.c;
const show = ( w ) => `(${ w.a },${ w.b },${ w.c })`;

/** Which settled target form a selector's subject is, if any. */
function formOf( selector ) {
	if ( selector.endsWith( '> picture > img:first-of-type' ) ) {
		return 'picture';
	}
	if ( selector.endsWith( '> img:first-of-type' ) ) {
		return 'img';
	}
	// Combinators outside parentheses.
	const outside = selector.replace( /\([^()]*(\([^()]*\))*[^()]*\)/g, '' );
	if ( ! /[\s>+~]/.test( outside ) ) {
		return 'wrapper';
	}
	if ( selector.includes( '.mb-stagger-parent' ) ) {
		return selector.includes( ':where(.wp-block-group__inner-container) >' )
			? 'stagger-inner'
			: 'stagger';
	}
	return null;
}

const IC = '.wp-block-group__inner-container';
const SPACER = '.wp-block-spacer, [data-type="core/spacer"]';

const rules = styleRules();
const settledRules = rules.filter( ( r ) =>
	r.selectors.some( ( s ) => /\.mb-settled(?!\))/.test( s.text ) )
);
const dropRule = settledRules.find( ( r ) =>
	r.decls.some( ( d ) => d.prop === 'animation' && d.value === 'none' )
);

describe( 'settled state CSS (GH #20)', () => {
	it( 'drops the animation on all four target forms (img in two paths)', () => {
		expect( dropRule ).toBeDefined();
		expect( dropRule.selectors.map( ( s ) => s.text ) ).toEqual( [
			'.mb-animated.mb-triggered.mb-settled',
			`.mb-stagger-parent.mb-triggered.mb-settled > :where(:not(${ IC }, ${ SPACER }))`,
			`.mb-stagger-parent.mb-triggered.mb-settled > :where(${ IC }) > :where(:not(${ SPACER }))`,
			'[data-mb-target="img"].mb-triggered.mb-settled > img:first-of-type',
			'[data-mb-target="img"].mb-triggered.mb-settled > picture > img:first-of-type',
		] );
	} );

	it( 'is the only settled rule, with no !important (#53)', () => {
		expect( settledRules ).toEqual( [ dropRule ] );
		expect( dropRule.decls ).toEqual( [
			{ prop: 'animation', value: 'none', important: false },
		] );
	} );

	it( 'out-weighs or follows every rule that binds an animation to the same target', () => {
		const settled = {};
		dropRule.selectors.forEach( ( s ) => {
			settled[ formOf( s.text ) ] = s.weight;
		} );
		expect( Object.keys( settled ).sort() ).toEqual(
			[ 'img', 'picture', 'stagger', 'stagger-inner', 'wrapper' ].sort()
		);

		const offenders = [];
		rules.forEach( ( rule ) => {
			if ( rule === dropRule ) {
				return;
			}
			const binds = rule.decls.some(
				( d ) => d.prop.startsWith( 'animation' ) && ! d.important
			);
			if ( ! binds ) {
				return;
			}
			rule.selectors.forEach( ( s ) => {
				const form = formOf( s.text );
				// `:not(.mb-settled)` rules never match a settled block.
				if ( ! form || s.text.includes( ':not(.mb-settled)' ) ) {
					return;
				}
				const order = compare( s.weight, settled[ form ] );
				if (
					order > 0 ||
					( order === 0 && rule.line > dropRule.line )
				) {
					offenders.push(
						`${ rule.line } ${ show( s.weight ) } ${ s.text }`
					);
				}
			} );
		} );
		expect( offenders ).toEqual( [] );
	} );

	it( 'out-weighs the img rules frontend.js injects (they load later)', () => {
		const injected = [
			'[data-mb-uid="mb-1"]',
			'[data-mb-uid="mb-1"].mb-triggered',
			'[data-mb-uid="mb-1"].mb-exit-triggered',
		].flatMap( ( scope ) => imgTargetSelector( scope ).split( ', ' ) );
		const settled = {};
		dropRule.selectors.forEach( ( s ) => {
			settled[ formOf( s.text ) ] = s.weight;
		} );
		injected.forEach( ( selector ) => {
			const weight = weightOf( selector );
			expect( [
				selector,
				compare( weight, settled[ formOf( selector ) ] ) < 0,
			] ).toEqual( [ selector, true ] );
		} );
	} );

	it( 'drops Flip 3D context with :not(.mb-settled), not a reset rule', () => {
		const flip3d = rules.filter( ( r ) =>
			r.decls.some(
				( d ) =>
					d.prop === 'transform-style' && d.value === 'preserve-3d'
			)
		);
		// Entry Flip in Page Load / Scroll Appear can settle; Exit and
		// Scroll Interactive never do.
		const settleable = flip3d.flatMap( ( r ) =>
			r.selectors
				.map( ( s ) => s.text )
				.filter( ( text ) =>
					text.includes( '.mb-enter-flip.mb-triggered' )
				)
		);
		expect( settleable.length ).toBe( 5 );
		settleable.forEach( ( text ) => {
			expect( text ).toContain( ':not(.mb-settled)' );
		} );
		// No settled Flip reset: the only `flat` left is the reduced
		// motion and per-device overrides, which keep `!important`.
		settledRules.forEach( ( r ) => {
			r.decls.forEach( ( d ) => {
				expect( d.prop ).not.toMatch(
					/^(transform-style|backface-visibility)$/
				);
			} );
		} );
	} );

	it( 'never pins opacity, transform or clip-path (no snap to a rest value)', () => {
		dropRule.decls.forEach( ( { prop } ) => {
			expect( prop ).not.toMatch(
				/^(opacity|transform|clip-path|filter)$/
			);
		} );
	} );
} );

describe( 'image-effect safety net (#53)', () => {
	it( 'unbinds the wrapper keyframe without !important', () => {
		const net = rules.filter( ( r ) =>
			r.selectors.some( ( s ) =>
				/^\.mb-(enter|exit)-image-(move|zoom):not\(\[data-mb-target="img"\]\)$/.test(
					s.text
				)
			)
		);
		expect( net ).toHaveLength( 1 );
		expect( net[ 0 ].selectors ).toHaveLength( 4 );
		expect( net[ 0 ].decls ).toEqual( [
			{ prop: 'animation-name', value: 'none', important: false },
		] );
	} );

	it( 'is the only rule naming a keyframe for an image-effect wrapper', () => {
		const others = [];
		rules.forEach( ( r ) => {
			if ( ! r.decls.some( ( d ) => d.prop === 'animation-name' ) ) {
				return;
			}
			r.selectors.forEach( ( s ) => {
				if (
					/\.mb-(enter|exit)-image-/.test( s.text ) &&
					formOf( s.text ) === 'wrapper' &&
					! s.text.includes( ':not([data-mb-target="img"])' )
				) {
					others.push( s.text );
				}
			} );
		} );
		expect( others ).toEqual( [] );
	} );
} );
