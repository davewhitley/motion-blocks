/**
 * The Page panel's per-device help text (src/components/deviceRanges.js)
 * says which screen widths each toggle covers, from the same queries the
 * front end uses: core's default viewport breakpoints, a theme's custom
 * ones, a theme that sets only one, and the pre-7.1 fallback.
 *
 * Run: npm run test:unit
 */
import { deviceRangeHelp } from '../../src/components/deviceRanges';
import { deviceQueryRange } from '../../src/motion-gate';

const { QUERY_SETS } = require( './helpers/motion-gate' );

const help = ( set ) => ( {
	mobile: deviceRangeHelp( 'mobile', QUERY_SETS[ set ] ),
	tablet: deviceRangeHelp( 'tablet', QUERY_SETS[ set ] ),
	desktop: deviceRangeHelp( 'desktop', QUERY_SETS[ set ] ),
} );

const NOT_USED =
	'Not used: this theme’s screen-size breakpoints don’t include this size.';

describe( 'per-device help text', () => {
	it( 'shows core’s default ranges', () => {
		expect( help( 'core' ) ).toEqual( {
			mobile: 'Screens up to 480px wide',
			tablet: 'Screens 481px to 782px wide',
			desktop: 'Screens 783px and wider',
		} );
	} );

	it( 'follows a theme’s own breakpoints', () => {
		expect( help( 'custom' ) ).toEqual( {
			mobile: 'Screens up to 600px wide',
			tablet: 'Screens 601px to 1000px wide',
			desktop: 'Screens 1001px and wider',
		} );
	} );

	it( 'says when the breakpoints leave a device out', () => {
		expect( help( 'mobileOnly' ) ).toEqual( {
			mobile: 'Screens up to 600px wide',
			tablet: NOT_USED,
			desktop: 'Screens 601px and wider',
		} );
		expect( help( 'tabletOnly' ) ).toEqual( {
			mobile: NOT_USED,
			tablet: 'Screens up to 900px wide',
			desktop: 'Screens 901px and wider',
		} );
	} );

	it( 'shows the pre-7.1 ranges', () => {
		expect( help( 'legacy' ) ).toEqual( {
			mobile: 'Screens up to 767px wide',
			tablet: 'Screens 768px to 1023px wide',
			desktop: 'Screens 1024px and wider',
		} );
	} );

	it( 'keeps em and fractional breakpoints as written', () => {
		const queries = {
			mobile: '(width <= 30em)',
			tablet: '(30em < width <= 48.5em)',
			desktop: '(width > 48.5em)',
		};
		expect( deviceRangeHelp( 'tablet', queries ) ).toBe(
			'Screens wider than 30em, up to 48.5em'
		);
		expect( deviceRangeHelp( 'desktop', queries ) ).toBe(
			'Screens wider than 48.5em'
		);
	} );

	it( 'reads the window’s printed queries by default', () => {
		window.motionBlocksDeviceQueries = QUERY_SETS.core;
		expect( deviceRangeHelp( 'mobile' ) ).toBe(
			'Screens up to 480px wide'
		);
		delete window.motionBlocksDeviceQueries;
		expect( deviceRangeHelp( 'mobile' ) ).toBe( NOT_USED );
	} );

	it( 'gives no text for a query form it doesn’t know', () => {
		expect( deviceQueryRange( '(orientation: portrait)' ) ).toBe( null );
		expect(
			deviceRangeHelp( 'mobile', { mobile: '(orientation: portrait)' } )
		).toBe( '' );
	} );
} );
