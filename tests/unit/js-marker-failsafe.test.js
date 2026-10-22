/**
 * No-JS marker failsafe (GH #57): `html.mb-js` must not outlive a
 * front-end bundle that never ran, or every hidden block stays at
 * opacity 0. Runs the real inline script from animation-plugin.php
 * and the real src/frontend.js in jsdom.
 *
 * Run: npm run test:unit
 */
const fs = require( 'fs' );
const path = require( 'path' );

/**
 * The JS that motion_blocks_print_js_marker() prints: the
 * single-quoted PHP string pieces inside its wp_print_inline_script_tag
 * call, joined.
 */
function readMarkerScript() {
	const php = fs.readFileSync(
		path.join( __dirname, '../../animation-plugin.php' ),
		'utf8'
	);
	const fn = php.match(
		/function motion_blocks_print_js_marker\(\)\s*\{[\s\S]*?wp_print_inline_script_tag\(\s*([\s\S]*?),\s*array\(/
	);
	expect( fn ).not.toBeNull();
	const pieces = fn[ 1 ].match( /'[^']*'/g );
	return pieces.map( ( p ) => p.slice( 1, -1 ) ).join( '' );
}

function runMarker() {
	// eslint-disable-next-line no-new-func
	new Function( readMarkerScript() )();
}

const html = document.documentElement;

beforeEach( () => {
	html.className = '';
	delete window.motionBlocksReady;
} );

describe( 'mb-js marker failsafe', () => {
	it( 'adds mb-js as soon as the head script runs', () => {
		runMarker();
		expect( html.classList.contains( 'mb-js' ) ).toBe( true );
	} );

	it( 'removes mb-js on load when frontend.js never ran', () => {
		runMarker();
		window.dispatchEvent( new Event( 'load' ) );
		expect( html.classList.contains( 'mb-js' ) ).toBe( false );
	} );

	it( 'keeps mb-js on load when frontend.js finished init', () => {
		runMarker();
		window.motionBlocksReady = true;
		window.dispatchEvent( new Event( 'load' ) );
		expect( html.classList.contains( 'mb-js' ) ).toBe( true );
	} );
} );

describe( 'frontend.js ready flag', () => {
	it( 'sets motionBlocksReady and re-asserts mb-js after init', () => {
		jest.isolateModules( () => {
			require( '../../src/frontend.js' );
		} );
		expect( window.motionBlocksReady ).toBe( true );
		expect( html.classList.contains( 'mb-js' ) ).toBe( true );
	} );
} );
