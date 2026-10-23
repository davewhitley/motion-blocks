/**
 * Motion Blocks — when a finished animation may be dropped (GH #20)
 *
 * `animation-fill-mode: both` keeps an animation's last keyframe
 * applied forever. For an entry effect that last frame looks like the
 * block's natural state, but it is a *resolved* value, not `none`:
 * `translate(0, 0)` (and even `transform: none` in a keyframe) computes
 * to `matrix(1, 0, 0, 1, 0, 0)`, Blur ends at `filter: blur(0px)`, and
 * Wipe / Curtain end at `clip-path: inset(0 0 0 0)`. A transform or
 * filter makes the block a containing block for `position: fixed`
 * descendants, and the inset clip-path clips them to the block, so a
 * Navigation block's full-screen mobile overlay rendered inside the
 * nav long after the animation had finished.
 *
 * frontend.js adds `.mb-settled` to a block once its animation has
 * finished, and animations.css then drops the animation. These
 * predicates decide when that is safe:
 *
 *   - `endsAtRest()`: the last frame must BE the block's natural look,
 *     or dropping the animation would snap it back (Out presets end
 *     hidden, Image Zoom ends zoomed in, Custom may end anywhere).
 *   - `settleTargets()`: the elements whose animations must all have
 *     finished, or null when the block can't be settled without
 *     touching a nested animated block.
 *   - `isOneShotPageLoad()` / `isOneShotScrollAppear()`: the block can
 *     never play again (Page Load Repeat Once; Scroll Appear Entry
 *     Replay Once with no Exit).
 *
 * The editor's "May break the menu overlay" warning reads the same
 * predicates through `settleBlockers()`, which lists why a block will
 * keep its last frame, so the panel can't drift from what the front
 * end actually settles.
 *
 * Dependency-free (apart from the Custom value allowlist) so the
 * front-end bundle stays small.
 */

import { isValidFromToValue } from './css-values';
import { staggerTargets } from './stagger-index';

/**
 * Preset entry effects whose last keyframe is the block's natural look
 * (opacity 1, no offset, scale 1, no blur, no rotation, no clip).
 * The `-out` presets end hidden, and Image Move / Image Zoom end moved
 * or zoomed, so they are deliberately absent. Custom is decided per
 * block by `customEndsAtRest()`.
 */
export const REST_END_TYPES = [
	'fade',
	'slide',
	'scale',
	'blur',
	'rotate',
	'flip',
	'wipe',
	'curtain',
];

const ZERO_TOKEN = /^[-+]?(?:0+(?:\.0*)?|\.0+)(?:[a-z]+|%)?$/i;

/**
 * Whether a clip-path value clips nothing: `none`, or an `inset()`
 * whose one to four offsets are all zero (no `round` corners).
 *
 * @param {string} value Clip-path value.
 * @return {boolean} True when it leaves the whole box visible.
 */
function isNeutralClipPath( value ) {
	const s = String( value ).trim().toLowerCase();
	if ( s === 'none' ) {
		return true;
	}
	const match = s.match( /^inset\(([^)]*)\)$/ );
	if ( ! match ) {
		return false;
	}
	const tokens = match[ 1 ].trim().split( /\s+/ );
	return (
		tokens.length >= 1 &&
		tokens.length <= 4 &&
		tokens.every( ( token ) => ZERO_TOKEN.test( token ) )
	);
}

/**
 * Whether `value` leaves property `id` at its natural state.
 *
 * @param {string} id    Property id (opacity, translateX, …, clipPath).
 * @param {*}      value A value that passed isValidFromToValue().
 * @return {boolean} True when it's neutral.
 */
function isNeutralValue( id, value ) {
	switch ( id ) {
		case 'opacity':
			// Opacity is clamped at 1, so anything above is fully opaque.
			return parseFloat( value ) >= 1;
		case 'scale':
			return parseFloat( value ) === 1;
		case 'clipPath':
			return isNeutralClipPath( value );
		default:
			// translateX / Y, rotate, rotateX / Y, blur: zero in any unit.
			return parseFloat( value ) === 0;
	}
}

const CUSTOM_PROPERTY_IDS = [
	'opacity',
	'translateX',
	'translateY',
	'scale',
	'rotate',
	'rotateX',
	'rotateY',
	'blur',
	'clipPath',
];

/**
 * Whether a Custom effect's End (To) side is the block's natural look.
 *
 * Reads `dataset[ toPrefix + PropertyId ]`, the same keys frontend.js
 * `buildSideBody()` builds the keyframe from. A value that fails the
 * allowlist is ignored, because the keyframe drops it too; a property
 * with no To value ends at the block's own (natural) value.
 *
 * @param {DOMStringMap|Object} dataset  The block's data attributes.
 * @param {string}              toPrefix 'mbTo' (Page Load) or
 *                                       'mbEntryTo' (Scroll Appear Entry).
 * @return {boolean} True when every valid To value is neutral.
 */
export function customEndsAtRest( dataset, toPrefix ) {
	return CUSTOM_PROPERTY_IDS.every( ( id ) => {
		const value =
			dataset[ toPrefix + id.charAt( 0 ).toUpperCase() + id.slice( 1 ) ];
		if ( ! isValidFromToValue( id, value ) ) {
			return true;
		}
		return isNeutralValue( id, value );
	} );
}

/**
 * Whether effect `type` finishes at the block's natural look, so its
 * filled last frame can be dropped without a visible change.
 *
 * @param {string}              type     Effect type (data-mb-type or
 *                                       data-mb-entry-type).
 * @param {DOMStringMap|Object} dataset  The block's data attributes.
 * @param {string}              toPrefix Dataset prefix of the Custom
 *                                       To values ('mbTo' / 'mbEntryTo').
 * @return {boolean} True when it ends at rest.
 */
