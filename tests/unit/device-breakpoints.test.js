/**
 * Per-device disable breakpoints cover every viewport width (GH #33).
 *
 * The device buckets used integer min-/max-width bounds, which left 1px
 * holes at fractional widths (767.5px, 1023.5px under browser zoom)
 * where no bucket matched and a disabled page animated anyway. This
 * guard checks the three queries in shared-constants.json
 * (`deviceQueries`) partition [0, ∞) exactly, keeps the whole-pixel
 * mapping unchanged, keeps the min-/max-width fallback that engines
 * without range syntax (Safari < 16.4) fall back on, and checks every
 * reader (the head script, src/motion-gate.js, the self-check) takes
 * them from there rather than keeping its own copy (#53).
 *
 * Run: npm run test:unit
 */
const fs = require( 'fs' );
const path = require( 'path' );

const root = path.join( __dirname, '..', '..' );

const shared = JSON.parse(
	fs.readFileSync( path.join( root, 'shared-constants.json' ), 'utf8' )
);

const read = ( file ) => fs.readFileSync( path.join( root, file ), 'utf8' );

const DEVICES = [ 'desktop', 'tablet', 'mobile' ];

/**
 * Evaluates one media query (no commas). Supports the range forms
 * `(width < N)`, `(N <= width < M)` and `(width >= N)`, and the
 * integer fallbacks `(max-width: N)`, `(min-width: N)` and
 * `(min-width: N) and (max-width: M)`. Anything else throws, so an
 * unexpected query fails loudly here.
 *
 * @param {string} query Single media query.
 * @param {number} width Viewport width in CSS px.
 * @return {boolean} Whether the query matches.
 */
function matchesOne( query, width ) {
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
	throw new Error( `Unsupported device query: ${ query }` );
}

/**
 * Splits a media query list on its top-level commas.
 *
 * @param {string} list Media query list.
 * @return {string[]} Individual queries.
 */
function splitList( list ) {
	const parts = [];
	let depth = 0;
	let start = 0;
	for ( let i = 0; i < list.length; i++ ) {
		if ( list[ i ] === '(' ) {
			depth++;
		} else if ( list[ i ] === ')' ) {
			depth--;
		} else if ( list[ i ] === ',' && ! depth ) {
			parts.push( list.slice( start, i ).trim() );
			start = i + 1;
		}
	}
	parts.push( list.slice( start ).trim() );
	return parts;
}

/**
 * Whether a query uses range syntax, which engines without it
 * (Safari < 16.4) drop from the list.
 *
 * @param {string} query Single media query.
 * @return {boolean} True for range syntax.
 */
const isRange = ( query ) => /\bwidth\s*[<>]/.test( query );

/**
 * A modern engine matches the list when any query in it matches.
 *
 * @param {string} list  Media query list.
 * @param {number} width Viewport width in CSS px.
 * @return {boolean} Whether the list matches.
 */
function matches( list, width ) {
	return splitList( list ).some( ( q ) => matchesOne( q, width ) );
}

/**
 * An engine without range syntax treats the range queries as
 * `not all` and matches on the integer fallbacks alone.
 *
 * @param {string} list  Media query list.
 * @param {number} width Viewport width in CSS px.
 * @return {boolean} Whether the list matches.
 */
function legacyMatches( list, width ) {
	return splitList( list )
		.filter( ( q ) => ! isRange( q ) )
		.some( ( q ) => matchesOne( q, width ) );
}

describe( 'per-device disable breakpoints (GH #33)', () => {
	const query = shared.deviceQueries;

	it( 'has one query per device, in order', () => {
		expect( Object.keys( query ) ).toEqual( DEVICES );
	} );

	it( 'is read from shared-constants.json everywhere', () => {
		expect( read( 'src/motion-gate.js' ) ).toContain(
			'SHARED.deviceQueries'
		);
		expect( read( 'animation-plugin.php' ) ).toContain(
			"motion_blocks_shared_constants()['deviceQueries']"
		);
		// No hand-kept copy: nothing else spells out a device query.
		[
			'css/animations.css',
			'src/self-check.js',
			'src/frontend.js',
			'src/motion-gate.js',
			'animation-plugin.php',
		].forEach( ( file ) => {
			expect( read( file ) ).not.toMatch(
				/\(\d+px <= width|width >= \d+px/
			);
		} );
	} );

	it( 'puts every width, fractional included, in exactly one bucket', () => {
		[
			0, 320, 767, 767.2, 767.5, 767.99, 768, 800, 1023, 1023.5, 1023.99,
			1024, 1920,
		].forEach( ( w ) => {
			const hit = DEVICES.filter( ( d ) => matches( query[ d ], w ) );
			expect( { width: w, hit } ).toEqual( {
				width: w,
				hit: [ expect.any( String ) ],
			} );
		} );
	} );

	it( 'keeps the whole-pixel mapping unchanged', () => {
		const bucket = ( w ) =>
			DEVICES.filter( ( d ) => matches( query[ d ], w ) );
		expect( bucket( 767 ) ).toEqual( [ 'mobile' ] );
		expect( bucket( 768 ) ).toEqual( [ 'tablet' ] );
		expect( bucket( 1023 ) ).toEqual( [ 'tablet' ] );
		expect( bucket( 1024 ) ).toEqual( [ 'desktop' ] );
	} );

	it( 'keeps a min-/max-width fallback for engines without range syntax', () => {
		DEVICES.forEach( ( d ) => {
			const parts = splitList( query[ d ] );
			expect( parts.some( isRange ) ).toBe( true );
			expect( parts.some( ( q ) => ! isRange( q ) ) ).toBe( true );
		} );
		const bucket = ( w ) =>
			DEVICES.filter( ( d ) => legacyMatches( query[ d ], w ) );
		[ 0, 320, 767, 768, 800, 1023, 1024, 1920 ].forEach( ( w ) => {
			expect( { width: w, hit: bucket( w ) } ).toEqual( {
				width: w,
				hit: [ expect.any( String ) ],
			} );
		} );
		expect( bucket( 767 ) ).toEqual( [ 'mobile' ] );
		expect( bucket( 768 ) ).toEqual( [ 'tablet' ] );
		expect( bucket( 1023 ) ).toEqual( [ 'tablet' ] );
		expect( bucket( 1024 ) ).toEqual( [ 'desktop' ] );
	} );
} );
