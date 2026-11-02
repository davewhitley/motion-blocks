/**
 * Test helpers for the motion gate (#53): the head script as PHP prints
 * it, and a matchMedia stand-in for jsdom (which has none).
 */
const fs = require( 'fs' );
const path = require( 'path' );

/**
 * The function expression motion_blocks_motion_gate_script() returns:
 * the single-quoted PHP string pieces in its body, joined.
 *
 * @return {string} JavaScript source.
 */
function readGateScript() {
	const php = fs.readFileSync(
		path.join( __dirname, '../../../animation-plugin.php' ),
		'utf8'
	);
	const fn = php.match(
		/function motion_blocks_motion_gate_script\(\)\s*\{([\s\S]*?)\n\}/
	);
	if ( ! fn ) {
		throw new Error( 'motion_blocks_motion_gate_script() not found' );
	}
	return fn[ 1 ]
		.match( /'[^']*'/g )
		.map( ( p ) => p.slice( 1, -1 ) )
		.join( '' );
}

/**
 * Whether one media query (no top-level commas) matches. Supports the
 * forms the plugin uses; anything else throws.
 *
 * @param {string} query Single media query.
 * @param {Object} state { width, reduced }.
 * @return {boolean} Whether it matches.
 */
function matchesOne( query, state ) {
	const { width } = state;
	if ( query === '(prefers-reduced-motion: reduce)' ) {
		return state.reduced;
	}
	let m = query.match( /^\(width < (\d+)px\)$/ );
	if ( m ) {
		return width < Number( m[ 1 ] );
	}
	m = query.match( /^\((\d+)px <= width < (\d+)px\)$/ );
	if ( m ) {
		return Number( m[ 1 ] ) <= width && width < Number( m[ 2 ] );
	}
	m = query.match( /^\(width >= (\d+)px\)$/ );
	if ( m ) {
		return width >= Number( m[ 1 ] );
	}
	m = query.match( /^\(max-width: (\d+)px\)$/ );
	if ( m ) {
		return width <= Number( m[ 1 ] );
	}
	m = query.match( /^\(min-width: (\d+)px\)$/ );
	if ( m ) {
		return width >= Number( m[ 1 ] );
	}
	m = query.match( /^\(min-width: (\d+)px\) and \(max-width: (\d+)px\)$/ );
	if ( m ) {
		return Number( m[ 1 ] ) <= width && width <= Number( m[ 2 ] );
	}
	throw new Error( `Unsupported media query: ${ query }` );
}

function matches( list, state ) {
	return list
		.split( /,(?![^(]*\))/ )
		.some( ( q ) => matchesOne( q.trim(), state ) );
}

/**
 * A `window.matchMedia` stand-in. `.set( patch )` changes the state and
 * fires `change` on every list whose result flipped, like a browser
 * does when the window is resized or the OS setting changes.
 *
 * @param {Object} initial { width, reduced }.
 * @return {Function} matchMedia.
 */
function fakeMatchMedia( initial ) {
	const state = { ...initial };
	const lists = [];
	const matchMedia = ( query ) => {
		const listeners = [];
		const list = {
			media: query,
			get matches() {
				return matches( query, state );
			},
			addEventListener: ( type, fn ) => listeners.push( fn ),
			removeEventListener: () => {},
			_listeners: listeners,
		};
		lists.push( { list, was: list.matches } );
		return list;
	};
	matchMedia.set = ( patch ) => {
		Object.assign( state, patch );
		lists.forEach( ( entry ) => {
			const now = entry.list.matches;
			if ( now !== entry.was ) {
				entry.was = now;
				entry.list._listeners.forEach( ( fn ) =>
					fn( { matches: now, media: entry.list.media } )
				);
			}
		} );
	};
	return matchMedia;
}

module.exports = { readGateScript, fakeMatchMedia, matches };
