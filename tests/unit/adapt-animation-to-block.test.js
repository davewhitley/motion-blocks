/**
 * Paste and saved / theme.json animations fit the receiving block
 * (GH #30): image-only settings copied from a Cover fall back to
 * block-level ones on block types without an image target.
 *
 * Run: npm run test:unit
 */
import {
	adaptAnimationToBlock,
	IMAGE_EFFECT_BLOCKS,
	IMAGE_TARGETABLE_BLOCKS,
} from '../../src/components/constants';

describe( 'adaptAnimationToBlock', () => {
	it( 'leaves a Cover animation unchanged on a Cover', () => {
		expect( IMAGE_EFFECT_BLOCKS ).toContain( 'core/cover' );
		expect( IMAGE_TARGETABLE_BLOCKS ).toContain( 'core/cover' );
		const attrs = {
			animationMode: 'page-load',
			animationType: 'image-zoom',
			animationDirection: 'in',
			animationFromToTarget: 'img',
		};
		expect( adaptAnimationToBlock( attrs, 'core/cover' ) ).toEqual( attrs );
	} );

	it( 'turns Image Zoom into Fade on a Heading', () => {
		expect(
			adaptAnimationToBlock(
				{
					animationMode: 'page-load',
					animationType: 'image-zoom',
					animationDirection: 'in',
					animationDuration: 0.8,
				},
				'core/heading'
			)
		).toEqual( {
			animationMode: 'page-load',
			animationType: 'fade',
			animationDirection: '',
			animationDuration: 0.8,
		} );
	} );

	it( 'turns Image Move into Fade in Scroll Interactive', () => {
		const out = adaptAnimationToBlock(
			{
				animationMode: 'scroll-interactive',
				animationType: 'image-move',
				animationDirection: 'btt',
				animationRangeStart: 10,
			},
			'core/paragraph'
		);
		expect( out.animationType ).toBe( 'fade' );
		expect( out.animationDirection ).toBe( '' );
		expect( out.animationRangeStart ).toBe( 10 );
	} );

	it( 'adapts each Scroll Appear slot on its own', () => {
		const out = adaptAnimationToBlock(
			{
				animationMode: 'scroll-appear',
				animationType: 'image-move',
				animationDirection: 'btt',
				animationEntryType: 'image-move',
				animationEntryDirection: 'btt',
				animationExitType: 'slide',
				animationExitDirection: 'ltr',
			},
			'core/group'
		);
		expect( out ).toMatchObject( {
			animationType: 'fade',
			animationDirection: '',
			animationEntryType: 'fade',
			animationEntryDirection: '',
			animationExitType: 'slide',
			animationExitDirection: 'ltr',
		} );

		const exitOnly = adaptAnimationToBlock(
			{
				animationMode: 'scroll-appear',
				animationEntryType: 'scale',
				animationEntryDirection: 'none',
				animationExitType: 'image-zoom',
				animationExitDirection: 'out',
			},
			'core/group'
		);
		expect( exitOnly ).toMatchObject( {
			animationEntryType: 'scale',
			animationEntryDirection: 'none',
			animationExitType: 'fade',
			animationExitDirection: '',
		} );
	} );

	it( 'moves "Animate image only" back to the whole block', () => {
		const out = adaptAnimationToBlock(
			{
				animationMode: 'page-load',
				animationType: 'slide',
				animationDirection: 'ltr',
				animationFromToTarget: 'img',
			},
			'core/heading'
		);
		expect( out ).toEqual( {
			animationMode: 'page-load',
			animationType: 'slide',
			animationDirection: 'ltr',
			animationFromToTarget: 'block',
		} );
	} );

	it( 'keeps Custom From/To values when dropping the image target', () => {
		const out = adaptAnimationToBlock(
			{
				animationMode: 'page-load',
				animationType: 'custom',
				animationFromToTarget: 'img',
				animationFromScale: 1.2,
				animationToScale: 1,
			},
			'core/image'
		);
		expect( out ).toMatchObject( {
			animationType: 'custom',
			animationFromToTarget: 'block',
			animationFromScale: 1.2,
			animationToScale: 1,
		} );
	} );

	it( 'adds no keys the animation did not carry', () => {
		const recipe = {
			animationMode: 'scroll-appear',
			animationEntryType: 'fade',
		};
		expect( adaptAnimationToBlock( recipe, 'core/paragraph' ) ).toEqual(
			recipe
		);
	} );

	it( 'does not mutate its input', () => {
		const attrs = {
			animationType: 'image-zoom',
			animationDirection: 'in',
			animationFromToTarget: 'img',
		};
		const copy = { ...attrs };
		adaptAnimationToBlock( attrs, 'core/heading' );
		expect( attrs ).toEqual( copy );
	} );

	it( 'tolerates a missing bag', () => {
		expect( adaptAnimationToBlock( undefined, 'core/heading' ) ).toEqual(
			{}
		);
	} );
} );
