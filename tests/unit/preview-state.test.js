/**
 * Editor preview state store (GH #29): reducer, selectors and the pure
 * helpers that route preview keys away from block attributes.
 *
 * Run: npm run test:unit
 */
import {
	reducer,
	actions,
	selectors,
	splitPreviewPatch,
	overlayPreviewState,
} from '../../src/components/previewState';
import {
	PREVIEW_DEFAULTS,
	PREVIEW_UI_KEYS,
	resetPreviewUiAttributes,
} from '../../src/components/constants';

const { setPreview, clearPreview } = actions;
const { getBlockPreview, hasPreview } = selectors;

describe( 'PREVIEW_DEFAULTS', () => {
	it( 'lists the six preview keys and is frozen', () => {
		expect( PREVIEW_UI_KEYS ).toEqual( [
			'animationPreviewPlaying',
			'animationPreviewSlot',
			'animationPreviewEnabled',
			'animationFromToPreviewSide',
			'animationFromToActiveSide',
			'animationScrubPosition',
		] );
		expect( Object.isFrozen( PREVIEW_DEFAULTS ) ).toBe( true );
	} );
} );

describe( 'reducer: SET_PREVIEW', () => {
	it( 'merges the patch into each id and keeps other ids untouched', () => {
		const a = { ...PREVIEW_DEFAULTS, animationPreviewEnabled: true };
		const state = { a };
		const next = reducer(
			state,
			setPreview( [ 'b', 'c' ], { animationPreviewPlaying: true } )
		);
		expect( next ).not.toBe( state );
		expect( next.a ).toBe( a );
		expect( next.b ).toEqual( {
			...PREVIEW_DEFAULTS,
			animationPreviewPlaying: true,
		} );
		expect( next.c ).toEqual( next.b );
		expect( state.b ).toBeUndefined();
	} );

	it( 'accepts a single id', () => {
		const next = reducer(
			{},
			setPreview( 'a', { animationFromToPreviewSide: 'end' } )
		);
		expect( next.a.animationFromToPreviewSide ).toBe( 'end' );
	} );

	it( 'merges onto an existing entry', () => {
		const state = reducer(
			{},
			setPreview( 'a', { animationFromToPreviewSide: 'start' } )
		);
		const next = reducer(
			state,
			setPreview( 'a', { animationFromToActiveSide: 'end' } )
		);
		expect( next.a.animationFromToPreviewSide ).toBe( 'start' );
		expect( next.a.animationFromToActiveSide ).toBe( 'end' );
	} );

	it( 'returns the same state for a no-op patch', () => {
		const state = reducer(
			{},
			setPreview( 'a', { animationPreviewPlaying: true } )
		);
		expect(
			reducer(
				state,
				setPreview( 'a', { animationPreviewPlaying: true } )
			)
		).toBe( state );
		expect( reducer( state, setPreview( 'a', {} ) ) ).toBe( state );
		expect(
			reducer( state, setPreview( 'a', { animationType: 'fade' } ) )
		).toBe( state );
	} );

	it( 'creates no entry for a playing:false patch on an absent id', () => {
		const state = {};
		const next = reducer(
			state,
			setPreview( [ 'gone' ], { animationPreviewPlaying: false } )
		);
		expect( next ).toBe( state );
		expect( hasPreview( next, 'gone' ) ).toBe( false );
	} );

	it( 'removes an entry that returns to the defaults', () => {
		const state = reducer(
			{},
			setPreview( 'a', { animationPreviewPlaying: true } )
		);
		const next = reducer(
			state,
			setPreview( 'a', { animationPreviewPlaying: false } )
		);
		expect( hasPreview( next, 'a' ) ).toBe( false );
		expect( getBlockPreview( next, 'a' ) ).toBe( PREVIEW_DEFAULTS );
	} );

	it( 'ignores non-preview keys in the patch', () => {
		const next = reducer(
			{},
			setPreview( 'a', {
				animationPreviewPlaying: true,
				animationType: 'fade',
			} )
		);
		expect( next.a.animationType ).toBeUndefined();
	} );

	it( 'stores and clears the scrub position', () => {
		const state = reducer(
			{},
			setPreview( 'a', { animationScrubPosition: 40 } )
		);
		expect( state.a.animationScrubPosition ).toBe( 40 );
		const next = reducer(
			state,
			setPreview( 'a', { animationScrubPosition: undefined } )
		);
		expect( hasPreview( next, 'a' ) ).toBe( false );
	} );
} );

