export const ANIMATION_OPTIONS = [
	{ label: 'Fade In', value: 'fade-in' },
	{ label: 'Slide Up', value: 'slide-up' },
	{ label: 'Slide Down', value: 'slide-down' },
	{ label: 'Slide Left', value: 'slide-left' },
	{ label: 'Slide Right', value: 'slide-right' },
	{ label: 'Zoom In', value: 'zoom-in' },
];

export const REPEAT_OPTIONS = [
	{ label: 'Play once', value: 'once' },
	{ label: 'Loop continuously', value: 'loop' },
	{ label: 'Back and forth', value: 'alternate' },
];

export const RANGE_TYPE_OPTIONS = [
	{ label: 'Cover', value: 'cover' },
	{ label: 'Contain', value: 'contain' },
	{ label: 'Entry', value: 'entry' },
	{ label: 'Exit', value: 'exit' },
	{ label: 'Entry Crossing', value: 'entry-crossing' },
	{ label: 'Exit Crossing', value: 'exit-crossing' },
];

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

export const DEFAULT_ATTRIBUTES = {
	animationMode: '',
	animationType: 'fade-in',
	animationDuration: 0.6,
	animationDelay: 0.4,
	animationRepeat: 'once',
	animationPauseOffscreen: true,
	animationPlayOnce: true,
	animationRangeStart: 'cover 0%',
	animationRangeEnd: 'cover 100%',
};
