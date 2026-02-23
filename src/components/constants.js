/**
 * Animation type options for the type dropdown.
 */
export const ANIMATION_TYPE_OPTIONS = [
	{ label: 'Fade', value: 'fade' },
	{ label: 'Slide', value: 'slide' },
	{ label: 'Wipe', value: 'wipe' },
	{ label: 'Curtain', value: 'curtain' },
	{ label: 'Flip', value: 'flip' },
	{ label: 'Scale', value: 'scale' },
	{ label: 'Blur', value: 'blur' },
];

/**
 * Direction options per animation type.
 */
export const DIRECTION_OPTIONS = {
	slide: [
		{ label: 'Bottom to top', value: 'btt' },
		{ label: 'Top to bottom', value: 'ttb' },
		{ label: 'Left to right', value: 'ltr' },
		{ label: 'Right to left', value: 'rtl' },
	],
	wipe: [
		{ label: 'Left to right', value: 'ltr' },
		{ label: 'Right to left', value: 'rtl' },
		{ label: 'Top to bottom', value: 'ttb' },
		{ label: 'Bottom to top', value: 'btt' },
	],
	curtain: [
		{ label: 'Outward', value: 'outward' },
		{ label: 'Inward', value: 'inward' },
	],
	flip: [
		{ label: 'Left to right', value: 'ltr' },
		{ label: 'Right to left', value: 'rtl' },
		{ label: 'Top to bottom', value: 'ttb' },
		{ label: 'Bottom to top', value: 'btt' },
	],
	scale: [
		{ label: 'None', value: 'none' },
		{ label: 'Bottom to top', value: 'btt' },
		{ label: 'Top to bottom', value: 'ttb' },
		{ label: 'Left to right', value: 'ltr' },
		{ label: 'Right to left', value: 'rtl' },
	],
};

/**
 * Types that show a direction control.
 */
export const TYPES_WITH_DIRECTION = [ 'slide', 'wipe', 'curtain', 'flip', 'scale' ];

/**
 * Types that have exit animation variants.
 * Flip is entrance-only.
 */
export const TYPES_WITH_EXIT = [ 'fade', 'slide', 'wipe', 'curtain', 'scale', 'blur' ];

/**
 * Default direction when a directional type is first selected.
 */
export const DEFAULT_DIRECTION = {
	slide: 'btt',
	wipe: 'ltr',
	curtain: 'outward',
	flip: 'ltr',
	scale: 'none',
};

/**
 * CSS custom property values per type + direction.
 * Used by both editor preview and frontend to parameterize keyframes.
 */
export const DIRECTION_CSS_VARS = {
	slide: {
		ltr: { '--mb-slide-x': '-30px', '--mb-slide-y': '0' },
		rtl: { '--mb-slide-x': '30px', '--mb-slide-y': '0' },
		ttb: { '--mb-slide-x': '0', '--mb-slide-y': '-30px' },
		btt: { '--mb-slide-x': '0', '--mb-slide-y': '30px' },
	},
	wipe: {
		ltr: { '--mb-wipe-from': 'inset(0 100% 0 0)' },
		rtl: { '--mb-wipe-from': 'inset(0 0 0 100%)' },
		ttb: { '--mb-wipe-from': 'inset(100% 0 0 0)' },
		btt: { '--mb-wipe-from': 'inset(0 0 100% 0)' },
	},
	curtain: {
		outward: { '--mb-curtain-from': 'inset(0 50% 0 50%)' },
		inward: { '--mb-curtain-from': 'inset(50% 0 50% 0)' },
	},
	flip: {
		ltr: { '--mb-flip-transform': 'rotateY(-90deg)' },
		rtl: { '--mb-flip-transform': 'rotateY(90deg)' },
		ttb: { '--mb-flip-transform': 'rotateX(90deg)' },
		btt: { '--mb-flip-transform': 'rotateX(-90deg)' },
	},
	scale: {
		none: { '--mb-scale-x': '0', '--mb-scale-y': '0' },
		btt: { '--mb-scale-x': '0', '--mb-scale-y': '30px' },
		ttb: { '--mb-scale-x': '0', '--mb-scale-y': '-30px' },
		ltr: { '--mb-scale-x': '-30px', '--mb-scale-y': '0' },
		rtl: { '--mb-scale-x': '30px', '--mb-scale-y': '0' },
	},
};

