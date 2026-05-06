/**
 * Pure helpers for the saved-animation library.
 *
 * Two sources, same shape:
 *
 * 1. USER LIBRARY — `mb_saved_animations` site option (REST).
 *    Authored in the editor; uid-keyed; each entry has a `createdAt`.
 *    Editable & deletable from the kebab menu.
 *
 *      { [uid]: { name, createdAt, attributes: { animation*: ... } } }
 *
 * 2. THEME LIBRARY — `theme.json` under
 *    `settings.custom.motionBlocks.savedAnimations`. Slug-keyed (the
 *    theme author chooses the slug); read-only from the editor.
 *
 *      // theme.json
 *      {
 *        "settings": {
 *          "custom": {
 *            "motionBlocks": {
 *              "savedAnimations": {
 *                "smooth-fade-up": {
 *                  "name": "Smooth Fade Up",
 *                  "attributes": {
 *                    "animationMode": "scroll-appear",
 *                    "animationType": "custom",
 *                    "animationFromOpacity": 0,
 *                    "animationFromTranslateY": "20px",
 *                    "animationToOpacity": 1,
 *                    "animationToTranslateY": "0px",
 *                    "animationDuration": 0.8,
 *                    "animationAcceleration": "ease-out"
 *                  }
 *                }
 *              }
 *            }
 *          }
 *        }
 *      }
 *
 * Both render in the kebab menu under separate group labels.
 * Applying either writes a copy of the attributes to the block —
 * no live link, so theme updates / library deletes don't disturb
 * blocks that previously applied an animation.
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

/**
 * Sort a theme-supplied animation library alphabetically by name.
 * Theme entries don't have `createdAt` (they're declared, not
 * authored over time), so a stable alphabetical order is the right
 * default.
 *
 * @param {Object} library slug-keyed library.
 * @return {Array<[string, Object]>}
 */
export function sortThemeLibrary( library ) {
	const entries = Object.entries( library || {} );
	entries.sort( ( a, b ) => {
		const na = a[ 1 ]?.name || a[ 0 ];
		const nb = b[ 1 ]?.name || b[ 0 ];
		return na.localeCompare( nb );
	} );
	return entries;
}