describe( 'reducer: CLEAR_PREVIEW', () => {
	const full = {
		animationPreviewPlaying: true,
		animationPreviewSlot: 'exit',
		animationPreviewEnabled: true,
		animationFromToPreviewSide: 'end',
		animationFromToActiveSide: 'end',
		animationScrubPosition: 40,
	};

	it( 'with keepPrefs resets the transient keys and keeps side + eye', () => {
		const state = { a: full };
		const next = reducer( state, clearPreview( 'a', { keepPrefs: true } ) );
		expect( next.a ).toEqual( {
			...PREVIEW_DEFAULTS,
			animationPreviewEnabled: true,
			animationFromToActiveSide: 'end',
		} );
	} );

	it( 'with keepPrefs removes an entry that only had transient keys', () => {
		const state = reducer(
			{},
			setPreview( 'a', {
				animationPreviewPlaying: true,
				animationFromToPreviewSide: 'start',
			} )
		);
		const next = reducer( state, clearPreview( 'a', { keepPrefs: true } ) );
		expect( hasPreview( next, 'a' ) ).toBe( false );
	} );

	it( 'with keepPrefs returns the same state when nothing is transient', () => {
		const state = {
			a: { ...PREVIEW_DEFAULTS, animationPreviewEnabled: true },
		};
		expect(
			reducer( state, clearPreview( 'a', { keepPrefs: true } ) )
		).toBe( state );
	} );

	it( 'without keepPrefs deletes the entry', () => {
		const b = { ...full };
		const state = { a: full, b };
		const next = reducer( state, clearPreview( 'a' ) );
		expect( hasPreview( next, 'a' ) ).toBe( false );
		expect( next.b ).toBe( b );
		expect( state.a ).toBe( full );
	} );

	it( 'returns the same state for ids with no entry', () => {
		const state = { a: full };
		expect( reducer( state, clearPreview( [ 'x', 'y' ] ) ) ).toBe( state );
		expect(
			reducer( state, clearPreview( 'x', { keepPrefs: true } ) )
		).toBe( state );
	} );

	it( 'clears several ids in one action', () => {
		const state = { a: full, b: full };
		const next = reducer( state, clearPreview( [ 'a', 'b' ] ) );
		expect( next ).toEqual( {} );
	} );
} );

describe( 'reducer: other actions', () => {
	it( 'starts empty and ignores unknown actions', () => {
		const state = reducer( undefined, { type: '@@INIT' } );
		expect( state ).toEqual( {} );
		expect( reducer( state, { type: 'OTHER' } ) ).toBe( state );
	} );
} );

describe( 'selectors', () => {
	it( 'getBlockPreview returns the frozen defaults for unknown ids', () => {
		expect( getBlockPreview( {}, 'x' ) ).toBe( PREVIEW_DEFAULTS );
		expect( getBlockPreview( { a: {} }, 'y' ) ).toBe( PREVIEW_DEFAULTS );
	} );

	it( 'getBlockPreview returns the stored entry', () => {
		const entry = { ...PREVIEW_DEFAULTS, animationPreviewPlaying: true };
		expect( getBlockPreview( { a: entry }, 'a' ) ).toBe( entry );
	} );

	it( 'hasPreview reports whether an entry exists', () => {
		expect( hasPreview( { a: PREVIEW_DEFAULTS }, 'a' ) ).toBe( true );
		expect( hasPreview( { a: PREVIEW_DEFAULTS }, 'b' ) ).toBe( false );
	} );
} );

describe( 'splitPreviewPatch', () => {
	it( 'splits a mixed patch (resetSettings / switchModeAttributes shape)', () => {
		const { preview, rest } = splitPreviewPatch( {
			animationMode: 'page-load',
			animationPreviewPlaying: false,
			animationPreviewSlot: 'entry',
			animationType: 'fade',
		} );
		expect( preview ).toEqual( {
			animationPreviewPlaying: false,
			animationPreviewSlot: 'entry',
		} );
		expect( rest ).toEqual( {
			animationMode: 'page-load',
			animationType: 'fade',
		} );
	} );

	it( 'returns rest null for a preview-only patch', () => {
		const { preview, rest } = splitPreviewPatch( {
			animationFromToPreviewSide: 'start',
			animationScrubPosition: undefined,
		} );
		expect( preview ).toEqual( {
			animationFromToPreviewSide: 'start',
			animationScrubPosition: undefined,
		} );
		expect( 'animationScrubPosition' in preview ).toBe( true );
		expect( rest ).toBeNull();
	} );

	it( 'returns preview null for an attribute-only patch', () => {
		const { preview, rest } = splitPreviewPatch( { animationDuration: 1 } );
		expect( preview ).toBeNull();
		expect( rest ).toEqual( { animationDuration: 1 } );
	} );

	it( 'handles an empty patch', () => {
		expect( splitPreviewPatch( {} ) ).toEqual( {
			preview: null,
			rest: null,
		} );
	} );
} );

