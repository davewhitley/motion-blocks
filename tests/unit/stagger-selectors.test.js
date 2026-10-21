/**
 * Stagger selectors in css/animations.css must reach through the
 * classic-theme Group wrapper (GH #66).
 *
 * Without theme.json, core wraps a default / constrained Group's
 * children in `.wp-block-group__inner-container`. Every stagger "child"
 * selector therefore comes as a pair:
 *
 *   X > :where(:not(.wp-block-group__inner-container))
 *   X > :where(.wp-block-group__inner-container) > *
 *
 * A bare `X > *` would match only the wrapper again, and a lone first
 * form would skip the wrapper's children. This guard fails if a new
 * rule (a new effect, say) forgets either half.
 *
 * Run: npm run test:unit
 */
const fs = require( 'fs' );
const path = require( 'path' );

const IC = '.wp-block-group__inner-container';
const EXCLUDE = ` > :where(:not(${ IC }))`;
const THROUGH = ` > :where(${ IC }) > `;

const css = fs
	.readFileSync(
		path.join( __dirname, '..', '..', 'css', 'animations.css' ),
		'utf8'
	)
	.replace( /\/\*[\s\S]*?\*\//g, '' );

/**
 * Split on commas that are not inside parentheses.
 *
 * @param {string} text Selector list.
 * @return {string[]} Trimmed, whitespace-collapsed parts.
 */
function splitTopLevel( text ) {
	const parts = [];
	let depth = 0;
	let current = '';
	for ( const ch of text ) {
		if ( ch === '(' ) {
			depth++;
		} else if ( ch === ')' ) {
			depth--;
		}
		if ( ch === ',' && depth === 0 ) {
			parts.push( current );
			current = '';
		} else {
			current += ch;
		}
	}
	parts.push( current );
	return parts.map( ( p ) => p.replace( /\s+/g, ' ' ).trim() );
}

/**
 * Every selector list in the file that mentions a stagger child, as
 * arrays of complex selectors. `:is( … )` lists (Reduced Motion and the
 * per-device blocks) are unpacked into their own list.
 *
 * @return {string[][]} Selector lists.
 */
function staggerSelectorLists() {
	const lists = [];
	const preludes = css.match( /[^{}]+(?=\{)/g ) || [];
	preludes.forEach( ( prelude ) => {
		if (
			! prelude.includes( '.mb-stagger-parent' ) ||
			prelude.trim().startsWith( '@' )
		) {
			return;
		}
		const selectors = splitTopLevel( prelude );
		const top = [];
		selectors.forEach( ( selector ) => {
			const isList = selector.match( /:is\(\s*([\s\S]*)\)\s*$/ );
			if ( isList && isList[ 1 ].includes( '.mb-stagger-parent >' ) ) {
				lists.push( splitTopLevel( isList[ 1 ] ) );
			} else {
				top.push( selector );
			}
		} );
		lists.push( top );
	} );
	return lists
		.map( ( list ) =>
			list.filter(
				( s ) => s.includes( '.mb-stagger-parent' ) && s.includes( '>' )
			)
		)
		.filter( ( list ) => list.length );
}

/**
 * The other half of a stagger child selector pair.
 *
 * @param {string} selector One half.
 * @return {string|null} Its twin, or null when it is neither form.
 */
function twinOf( selector ) {
	const nth = '(:nth-child\\(\\d+\\))?';
	const esc = ( s ) => s.replace( /[.*+?^${}()|[\]\\]/g, '\\$&' );
	let m = selector.match(
		new RegExp( `^(.*)${ esc( EXCLUDE ) }${ nth }$` )
	);
	if ( m ) {
		return `${ m[ 1 ] }${ THROUGH }${ m[ 2 ] || '*' }`;
	}
	m = selector.match(
		new RegExp( `^(.*)${ esc( THROUGH ) }(\\*|:nth-child\\(\\d+\\))$` )
	);
	if ( m ) {
		return `${ m[ 1 ] }${ EXCLUDE }${ m[ 2 ] === '*' ? '' : m[ 2 ] }`;
	}
	return null;
}

describe( 'stagger child selectors (GH #66)', () => {
	const lists = staggerSelectorLists();
	const all = lists.flat();

	it( 'finds the stagger rules', () => {
		// 59 rules plus 8 Reduced Motion / per-device entries, two
		// selectors each. Loose floor so new effects don't break it.
		expect( all.length ).toBeGreaterThanOrEqual( 2 * 60 );
	} );

	it( 'has no bare `> *` child selector left', () => {
		const bare = all.filter( ( s ) => twinOf( s ) === null );
		expect( bare ).toEqual( [] );
	} );

	it( 'pairs every selector with its wrapper twin in the same list', () => {
		const missing = [];
		lists.forEach( ( list ) => {
			list.forEach( ( s ) => {
				const twin = twinOf( s );
				if ( twin && ! list.includes( twin ) ) {
					missing.push( `${ s }  →  missing ${ twin }` );
				}
			} );
		} );
		expect( missing ).toEqual( [] );
	} );

	it( 'keeps the 30 nth-child delays reaching through the wrapper', () => {
		for ( let n = 1; n <= 30; n++ ) {
			expect( all ).toContain(
				`.mb-stagger-parent.mb-triggered${ THROUGH }:nth-child(${ n })`
			);
		}
	} );
} );
