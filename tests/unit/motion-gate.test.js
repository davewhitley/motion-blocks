/**
 * The motion gate decision (#53): `html.mb-motion` is on unless reduced
 * motion is on or animations are disabled for this page on the current
 * device. Tests the pure decision in src/motion-gate.js for every
 * combination of reduced motion, device bucket and disabled-device list,
 * and checks the head script printed by animation-plugin.php (its own
 * copy, since it runs before any bundle loads) and startMotionGate()
 * reach the same answer, including after a change mid-visit.
 *
 * Run: npm run test:unit
 */
import {
	DEVICES,
	MOTION_CLASS,
	currentDevice,
	disabledDevicesFrom,
	motionAllowed,
	motionWanted,
	startMotionGate,
} from '../../src/motion-gate';

const { readGateScript, fakeMatchMedia } = require( './helpers/motion-gate' );
const SHARED = require( '../../shared-constants.json' );

// One viewport width per bucket, plus the edges either side of each
// breakpoint (fractional widths under browser zoom included, GH #33).
const WIDTH = { desktop: 1280, tablet: 800, mobile: 375 };

/** Every subset of DEVICES. */
const SUBSETS = DEVICES.reduce(
	( sets, device ) => sets.concat( sets.map( ( s ) => [ ...s, device ] ) ),
	[ [] ]
);

const COMBOS = [];
[ false, true ].forEach( ( reduced ) =>
	DEVICES.forEach( ( device ) =>
		SUBSETS.forEach( ( disabled ) =>
			COMBOS.push( { reduced, device, disabled } )
		)
	)
);

const html = document.documentElement;

function runHeadScript( disabled ) {
	// eslint-disable-next-line no-new-func
	new Function( 'h', 'q', 'd', '(' + readGateScript() + ')(h,q,d);' )(
		html,
		SHARED.deviceQueries,
		disabled
	);
}

function setBodyClasses( disabled ) {
	document.body.className = disabled
		.map( ( device ) => 'mb-disabled-' + device )
		.join( ' ' );
}

beforeEach( () => {
	html.className = '';
	document.body.className = '';
} );

afterEach( () => {
	delete window.matchMedia;
} );

describe( 'motionAllowed', () => {
	it( 'is off with reduced motion, whatever the device', () => {
		COMBOS.filter( ( c ) => c.reduced ).forEach( ( c ) => {
			expect( motionAllowed( true, c.device, c.disabled ) ).toBe( false );
		} );
		expect( motionAllowed( true, null, [] ) ).toBe( false );
	} );

	it( 'is off on a disabled device and on on any other', () => {
		expect( motionAllowed( false, 'mobile', [ 'mobile' ] ) ).toBe( false );
		expect(
			motionAllowed( false, 'mobile', [ 'desktop', 'tablet' ] )
		).toBe( true );
		expect(
			motionAllowed( false, 'desktop', [ 'tablet', 'desktop' ] )
		).toBe( false );
		expect( motionAllowed( false, 'tablet', [] ) ).toBe( true );
	} );

	it( 'is on when no bucket matches and reduced motion is off', () => {
		expect( motionAllowed( false, null, [ ...DEVICES ] ) ).toBe( true );
	} );

	it.each( COMBOS )(
		'reduced=$reduced device=$device disabled=$disabled',
		( { reduced, device, disabled } ) => {
			expect( motionAllowed( reduced, device, disabled ) ).toBe(
				! reduced && ! disabled.includes( device )
			);
		}
	);
} );

describe( 'currentDevice', () => {
	it.each( [
		[ 0, 'mobile' ],
		[ 375, 'mobile' ],
		[ 767, 'mobile' ],
		[ 767.5, 'mobile' ],
		[ 768, 'tablet' ],
		[ 1023, 'tablet' ],
		[ 1023.5, 'tablet' ],
		[ 1024, 'desktop' ],
		[ 1920, 'desktop' ],
	] )( '%p px is %s', ( width, device ) => {
		expect(
			currentDevice( fakeMatchMedia( { width, reduced: false } ) )
		).toBe( device );
	} );
} );

describe( 'disabledDevicesFrom', () => {
	it( 'reads the mb-disabled-* body classes', () => {
		document.body.className = 'home mb-disabled-mobile mb-disabled-desktop';
		expect( disabledDevicesFrom( document.body ) ).toEqual( [
			'desktop',
			'mobile',
		] );
	} );
} );

describe( 'every setter agrees with motionAllowed', () => {
	it.each( COMBOS )(
		'reduced=$reduced device=$device disabled=$disabled',
		( { reduced, device, disabled } ) => {
			const want = motionAllowed( reduced, device, disabled );
			const state = { width: WIDTH[ device ], reduced };

			// Head script, with the list PHP prints.
			window.matchMedia = fakeMatchMedia( state );
			runHeadScript( disabled );
			expect( html.classList.contains( MOTION_CLASS ) ).toBe( want );

			// frontend.js, with the body classes.
			html.className = '';
			setBodyClasses( disabled );
			window.matchMedia = fakeMatchMedia( state );
			expect( motionWanted( window, disabled ) ).toBe( want );
			startMotionGate( window );
			expect( html.classList.contains( MOTION_CLASS ) ).toBe( want );
		}
	);
} );

describe( 'the class follows changes mid-visit', () => {
	const steps = [
		[ 'reduced motion on', { reduced: true }, false ],
		[ 'reduced motion off', { reduced: false }, true ],
		[ 'resize to the disabled mobile bucket', { width: 375 }, false ],
		[ 'resize to tablet', { width: 800 }, true ],
		[
			'resize to mobile with reduced motion',
			{ width: 400, reduced: true },
			false,
		],
		[
			'back to desktop, reduced motion off',
			{ width: 1280, reduced: false },
			true,
		],
	];

	it( 'in the head script', () => {
		window.matchMedia = fakeMatchMedia( { width: 1280, reduced: false } );
		runHeadScript( [ 'mobile' ] );
		expect( html.classList.contains( MOTION_CLASS ) ).toBe( true );
		steps.forEach( ( [ label, patch, want ] ) => {
			window.matchMedia.set( patch );
			expect( {
				label,
				on: html.classList.contains( MOTION_CLASS ),
			} ).toEqual( { label, on: want } );
		} );
	} );

	it( 'in startMotionGate', () => {
		jest.isolateModules( () => {
			const gate = require( '../../src/motion-gate' );
			window.matchMedia = fakeMatchMedia( {
				width: 1280,
				reduced: false,
			} );
			setBodyClasses( [ 'mobile' ] );
			gate.startMotionGate( window );
			gate.startMotionGate( window ); // second call only re-syncs
			expect( html.classList.contains( MOTION_CLASS ) ).toBe( true );
			steps.forEach( ( [ label, patch, want ] ) => {
				window.matchMedia.set( patch );
				expect( {
					label,
					on: html.classList.contains( MOTION_CLASS ),
				} ).toEqual( { label, on: want } );
			} );
		} );
	} );
} );
