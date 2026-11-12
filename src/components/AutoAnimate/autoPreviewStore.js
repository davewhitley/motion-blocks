/**
 * Editor-only store for the Auto-animate preview (prototype).
 *
 * While a preview is running, each planned block's animation
 * attributes live here as an "overlay" that the canvas HOC lays over
 * the block's real attributes. Nothing is written to the block-editor
 * store, so previewing never dirties the post, never adds undo steps
 * and is never saved. Undo = end the preview; Keep = one real write.
 *
 * `played` tracks which overlaid blocks have revealed (Scroll Appear
 * blocks reveal when they scroll into view in the canvas). `runId`
 * bumps on Replay / style change so blocks restart.
 */
import { createReduxStore, register } from '@wordpress/data';

export const STORE_NAME = 'motion-blocks/auto-preview';

const EMPTY = Object.freeze( {} );

const DEFAULT_STATE = {
	active: false,
	overlays: EMPTY,
	played: EMPTY,
	runId: 0,
	plan: null,
	stylePreset: 'balanced',
	// Animated blocks being replaced (reset under the new plan).
	clearIds: [],
};

function reducer( state = DEFAULT_STATE, action ) {
	switch ( action.type ) {
		case 'START':
			return {
				...state,
				active: true,
				overlays: action.overlays,
				played: EMPTY,
				runId: state.runId + 1,
				plan: action.plan,
				stylePreset: action.stylePreset,
				clearIds: action.clearIds || [],
			};
		case 'SET_OVERLAYS':
			return {
				...state,
				overlays: action.overlays,
				stylePreset: action.stylePreset,
				played: EMPTY,
				runId: state.runId + 1,
			};
		case 'MARK_PLAYED':
			if ( state.played[ action.clientId ] ) {
				return state;
			}
			return {
				...state,
				played: { ...state.played, [ action.clientId ]: true },
			};
		case 'REPLAY':
			return { ...state, played: EMPTY, runId: state.runId + 1 };
		case 'END':
			return { ...DEFAULT_STATE, runId: state.runId + 1 };
	}
	return state;
}

const actions = {
	startAutoPreview: ( overlays, plan, stylePreset, clearIds = [] ) => ( {
		type: 'START',
		overlays,
		plan,
		stylePreset,
		clearIds,
	} ),
	setAutoPreviewOverlays: ( overlays, stylePreset ) => ( {
		type: 'SET_OVERLAYS',
		overlays,
		stylePreset,
	} ),
	markAutoPreviewPlayed: ( clientId ) => ( {
		type: 'MARK_PLAYED',
		clientId,
	} ),
	replayAutoPreview: () => ( { type: 'REPLAY' } ),
	endAutoPreview: () => ( { type: 'END' } ),
};

const selectors = {
	isAutoPreviewActive: ( state ) => state.active,
	getAutoPreviewOverlays: ( state ) => state.overlays,
	getAutoPreviewRunId: ( state ) => state.runId,
	getAutoPreviewPlan: ( state ) => state.plan,
	getAutoPreviewStyle: ( state ) => state.stylePreset,
	getAutoPreviewClearIds: ( state ) => state.clearIds,
	// `undefined` for blocks not in the preview, so they ignore it.
	getAutoPreviewOverlay: ( state, clientId ) => state.overlays[ clientId ],
	isAutoPreviewPlayed: ( state, clientId ) => !! state.played[ clientId ],
};

export const store = createReduxStore( STORE_NAME, {
	reducer,
	actions,
	selectors,
} );

register( store );
