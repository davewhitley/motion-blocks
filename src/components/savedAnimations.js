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

import { DEFAULT_ATTRIBUTES, PREVIEW_UI_KEYS } from './constants';

/**
 * Editor preview state (GH #29): Play, the From/To eye, the Start/End
 * side, the Entry/Exit preview slot, the Scroll Interactive eye and
 * the scrubber. Never part of an animation, so never copied, pasted,
 * applied or saved. Older library entries, theme.json recipes and
 * clipboard blobs may still carry some of these keys; every way in
 * strips them.
 */
const STRIP_KEYS = PREVIEW_UI_KEYS;

/**
 * Every attribute that makes up a block's animation: the keys of
 * DEFAULT_ATTRIBUTES minus the preview-state keys.
 */
const ANIMATION_KEYS = Object.keys( DEFAULT_ATTRIBUTES ).filter(
	( key ) => ! STRIP_KEYS.includes( key )
);

/**
 * Extract only the animation attributes from a full attributes object,
 * for Copy, Apply to other blocks and Save. Preview-state keys are
 * never included, even when the panel's (store-overlaid) attributes
 * carry a non-default value for one.
 *
 * @param {Object} attributes Block attributes.
 * @return {Object} Defined animation attributes.
 */
export function pickAnimationAttributes( attributes ) {
	const picked = {};
	ANIMATION_KEYS.forEach( ( key ) => {
		if ( attributes?.[ key ] !== undefined ) {
			picked[ key ] = attributes[ key ];
		}
	} );
	return picked;
}

/**
 * Filter out preview-state keys from an animation-attributes bag.
 * Used on everything that comes in from outside the block: pasted
 * clipboard data, saved and theme.json animations.
 *
 * @param {Object} picked Animation attributes.
 * @return {Object} The bag without preview keys.
 */
export function stripUiState( picked ) {
	const out = {};
	Object.keys( picked || {} ).forEach( ( key ) => {
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
	const uid = Math.random().toString( 36 ).slice( 2, 10 );
	// Never all digits: PHP turns a numeric string key into an int, and
	// a library whose keys all look like 0, 1, 2… would come back from
	// the REST API as a JSON array (2026-10-20 review, #57).
	return /^\d+$/.test( uid ) ? 'u' + uid.slice( 1 ) : uid;
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

/**
 * Persist one change to the saved-animation library (GH #28).
 *
 * - Saves only `mb_saved_animations`. The old code called
 *   `saveEditedEntityRecord( 'root', 'site', … )`, which saves every
 *   pending edit on the site entity, so an unsaved Site Title change in
 *   the Site Editor was saved along with the animation.
 * - Applies `change` to the library as it is on the server right now,
 *   not the copy this editor loaded, so an animation another admin saved
 *   in the meantime isn't dropped. Falls back to `cached` if that read
 *   fails.
 * - Rejects when the save fails (no permission, network error), so the
 *   caller can say so instead of reporting success.
 *
 * @param {Object}   io
 * @param {Function} io.fetchLibrary Resolves to the server's library.
 * @param {Function} io.saveLibrary  Saves a whole library; rejects on failure.
 * @param {Object}   [io.cached]     The library this editor has loaded.
 * @param {Function} change          Library → next library. Gets a copy.
 * @return {Promise<Object>} The library that was saved.
 */
export function saveLibraryChange( io, change ) {
	// One at a time: a second change made before the first one's save
	// lands (Save, then a quick Delete) must start from the library that
	// includes the first, or it would overwrite it.
	const run = pendingLibrarySave.then( () =>
		applyLibraryChange( io, change )
	);
	pendingLibrarySave = run.catch( () => {} );
	return run;
}

let pendingLibrarySave = Promise.resolve();

async function applyLibraryChange(
	{ fetchLibrary, saveLibrary, cached },
	change
) {
	let current = cached || {};
	try {
		const fresh = await fetchLibrary();
		if ( fresh && typeof fresh === 'object' && ! Array.isArray( fresh ) ) {
			current = fresh;
		}
	} catch ( e ) {
		// Keep the cached copy; the save below reports any real problem.
	}
	const next = change( { ...current } );
	await saveLibrary( next );
	return next;
}
