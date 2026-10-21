/**
 * aliasSlotForPreview — which Scroll Appear slot the editor preview
 * copies onto the shared animation* keys (GH #49).
 *
 * Run: npm run test:unit
 */
import { aliasSlotForPreview } from '../../src/components/constants';

const BASE = {
	animationMode: 'scroll-appear',
	animationEntryType: 'fade',
	animationExitType: 'custom',
	animationExitFromOpacity: 1,
	animationExitToTranslateY: '200px',
};

describe( 'aliasSlotForPreview', () => {
	it( 'previews the Exit slot while the eye is on and the slot is exit', () => {
		const result = aliasSlotForPreview( {
			...BASE,
			animationFromToPreviewSide: 'end',
			animationPreviewSlot: 'exit',
			animationPreviewPlaying: false,
		} );
		expect( result.animationType ).toBe( 'custom' );
		expect( result.animationToTranslateY ).toBe( '200px' );
		expect( result.animationFromOpacity ).toBe( 1 );
		expect( result.__mbPreviewSlot ).toBe( 'exit' );
	} );

	it( 'previews the Entry slot while the eye is on and the slot is entry', () => {
		const result = aliasSlotForPreview( {
			...BASE,
			animationFromToPreviewSide: 'end',
			animationPreviewSlot: 'entry',
		} );
		expect( result.animationType ).toBe( 'fade' );
		expect( result.__mbPreviewSlot ).toBe( 'entry' );
	} );

	it( 'uses Entry at rest even when a stale exit slot is left behind', () => {
		const result = aliasSlotForPreview( {
			...BASE,
			animationFromToPreviewSide: 'off',
			animationPreviewSlot: 'exit',
			animationPreviewPlaying: false,
		} );
		expect( result.animationType ).toBe( 'fade' );
		expect( result.__mbPreviewSlot ).toBe( 'entry' );
	} );

	it( 'still previews Exit while Play is running with the eye off', () => {
		const result = aliasSlotForPreview( {
			...BASE,
			animationFromToPreviewSide: 'off',
			animationPreviewSlot: 'exit',
			animationPreviewPlaying: true,
		} );
		expect( result.animationType ).toBe( 'custom' );
		expect( result.__mbPreviewSlot ).toBe( 'exit' );
	} );

	it( "shows Exit's From/To, not Entry's, when both slots are Custom", () => {
		const result = aliasSlotForPreview( {
			...BASE,
			animationEntryType: 'custom',
			animationEntryFromOpacity: 0,
			animationEntryToTranslateY: '-50px',
			animationFromToPreviewSide: 'end',
			animationPreviewSlot: 'exit',
		} );
		expect( result.animationToTranslateY ).toBe( '200px' );
		expect( result.animationFromOpacity ).toBe( 1 );

		const entry = aliasSlotForPreview( {
			...BASE,
			animationEntryType: 'custom',
			animationEntryFromOpacity: 0,
			animationEntryToTranslateY: '-50px',
			animationFromToPreviewSide: 'end',
			animationPreviewSlot: 'entry',
		} );
		expect( entry.animationToTranslateY ).toBe( '-50px' );
		expect( entry.animationFromOpacity ).toBe( 0 );
	} );

	it( 'returns an empty type for an empty Exit slot, tagged exit', () => {
		const result = aliasSlotForPreview( {
			...BASE,
			animationExitType: '',
			animationFromToPreviewSide: 'start',
			animationPreviewSlot: 'exit',
		} );
		expect( result.animationType ).toBe( '' );
		expect( result.__mbPreviewSlot ).toBe( 'exit' );
	} );

	it.each( [ null, undefined, '' ] )(
		'falls back to Entry when the eye value is %p',
		( eye ) => {
			const result = aliasSlotForPreview( {
				...BASE,
				animationFromToPreviewSide: eye,
				animationPreviewSlot: 'exit',
			} );
			expect( result.animationType ).toBe( 'fade' );
			expect( result.__mbPreviewSlot ).toBe( 'entry' );
		}
	);
} );
