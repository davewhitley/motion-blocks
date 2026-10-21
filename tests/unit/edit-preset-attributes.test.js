/**
 * editPresetAttributes — the Page Load "Edit" button converts a preset
 * to Custom without turning Stagger off (GH #64).
 *
 * Run: npm run test:unit
 */
import {
	DEFAULT_ATTRIBUTES,
	DEFAULT_DIRECTION,
	STAGGER_INCOMPATIBLE_TYPES,
	editPresetAttributes,
	isStaggerCompatible,
} from '../../src/components/constants';

const PROPS = [
	'Opacity',
	'TranslateX',
	'TranslateY',
	'Scale',
	'Rotate',
	'RotateX',
	'RotateY',
	'Blur',
	'ClipPath',
];
const FROM_TO_KEYS = PROPS.flatMap( ( p ) => [
	`animationFrom${ p }`,
	`animationTo${ p }`,
] );

const block = ( attrs ) => ( { ...DEFAULT_ATTRIBUTES, ...attrs } );

describe( 'editPresetAttributes (Page Load Edit button)', () => {
	it( 'keeps Stagger on when a staggered preset becomes Custom', () => {
		const attrs = block( {
			animationMode: 'page-load',
			animationType: 'slide',
			animationDirection: DEFAULT_DIRECTION.slide,
			animationStaggerEnabled: true,
		} );
		const out = editPresetAttributes( attrs );

		expect( out.animationType ).toBe( 'custom' );
		expect( out.animationDirection ).toBe( '' );
		expect( out ).not.toHaveProperty( 'animationStaggerEnabled' );

		const after = { ...attrs, ...out };
		expect( after.animationStaggerEnabled ).toBe( true );
		expect( isStaggerCompatible( after ) ).toBe( true );
	} );

	it( 'seeds only the preset values and nulls every other From/To key', () => {
		const out = editPresetAttributes(
			block( { animationMode: 'page-load', animationType: 'fade' } )
		);

		expect( out.animationFromOpacity ).toBe( 0 );
		expect( out.animationToOpacity ).toBe( 1 );
		for ( const key of FROM_TO_KEYS ) {
			if (
				key === 'animationFromOpacity' ||
				key === 'animationToOpacity'
			) {
				continue;
			}
			expect( out ).toHaveProperty( key, null );
		}
	} );

	it( 'keeps image effects targeting the inner img', () => {
		const out = editPresetAttributes(
			block( { animationMode: 'page-load', animationType: 'image-zoom' } )
		);

		expect( out.animationType ).toBe( 'custom' );
		expect( out.animationFromToTarget ).toBe( 'img' );
	} );

	it( 'does not set an img target for wrapper presets', () => {
		const out = editPresetAttributes(
			block( { animationMode: 'page-load', animationType: 'fade' } )
		);

		expect( out ).not.toHaveProperty( 'animationFromToTarget' );
	} );

	it.each( [ 'custom', '' ] )(
		'returns null when the type %p has no preset to convert',
		( type ) => {
			expect(
				editPresetAttributes(
					block( { animationMode: 'page-load', animationType: type } )
				)
			).toBeNull();
		}
	);

	it( 'relies on Custom being stagger-compatible', () => {
		expect( STAGGER_INCOMPATIBLE_TYPES ).not.toContain( 'custom' );
	} );
} );
