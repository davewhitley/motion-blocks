/**
 * Motion off leaves the theme's styles alone (#53).
 *
 * Reduced motion and per-device disable used to pin every animated
 * block at rest with reset rules (`animation: none; opacity: 1;
 * transform: none; filter: none; clip-path: none`, all `!important`),
 * which wiped a theme's own styling on those blocks. Now every rule
 * that animates, pre-hides or transforms a block is scoped under
 * `:where(html.mb-motion)`, a class that is only on <html> while motion
 * is on (src/motion-gate.js), and there is nothing to reset.
 *
 * Guards:
 *   - no `!important` anywhere in the file, except the print rule
 *     (GH #127);
 *   - every rule that sets a motion property is gated, on every
 *     selector in its list, and nothing else is (only the
 *     custom-property defaults stay ungated; the page overflow clip is
 *     gated too, GH #134);
 *   - no reset rule and no media query for reduced motion or device
 *     buckets left to keep in step (GH #26 / #44);
 *   - the img rules frontend.js injects at runtime are gated too;
 *   - Flip's 3D context still only comes from Flip rules (GH #33).
 *
 * Run: npm run test:unit
 */
const fs = require( 'fs' );
const path = require( 'path' );
/* eslint-disable import/no-extraneous-dependencies -- PostCSS and its parsers come with @wordpress/scripts. */
const postcss = require( 'postcss' );
const selectorParser = require( 'postcss-selector-parser' );
/* eslint-enable import/no-extraneous-dependencies */

const root = path.join( __dirname, '..', '..' );
const css = postcss.parse(
	fs.readFileSync( path.join( root, 'css', 'animations.css' ), 'utf8' )
);

const GATE = ':where(html.mb-motion) ';
const MOTION_PROP =
	/^(animation(-[a-z-]+)?|opacity|transform|translate|rotate|scale|filter|clip-path|transform-style|backface-visibility)$/;

/** Every style rule outside @keyframes, with its complex selectors. */
function styleRules() {
	const out = [];
	css.walkRules( ( rule ) => {
		if ( /keyframes$/.test( rule.parent?.name || '' ) ) {
			return;
		}
		const selectors = [];
		selectorParser( ( list ) => {
			list.each( ( sel ) => {
				selectors.push( sel.toString().replace( /\s+/g, ' ' ).trim() );
			} );
		} ).processSync( rule.selector );
		const props = [];
		rule.walkDecls( ( d ) => props.push( d.prop ) );
		out.push( {
			selectors,
			props,
			motion: props.some( ( p ) => MOTION_PROP.test( p ) ),
		} );
	} );
	return out;
}

const rules = styleRules();

describe( 'motion gate in animations.css (#53)', () => {
	it( 'has no !important declarations outside the print rule', () => {
		const important = [];
		css.walkDecls( ( d ) => {
			// The print rule (GH #127) is the one exception: only
			// `!important` outranks a running animation's value.
			// tests/unit/print-css.test.js covers it.
			const inPrint =
				d.parent.parent?.type === 'atrule' &&
				d.parent.parent.name === 'media' &&
				d.parent.parent.params === 'print';
			if ( d.important && ! inPrint ) {
				important.push( `${ d.parent.selector } { ${ d.prop } }` );
			}
		} );
		expect( important ).toEqual( [] );
	} );

	it( 'gates every selector of every rule that sets a motion property', () => {
		const ungated = rules
			.filter( ( r ) => r.motion )
			.flatMap( ( r ) => r.selectors )
			.filter( ( s ) => ! s.startsWith( GATE ) );
		expect( ungated ).toEqual( [] );
	} );

	it( 'leaves only the custom-property defaults ungated', () => {
		// Not a motion property, but gated all the same (next test).
		const ungated = rules.filter(
			( r ) => ! r.motion && ! r.props.includes( 'overflow-x' )
		);
		ungated.forEach( ( r ) => {
			r.selectors.forEach( ( s ) => expect( s ).not.toContain( GATE ) );
			r.props.forEach( ( p ) =>
				expect( p.startsWith( '--' ) ).toBe( true )
			);
		} );
		expect( ungated.map( ( r ) => r.selectors[ 0 ] ) ).toEqual( [
			'.mb-animated',
			expect.stringMatching( /^\.mb-animated:not\(/ ),
		] );
	} );

	it( 'gates the page overflow clip, at zero specificity (GH #134)', () => {
		const clip = rules.filter( ( r ) => r.props.includes( 'overflow-x' ) );
		expect( clip.map( ( r ) => r.selectors ) ).toEqual( [
			[ ':where(html.mb-motion) :where(body.mb-clip-page-overflow)' ],
		] );
	} );

	it( 'puts the gate on <html> with no weight', () => {
		rules
			.filter( ( r ) => r.motion )
			.flatMap( ( r ) => r.selectors )
			.forEach( ( s ) => {
				// One gate, at the start, and nothing else on <html>.
				expect( s.split( 'html.' ) ).toHaveLength( 2 );
			} );
	} );

	it( 'has no reset rules or media queries for motion-off states left', () => {
		const text = css.toString().replace( /\/\*[\s\S]*?\*\//g, '' );
		expect( text ).not.toMatch( /prefers-reduced-motion/ );
		expect( text ).not.toMatch( /mb-disabled-/ );
		expect( text ).not.toMatch( /html\.mb-js/ );
		const media = [];
		css.walkAtRules( 'media', ( at ) => media.push( at.params ) );
		// Print is not a motion-off state: it has its own rule (GH #127).
		expect( media ).toEqual( [ 'print' ] );
	} );

	it( 'only sets preserve-3d on Flip rules (GH #33)', () => {
		const stray = [];
		css.walkDecls( 'transform-style', ( d ) => {
			if (
				d.value === 'preserve-3d' &&
				! /\.mb-(enter|exit)-flip\b/.test( d.parent.selector )
			) {
				stray.push( d.parent.selector );
			}
		} );
		expect( stray ).toEqual( [] );
	} );
} );

describe( 'motion gate in the CSS frontend.js injects (#53)', () => {
	const frontend = fs
		.readFileSync( path.join( root, 'src', 'frontend.js' ), 'utf8' )
		.replace( /\/\*[\s\S]*?\*\//g, '' )
		.replace( /\/\/.*$/gm, '' );

	it( 'scopes every per-block rule through the gated scope', () => {
		const scopes = frontend.match( /\[data-mb-uid="' \+ uid/g ) || [];
		expect( scopes ).toHaveLength( 1 );
		expect( frontend ).toContain(
			`return '${ GATE }[data-mb-uid="' + uid + '"]';`
		);
		expect(
			( frontend.match( /var scope = gatedScope\( uid \);/g ) || [] )
				.length
		).toBe( 2 );
	} );
} );
