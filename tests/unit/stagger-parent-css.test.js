/**
 * Stagger parents keep the theme's own styling (#53), and Scroll
 * Interactive binds nothing without scroll-driven animations (GH #42).
 *
 * The Stagger parent rule used to force opacity, transform, filter and
 * clip-path with `!important`, and an `@supports not` reset forced
 * Scroll Interactive back to `animation-name: none !important`. Both
 * are gone, so these rules guard what replaced them:
 *
 * - the wrapper hide rules and the Page Load "Out" un-hide rule skip
 *   Stagger parents, so nothing sets the parent's opacity;
 * - the Stagger parent rule only unbinds the keyframe, without
 *   `!important`;
 * - every Scroll Interactive binding sits inside
 *   `@supports (animation-timeline: view())`, and there's no
 *   `@supports not` fallback left to keep in step.
 *
 * Run: npm run test:unit
 */
const fs = require( 'fs' );
const path = require( 'path' );
const postcss = require( 'postcss' );

const root = postcss.parse(
	fs.readFileSync(
		path.join( __dirname, '..', '..', 'css', 'animations.css' ),
		'utf8'
	)
);

const collapse = ( text ) => text.replace( /\s+/g, ' ' ).trim();

/** Style rules with their selector list and enclosing at-rules. */
function styleRules() {
	const rules = [];
	root.walkRules( ( rule ) => {
		if ( /keyframes$/.test( rule.parent?.name || '' ) ) {
			return;
		}
		const context = [];
		for ( let p = rule.parent; p && p.type !== 'root'; p = p.parent ) {
			context.unshift( `@${ p.name } ${ collapse( p.params ) }` );
		}
		const decls = [];
		rule.walkDecls( ( d ) =>
			decls.push( {
				prop: d.prop,
				value: d.value,
				important: !! d.important,
			} )
		);
		rules.push( {
			selectors: rule.selectors.map( collapse ),
			context: context.join( ' ' ),
			decls,
		} );
	} );
	return rules;
}

const rules = styleRules();
const VIEW_GATE = '@supports (animation-timeline: view())';

describe( 'Stagger parents keep theme styles (#53)', () => {
	it( 'are left out of every wrapper opacity rule', () => {
		// The selector's subject (last compound), ignoring anything
		// inside parentheses.
		const subject = ( s ) => {
			let depth = 0;
			let out = '';
			for ( const ch of s ) {
				depth += ch === '(' ? 1 : 0;
				out += depth ? '' : ch;
				depth -= ch === ')' ? 1 : 0;
			}
			return out.split( /\s*[\s>+~]\s*/ ).pop();
		};
		const wrapperOpacity = rules
			.filter(
				( r ) =>
					! /reduced-motion: reduce/.test( r.context ) &&
					r.decls.some(
						( d ) => d.prop === 'opacity' && ! d.important
					)
			)
			.flatMap( ( r ) => r.selectors )
			.filter(
				( s ) =>
					/^\.mb-mode-(page-load|scroll-appear)/.test(
						subject( s )
					) &&
					// img-target wrappers are Covers, never Stagger
					// parents.
					! s.includes( '[data-mb-target="img"]' )
			);
		// The two hide rules and the Page Load "Out" un-hide rule.
		expect( wrapperOpacity ).toHaveLength( 3 );
		wrapperOpacity.forEach( ( s ) => {
			expect( s ).toContain( ':where(:not(.mb-stagger-parent))' );
		} );
	} );

	it( 'only have their keyframe unbound, without !important', () => {
		const parentRule = rules.find( ( r ) =>
			r.selectors.includes(
				'.mb-stagger-parent.mb-animated:is(.mb-triggered, .mb-exit-triggered, .mb-mode-scroll-interactive)'
			)
		);
		expect( parentRule ).toBeDefined();
		expect( parentRule.decls ).toEqual( [
			{ prop: 'animation-name', value: 'none', important: false },
		] );
	} );
} );

describe( 'Scroll Interactive without view timelines (GH #42)', () => {
	it( 'binds every effect inside the view() gate', () => {
		const outside = rules
			.filter( ( r ) => ! r.context.includes( VIEW_GATE ) )
			.filter( ( r ) =>
				r.decls.some( ( d ) => d.prop.startsWith( 'animation' ) )
			)
			.flatMap( ( r ) =>
				r.selectors.filter(
					( s ) =>
						s.includes( '.mb-mode-scroll-interactive' ) &&
						! /reduced|mb-disabled/.test( s + r.context )
				)
			)
			.filter( ( s ) => ! s.includes( '.mb-stagger-parent' ) );
		// The only one left is the img-target wrapper suppress, which
		// sets `none` and binds nothing.
		expect( outside ).toEqual( [
			'[data-mb-target="img"].mb-mode-scroll-interactive',
		] );
	} );

	it( 'has no @supports not fallback to keep in step', () => {
		const fallbacks = [];
		root.walkAtRules( 'supports', ( at ) => {
			if ( /not\s*\(\s*animation-timeline/.test( at.params ) ) {
				fallbacks.push( at.params );
			}
		} );
		expect( fallbacks ).toEqual( [] );
	} );
} );
