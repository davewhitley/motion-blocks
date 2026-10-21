/**
 * resetAnimationAttributes — "Reset settings" resets every animation
 * attribute, the Scroll Appear Entry / Exit slots included (GH #56).
 *
 * Run: npm run test:unit
 */
import {
	DEFAULT_ATTRIBUTES,
	PREVIEW_UI_KEYS,
	migrateScrollAppearAttrs,
	materializeScrollAppearPatch,
	resetAnimationAttributes,
} from '../../src/components/constants';
import { pickAnimationAttributes } from '../../src/components/savedAnimations';

// A Scroll Appear block with Entry Slide and Exit Custom, plus the
// other settings the old reset left alone.
const configured = {
	...DEFAULT_ATTRIBUTES,
	animationMode: 'scroll-appear',
	animationType: 'fade',
	animationEntryType: 'slide',
	animationEntryDirection: 'left',
	animationEntryDuration: 1.2,
	animationEntryDelay: 0.5,
	animationEntryReplay: 'repeat',
	animationExitType: 'custom',
	animationExitFromOpacity: 1,
	animationExitToOpacity: 0,
	animationExitToTranslateY: '40px',
	animationExitReplay: 'none',
	animationStaggerEnabled: true,
	animationStaggerStep: 0.3,
	animationFromToTarget: 'img',
	animationRotateAngle: 180,
	animationCustomTimingFunction: 'steps(4)',
};

describe( 'resetAnimationAttributes', () => {
	it( 'covers every animation key and no preview key', () => {
		const out = resetAnimationAttributes( 'page-load' );
		for ( const key of Object.keys( DEFAULT_ATTRIBUTES ) ) {
			expect( out ).toHaveProperty( key );
		}
		for ( const key of PREVIEW_UI_KEYS ) {
			expect( out ).not.toHaveProperty( key );
		}
	} );

	it( 'keeps the given mode', () => {
		expect( resetAnimationAttributes( 'page-load' ).animationMode ).toBe(
			'page-load'
		);
		expect(
			resetAnimationAttributes( 'scroll-interactive' ).animationMode
		).toBe( 'scroll-interactive' );
		expect(
			resetAnimationAttributes( 'scroll-appear' ).animationMode
		).toBe( 'scroll-appear' );
	} );

	it( 'seeds the Entry slot for Scroll Appear, like picking the mode', () => {
		const out = resetAnimationAttributes( 'scroll-appear' );
		expect( out.animationEntryType ).toBe(
			DEFAULT_ATTRIBUTES.animationType
		);
		expect( out.animationEntryDirection ).toBe( '' );
		expect( out.animationEntryDuration ).toBe(
			DEFAULT_ATTRIBUTES.animationDuration
		);
		expect( out.animationEntryDelay ).toBe(
			DEFAULT_ATTRIBUTES.animationDelay
		);
		expect( out.animationEntryReplay ).toBe( 'once' );
		expect( out.animationExitType ).toBe( '' );
	} );

	it( 'leaves the slots empty in the other modes', () => {
		expect(
			resetAnimationAttributes( 'page-load' ).animationEntryType
		).toBe( '' );
		expect(
			resetAnimationAttributes( 'scroll-interactive' ).animationExitType
		).toBe( '' );
	} );

	it( 'resets a configured Scroll Appear block to Entry Fade, no Exit', () => {
		const after = {
			...configured,
			...resetAnimationAttributes( configured.animationMode ),
		};
		const view = migrateScrollAppearAttrs( after );
		expect( view.animationEntryType ).toBe( 'fade' );
		expect( view.animationEntryDirection ).toBe( '' );
		expect( view.animationEntryDuration ).toBe( 0.6 );
		expect( view.animationEntryDelay ).toBe( 0 );
		expect( view.animationEntryReplay ).toBe( 'once' );
		expect( view.animationExitType ).toBe( '' );
		expect( view.animationExitReplay ).toBe( 'reverse' );
		expect( view.animationExitFromOpacity ).toBeNull();
		expect( view.animationExitToOpacity ).toBeNull();
		expect( view.animationExitToTranslateY ).toBeNull();
		expect( view.animationStaggerEnabled ).toBe( false );
		expect( view.animationStaggerStep ).toBe( 0.1 );
		expect( view.animationFromToTarget ).toBe( 'block' );
		expect( view.animationRotateAngle ).toBe( 90 );
		expect( view.animationCustomTimingFunction ).toBe(
			DEFAULT_ATTRIBUTES.animationCustomTimingFunction
		);
	} );

	it( 'leaves the block equal to a freshly picked Scroll Appear block', () => {
		const after = {
			...configured,
			...resetAnimationAttributes( 'scroll-appear' ),
		};
		expect( pickAnimationAttributes( after ) ).toEqual(
			pickAnimationAttributes( {
				...DEFAULT_ATTRIBUTES,
				animationMode: 'scroll-appear',
				animationEntryType: DEFAULT_ATTRIBUTES.animationType,
			} )
		);
	} );

	it( 'passes through materializeScrollAppearPatch untouched', () => {
		const patch = resetAnimationAttributes( 'scroll-appear' );
		expect( materializeScrollAppearPatch( configured, patch ) ).toBe(
			patch
		);
	} );
} );
