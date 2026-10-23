/**
 * Copy paths never carry editor preview state (GH #29): Copy, Apply to
 * other blocks, Save and the ingest side (Paste, apply saved / theme
 * animation) all leave out the six preview keys.
 *
 * Run: npm run test:unit
 */
import {
	pickAnimationAttributes,
	saveLibraryChange,
	stripUiState,
} from '../../src/components/savedAnimations';
import {
	DEFAULT_ATTRIBUTES,
	PREVIEW_DEFAULTS,
	PREVIEW_UI_KEYS,
	normalizeCustomFromToAttrs,
} from '../../src/components/constants';

// A preview state that differs from PREVIEW_DEFAULTS on every key.
const LIVE_PREVIEW = {
	animationPreviewPlaying: true,
	animationPreviewSlot: 'exit',
	animationPreviewEnabled: true,
	animationFromToPreviewSide: 'start',
	animationFromToActiveSide: 'end',
	animationScrubPosition: 40,
};

describe( 'preview keys', () => {
	it( 'LIVE_PREVIEW covers all six keys with non-default values', () => {
		expect( Object.keys( LIVE_PREVIEW ).sort() ).toEqual(
			[ ...PREVIEW_UI_KEYS ].sort()
		);
		PREVIEW_UI_KEYS.forEach( ( key ) => {
			expect( LIVE_PREVIEW[ key ] ).not.toBe( PREVIEW_DEFAULTS[ key ] );
		} );
	} );

	it( 'DEFAULT_ATTRIBUTES holds no preview key', () => {
		PREVIEW_UI_KEYS.forEach( ( key ) => {
			expect( DEFAULT_ATTRIBUTES ).not.toHaveProperty( key );
		} );
	} );
} );

describe( 'stripUiState', () => {
	it( 'removes all six preview keys and keeps the rest', () => {
		const out = stripUiState( {
			animationMode: 'page-load',
			animationType: 'custom',
			animationFromOpacity: 0,
			...LIVE_PREVIEW,
		} );
		expect( out ).toEqual( {
			animationMode: 'page-load',
			animationType: 'custom',
			animationFromOpacity: 0,
		} );
	} );

	it( 'does not mutate its input', () => {
		const input = { animationMode: 'page-load', ...LIVE_PREVIEW };
		const copy = { ...input };
		stripUiState( input );
		expect( input ).toEqual( copy );
	} );

	it( 'tolerates a missing bag', () => {
		expect( stripUiState( undefined ) ).toEqual( {} );
	} );
} );

describe( 'pickAnimationAttributes', () => {
	// What the panel hands the options menu: attributes with the
	// block's preview state laid over them.
	const panelAttributes = {
		...DEFAULT_ATTRIBUTES,
		className: 'is-style-fancy',
		content: 'Hello',
		animationMode: 'scroll-appear',
		animationFromToTarget: 'img',
		animationEntryType: 'custom',
		animationEntryFromOpacity: 0,
		animationEntryFromTranslateY: '20px',
		animationExitType: 'fade',
		animationExitDuration: 0.3,
		...LIVE_PREVIEW,
	};

	it( 'never returns a preview key, even with non-default values', () => {
		const picked = pickAnimationAttributes( panelAttributes );
		PREVIEW_UI_KEYS.forEach( ( key ) => {
			expect( picked ).not.toHaveProperty( key );
		} );
	} );

	it( 'keeps real animation keys, including the target and both slots', () => {
		const picked = pickAnimationAttributes( panelAttributes );
		expect( picked ).toMatchObject( {
			animationMode: 'scroll-appear',
			animationFromToTarget: 'img',
			animationEntryType: 'custom',
			animationEntryFromOpacity: 0,
			animationEntryFromTranslateY: '20px',
			animationExitType: 'fade',
			animationExitDuration: 0.3,
		} );
	} );

	it( 'leaves out non-animation attributes and undefined values', () => {
		const picked = pickAnimationAttributes( {
			className: 'x',
			content: 'Hello',
			animationMode: 'page-load',
			animationDuration: undefined,
		} );
		expect( picked ).toEqual( { animationMode: 'page-load' } );
	} );

	it( 'returns an empty bag for missing attributes', () => {
		expect( pickAnimationAttributes( undefined ) ).toEqual( {} );
	} );
} );