describe( 'overlayPreviewState', () => {
	it( 'replaces legacy saved values when there is no entry', () => {
		const attrs = {
			animationType: 'custom',
			animationFromToPreviewSide: 'start',
			animationScrubPosition: 40,
			animationPreviewPlaying: true,
			animationPreviewSlot: 'exit',
		};
		const out = overlayPreviewState( attrs, getBlockPreview( {}, 'a' ) );
		expect( out.animationFromToPreviewSide ).toBe( 'off' );
		expect( out.animationScrubPosition ).toBeUndefined();
		expect( out.animationPreviewPlaying ).toBe( false );
		expect( out.animationPreviewSlot ).toBe( 'entry' );
		expect( out.animationType ).toBe( 'custom' );
		expect( out ).not.toBe( attrs );
		expect( attrs.animationPreviewPlaying ).toBe( true );
	} );

	it( 'applies the store entry over the attributes', () => {
		const entry = {
			...PREVIEW_DEFAULTS,
			animationFromToPreviewSide: 'end',
			animationScrubPosition: 25,
		};
		const out = overlayPreviewState(
			{ animationFromToPreviewSide: 'off' },
			entry
		);
		expect( out.animationFromToPreviewSide ).toBe( 'end' );
		expect( out.animationScrubPosition ).toBe( 25 );
	} );
} );

describe( 'resetPreviewUiAttributes', () => {
	const blockType = {
		attributes: {
			animationType: { type: 'string', default: '' },
			animationPreviewPlaying: { type: 'boolean', default: false },
			animationPreviewSlot: { type: 'string', default: 'entry' },
			animationPreviewEnabled: { type: 'boolean', default: false },
			animationFromToPreviewSide: { type: 'string', default: 'off' },
			animationFromToActiveSide: { type: 'string', default: 'start' },
			animationScrubPosition: { type: 'number' },
		},
	};

	it( 'resets all six keys to their registered defaults', () => {
		const attrs = {
			animationType: 'custom',
			animationPreviewPlaying: true,
			animationPreviewSlot: 'exit',
			animationPreviewEnabled: true,
			animationFromToPreviewSide: 'start',
			animationFromToActiveSide: 'end',
			animationScrubPosition: 40,
		};
		const out = resetPreviewUiAttributes( attrs, blockType );
		expect( out ).toEqual( {
			animationType: 'custom',
			animationPreviewPlaying: false,
			animationPreviewSlot: 'entry',
			animationPreviewEnabled: false,
			animationFromToPreviewSide: 'off',
			animationFromToActiveSide: 'start',
		} );
		expect( 'animationScrubPosition' in out ).toBe( false );
		expect( attrs.animationPreviewPlaying ).toBe( true );
	} );

	it( 'returns the same object when nothing needs resetting', () => {
		const attrs = {
			animationType: 'fade',
			animationPreviewPlaying: false,
			animationPreviewSlot: 'entry',
			animationFromToPreviewSide: 'off',
		};
		expect( resetPreviewUiAttributes( attrs, blockType ) ).toBe( attrs );
	} );

	it( 'leaves keys the block type did not register alone', () => {
		const attrs = { animationFromToPreviewSide: 'start' };
		expect( resetPreviewUiAttributes( attrs, { attributes: {} } ) ).toBe(
			attrs
		);
		expect( resetPreviewUiAttributes( attrs, {} ) ).toBe( attrs );
	} );

	it( 'resets only the stale keys and keeps every other value', () => {
		const attrs = {
			animationType: 'custom',
			animationFromOpacity: 0,
			animationFromToPreviewSide: 'start',
			animationPreviewSlot: 'entry',
		};
		const out = resetPreviewUiAttributes( attrs, blockType );
		expect( out ).not.toBe( attrs );
		expect( out ).toEqual( {
			animationType: 'custom',
			animationFromOpacity: 0,
			animationFromToPreviewSide: 'off',
			animationPreviewSlot: 'entry',
		} );
	} );

	it( 'does not add keys that were absent', () => {
		const attrs = { animationScrubPosition: 40 };
		const out = resetPreviewUiAttributes( attrs, blockType );
		expect( out ).toEqual( {} );
	} );

	it( 'works with the blocks.getBlockAttributes filter arguments', () => {
		// ( attributes, blockType, innerHTML, rawAttributes )
		const attrs = { animationPreviewPlaying: true };
		const out = resetPreviewUiAttributes( attrs, blockType, '<p>Hi</p>', {
			animationPreviewPlaying: true,
		} );
		expect( out ).toEqual( { animationPreviewPlaying: false } );
	} );

	it( 'passes non-object attributes through', () => {
		expect( resetPreviewUiAttributes( undefined, blockType ) ).toBe(
			undefined
		);
		expect( resetPreviewUiAttributes( null, blockType ) ).toBe( null );
	} );

	it( 'resets to exactly PREVIEW_DEFAULTS for the registered schema', () => {
		const stale = {
			animationPreviewPlaying: true,
			animationPreviewSlot: 'exit',
			animationPreviewEnabled: true,
			animationFromToPreviewSide: 'end',
			animationFromToActiveSide: 'end',
			animationScrubPosition: 75,
		};
		const out = resetPreviewUiAttributes( stale, blockType );
		PREVIEW_UI_KEYS.forEach( ( key ) => {
			expect( out[ key ] ).toBe( PREVIEW_DEFAULTS[ key ] );
		} );
	} );
} );

