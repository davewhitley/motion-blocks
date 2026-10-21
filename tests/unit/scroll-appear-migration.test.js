/**
 * materializeScrollAppearPatch — the first slot edit on a legacy-shaped
 * Scroll Appear block writes the slot values the migration shim
 * derived, so the edit isn't thrown away on the next render (GH #25).
 *
 * Run: npm run test:unit
 */
import {
	SCHEMA_DEFAULTS,
	DEFAULT_ATTRIBUTES,
	migrateScrollAppearAttrs,
	materializeScrollAppearPatch,
} from '../../src/components/constants';

// Editor attributes always carry the schema defaults.
const legacy = ( attrs ) => ( {
	...DEFAULT_ATTRIBUTES,
	...SCHEMA_DEFAULTS,
	animationMode: 'scroll-appear',
	...attrs,
} );

// What the editor (and PHP) see after the patch is written.
const applyAndView = ( attrs, patch ) =>
	migrateScrollAppearAttrs( {
		...attrs,
		...materializeScrollAppearPatch( attrs, patch ),
	} );

describe( 'materializeScrollAppearPatch', () => {
	it( 'keeps a Duration edit on a legacy enter block', () => {
		const attrs = legacy( {
			animationType: 'fade',
			animationDuration: 0.7,
			animationDelay: 0,
			animationScrollTrigger: 'enter',
		} );
		const patch = materializeScrollAppearPatch( attrs, {
			animationEntryDuration: 2,
		} );
		expect( patch.animationEntryType ).toBe( 'fade' );
		const view = applyAndView( attrs, { animationEntryDuration: 2 } );
		expect( view.animationEntryType ).toBe( 'fade' );
		expect( view.animationEntryDuration ).toBe( 2 );
		expect( view.animationEntryDelay ).toBe( 0 );
		expect( view.animationExitType ).toBe( '' );
	} );

	it.each( [ 'mirror', 'both' ] )(
		'keeps the Exit slot when the Entry effect changes (%s)',
		( trigger ) => {
			const attrs = legacy( {
				animationType: 'scale',
				animationDuration: 1.1,
				animationScrollTrigger: trigger,
			} );
			const edit = {
				animationEntryType: 'slide',
				animationEntryDirection: 'btt',
			};
			const patch = materializeScrollAppearPatch( attrs, edit );
			expect( patch.animationExitType ).toBe( 'scale' );
			expect( patch.animationExitDuration ).toBe( 1.1 );
			const view = applyAndView( attrs, edit );
			expect( view.animationEntryType ).toBe( 'slide' );
			expect( view.animationEntryDirection ).toBe( 'btt' );
			expect( view.animationEntryDuration ).toBe( 1.1 );
			expect( view.animationExitType ).toBe( 'scale' );
			expect( view.animationExitDuration ).toBe( 1.1 );
			expect( view.animationExitDelay ).toBe( 0 );
		}
	);

	it( 'fills only the Exit slot for a legacy exit block', () => {
		const attrs = legacy( {
			animationType: 'fade',
			animationScrollTrigger: 'exit',
		} );
		const patch = materializeScrollAppearPatch( attrs, {
			animationExitDuration: 1.5,
		} );
		expect( patch.animationExitType ).toBe( 'fade' );
		expect( patch ).not.toHaveProperty( 'animationEntryType' );
		const view = applyAndView( attrs, { animationExitDuration: 1.5 } );
		expect( view.animationEntryType ).toBe( '' );
		expect( view.animationExitType ).toBe( 'fade' );
		expect( view.animationExitDuration ).toBe( 1.5 );
	} );

	it( 'writes unit-bearing From/To values for a legacy Custom block', () => {
		const attrs = legacy( {
			animationType: 'custom',
			animationScrollTrigger: 'enter',
			animationFromOpacity: 0,
			animationFromRotate: 45,
			animationFromBlur: 8,
		} );
		const patch = materializeScrollAppearPatch( attrs, {
			animationEntryDuration: 1,
		} );
		expect( patch.animationEntryType ).toBe( 'custom' );
		expect( patch.animationEntryFromOpacity ).toBe( 0 );
		expect( patch.animationEntryFromRotate ).toBe( '45deg' );
		expect( patch.animationEntryFromBlur ).toBe( '8px' );
	} );

	it( 'leaves the patch alone when nothing applies', () => {
		const slotBlock = legacy( {
			animationEntryType: 'fade',
			animationExitType: '',
		} );
		const legacyBlock = legacy( { animationType: 'fade' } );
		const slotEdit = { animationEntryDuration: 2 };
		const cases = [
			[ slotBlock, slotEdit ],
			[ { ...legacyBlock, animationMode: 'page-load' }, slotEdit ],
			[
				legacyBlock,
				{ animationMode: 'scroll-appear', animationEntryType: 'fade' },
			],
			[ legacyBlock, { animationStaggerEnabled: true } ],
			[ legacyBlock, { animationPreviewPlaying: true } ],
			[ legacyBlock, { animationPreviewSlot: 'exit' } ],
		];
		for ( const [ attrs, patch ] of cases ) {
			expect( materializeScrollAppearPatch( attrs, patch ) ).toBe(
				patch
			);
		}
	} );

	it( 'clears the shared type when the last slot is emptied', () => {
		const legacyEnter = legacy( {
			animationType: 'fade',
			animationScrollTrigger: 'enter',
		} );
		const freshSlot = legacy( {
			animationEntryType: 'fade',
			animationExitType: '',
		} );
		for ( const attrs of [ legacyEnter, freshSlot ] ) {
			const edit = {
				animationEntryType: '',
				animationEntryDirection: '',
			};
			const patch = materializeScrollAppearPatch( attrs, edit );
			expect( patch.animationType ).toBe( '' );
			const view = applyAndView( attrs, edit );
			expect( view.animationEntryType ).toBe( '' );
			expect( view.animationExitType ).toBe( '' );
		}
	} );

	it( 'keeps Exit and the shared type when only Entry is cleared on a mirror block', () => {
		const attrs = legacy( {
			animationType: 'scale',
			animationScrollTrigger: 'mirror',
		} );
		const edit = { animationEntryType: '', animationEntryDirection: '' };
		const patch = materializeScrollAppearPatch( attrs, edit );
		expect( patch ).not.toHaveProperty( 'animationType' );
		expect( patch.animationExitType ).toBe( 'scale' );
		const view = applyAndView( attrs, edit );
		expect( view.animationEntryType ).toBe( '' );
		expect( view.animationExitType ).toBe( 'scale' );
	} );
} );
