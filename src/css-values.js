/**
 * Allowlists for Custom From/To values.
 *
 * These values are written as text into `@keyframes` rules (front end:
 * frontend.js `buildSideBody`; editor: `buildKeyframeSide`). Each
 * property only accepts the shapes the panel itself produces, so
 * malformed input can't break the generated CSS; anything else is
 * treated as "not set".
 *
 * Mirrored in PHP by motion_blocks_valid_from_to_value() — keep the two
 * in step.
 */

const NUM = '-?(?:\\d+(?:\\.\\d+)?|\\.\\d+)';
const LENGTH_UNITS =
	'px|%|em|rem|vw|vh|vmin|vmax|svw|svh|lvw|lvh|dvw|dvh|ch|ex';
const ANGLE_UNITS = 'deg|turn|rad|grad';

const NUMBER = new RegExp( `^${ NUM }$` );
const LENGTH = new RegExp( `^${ NUM }(?:${ LENGTH_UNITS })?$`, 'i' );
const BLUR = new RegExp( `^${ NUM }(?:px|em|rem)?$`, 'i' );
const ANGLE = new RegExp( `^${ NUM }(?:${ ANGLE_UNITS })?$`, 'i' );

// `none`, a basic shape with only numbers, units, keywords, spaces,
// commas and `/` inside (no nested functions), or `path()` with an
// optional fill rule and a single quoted path string.
const CLIP_PATH = new RegExp(
	'^(?:none' +
		'|(?:inset|circle|ellipse|polygon|rect|xywh)\\([a-z0-9\\s.,%+\\-/]*\\)' +
		'|path\\(\\s*(?:(?:nonzero|evenodd)\\s*,\\s*)?' +
		'(?:"[a-z0-9\\s.,+\\-]*"|\'[a-z0-9\\s.,+\\-]*\')\\s*\\)' +
		')$',
	'i'
);

const PATTERNS = {
	opacity: NUMBER,
	scale: NUMBER,
	translateX: LENGTH,
	translateY: LENGTH,
	blur: BLUR,
	rotate: ANGLE,
	rotateX: ANGLE,
	rotateY: ANGLE,
	clipPath: CLIP_PATH,
};

// Longer than any real value (long polygons / paths stay well under).
export const MAX_FROM_TO_LENGTH = 2000;

/**
 * Whether `value` is safe and well-formed for the Custom From/To
 * property `id` (opacity, translateX, …, clipPath).
 *
 * @param {string} id    Property id from PROPERTY_DEFINITIONS.
 * @param {*}      value Raw value (number or string).
 * @return {boolean} True when the value may be written into CSS.
 */
export function isValidFromToValue( id, value ) {
	if ( value === undefined || value === null || value === '' ) {
		return false;
	}
	const pattern = PATTERNS[ id ];
	if ( ! pattern ) {
		return false;
	}
	const s = String( value ).trim();
	return s.length <= MAX_FROM_TO_LENGTH && pattern.test( s );
}
