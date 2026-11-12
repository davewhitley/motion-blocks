/**
 * Exit slots play their effect backward, so each Exit direction option
 * is listed under the arrow and label of the motion it produces
 * (GH #130).
 */
import {
	slotDirectionOptions,
	DIRECTION_CSS_VARS,
} from '../../src/components/constants';

const pick = ( options, shown ) =>
	options.find( ( opt ) => opt.shown === shown );

describe( 'slotDirectionOptions', () => {
	it( 'stores the shown direction for an Entry', () => {
		slotDirectionOptions( 'slide', 'entry' ).forEach( ( opt ) => {
			expect( opt.value ).toBe( opt.shown );
		} );
	} );

	it( 'lists the same arrows in the same order for Entry and Exit', () => {
		const shown = ( slot ) =>
			slotDirectionOptions( 'slide', slot ).map( ( opt ) => [
				opt.shown,
				opt.label,
			] );
		expect( shown( 'exit' ) ).toEqual( shown( 'entry' ) );
	} );

	it( 'stores the opposite direction for an Exit', () => {
		const options = slotDirectionOptions( 'slide', 'exit' );
		expect( pick( options, 'btt' ).value ).toBe( 'ttb' );
		expect( pick( options, 'ttb' ).value ).toBe( 'btt' );
		expect( pick( options, 'ltr' ).value ).toBe( 'rtl' );
		expect( pick( options, 'rtl' ).value ).toBe( 'ltr' );
	} );

	it( 'shows an Exit Slide under the way it moves', () => {
		// The Exit keyframe runs from rest to the Entry's start offset.
		// "Bottom to top" has to end above the block: a negative y.
		const up = pick( slotDirectionOptions( 'slide', 'exit' ), 'btt' );
		const end = DIRECTION_CSS_VARS.slide[ up.value ][ '--mb-slide-y' ];
		expect( parseFloat( end ) ).toBeLessThan( 0 );
	} );

	it( 'leaves Curtain alone', () => {
		expect(
			slotDirectionOptions( 'curtain', 'exit' ).map(
				( opt ) => opt.value
			)
		).toEqual( [ 'horizontal', 'vertical' ] );
	} );

	it( 'returns nothing for an effect with no direction', () => {
		expect( slotDirectionOptions( 'fade', 'exit' ) ).toEqual( [] );
	} );
} );
