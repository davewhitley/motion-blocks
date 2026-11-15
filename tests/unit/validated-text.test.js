/**
 * Mistyped Clip path and Custom timing function values get an error
 * message (GH #59).
 *
 * Run: npm run test:unit
 */
import {
	clipPathError,
	timingFunctionError,
} from '../../src/components/valueErrors';

describe( 'Clip path', () => {
	it( 'accepts the shapes the plugin writes into CSS', () => {
		[
			'inset(0 50% 0 0)',
			'circle(50%)',
			'polygon(0 0, 100% 0, 100% 100%)',
			'none',
			'',
		].forEach( ( value ) => expect( clipPathError( value ) ).toBeNull() );
	} );

	it( 'flags a value that would be left out', () => {
		[ 'inset(0 50', 'blob(10px)', 'url(#clip)', 'half' ].forEach(
			( value ) => expect( clipPathError( value ) ).toMatch( /clip-path/ )
		);
	} );
} );

describe( 'Custom timing function', () => {
	const supports = jest.fn(
		( prop, value ) =>
			prop === 'animation-timing-function' &&
			/^(linear|ease(-in|-out|-in-out)?|cubic-bezier\(.+\)|steps\(.+\))$/.test(
				value
			)
	);
	beforeAll( () => {
		window.CSS = { supports };
	} );

	it( 'asks the browser, and accepts what it accepts', () => {
		expect(
			timingFunctionError( ' cubic-bezier(0.4, 0, 0.2, 1) ' )
		).toBeNull();
		expect( timingFunctionError( 'ease-in' ) ).toBeNull();
	} );

	it( 'flags what the browser refuses', () => {
		expect( timingFunctionError( 'ease-in-cubic' ) ).toMatch(
			/timing function/
		);
	} );

	it( 'says nothing about an empty field', () => {
		expect( timingFunctionError( '' ) ).toBeNull();
		expect( timingFunctionError( undefined ) ).toBeNull();
	} );
} );
