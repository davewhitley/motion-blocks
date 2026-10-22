/**
 * isValidFromToValue — Custom From/To values are written into
 * @keyframes text, so each property only accepts the shapes the panel
 * produces. Mirrored in PHP by motion_blocks_valid_from_to_value().
 *
 * Run: npm run test:unit
 */
import { isValidFromToValue } from '../../src/css-values';
import { buildKeyframeSide } from '../../src/components/constants';

describe( 'isValidFromToValue', () => {
	it.each( [
		[ 'opacity', 0 ],
		[ 'opacity', '0.5' ],
		[ 'opacity', '.03' ],
		[ 'scale', 1.2 ],
		[ 'scale', '-1' ],
		[ 'translateX', '40px' ],
		[ 'translateY', '-10%' ],
		[ 'translateY', '2.5rem' ],
		[ 'translateX', '0' ],
		[ 'blur', '8px' ],
		[ 'rotate', '360deg' ],
		[ 'rotateX', '-90deg' ],
		[ 'rotateY', '0.5turn' ],
		[ 'clipPath', 'none' ],
		[ 'clipPath', 'inset(0 100% 0 0)' ],
		[ 'clipPath', 'inset(10px 20px round 8px / 4px)' ],
		[ 'clipPath', 'circle(150% at 50% 50%)' ],
		[ 'clipPath', 'ellipse(40% 30% at center)' ],
		[ 'clipPath', 'polygon(0% 0%, 200% 0%, 0% 200%, 0% 0%)' ],
		[ 'clipPath', 'path("M0 0 L100 0 L100 100 Z")' ],
		[ 'clipPath', "path(evenodd, 'M 10,30 A 20,20 0,0,1 50,30 Z')" ],
	] )( 'accepts %s %p', ( id, value ) => {
		expect( isValidFromToValue( id, value ) ).toBe( true );
	} );

	it.each( [
		[ 'opacity', '0; color: red' ],
		[ 'opacity', '0 }' ],
		[ 'opacity', '1px' ],
		[ 'translateX', '40px) translate(9999px' ],
		[ 'translateX', 'calc(10px + 5px)' ],
		[ 'blur', '8deg' ],
		[ 'rotate', '45px' ],
		[ 'rotate', '45deg }' ],
		[ 'clipPath', 'none } x {' ],
		[ 'clipPath', 'inset(0); color: red' ],
		[ 'clipPath', 'polygon(calc(50% - 1px) 0, 0 0)' ],
		[ 'clipPath', 'path("M0 0) x {")' ],
		[ 'clipPath', 'path("M0 0' ],
		[ 'clipPath', 'url(#mask)' ],
		[ 'clipPath', 'inset(0) /* comment' ],
		[ 'clipPath', 'inset(0)\\7d' ],
		[ 'clipPath', '<style>' ],
		[ 'opacity', '' ],
		[ 'opacity', null ],
		[ 'unknownProp', '1' ],
	] )( 'rejects %s %p', ( id, value ) => {
		expect( isValidFromToValue( id, value ) ).toBe( false );
	} );

	it( 'rejects absurdly long values', () => {
		expect(
			isValidFromToValue( 'clipPath', `polygon(${ '1% '.repeat( 1000 ) })` )
		).toBe( false );
	} );
} );

describe( 'buildKeyframeSide drops invalid values', () => {
	it( 'keeps valid declarations and skips a malformed one', () => {
		const body = buildKeyframeSide( {
			opacity: 0,
			translateY: '40px',
			clipPath: 'none } x {',
		} );
		expect( body ).toBe( 'opacity: 0; transform: translate(0px, 40px);' );
		expect( body ).not.toContain( '}' );
	} );

	it( 'returns null when every value is invalid', () => {
		expect( buildKeyframeSide( { opacity: '1; x: y' } ) ).toBeNull();
	} );
} );
