/**
 * The motion gate decision (#53): `html.mb-motion` is on unless reduced
 * motion is on or animations are disabled for this page on the current
 * device. Tests the pure decision in src/motion-gate.js for every
 * combination of reduced motion, device bucket and disabled-device list,
 * and checks the head script printed by animation-plugin.php (its own
 * copy, since it runs before any bundle loads) and startMotionGate()
 * reach the same answer, including after a change mid-visit.
 *
 * The device buckets are injected, the way PHP prints them
 * (motion_blocks_device_media_queries()): WordPress core's default
 * viewport breakpoints, a theme's custom ones, a theme that sets only
 * one breakpoint, and the pre-7.1 fallback.
 *
 * Run: npm run test:unit
 */
import {
	DEVICES,
	MOTION_CLASS,
	currentDevice,
	deviceQueries,
	disabledDevicesFrom,
	motionAllowed,
	motionWanted,
	startMotionGate,
} from '../../src/motion-gate';

const {
	readGateScript,
	fakeMatchMedia,
	QUERY_SETS,
} = require( './helpers/motion-gate' );

// One viewport width inside each bucket a query set defines.
const WIDTHS = {
	core: { mobile: 375, tablet: 600, desktop: 1280 },
	custom: { mobile: 600, tablet: 800, desktop: 1280 },
	mobileOnly: { mobile: 375, desktop: 800 },
	tabletOnly: { tablet: 600, desktop: 1280 },
	legacy: { mobile: 600, tablet: 800, desktop: 1280 },
};

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

function runHeadScript( queries, disabled ) {
	// eslint-disable-next-line no-new-func
	new Function( 'h', 'q', 'd', '(' + readGateScript() + ')(h,q,d);' )(
		html,
		queries,
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
	window.motionBlocksDeviceQueries = QUERY_SETS.core;
} );

afterEach( () => {
	delete window.matchMedia;
	delete window.motionBlocksDeviceQueries;
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
	const at = ( set, width ) =>
		currentDevice(
			fakeMatchMedia( { width, reduced: false } ),
			QUERY_SETS[ set ]
		);

	it.each( [
		// Core defaults: mobile ≤ 480px < tablet ≤ 782px < desktop.
		[ 'core', 0, 'mobile' ],
		[ 'core', 480, 'mobile' ],
		[ 'core', 480.5, 'tablet' ],
		[ 'core', 600, 'tablet' ],
		[ 'core', 782, 'tablet' ],
		[ 'core', 782.5, 'desktop' ],
		[ 'core', 1920, 'desktop' ],
		// A theme's own breakpoints (600px / 1000px).
		[ 'custom', 600, 'mobile' ],
		[ 'custom', 601, 'tablet' ],
		[ 'custom', 1000, 'tablet' ],
		[ 'custom', 1001, 'desktop' ],
		// Only `mobile` set: no tablet bucket.
		[ 'mobileOnly', 600, 'mobile' ],
		[ 'mobileOnly', 800, 'desktop' ],
		// Only `tablet` set: everything up to it is tablet.
		[ 'tabletOnly', 320, 'tablet' ],
		[ 'tabletOnly', 901, 'desktop' ],
		// Before 7.1.
		[ 'legacy', 600, 'mobile' ],
		[ 'legacy', 767.5, 'mobile' ],
		[ 'legacy', 768, 'tablet' ],
		[ 'legacy', 1024, 'desktop' ],
	] )( '%s at %p px is %s', ( set, width, device ) => {
		expect( at( set, width ) ).toBe( device );
	} );

	it( 'puts 600px in a different bucket for core than before 7.1', () => {
		expect( at( 'core', 600 ) ).toBe( 'tablet' );
		expect( at( 'legacy', 600 ) ).toBe( 'mobile' );
	} );

	it( 'finds no device without any queries', () => {
		expect(
			currentDevice(
				fakeMatchMedia( { width: 600, reduced: false } ),
				{}
			)
		).toBe( null );
	} );
} );

describe( 'deviceQueries', () => {
	it( 'reads the queries PHP printed, dropping anything else', () => {
		expect(
			deviceQueries( {
				motionBlocksDeviceQueries: {
					mobile: '(width <= 600px)',
					tablet: '',
					desktop: '(width > 600px)',
					watch: '(width > 1px)',
				},
			} )
		).toEqual( { mobile: '(width <= 600px)', desktop: '(width > 600px)' } );
		expect( deviceQueries( {} ) ).toEqual( {} );
	} );
} );

describe( 'disabledDevicesFrom', () => {
	it( 'reads the mb-disabled-* body classes', () => {
		document.body.className = 'home mb-disabled-mobile mb-disabled-desktop';
		expect( disabledDevicesFrom( document.body ) ).toEqual( [
			'mobile',
			'desktop',
		] );
	} );
} );

describe.each( Object.keys( QUERY_SETS ) )(
	'every setter agrees with motionAllowed (%s breakpoints)',
	( set ) => {
		const queries = QUERY_SETS[ set ];
		const combos = COMBOS.filter( ( c ) => WIDTHS[ set ][ c.device ] );

		it.each( combos )(
			'reduced=$reduced device=$device disabled=$disabled',
			( { reduced, device, disabled } ) => {
				const want = motionAllowed( reduced, device, disabled );
				const state = { width: WIDTHS[ set ][ device ], reduced };

				// Head script, with the queries and list PHP prints.
				window.matchMedia = fakeMatchMedia( state );
				runHeadScript( queries, disabled );
				expect( html.classList.contains( MOTION_CLASS ) ).toBe( want );

				// frontend.js, with the printed queries and the body classes.
				html.className = '';
				setBodyClasses( disabled );
				window.motionBlocksDeviceQueries = queries;
				window.matchMedia = fakeMatchMedia( state );
				expect( motionWanted( window, disabled ) ).toBe( want );
				startMotionGate( window );
				expect( html.classList.contains( MOTION_CLASS ) ).toBe( want );
			}
		);
	}
);

describe( 'a device the breakpoints leave out never matches', () => {
	it.each( [
		[ 'mobileOnly', 'tablet', [ 320, 600, 800, 1280 ] ],
		[ 'tabletOnly', 'mobile', [ 320, 600, 800, 1280 ] ],
	] )( '%s: disabling %s changes nothing', ( set, device, widths ) => {
		widths.forEach( ( width ) => {
			html.className = '';
			window.matchMedia = fakeMatchMedia( { width, reduced: false } );
			runHeadScript( QUERY_SETS[ set ], [ device ] );
			expect( {
				width,
				on: html.classList.contains( MOTION_CLASS ),
			} ).toEqual( { width, on: true } );
			expect(
				motionWanted( window, [ device ], QUERY_SETS[ set ] )
			).toBe( true );
		} );
	} );
} );

describe( 'the class follows changes mid-visit', () => {
	// Core breakpoints, animations disabled on mobile (≤ 480px).
	const steps = [
		[ 'reduced motion on', { reduced: true }, false ],
		[ 'reduced motion off', { reduced: false }, true ],
		[ 'resize to the disabled mobile bucket', { width: 375 }, false ],
		[ 'resize to tablet (600px)', { width: 600 }, true ],
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
		runHeadScript( QUERY_SETS.core, [ 'mobile' ] );
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
