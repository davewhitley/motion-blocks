/**
 * The editor's "May break the menu overlay" prediction: block
 * attributes go through the same settle predicates (src/settle.js) the
 * front end runs on the rendered data attributes, after the same
 * migration and img-target / Stagger gating the PHP render filter does.
 *
 * Run: npm run test:unit
 */
import {
	attrsToSettleDataset,
	isRenderedAnimated,
	menuOverlayBlockers,
	navHasOverlay,
} from '../../src/components/menuOverlay';
import { SCHEMA_DEFAULTS } from '../../src/components/constants';

// Editor attributes always carry the schema defaults.
const withDefaults = ( attrs ) => ( { ...SCHEMA_DEFAULTS, ...attrs } );
const PL = withDefaults( {
	animationMode: 'page-load',
	animationType: 'slide',
} );
const SA = withDefaults( {
	animationMode: 'scroll-appear',
	animationEntryType: 'slide',
} );

describe( 'navHasOverlay', () => {
	it( 'is true unless Overlay Menu is Off', () => {
		expect( navHasOverlay( undefined ) ).toBe( true );
		expect( navHasOverlay( {} ) ).toBe( true );
		expect( navHasOverlay( { overlayMenu: 'mobile' } ) ).toBe( true );
		expect( navHasOverlay( { overlayMenu: 'always' } ) ).toBe( true );
		expect( navHasOverlay( { overlayMenu: 'never' } ) ).toBe( false );
	} );
} );

describe( 'attrsToSettleDataset', () => {
	it( 'maps To attributes onto the front-end dataset keys', () => {
		expect(
			attrsToSettleDataset( {
				animationToTranslateX: '20px',
				animationToOpacity: 1,
				animationEntryToClipPath: 'inset(0)',
				animationEntryToScale: null,
				animationFromScale: 2,
			} )
		).toEqual( {
			mbToTranslateX: '20px',
			mbToOpacity: '1',
			mbEntryToClipPath: 'inset(0)',
		} );
	} );

	it( 'invalid values are ignored by the settle check, as on the front end', () => {
		const r = menuOverlayBlockers(
			'core/navigation',
			withDefaults( {
				animationMode: 'page-load',
				animationType: 'custom',
				animationToTranslateX: 'calc(1px; color: red)',
				animationToOpacity: 1,
			} )
		);
		expect( r.reasons ).toEqual( [] );
	} );
} );

describe( 'menuOverlayBlockers', () => {
	it( 'one-shot entry effects settle', () => {
		expect( menuOverlayBlockers( 'core/navigation', PL ) ).toEqual( {
			animated: true,
			reasons: [],
			staggerActive: false,
			imgTargetActive: false,
		} );
		expect( menuOverlayBlockers( 'core/navigation', SA ).reasons ).toEqual(
			[]
		);
	} );

	it( 'lists the reasons in order', () => {
		expect(
			menuOverlayBlockers( 'core/navigation', {
				...PL,
				animationRepeat: 'loop',
				animationType: 'fade-out',
			} ).reasons
		).toEqual( [ 'loop', 'not-at-rest' ] );
		expect(
			menuOverlayBlockers( 'core/navigation', {
				...SA,
				animationEntryType: 'custom',
				animationEntryReplay: 'repeat',
				animationEntryToTranslateY: '40px',
				animationExitType: 'fade',
			} ).reasons
		).toEqual( [ 'replay', 'exit', 'custom-end' ] );
		expect(
			menuOverlayBlockers( 'core/navigation', {
				...PL,
				animationMode: 'scroll-interactive',
			} ).reasons
		).toEqual( [ 'interactive' ] );
	} );

	it( 'Custom ending neutral settles', () => {
		expect(
			menuOverlayBlockers( 'core/navigation', {
				...PL,
				animationType: 'custom',
				animationToTranslateX: '0px',
				animationToOpacity: 1,
			} ).reasons
		).toEqual( [] );
	} );

	it( 'migrates legacy Scroll Appear blocks first', () => {
		// 'both' (mirror) derives an Exit slot.
		const r = menuOverlayBlockers(
			'core/navigation',
			withDefaults( {
				animationMode: 'scroll-appear',
				animationType: 'slide',
				animationScrollTrigger: 'both',
			} )
		);
		expect( r.animated ).toBe( true );
		expect( r.reasons ).toEqual( [ 'exit' ] );
		// Raw attrs with omitted keys resolve to the schema defaults.
		expect(
			menuOverlayBlockers( 'core/navigation', {
				animationMode: 'scroll-appear',
			} ).reasons
		).toEqual( [] );
	} );

	it( 'not animated when the render filter would skip the block', () => {
		expect(
			menuOverlayBlockers( 'core/navigation', {
				...PL,
				animationType: '',
			} ).animated
		).toBe( false );
		expect(
			menuOverlayBlockers( 'core/navigation', {
				...SA,
				animationEntryType: '',
				animationExitType: '',
				// Not legacy: an emptied slot clears animationType too.
				animationType: '',
			} ).animated
		).toBe( false );
		expect(
			menuOverlayBlockers( 'core/navigation', SCHEMA_DEFAULTS ).animated
		).toBe( false );
		expect( isRenderedAnimated( PL ) ).toBe( true );
		expect( isRenderedAnimated( { ...PL, animationType: '' } ) ).toBe(
			false
		);
		expect( isRenderedAnimated( {} ) ).toBe( false );
	} );

	it( 'Stagger: only on parent blocks with a compatible mode/effect', () => {
		const on = { ...PL, animationStaggerEnabled: true };
		expect( menuOverlayBlockers( 'core/group', on ).staggerActive ).toBe(
			true
		);
		expect(
			menuOverlayBlockers( 'core/navigation', on ).staggerActive
		).toBe( false );
		// A leftover flag on Scroll Interactive doesn't stagger (GH #48).
		expect(
			menuOverlayBlockers( 'core/group', {
				...on,
				animationMode: 'scroll-interactive',
			} ).staggerActive
		).toBe( false );
	} );

	it( 'img-target: image effects or "Animate image only", when there is an <img>', () => {
		const cover = { ...PL, animationType: 'image-zoom' };
		expect(
			menuOverlayBlockers( 'core/cover', cover ).imgTargetActive
		).toBe( true );
		expect(
			menuOverlayBlockers( 'core/cover', {
				...PL,
				animationFromToTarget: 'img',
			} ).imgTargetActive
		).toBe( true );
		expect( menuOverlayBlockers( 'core/cover', PL ).imgTargetActive ).toBe(
			false
		);
		// Fixed background: no <img>, so no image target.
		expect(
			menuOverlayBlockers( 'core/cover', { ...cover, hasParallax: true } )
				.imgTargetActive
		).toBe( false );
		expect(
			menuOverlayBlockers( 'core/cover', {
				...SA,
				animationEntryType: '',
				animationExitType: 'image-move',
			} ).imgTargetActive
		).toBe( true );
	} );
} );
