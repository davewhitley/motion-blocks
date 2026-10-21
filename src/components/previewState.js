/**
 * Editor preview state (GH #29) — reducer, actions, selectors and
 * helpers for the `motion-blocks/editor-preview` store.
 *
 * Play, the From/To eye, the Start/End side, the Entry/Exit preview
 * slot, the Scroll Interactive eye and the scrubber used to be block
 * attributes. Writing them added undo steps, marked the post dirty,
 * got saved into post_content and travelled with copies of the block.
 * They now live here, per clientId, outside the block-editor store.
 *
 * State shape: `{ [clientId]: entry }`, where an entry carries all six
 * PREVIEW_UI_KEYS (attribute names, so the panel can overlay an entry
 * on the block's attributes with a plain spread). A block with no
 * entry is at PREVIEW_DEFAULTS. An entry that returns to the defaults
 * is removed, so the map only holds blocks with live preview state.
 *
 * No @wordpress imports: previewStore.js registers the store. That
 * keeps this module loadable in the Jest unit tests.
 */
import { PREVIEW_DEFAULTS, PREVIEW_UI_KEYS } from './constants';

/**
 * Keys a deselect keeps for the rest of the editor session (the
 * Start/End side and the Scroll Interactive eye). Everything else
 * resets when the block leaves the selection.
 */
const PREF_KEYS = [ 'animationPreviewEnabled', 'animationFromToActiveSide' ];

const hasOwn = ( obj, key ) => Object.prototype.hasOwnProperty.call( obj, key );

function toIds( clientIds ) {
	const ids = Array.isArray( clientIds ) ? clientIds : [ clientIds ];
	return ids.filter( Boolean );
}

function isDefaultEntry( entry ) {
	return PREVIEW_UI_KEYS.every(
		( key ) => entry[ key ] === PREVIEW_DEFAULTS[ key ]
	);
}

/**
 * Write `entry` for `id` into a copy of `state`, copying
 * the map only once per action. A default entry is removed instead.
 *
 * @param {Object} state State before the action.
 * @param {Object} draft Copy made so far in this action, or `state`.
 * @param {string} id    Client id.
 * @param {Object} entry New entry.
 * @return {Object} The (possibly new) draft.
 */
function writeEntry( state, draft, id, entry ) {
	const out = draft === state ? { ...state } : draft;
	if ( isDefaultEntry( entry ) ) {
		delete out[ id ];
	} else {
		out[ id ] = entry;
	}
	return out;
}

/**
 * Reducer. Returns the same state object when an action changes
 * nothing, and keeps the entry references of untouched blocks, so
 * `useSelect` subscribers of other blocks don't re-render (GH #27).
 *
 * @param {Object} state  Current state.
 * @param {Object} action Dispatched action.
 * @return {Object} Next state.
 */
export function reducer( state = {}, action ) {
	switch ( action.type ) {
		case 'SET_PREVIEW': {
			const patch = action.patch || {};
			const keys = PREVIEW_UI_KEYS.filter( ( key ) =>
				hasOwn( patch, key )
			);
			if ( ! keys.length ) {
				return state;
			}
			let next = state;
			for ( const id of toIds( action.clientIds ) ) {
				const prev = state[ id ] || PREVIEW_DEFAULTS;
				if ( keys.every( ( key ) => prev[ key ] === patch[ key ] ) ) {
					// Covers a late `playing: false` for a block with no
					// entry (e.g. the Play timer firing after the block
					// was removed): nothing to create.
					continue;
				}
				const entry = { ...prev };
				keys.forEach( ( key ) => {
					entry[ key ] = patch[ key ];
				} );
				next = writeEntry( state, next, id, entry );
			}
			return next;
		}
		case 'CLEAR_PREVIEW': {
			let next = state;
			for ( const id of toIds( action.clientIds ) ) {
				const prev = state[ id ];
				if ( ! prev ) {
					continue;
				}
				if ( ! action.keepPrefs ) {
					if ( next === state ) {
						next = { ...state };
					}
					delete next[ id ];
					continue;
				}
				const entry = { ...PREVIEW_DEFAULTS };
				PREF_KEYS.forEach( ( key ) => {
					entry[ key ] = prev[ key ];
				} );
				if (
					PREVIEW_UI_KEYS.every(
						( key ) => entry[ key ] === prev[ key ]
					)
				) {
					continue;
				}
				next = writeEntry( state, next, id, entry );
			}
			return next;
		}
	}
	return state;
}

export const actions = {
	/**
	 * Merge preview values into one or more blocks' entries.
	 *
	 * @param {string|string[]} clientIds Block(s) to update.
	 * @param {Object}          patch     Preview keys (others ignored).
	 * @return {Object} Action.
	 */
	setPreview( clientIds, patch ) {
		return { type: 'SET_PREVIEW', clientIds, patch };
	},

	/**
	 * Clear one or more blocks' preview state. With `keepPrefs`, the
	 * Start/End side and the Scroll Interactive eye are kept for the
	 * session (deselect); without it the entry is deleted (unmount).
	 *
	 * @param {string|string[]} clientIds         Block(s) to clear.
	 * @param {Object}          options
	 * @param {boolean}         options.keepPrefs Keep side + eye.
	 * @return {Object} Action.
	 */
	clearPreview( clientIds, { keepPrefs = false } = {} ) {
		return { type: 'CLEAR_PREVIEW', clientIds, keepPrefs };
	},
};

export const selectors = {
	/**
	 * A block's preview state. Returns the stored entry, or the frozen
	 * PREVIEW_DEFAULTS object for a block with none, so the result is
	 * the same reference until that block's state changes.
	 *
	 * @param {Object} state    Store state.
	 * @param {string} clientId Block client id.
	 * @return {Object} All six preview keys.
	 */
	getBlockPreview( state, clientId ) {
		return state[ clientId ] || PREVIEW_DEFAULTS;
	},

	/**
	 * Whether a block has any non-default preview state.
	 *
	 * @param {Object} state    Store state.
	 * @param {string} clientId Block client id.
	 * @return {boolean} True when an entry exists.
	 */
	hasPreview( state, clientId ) {
		return hasOwn( state, clientId );
	},
};

/**
 * Split a setAttributes-style patch into its preview keys and the
 * real attribute keys. Either part is `null` when empty.
 *
 * @param {Object} patch Partial attributes.
 * @return {{ preview: Object|null, rest: Object|null }} Split patch.
 */
export function splitPreviewPatch( patch ) {
	let preview = null;
	let rest = null;
	Object.keys( patch || {} ).forEach( ( key ) => {
		if ( PREVIEW_UI_KEYS.includes( key ) ) {
			preview = preview || {};
			preview[ key ] = patch[ key ];
		} else {
			rest = rest || {};
			rest[ key ] = patch[ key ];
		}
	} );
	return { preview, rest };
}

/**
 * Lay a block's preview state over its attributes. All six keys always
 * come from the preview state (the defaults when there is none), so
 * values saved in older posts never take effect in the editor.
 *
 * @param {Object} attrs   Block attributes.
 * @param {Object} preview Result of getBlockPreview.
 * @return {Object} New attributes object.
 */
export function overlayPreviewState( attrs, preview ) {
	return { ...attrs, ...PREVIEW_DEFAULTS, ...preview };
}
