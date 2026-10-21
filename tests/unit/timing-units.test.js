/**
 * isLongTiming — Duration / Delay values above the soft limit get a
 * "seconds, not milliseconds" hint in the panel (GH #65). The limit is
 * a warning only; nothing is clamped.
 *
 * Run: npm run test:unit
 */
import {
	TIMING_SOFT_MAX_SECONDS,
	isLongTiming,
} from '../../src/components/constants';

describe( 'isLongTiming', () => {
	it( 'uses a 30 second soft limit', () => {
		expect( TIMING_SOFT_MAX_SECONDS ).toBe( 30 );
	} );

	it.each( [ 0.6, 0, 30, '30', 2, '0.25' ] )(
		'is false for normal timing %p',
		( value ) => {
			expect( isLongTiming( value ) ).toBe( false );
		}
	);

	it.each( [ 30.1, 500, '500', 120 ] )(
		'is true for long timing %p',
		( value ) => {
			expect( isLongTiming( value ) ).toBe( true );
		}
	);

	it.each( [ undefined, null, '', 'abc', NaN, -5, Infinity ] )(
		'is false for empty or invalid %p',
		( value ) => {
			expect( isLongTiming( value ) ).toBe( false );
		}
	);
} );
