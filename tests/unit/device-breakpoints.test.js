/**
 * Per-device disable breakpoints cover every viewport width (GH #33).
 *
 * The three `body.mb-disabled-*` blocks in animations.css used
 * integer min-/max-width bounds, which left 1px holes at fractional
 * widths (767.5px, 1023.5px under browser zoom) where no bucket
 * matched and a disabled page animated anyway. This guard checks the
 * three preludes partition [0, ∞) exactly, keeps the whole-pixel
 * mapping unchanged, and keeps the self-check's DEVICE_QUERIES in
 * step with the CSS.
 *
 * Run: npm run test:unit
 */
const fs = require( 'fs' );
const path = require( 'path' );

const root = path.join( __dirname, '..', '..' );

const css = fs
	.readFileSync( path.join( root, 'css', 'animations.css' ), 'utf8' )
	.replace( /\/\*[\s\S]*?\*\//g, '' );

const selfCheck = fs.readFileSync(
	path.join( root, 'src', 'self-check.js' ),
	'utf8'
);

const DEVICES = [ 'desktop', 'tablet', 'mobile' ];

/**
 * Prelude (without `@media `) of every top-level @media block whose
 * body mentions `body.mb-disabled-<device>`, keyed by device.
 *
 * @return {Object<string, string[]>} Device → media query lists.
 */
function cssQueries() {
	const out = {};
	DEVICES.forEach( ( d ) => ( out[ d ] = [] ) );
	const re = /@media\s+([^{]+)\{/g;
	let m;
	while ( ( m = re.exec( css ) ) ) {
		// Walk to the matching closing brace.
		let depth = 1;
		let i = re.lastIndex;
		while ( depth && i < css.length ) {
			if ( css[ i ] === '{' ) {
				depth++;
			} else if ( css[ i ] === '}' ) {
				depth--;
			}
			i++;
		}
		const block = css.slice( re.lastIndex, i );
		DEVICES.forEach( ( d ) => {
			if ( block.includes( `body.mb-disabled-${ d }` ) ) {
				out[ d ].push( m[ 1 ].replace( /\s+/g, ' ' ).trim() );
			}
		} );
		re.lastIndex = i;
	}
	return out;
}

/**
 * DEVICE_QUERIES from src/self-check.js, in source order.
 *
 * @return {[string, string][]} [device, query] pairs.
 */
function selfCheckQueries() {
	const block = selfCheck.match( /DEVICE_QUERIES\s*=\s*\{([\s\S]*?)\}/ );
	expect( block ).not.toBeNull();
	return [ ...block[ 1 ].matchAll( /(\w+)\s*:\s*'([^']+)'/g ) ].map(
		( m ) => [ m[ 1 ], m[ 2 ] ]
	);
}

/**
 * Evaluates the three range forms used for the device buckets:
 * `(width < N)`, `(N <= width < M)` and `(width >= N)`. Anything else
 * throws, so a switch back to min-/max-width fails loudly here.
 *
 * @param {string} query Media query.
 * @param {number} width Viewport width in CSS px.
 * @return {boolean} Whether the query matches.
 */
function matches( query, width ) {
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
	throw new Error( `Unsupported device query: ${ query }` );
}

describe( 'per-device disable breakpoints (GH #33)', () => {
	const fromCss = cssQueries();
	const fromSelfCheck = selfCheckQueries();
	const query = {};
	DEVICES.forEach( ( d ) => ( query[ d ] = fromCss[ d ][ 0 ] ) );

	it( 'has one @media block per device', () => {
		DEVICES.forEach( ( d ) => {
			expect( fromCss[ d ] ).toHaveLength( 1 );
		} );
	} );

	it( 'keeps the self-check DEVICE_QUERIES identical to the CSS', () => {
		expect( fromSelfCheck.map( ( [ d ] ) => d ) ).toEqual( DEVICES );
		fromSelfCheck.forEach( ( [ d, q ] ) => {
			expect( q ).toBe( query[ d ] );
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
} );
