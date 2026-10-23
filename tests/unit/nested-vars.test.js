/**
 * An animated block nested in another doesn't inherit the outer
 * block's effect settings (2026-10-20 review, #54).
 *
 * The runtime sets a per-effect custom property inline only when it
 * differs from the default (e.g. `--mb-iteration-count: infinite` for a
 * loop), and custom properties inherit. So every per-effect property
 * the rules read with a fallback must be re-declared on `.mb-animated`
 * with that same fallback value.
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

// Inherited from the stagger parent by its children on purpose.
const INHERITED = [
	'--mb-stagger-anim-name',
	'--mb-entry-anim-name',
	'--mb-exit-anim-name',
	'--mb-stagger-step',
	'--mb-stagger-index',
];

/** `var(--x, fallback)` uses, balancing parentheses in the fallback. */
function fallbacks() {
	const out = {};
	const re = /var\(\s*(--mb-[a-z-]+)\s*,/g;
	let m;
	while ( ( m = re.exec( css ) ) ) {
		let depth = 1;
		let i = re.lastIndex;
		const start = i;
		while ( depth > 0 && i < css.length ) {
			if ( css[ i ] === '(' ) {
				depth++;
			} else if ( css[ i ] === ')' ) {
				depth--;
			}
			i++;
		}
		const value = css.slice( start, i - 1 ).trim();
		( out[ m[ 1 ] ] = out[ m[ 1 ] ] || new Set() ).add( value );
	}
	return out;
}

function baseDeclarations() {
	// The plain `.mb-animated` rule (timing) and the one that skips
	// animated Stagger children (everything else).
	const re = /(?<=^|\})\s*\.mb-animated(?::not\([^{]*\))?\s*\{([^}]*)\}/g;
	const bodies = [];
	let m;
	while ( ( m = re.exec( css ) ) ) {
		bodies.push( m[ 1 ] );
	}
	const out = {};
	bodies
		.join( ';' )
		.split( ';' )
		.forEach( ( decl ) => {
			const m = decl.match( /^\s*(--mb-[a-z-]+)\s*:\s*(.+?)\s*$/ );
			if ( m ) {
				out[ m[ 1 ] ] = m[ 2 ];
			}
		} );
	return out;
}

describe( '.mb-animated', () => {
	const declared = baseDeclarations();
	const used = fallbacks();

	it( 're-declares every per-effect property the rules read', () => {
		const missing = Object.keys( used ).filter(
			( name ) => ! INHERITED.includes( name ) && ! ( name in declared )
		);
		expect( missing ).toEqual( [] );
	} );

	it( 'declares each with the same value the rules fall back to', () => {
		Object.keys( used )
			.filter( ( name ) => ! INHERITED.includes( name ) )
			.forEach( ( name ) => {
				// --mb-timing reads `linear` in the scroll-driven img rule
				// but is declared `ease` (a separate review item), and
				// --mb-delay reads `0s` in rules where the block always
				// sets it; those keep their existing declarations.
				if ( name === '--mb-timing' || name === '--mb-delay' ) {
					return;
				}
				expect( [ name, [ ...used[ name ] ] ] ).toEqual( [
					name,
					[ declared[ name ] ],
				] );
			} );
	} );

	it( 'leaves the stagger-inherited properties alone', () => {
		INHERITED.forEach( ( name ) => {
			expect( name in declared ).toBe( false );
		} );
	} );
} );

describe( 'an animated Stagger child', () => {
	it( "is left out, so it keeps inheriting the parent's stagger settings", () => {
		// The parent's stagger rule drives that child's animation, so it
		// must still inherit the parent's direction, loop and reverse.
		expect( css ).toMatch(
			/\.mb-animated:not\(\.mb-stagger-parent > :where\(:not\(\.wp-block-group__inner-container\)\), \.mb-stagger-parent > :where\(\.wp-block-group__inner-container\) > \*\) \{[^}]*--mb-iteration-count: 1;/
		);
	} );
} );
