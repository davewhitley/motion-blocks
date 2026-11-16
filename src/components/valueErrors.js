/**
 * Why a free-form CSS value will be ignored (GH #59). Used by
 * ValidatedTextControl for the Clip path and Custom timing function
 * fields.
 */
import { __ } from '@wordpress/i18n';

import { isValidFromToValue } from '../css-values';

/**
 * @param {string} value What is in the Custom timing function field.
 * @return {string|null} Why it will be ignored, or null when it is
 *     usable (or empty: the default is used, which the field's help
 *     already covers).
 */
export function timingFunctionError( value ) {
	const text = String( value ?? '' ).trim();
	if (
		! text ||
		typeof window === 'undefined' ||
		! window.CSS ||
		! window.CSS.supports
	) {
		return null;
	}
	return window.CSS.supports( 'animation-timing-function', text )
		? null
		: __( 'This is not a valid CSS timing function.', 'motion-blocks' );
}

/**
 * @param {string} value What is in the Clip path field.
 * @return {string|null} Why it will be ignored, or null.
 */
export function clipPathError( value ) {
	const text = String( value ?? '' ).trim();
	if ( ! text || isValidFromToValue( 'clipPath', text ) ) {
		return null;
	}
	return __(
		'This is not a clip-path value this field accepts. Example: inset(0 50% 0 0).',
		'motion-blocks'
	);
}
