/**
 * Translatable effect and direction names for the panel (GH #54, #89).
 *
 * The English wording lives in `effectCatalog` / `directionLabels` in
 * shared-constants.json, which agents and schema/README.md read. The
 * panel needs the same words as string literals in `__()` calls, or
 * `wp i18n make-pot` can't find them and a translated site shows them
 * in English. tests/unit/recipe-coverage.test.js checks the two lists
 * match, so a renamed or new effect fails the build until both agree.
 */
import { __ } from '@wordpress/i18n';

/** Effect names, keyed by effect value. */
export const EFFECT_LABELS = {
	fade: __( 'Fade In', 'motion-blocks' ),
	'fade-out': __( 'Fade Out', 'motion-blocks' ),
	slide: __( 'Slide In', 'motion-blocks' ),
	'slide-out': __( 'Slide Out', 'motion-blocks' ),
	wipe: __( 'Wipe', 'motion-blocks' ),
	curtain: __( 'Curtain Open', 'motion-blocks' ),
	'curtain-out': __( 'Curtain Close', 'motion-blocks' ),
	flip: __( 'Flip', 'motion-blocks' ),
	scale: __( 'Scale In', 'motion-blocks' ),
	'scale-out': __( 'Scale Out', 'motion-blocks' ),
	blur: __( 'Blur In', 'motion-blocks' ),
	'blur-out': __( 'Blur Out', 'motion-blocks' ),
	rotate: __( 'Rotate In', 'motion-blocks' ),
	'rotate-out': __( 'Rotate Out', 'motion-blocks' ),
	'image-move': __( 'Image Move (Beta)', 'motion-blocks' ),
	'image-zoom': __( 'Image Zoom (Beta)', 'motion-blocks' ),
	custom: __( 'Custom', 'motion-blocks' ),
};

/**
 * Names in the Exit slot, where they differ: the slot stores the base
 * value (`'curtain'`) and plays its Out keyframe (`exitLabel` in the
 * catalog).
 */
export const EXIT_EFFECT_LABELS = {
	fade: __( 'Fade Out', 'motion-blocks' ),
	slide: __( 'Slide Out', 'motion-blocks' ),
	curtain: __( 'Curtain Close', 'motion-blocks' ),
	flip: __( 'Flip Out', 'motion-blocks' ),
	scale: __( 'Scale Out', 'motion-blocks' ),
	blur: __( 'Blur Out', 'motion-blocks' ),
	rotate: __( 'Rotate Out', 'motion-blocks' ),
};

/** Direction names, keyed by direction value. */
export const DIRECTION_LABELS = {
	btt: __( 'Bottom to top', 'motion-blocks' ),
	ttb: __( 'Top to bottom', 'motion-blocks' ),
	ltr: __( 'Left to right', 'motion-blocks' ),
	rtl: __( 'Right to left', 'motion-blocks' ),
	horizontal: __( 'Horizontal', 'motion-blocks' ),
	vertical: __( 'Vertical', 'motion-blocks' ),
	none: __( 'None', 'motion-blocks' ),
};