/**
 * The editor flows withAnimationControls drives (router + selection
 * cleanup), replayed against the pure reducer.
 */
describe( 'editor flows', () => {
	// What routedSetAttributes does with one patch: preview keys to the
	// store for the target ids, the rest returned for the block.
	function route( state, patch, ids ) {
		const { preview, rest } = splitPreviewPatch( patch );
		return {
			state: preview ? reducer( state, setPreview( ids, preview ) ) : state,
			rest,
		};
	}

	it( 'Play on a multi-selection stops on every block when they leave it', () => {
		let { state, rest } = route(
			{},
			{ animationPreviewPlaying: true },
			[ 'a', 'b' ]
		);
		expect( rest ).toBeNull();
		expect( getBlockPreview( state, 'a' ).animationPreviewPlaying ).toBe(
			true
		);
		expect( getBlockPreview( state, 'b' ).animationPreviewPlaying ).toBe(
			true
		);
		// Each block's own inSelection effect fires on deselect.
		state = reducer( state, clearPreview( 'a', { keepPrefs: true } ) );
		state = reducer( state, clearPreview( 'b', { keepPrefs: true } ) );
		expect( state ).toEqual( {} );
	} );

	it( 'a late Play timer stop does not recreate cleared or removed entries', () => {
		let { state } = route(
			{},
			{ animationPreviewPlaying: true, animationPreviewSlot: 'exit' },
			[ 'a', 'b' ]
		);
		state = reducer( state, clearPreview( 'a' ) ); // unmount (undo of insert)
		state = reducer( state, clearPreview( 'b', { keepPrefs: true } ) );
		const before = state;
		( { state } = route(
			state,
			{ animationPreviewPlaying: false },
			[ 'a', 'b' ]
		) );
		expect( state ).toBe( before );
		expect( hasPreview( state, 'a' ) ).toBe( false );
		expect( hasPreview( state, 'b' ) ).toBe( false );
	} );

	it( 'deselect keeps the side and the Scroll Interactive eye only', () => {
		let { state } = route(
			{},
			{
				animationFromToActiveSide: 'end',
				animationFromToPreviewSide: 'end',
				animationPreviewSlot: 'exit',
				animationPreviewEnabled: true,
				animationScrubPosition: 30,
			},
			[ 'a' ]
		);
		state = reducer( state, clearPreview( 'a', { keepPrefs: true } ) );
		expect( getBlockPreview( state, 'a' ) ).toEqual( {
			...PREVIEW_DEFAULTS,
			animationFromToActiveSide: 'end',
			animationPreviewEnabled: true,
		} );
	} );

	it( 'a mixed patch sends only real attributes to the block', () => {
		const { state, rest } = route(
			{ a: { ...PREVIEW_DEFAULTS, animationPreviewPlaying: true } },
			{
				animationType: '',
				animationPreviewPlaying: false,
				animationPreviewSlot: 'entry',
			},
			[ 'a' ]
		);
		expect( rest ).toEqual( { animationType: '' } );
		expect( state ).toEqual( {} );
	} );
} );
