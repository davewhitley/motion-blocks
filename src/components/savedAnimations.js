/**
 * Pure helpers for the saved-animation library.
 *
 * Storage shape (lives at `mb_saved_animations` site option, exposed
 * via REST):
 *
 *   {
 *     [uid]: {
 *       name: string,
 *       createdAt: ISO string,
 *       attributes: { animation*: ... }
 *     }
 *   }
 *
 * Keep this module side-effect-free — no React, no WP store calls.
 * All the React/store glue lives in AnimationOptionsMenu.
 */

/**
 * UI-only attributes that should never be persisted. They're the
 * editor's ephemeral state (which side is being edited, whether the
 * preview is on) and would surprise users if restored on apply.
 */
const STRIP_KEYS = [
	'animationFromToActiveSide',
	'animationFromToPreviewSide',
];

/**
 * Filter out UI-state keys from a picked animation-attributes bag.
 *
 * @param {Object} picked Output of pickAnimationAttributes(attributes).
 * @return {Object}
 */
export function stripUiState( picked ) {
	const out = {};
	Object.keys( picked ).forEach( ( key ) => {
		if ( ! STRIP_KEYS.includes( key ) ) {
			out[ key ] = picked[ key ];
		}
	} );
	return out;
}

/**
 * Generate a short random id for a saved animation. Not cryptographic
 * — just enough entropy that two saves in the same second don't collide.
 *
 * @return {string} 8-character base36 string.
 */
export function generateUid() {
	return Math.random().toString( 36 ).slice( 2, 10 );
}

/**
 * Sort saved animations for menu display: newest first, then by name
 * for ties. Returns an array of [uid, saved] tuples ready for .map.
 *
 * @param {Object} library uid-keyed library.
 * @return {Array<[string, Object]>}
 */
export function sortLibrary( library ) {
	const entries = Object.entries( library || {} );
	entries.sort( ( a, b ) => {
		const ta = a[ 1 ]?.createdAt || '';
		const tb = b[ 1 ]?.createdAt || '';
		if ( ta !== tb ) {
			return tb.localeCompare( ta );
		}
		const na = a[ 1 ]?.name || '';
		const nb = b[ 1 ]?.name || '';
		return na.localeCompare( nb );
	} );
	return entries;
}