describe( 'apply-saved ingest', () => {
	it( 'a pre-GH #29 library entry or theme recipe applies without preview keys', () => {
		const saved = {
			animationMode: 'page-load',
			animationType: 'custom',
			animationFromOpacity: 0,
			animationFromRotate: 45,
			animationFromToActiveSide: 'end',
			animationFromToPreviewSide: 'start',
		};
		const out = normalizeCustomFromToAttrs( stripUiState( saved ) );
		PREVIEW_UI_KEYS.forEach( ( key ) => {
			expect( out ).not.toHaveProperty( key );
		} );
		expect( out.animationMode ).toBe( 'page-load' );
		expect( out.animationFromOpacity ).toBe( 0 );
		// Unit-less legacy value upgraded to the stored string form.
		expect( out.animationFromRotate ).toBe( '45deg' );
	} );
} );

/*
 * Saving the library (GH #28): save only the library, on top of the
 * server's current copy, and fail loudly.
 */
describe( 'saveLibraryChange', () => {
	const mine = { name: 'Mine', attributes: {} };
	const theirs = { name: 'Theirs', attributes: {} };

	it( "applies the change to the server's current library", async () => {
		const saved = [];
		const next = await saveLibraryChange(
			{
				cached: {},
				// Another admin saved "theirs" after this editor loaded.
				fetchLibrary: async () => ( { b: theirs } ),
				saveLibrary: async ( lib ) => saved.push( lib ),
			},
			( lib ) => ( { ...lib, a: mine } )
		);
		expect( next ).toEqual( { a: mine, b: theirs } );
		expect( saved ).toEqual( [ { a: mine, b: theirs } ] );
	} );

	it( 'falls back to the loaded copy when the server read fails', async () => {
		const next = await saveLibraryChange(
			{
				cached: { b: theirs },
				fetchLibrary: async () => {
					throw new Error( 'offline' );
				},
				saveLibrary: async () => {},
			},
			( lib ) => {
				delete lib.b;
				return lib;
			}
		);
		expect( next ).toEqual( {} );
	} );

	it( "doesn't modify the cached library in place", async () => {
		const cached = { b: theirs };
		await saveLibraryChange(
			{
				cached,
				fetchLibrary: async () => null,
				saveLibrary: async () => {},
			},
			( lib ) => {
				delete lib.b;
				return lib;
			}
		);
		expect( cached ).toEqual( { b: theirs } );
	} );

	it( 'rejects when the save fails, so no success notice is shown', async () => {
		await expect(
			saveLibraryChange(
				{
					cached: {},
					fetchLibrary: async () => ( {} ),
					saveLibrary: async () => {
						throw new Error(
							'Sorry, you are not allowed to do that.'
						);
					},
				},
				( lib ) => ( { ...lib, a: mine } )
			)
		).rejects.toThrow( 'not allowed' );
	} );
} );

describe( 'AnimationOptionsMenu saves only the library (GH #28)', () => {
	const src = require( 'fs' ).readFileSync(
		require( 'path' ).join(
			__dirname,
			'..',
			'..',
			'src',
			'components',
			'AnimationOptionsMenu.js'
		),
		'utf8'
	);

	it( 'never saves the whole site entity', () => {
		// saveEditedEntityRecord saves every pending site edit.
		expect( src ).not.toMatch( /saveEditedEntityRecord/ );
		expect( src ).toMatch(
			/saveEntityRecord\(\s*'root',\s*'site',\s*\{\s*mb_saved_animations: next\s*\},\s*\{\s*throwOnError: true\s*\}/
		);
	} );

	it( 'never leaves the library as a pending site edit', () => {
		// An edit that failed to save would ride along with the next
		// Site Editor save.
		expect( src ).not.toMatch( /setSavedAnimations/ );
	} );
} );
