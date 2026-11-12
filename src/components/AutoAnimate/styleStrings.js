/**
 * Auto-animate style names and descriptions, shared by the dialog and the
 * preview card. plan.js keeps no UI strings.
 */
import { __ } from '@wordpress/i18n';

/** Style names for the picker. */
export const STYLE_LABELS = {
	subtle: __( 'Subtle', 'motion-blocks' ),
	balanced: __( 'Balanced', 'motion-blocks' ),
	bold: __( 'Bold', 'motion-blocks' ),
};

/** One line on what each style does, shown under the picker. */
export const STYLE_DESCRIPTIONS = {
	subtle: __(
		'Short, gentle moves. Each section rises as one piece.',
		'motion-blocks'
	),
	balanced: __(
		'Medium moves. Items in a section rise one after another.',
		'motion-blocks'
	),
	bold: __(
		'Long, large moves. Items rise one after another, more slowly.',
		'motion-blocks'
	),
};
