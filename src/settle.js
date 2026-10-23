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
