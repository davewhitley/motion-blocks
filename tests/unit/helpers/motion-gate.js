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

/** CSS length in px (em / rem at the default 16px). */
function px( length ) {
	const m = /^(\d*\.?\d+)(px|em|rem)$/.exec( length );
	if ( ! m ) {
		throw new Error( `Unsupported length: ${ length }` );
	}
	return Number( m[ 1 ] ) * ( m[ 2 ] === 'px' ? 1 : 16 );
}

const COMPARE = {
	'<': ( a, b ) => a < b,
	'<=': ( a, b ) => a <= b,
	'>': ( a, b ) => a > b,
	'>=': ( a, b ) => a >= b,
};

/**
 * Whether one media query (no top-level commas) matches. Supports the
 * forms the plugin and core use: range syntax with one or two bounds
 * (`(width <= 480px)`, `(480px < width <= 782px)`), min-/max-width and
 * their `and` pair, and prefers-reduced-motion. Anything else throws.
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
	const len = '(\\d*\\.?\\d+(?:px|em|rem))';
	let m = query.match( new RegExp( `^\\(width (<=?|>=?) ${ len }\\)$` ) );
	if ( m ) {
		return COMPARE[ m[ 1 ] ]( width, px( m[ 2 ] ) );
	}
	m = query.match(
		new RegExp( `^\\(${ len } (<=?) width (<=?) ${ len }\\)$` )
	);
	if ( m ) {
		return (
			COMPARE[ m[ 2 ] ]( px( m[ 1 ] ), width ) &&
			COMPARE[ m[ 3 ] ]( width, px( m[ 4 ] ) )
		);
	}
	return query.split( /\s+and\s+/ ).every( ( part ) => {
		const mm = part.match(
			new RegExp( `^\\((min|max)-width: ${ len }\\)$` )
		);
		if ( ! mm ) {
			throw new Error( `Unsupported media query: ${ query }` );
		}
		return mm[ 1 ] === 'min'
			? width >= px( mm[ 2 ] )
			: width <= px( mm[ 2 ] );
	} );
}

/**
 * Device queries the way PHP prints them
 * (motion_blocks_device_media_queries()), for the cases the tests use.
 */
const QUERY_SETS = {
	// Core 7.1 defaults: mobile 480px, tablet 782px.
	core: {
		mobile: '(width <= 480px)',
		tablet: '(480px < width <= 782px)',
		desktop: '(width > 782px)',
	},
	// A theme with `settings.viewport` { mobile: 600px, tablet: 1000px }.
	custom: {
		mobile: '(width <= 600px)',
		tablet: '(600px < width <= 1000px)',
		desktop: '(width > 1000px)',
	},
	// A theme that sets only `mobile`: no tablet bucket.
	mobileOnly: {
		mobile: '(width <= 600px)',
		desktop: '(width > 600px)',
	},
	// A theme that sets only `tablet`: no mobile bucket.
	tabletOnly: {
		tablet: '(width <= 900px)',
		desktop: '(width > 900px)',
	},
	// Before WordPress 7.1: the plugin's own ranges.
	legacy: {
		mobile: '(max-width: 767px), (width < 768px)',
		tablet: '(min-width: 768px) and (max-width: 1023px), (768px <= width < 1024px)',
		desktop: '(min-width: 1024px), (width >= 1024px)',
	},
};

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

module.exports = { readGateScript, fakeMatchMedia, matches, QUERY_SETS };
