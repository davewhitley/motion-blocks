/**
 * Typing a unit in the seconds fields: "150ms" is 0.15 (GH #121).
 *
 * Run: npm run test:unit
 */
import { secondsFromUnitText } from '../../src/components/secondsInput';

it( 'turns milliseconds into seconds', () => {
	expect( secondsFromUnitText( '150ms' ) ).toBe( '0.15' );
	expect( secondsFromUnitText( ' 80 MS ' ) ).toBe( '0.08' );
	expect( secondsFromUnitText( '1500ms' ) ).toBe( '1.5' );
	expect( secondsFromUnitText( '300ms' ) ).toBe( '0.3' );
} );

it( 'drops an "s" unit', () => {
	expect( secondsFromUnitText( '0.5s' ) ).toBe( '0.5' );
	expect( secondsFromUnitText( '.25 s' ) ).toBe( '0.25' );
	expect( secondsFromUnitText( '2s' ) ).toBe( '2' );
} );

it( 'leaves plain numbers and unfinished text alone', () => {
	[ '150', '0.6', '', '150m', 'ms', 'fast', '-5ms', null ].forEach(
		( text ) => expect( secondsFromUnitText( text ) ).toBeNull()
	);
} );
