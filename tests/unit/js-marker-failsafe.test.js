/**
 * No-JS marker failsafe (GH #57): `html.mb-js` and the motion gate
 * `html.mb-motion` (#53) must not outlive a front-end bundle that never
 * ran, or every hidden block stays at opacity 0. Runs the real head
 * script from animation-plugin.php and the real src/frontend.js in
 * jsdom.
 *
 * Run: npm run test:unit
 */
const {
	readGateScript,
	fakeMatchMedia,
	QUERY_SETS,
} = require( './helpers/motion-gate' );

const html = document.documentElement;

function runMarker( disabled = [] ) {
	// eslint-disable-next-line no-new-func
	new Function( 'h', 'q', 'd', '(' + readGateScript() + ')(h,q,d);' )(
		html,
		QUERY_SETS.core,
		disabled
	);
}

beforeEach( () => {
	html.className = '';
	delete window.motionBlocksReady;
	window.matchMedia = fakeMatchMedia( { width: 1280, reduced: false } );
	window.motionBlocksDeviceQueries = QUERY_SETS.core;
} );

afterEach( () => {
	delete window.matchMedia;
	delete window.motionBlocksDeviceQueries;
} );

describe( 'head script failsafe', () => {
	it( 'adds mb-js and mb-motion as soon as it runs', () => {
		runMarker();
		expect( html.classList.contains( 'mb-js' ) ).toBe( true );
		expect( html.classList.contains( 'mb-motion' ) ).toBe( true );
	} );

	it( 'removes both on load when frontend.js never ran', () => {
		runMarker();
		window.dispatchEvent( new Event( 'load' ) );
		expect( html.classList.contains( 'mb-js' ) ).toBe( false );
		expect( html.classList.contains( 'mb-motion' ) ).toBe( false );
	} );

	it( 'stops updating mb-motion after the failsafe fired', () => {
		runMarker();
		window.dispatchEvent( new Event( 'load' ) );
		window.matchMedia.set( { reduced: true } );
		window.matchMedia.set( { reduced: false } );
		expect( html.classList.contains( 'mb-motion' ) ).toBe( false );
	} );

	it( 'keeps both on load when frontend.js finished init', () => {
		runMarker();
		window.motionBlocksReady = true;
		window.dispatchEvent( new Event( 'load' ) );
		expect( html.classList.contains( 'mb-js' ) ).toBe( true );
		expect( html.classList.contains( 'mb-motion' ) ).toBe( true );
	} );
} );

describe( 'frontend.js ready flag', () => {
	it( 'sets motionBlocksReady and re-asserts mb-js and mb-motion after init', () => {
		jest.isolateModules( () => {
			require( '../../src/frontend.js' );
		} );
		expect( window.motionBlocksReady ).toBe( true );
		expect( html.classList.contains( 'mb-js' ) ).toBe( true );
		expect( html.classList.contains( 'mb-motion' ) ).toBe( true );
	} );

	it( 'leaves mb-motion off with reduced motion on', () => {
		window.matchMedia = fakeMatchMedia( { width: 1280, reduced: true } );
		jest.isolateModules( () => {
			require( '../../src/frontend.js' );
		} );
		expect( html.classList.contains( 'mb-js' ) ).toBe( true );
		expect( html.classList.contains( 'mb-motion' ) ).toBe( false );
	} );
	it( 'uses the printed device queries for a disabled device (assets loaded late)', () => {
		// 600px is tablet to core, mobile to the pre-7.1 ranges.
		document.body.className = 'mb-disabled-tablet';
		window.matchMedia = fakeMatchMedia( { width: 600, reduced: false } );
		jest.isolateModules( () => {
			require( '../../src/frontend.js' );
		} );
		expect( html.classList.contains( 'mb-motion' ) ).toBe( false );

		html.className = '';
		window.motionBlocksDeviceQueries = QUERY_SETS.legacy;
		jest.isolateModules( () => {
			require( '../../src/frontend.js' );
		} );
		expect( html.classList.contains( 'mb-motion' ) ).toBe( true );
		document.body.className = '';
	} );
} );