export function endsAtRest( type, dataset, toPrefix ) {
	if ( REST_END_TYPES.indexOf( type ) !== -1 ) {
		return true;
	}
	if ( type === 'custom' ) {
		return customEndsAtRest( dataset, toPrefix );
	}
	return false;
}

/**
 * Whether a Page Load block plays once and stops, so it can settle.
 * Loop and Alternate run forever.
 *
 * @param {string} repeat data-mb-repeat / animationRepeat.
 * @return {boolean} True for a one-shot Page Load.
 */
export function isOneShotPageLoad( repeat ) {
	return repeat !== 'loop' && repeat !== 'alternate';
}

/**
 * Whether a Scroll Appear block's Entry can never play again: Replay
 * Once and no Exit slot (an Exit plays, and reverses, on every pass).
 *
 * @param {string}  entryReplay data-mb-entry-replay / animationEntryReplay.
 * @param {boolean} hasExit     Whether the Exit slot has an effect.
 * @return {boolean} True for a one-shot Scroll Appear Entry.
 */
export function isOneShotScrollAppear( entryReplay, hasExit ) {
	return entryReplay === 'once' && ! hasExit;
}

/**
 * Why a block keeps its last frame, in the order the editor lists the
 * fixes. Each id is one fix line in the "May break the menu overlay"
 * warning.
 */
export const SETTLE_BLOCKERS = [
	'interactive',
	'loop',
	'replay',
	'exit',
	'not-at-rest',
	'custom-end',
];

/**
 * Why effect `type` can't settle, or null when it ends at rest.
 *
 * @param {string}              type     Effect type.
 * @param {DOMStringMap|Object} dataset  Custom To values (see endsAtRest).
 * @param {string}              toPrefix 'mbTo' or 'mbEntryTo'.
 * @return {?string} 'custom-end', 'not-at-rest' or null.
 */
export function effectBlocker( type, dataset, toPrefix ) {
	if ( endsAtRest( type, dataset, toPrefix ) ) {
		return null;
	}
	return type === 'custom' ? 'custom-end' : 'not-at-rest';
}

/**
 * Every reason a block's animation will keep its last frame applied
 * (and so keep trapping `position: fixed` descendants), as ids from
 * SETTLE_BLOCKERS in that order. An empty list means frontend.js
 * settles it once it finishes (unless `settleTargets()` skips it).
 *
 * Scroll Interactive shares `animationType` and the To keys with Page
 * Load, so it reports the effect reason too: switching mode alone
 * would not settle an Out preset.
 *
 * @param {Object}              config             The block's resolved config.
 * @param {string}              config.mode        Animation mode.
 * @param {string}              config.type        Page Load / Scroll Interactive effect.
 * @param {string}              config.repeat      Page Load Repeat.
 * @param {string}              config.entryType   Scroll Appear Entry effect.
 * @param {string}              config.entryReplay Scroll Appear Entry Replay.
 * @param {string}              config.exitType    Scroll Appear Exit effect.
 * @param {DOMStringMap|Object} dataset            Custom To values, keyed
 *                                                 like the front-end dataset.
 * @return {string[]} Blocker ids.
 */
export function settleBlockers(
	{ mode, type, repeat, entryType, entryReplay, exitType },
	dataset
) {
	const found = [];
	if ( mode === 'scroll-appear' ) {
		if ( entryType && entryReplay !== 'once' ) {
			found.push( 'replay' );
		}
		if ( exitType ) {
			found.push( 'exit' );
		}
		if ( entryType ) {
			found.push( effectBlocker( entryType, dataset, 'mbEntryTo' ) );
		}
	} else {
		if ( mode === 'scroll-interactive' ) {
			found.push( 'interactive' );
		} else if ( ! isOneShotPageLoad( repeat ) ) {
			found.push( 'loop' );
		}
		found.push( effectBlocker( type, dataset, 'mbTo' ) );
	}
	return SETTLE_BLOCKERS.filter( ( id ) => found.indexOf( id ) !== -1 );
}

/**
 * The elements a block's own animation runs on: the wrapper, a Stagger
 * parent's children (both forms, GH #66) and an img-target block's
 * `img:first-of-type` — the same targets the `.mb-settled` rules in
 * animations.css reach.
 *
 * Returns null when settling would touch a nested animated block: a
 * Stagger child that is itself animated, or an image the img-target
 * selector also matches inside a nested animated block. Those blocks
 * keep their fill instead.
 *
 * @param {Element} el Block wrapper (`.mb-animated`).
 * @return {Element[]|null} Targets, or null to skip settling.
 */
export function settleTargets( el ) {
	const targets = [ el ];
	if ( el.classList.contains( 'mb-stagger-parent' ) ) {
		const children = staggerTargets( el ).map( ( t ) => t.el );
		for ( let i = 0; i < children.length; i++ ) {
			if ( children[ i ].classList.contains( 'mb-animated' ) ) {
				return null;
			}
			targets.push( children[ i ] );
		}
	}
	if ( el.getAttribute( 'data-mb-target' ) === 'img' ) {
		const images = el.querySelectorAll( 'img:first-of-type' );
		for ( let i = 0; i < images.length; i++ ) {
			if ( images[ i ].closest( '.mb-animated' ) !== el ) {
				return null;
			}
			targets.push( images[ i ] );
		}
	}
	return targets;
}