/**
 * Entrance keyframe name per type.
 */
export const ENTER_KEYFRAME_MAP = {
	fade: 'mbFadeIn',
	slide: 'mbSlideIn',
	wipe: 'mbWipeIn',
	curtain: 'mbCurtainReveal',
	flip: 'mbFlipIn',
	scale: 'mbScaleIn',
	blur: 'mbBlurIn',
};

/**
 * Exit keyframe name per type.
 * Flip falls back to fade-out since it has no exit variant.
 */
export const EXIT_KEYFRAME_MAP = {
	fade: 'mbFadeOut',
	slide: 'mbSlideOut',
	wipe: 'mbWipeOut',
	curtain: 'mbCurtainClose',
	flip: 'mbFadeOut',
	scale: 'mbScaleOut',
	blur: 'mbBlurOut',
};

/**
 * Scroll in View trigger options.
 */
export const SCROLL_TRIGGER_OPTIONS = [
	{ label: 'Enter viewport', value: 'enter' },
	{ label: 'Exit viewport', value: 'exit' },
	{ label: 'Both', value: 'both' },
];

/**
 * Exit mode options (shown when trigger is 'both').
 */
export const EXIT_MODE_OPTIONS = [
	{ label: 'Mirror enter animation', value: 'mirror' },
	{ label: 'Custom exit animation', value: 'custom' },
];

/**
 * Acceleration (timing function) options.
 */
export const ACCELERATION_OPTIONS = [
	{ label: 'Ease', value: 'ease' },
	{ label: 'Linear', value: 'linear' },
	{ label: 'Ease In', value: 'ease-in' },
	{ label: 'Ease Out', value: 'ease-out' },
	{ label: 'Ease In-Out', value: 'ease-in-out' },
];

/**
 * Repeat options (page-load only).
 */
export const REPEAT_OPTIONS = [
	{ label: 'Play once', value: 'once' },
	{ label: 'Loop continuously', value: 'loop' },
	{ label: 'Back and forth', value: 'alternate' },
];

/**
 * Scroll-interactive range type options.
 */
export const RANGE_TYPE_OPTIONS = [
	{ label: 'Cover', value: 'cover' },
	{ label: 'Contain', value: 'contain' },
	{ label: 'Entry', value: 'entry' },
	{ label: 'Exit', value: 'exit' },
	{ label: 'Entry Crossing', value: 'entry-crossing' },
	{ label: 'Exit Crossing', value: 'exit-crossing' },
];

export const BLUR_SETTINGS = {
	min: 1,
	max: 20,
	step: 1,
};

export const DURATION_SETTINGS = {
	min: 0.1,
	max: 2,
	step: 0.1,
};

export const DELAY_SETTINGS = {
	min: 0,
	max: 4,
	step: 0.1,
};

/**
 * Default attribute values for all animation settings.
 */
export const DEFAULT_ATTRIBUTES = {
	animationMode: '',
	animationType: 'fade',
	animationDirection: '',
	animationDuration: 0.6,
	animationDelay: 0.4,
	animationRepeat: 'once',
	animationPauseOffscreen: true,
	animationPlayOnce: true,
	animationScrollTrigger: 'enter',
	animationExitMode: 'mirror',
	animationExitType: 'fade',
	animationExitDirection: '',
	animationExitDuration: 0.6,
	animationAcceleration: 'ease',
	animationExitDelay: 0,
	animationExitAcceleration: 'ease',
	animationBlurAmount: 8,
	animationRangeStart: 'cover 0%',
	animationRangeEnd: 'cover 100%',
};
