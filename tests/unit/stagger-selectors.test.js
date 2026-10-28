/**
 * Stagger selectors in css/animations.css must reach through the
 * classic-theme Group wrapper (GH #66).
 *
 * Without theme.json, core wraps a default / constrained Group's
 * children in `.wp-block-group__inner-container`. Every stagger "child"
 * selector therefore comes as a pair:
 *
 *   X > :where(:not(.wp-block-group__inner-container, <spacer>))
 *   X > :where(.wp-block-group__inner-container) > :where(:not(<spacer>))
 *
 * A bare `X > *` would match only the wrapper again, and a lone first
 * form would skip the wrapper's children. Both forms leave Spacers out
 * (they're empty, and stagger-index.js doesn't number them). This
 * guard fails if a new rule (a new effect, say) forgets either half or
 * the spacer skip.
 *
 * Run: npm run test:unit
 */
const fs = require( 'fs' );
const path = require( 'path' );

const IC = '.wp-block-group__inner-container';
const SPACER = '.wp-block-spacer, [data-type="core/spacer"]';
const EXCLUDE = ` > :where(:not(${ IC }, ${ SPACER }))`;
const THROUGH = ` > :where(${ IC }) > :where(:not(${ SPACER }))`;

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
			// A list inside `:is( … )`, or `:not( … )` (the per-effect
			// defaults on `.mb-animated` skip animated Stagger children).
			const isList = selector.match( /:(?:is|not)\(\s*([\s\S]*)\)\s*$/ );
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
	if ( selector.endsWith( EXCLUDE ) ) {
		return selector.slice( 0, -EXCLUDE.length ) + THROUGH;
	}
	if ( selector.endsWith( THROUGH ) ) {
		return selector.slice( 0, -THROUGH.length ) + EXCLUDE;
	}
	return null;
}

describe( 'stagger child selectors (GH #66)', () => {
	const lists = staggerSelectorLists();
	const all = lists.flat();

	it( 'finds the stagger rules', () => {
		// 29 rules plus 8 Reduced Motion / per-device entries, two
		// selectors each. Loose floor so new effects don't break it.
		expect( all.length ).toBeGreaterThanOrEqual( 2 * 30 );
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

	it( 'has no :nth-child() delay rules left (GH #53)', () => {
		// The delay used to come from 30 :nth-child() rules, so
		// children past the 30th started immediately.
		expect( all.filter( ( s ) => s.includes( ':nth-child(' ) ) ).toEqual(
			[]
		);
	} );

	it( "steps the delay by each child's --mb-stagger-index, both forms", () => {
		const head = `.mb-stagger-parent.mb-triggered${ EXCLUDE }, .mb-stagger-parent.mb-triggered${ THROUGH } {`;
		const flat = css.replace( /\s+/g, ' ' );
		const at = flat.indexOf( head );
		expect( at ).toBeGreaterThan( -1 );
		const rule = [
			null,
			flat.slice( at + head.length, flat.indexOf( '}', at ) ),
		];
		expect( rule[ 1 ].replace( /\s+/g, ' ' ) ).toContain(
			'animation-delay: calc(var(--mb-delay, 0s) + var(--mb-stagger-index, 0) * var(--mb-stagger-step, 0.1s));'
		);
	} );

	it( 'keeps --mb-stagger-index from inheriting into nested children', () => {
		const prop = css.match( /@property --mb-stagger-index\s*\{([^}]*)\}/ );
		expect( prop ).not.toBeNull();
		expect( prop[ 1 ] ).toMatch( /inherits:\s*false/ );
	} );
} );
