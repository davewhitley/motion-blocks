/**
 * Animation type options for the type dropdown.
 *
 * `custom` is a special type that exposes the From/To state editor.
 * Existing preset types animate via fixed @keyframes; `custom` animates
 * via a generic keyframe parameterized by CSS custom properties.
 */
export const ANIMATION_TYPE_OPTIONS = [
	{ label: 'Fade', value: 'fade' },
	{ label: 'Slide', value: 'slide' },
	{ label: 'Wipe', value: 'wipe' },
	{ label: 'Curtain', value: 'curtain' },
	{ label: 'Flip', value: 'flip' },
	{ label: 'Scale', value: 'scale' },
	{ label: 'Blur', value: 'blur' },
	{ label: 'Rotate', value: 'rotate' },
	{ label: 'Image Move (parallax)', value: 'image-move' },
	{ label: 'Custom (From / To)', value: 'custom' },
];

/**
 * Animation types that only make sense in scroll-interactive mode.
 * The PageLoad and ScrollAppear panels filter these out of their
 * effect dropdown; only ScrollInteractive offers them.
 *
 * Currently just `image-move` (parallax requires scroll progress).
 */
export const SCROLL_INTERACTIVE_ONLY_TYPES = [ 'image-move' ];

/**
 * Block types where the From/To "Target = Image only" toggle is
 * meaningful. These all have a single primary `<img>` as their main
 * subject, and animating that img specifically gives a cleaner result
 * than animating the whole block wrapper.
 *
 * Other blocks (Group, Columns, Gallery, Query Loop) are intentionally
 * omitted: for those, the right pattern is to apply the animation to
 * the inner Image block itself, not to the container.
 *
 * Theme/plugin authors can extend the list via the `motion-blocks/
 * image-targetable-blocks` JS filter (see src/index.js).
 */
export const IMAGE_TARGETABLE_BLOCKS = [
	'core/image',
	'core/post-featured-image',
	'core/site-logo',
	'core/cover',
	'core/avatar',
	'core/media-text',
];

/**
 * Block types that support the "Stagger children" toggle. When stagger
 * is enabled on one of these, the parent's animation config is applied
 * to each direct child with a stepped delay (computed via CSS
 * `:nth-child()` rules in animations.css / editor.scss). The parent
 * itself stops animating and becomes the cascade controller.
 *
 * Whitelisted because stagger only makes sense for blocks whose
 * meaningful content IS their direct children (lists, galleries, button
 * groups, etc.). For arbitrary content blocks (e.g. core/paragraph)
 * staggering "children" doesn't have a coherent meaning.
 */
export const STAGGER_CONTAINER_BLOCKS = [
	'core/group',
	'core/columns',
	'core/buttons',
	'core/gallery',
	'core/list',
];

/**
 * Animation types that don't compose with the stagger cascade in v1.
 * Custom (From/To) and image-move both use per-block @keyframes
 * injection — replicating that to N children would require N injected
 * @keyframes rules and breaks the simple `:nth-child()` model. Hide
 * the Stagger toggle (or surface a "not available" note) for these.
 */
export const STAGGER_INCOMPATIBLE_TYPES = [ 'custom', 'image-move' ];

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
		{ label: 'Horizontal', value: 'horizontal' },
		{ label: 'Vertical', value: 'vertical' },
	],
	flip: [
		{ label: 'Left to right', value: 'ltr' },
		{ label: 'Right to left', value: 'rtl' },
		{ label: 'Top to bottom', value: 'ttb' },
		{ label: 'Bottom to top', value: 'btt' },
	],
	scale: [
		{ label: 'Bottom to top', value: 'btt' },
		{ label: 'Top to bottom', value: 'ttb' },
		{ label: 'Left to right', value: 'ltr' },
		{ label: 'Right to left', value: 'rtl' },
	],
	'image-move': [
		{ label: 'Bottom to top', value: 'btt' },
		{ label: 'Top to bottom', value: 'ttb' },
		{ label: 'Left to right', value: 'ltr' },
		{ label: 'Right to left', value: 'rtl' },
	],
};

/**
 * Types that show a direction control.
 */
export const TYPES_WITH_DIRECTION = [ 'slide', 'wipe', 'curtain', 'flip', 'scale', 'image-move' ];

/**
 * Types that have exit animation variants.
 * Flip is entrance-only.
 */
export const TYPES_WITH_EXIT = [ 'fade', 'slide', 'wipe', 'curtain', 'scale', 'blur', 'rotate' ];

/**
 * Default direction when a directional type is first selected.
 */
export const DEFAULT_DIRECTION = {
	slide: 'btt',
	wipe: 'ltr',
	curtain: 'horizontal',
	flip: 'ltr',
	scale: 'none',
	'image-move': 'btt',
};

/**
 * CSS custom property values per type + direction.
 * Used by both editor preview and frontend to parameterize keyframes.
 */
export const DIRECTION_CSS_VARS = {
	slide: {
		ltr: { '--mb-slide-x': '-50px', '--mb-slide-y': '0' },
		rtl: { '--mb-slide-x': '50px', '--mb-slide-y': '0' },
		ttb: { '--mb-slide-x': '0', '--mb-slide-y': '-50px' },
		btt: { '--mb-slide-x': '0', '--mb-slide-y': '50px' },
	},
	wipe: {
		ltr: { '--mb-wipe-from': 'inset(0 100% 0 0)' },
		rtl: { '--mb-wipe-from': 'inset(0 0 0 100%)' },
		ttb: { '--mb-wipe-from': 'inset(100% 0 0 0)' },
		btt: { '--mb-wipe-from': 'inset(0 0 100% 0)' },
	},
	curtain: {
		horizontal: { '--mb-curtain-from': 'inset(0 50% 0 50%)' },
		vertical: { '--mb-curtain-from': 'inset(50% 0 50% 0)' },
	},
	flip: {
		ltr: { '--mb-flip-transform': 'rotateY(-90deg)' },
		rtl: { '--mb-flip-transform': 'rotateY(90deg)' },
		ttb: { '--mb-flip-transform': 'rotateX(90deg)' },
		btt: { '--mb-flip-transform': 'rotateX(-90deg)' },
	},
	scale: {
		none: { '--mb-scale-x': '0', '--mb-scale-y': '0' },
		btt: { '--mb-scale-x': '0', '--mb-scale-y': '50px' },
		ttb: { '--mb-scale-x': '0', '--mb-scale-y': '-50px' },
		ltr: { '--mb-scale-x': '-50px', '--mb-scale-y': '0' },
		rtl: { '--mb-scale-x': '50px', '--mb-scale-y': '0' },
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
	rotate: 'mbRotateIn',
	// `custom` intentionally not mapped — its keyframe name is
	// generated per-block (mb-custom-{clientId}) and bound inline.
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
	rotate: 'mbRotateOut',
	// `custom` intentionally not mapped — see ENTER_KEYFRAME_MAP.
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
 *
 * `custom` is a sentinel: when the user picks it, the runtime reads
 * `animationCustomTimingFunction` (or the exit equivalent) instead of
 * the preset name. Lets users enter any valid CSS timing function
 * (cubic-bezier, steps, linear() with stops, etc.).
 */
export const ACCELERATION_OPTIONS = [
	{ label: 'Ease', value: 'ease' },
	{ label: 'Linear', value: 'linear' },
	{ label: 'Ease In', value: 'ease-in' },
	{ label: 'Ease Out', value: 'ease-out' },
	{ label: 'Ease In-Out', value: 'ease-in-out' },
	{ label: 'Custom', value: 'custom' },
];

/**
 * Default custom timing function — a sensible cubic-bezier the user
 * can edit when they pick "Custom" in the acceleration dropdown.
 */
export const DEFAULT_CUSTOM_TIMING_FUNCTION = 'cubic-bezier(0.25, 0.1, 0.25, 1)';

/**
 * Resolve an acceleration attribute value to an actual CSS timing
 * function. Used by the editor preview HOC and the frontend script.
 */
export function resolveTimingFunction( acceleration, customValue ) {
	if ( acceleration === 'custom' ) {
		return customValue && customValue.trim()
			? customValue
			: DEFAULT_CUSTOM_TIMING_FUNCTION;
	}
	return acceleration || 'ease';
}

/**
 * Repeat options (page-load only).
 */
export const REPEAT_OPTIONS = [
	{ label: 'Play once', value: 'once' },
	{ label: 'Loop continuously', value: 'loop' },
	{ label: 'Back and forth', value: 'alternate' },
];

export const BLUR_SETTINGS = {
	min: 1,
	max: 20,
	step: 1,
};

/* ----------------------------------------------------------------
 * Custom (From / To) — Property definitions for the v1 editor.
 *
 * The `custom` animation type animates via a per-block @keyframes rule
 * generated from the user's added properties. Each block gets a unique
 * keyframe (mb-custom-{clientId}) containing only the properties the
 * user explicitly added on each side; CSS interpolates unspecified
 * properties to the element's computed style on that end of the timeline.
 *
 * `identity` is the value applied when the user adds a property but
 * doesn't change it (e.g. add Opacity → starts at 1).
 *
 * Translate values are stored as CSS-native strings ("20px", "10%")
 * to keep unit handling simple and CSS-side. Other values are numbers.
 * -------------------------------------------------------------- */

export const TRANSLATE_UNIT_OPTIONS = [
	{ label: 'px', value: 'px' },
	{ label: '%', value: '%' },
	{ label: 'vh', value: 'vh' },
	{ label: 'vw', value: 'vw' },
	{ label: 'em', value: 'em' },
	{ label: 'rem', value: 'rem' },
];

/**
 * v1 property set for the From/To editor.
 *
 * `kind` controls the input shape:
 *   - 'number'  : numeric input (opacity, scale, rotate)
 *   - 'length'  : value + unit selector (translateX, translateY)
 *
 * `identity` is the value used in the CSS keyframe when the attribute
 * matches the default — i.e. the property "doesn't animate".
 */
export const PROPERTY_DEFINITIONS = [
	// `withSlider: true` adds an inline RangeControl on the right
	// half of the row (matching the Figma design). Useful for
	// properties with a fixed sensible range. Properties without
	// it just render the input control alone, full-width or paired.
	{
		id: 'opacity',
		label: 'Opacity',
		kind: 'number',
		min: 0,
		max: 1,
		step: 0.05,
		identity: 1,
		withSlider: true,
	},
	{
		id: 'scale',
		label: 'Scale',
		kind: 'number',
		min: 0,
		// No `max` — input accepts arbitrarily large values. The
		// slider clamps to `sliderMax` for a sensible drag range,
		// but the user can type 6, 10, etc. in the number field.
		sliderMax: 5,
		step: 0.05,
		identity: 1,
		withSlider: true,
	},
	{
		id: 'translateX',
		label: 'Move X',
		kind: 'length',
		identity: '0px',
		halfWidth: true,
	},
	{
		id: 'translateY',
		label: 'Move Y',
		kind: 'length',
		identity: '0px',
		halfWidth: true,
	},
	{
		id: 'rotate',
		label: 'Rotate',
		kind: 'number',
		min: -180,
		max: 180,
		step: 1,
		identity: 0,
		unitSuffix: 'deg',
		withSlider: true,
	},
	// 3D rotations — when either is set on a side, the keyframe
	// includes `perspective(800px)` automatically so the rotation
	// has visible depth (matches the legacy Flip preset).
	{
		id: 'rotateX',
		label: '3D Rotate X',
		kind: 'number',
		step: 1,
		identity: 0,
		unitSuffix: 'deg',
		halfWidth: true,
	},
	{
		id: 'rotateY',
		label: '3D Rotate Y',
		kind: 'number',
		step: 1,
		identity: 0,
		unitSuffix: 'deg',
		halfWidth: true,
	},
	{
		id: 'blur',
		label: 'Blur',
		kind: 'number',
		min: 0,
		step: 1,
		identity: 0,
		unitSuffix: 'px',
	},
	// Free-form CSS clip-path string. Use raw CSS values like
	// `inset(0 50% 0 50%)` or `circle(50%)`. Identity is `inset(0)`
	// (fully visible) so an unedited side reveals the element.
	{
		id: 'clipPath',
		label: 'Clip path',
		kind: 'text',
		identity: 'inset(0)',
		placeholder: 'inset(0 50% 0 50%)',
	},
];

/**
 * Map property id → attribute name for "from" and "to" sides.
 */
export const FROM_ATTR = {
	opacity: 'animationFromOpacity',
	translateX: 'animationFromTranslateX',
	translateY: 'animationFromTranslateY',
	scale: 'animationFromScale',
	rotate: 'animationFromRotate',
	rotateX: 'animationFromRotateX',
	rotateY: 'animationFromRotateY',
	blur: 'animationFromBlur',
	clipPath: 'animationFromClipPath',
};

export const TO_ATTR = {
	opacity: 'animationToOpacity',
	translateX: 'animationToTranslateX',
	translateY: 'animationToTranslateY',
	scale: 'animationToScale',
	rotate: 'animationToRotate',
	rotateX: 'animationToRotateX',
	rotateY: 'animationToRotateY',
	blur: 'animationToBlur',
	clipPath: 'animationToClipPath',
};

/**
 * The four properties seeded into the From/To panel when the user
 * picks "Custom" for the first time on a block. All eight values
 * are identity (no visual change) so the four rows render as
 * editable form fields the user can immediately tweak. The block
 * itself doesn't move/fade/scale until the user changes a value.
 *
 * Re-seeding policy: only applied when no From/To attribute is
 * currently set on the block. If the user explicitly removes all
 * four from the panel, switching to a preset and back will re-seed
 * (since all attrs are null at that point). Switching back with
 * any From/To value still set preserves the user's work.
 */
export const CUSTOM_DEFAULT_FROM_TO = {
	animationFromOpacity: 1,
	animationToOpacity: 1,
	animationFromScale: 1,
	animationToScale: 1,
	animationFromTranslateX: '0px',
	animationToTranslateX: '0px',
	animationFromTranslateY: '0px',
	animationToTranslateY: '0px',
};

const ALL_CUSTOM_FROM_TO_KEYS = [
	...Object.values( FROM_ATTR ),
	...Object.values( TO_ATTR ),
];

/**
 * Does the block have ANY From/To property currently set? Used to
 * decide whether picking "Custom" should seed defaults — if all
 * From/To attrs are null, seed; if anything is set, preserve.
 *
 * @param {Object} attributes Block attributes.
 * @return {boolean}
 */
export function hasAnyCustomFromToSet( attributes ) {
	if ( ! attributes ) {
		return false;
	}
	return ALL_CUSTOM_FROM_TO_KEYS.some( ( key ) => {
		const v = attributes[ key ];
		return v !== null && v !== undefined;
	} );
}

/**
 * Map property id → CSS-friendly kebab name. Used for generating
 * `data-mb-from-{cssVar}` / `data-mb-to-{cssVar}` data attributes
 * the frontend reads.
 */
export const PROPERTY_CSS_VAR = {
	opacity: 'opacity',
	translateX: 'translate-x',
	translateY: 'translate-y',
	scale: 'scale',
	rotate: 'rotate',
	rotateX: 'rotate-x',
	rotateY: 'rotate-y',
	blur: 'blur',
	clipPath: 'clip-path',
};

/**
 * Compute the equivalent From/To property bag for an existing preset.
 * Returns null for presets whose effects can't be represented in v1.
 *
 * Used by the "Customize" action that converts a preset to the
 * `custom` type so the user can fine-tune its keyframe.
 *
 * @param {string} type      Animation type (fade/slide/scale/rotate).
 * @param {string} direction Direction value if the preset has one.
 * @param {Object} options   Extra preset params (e.g. rotateAngle).
 * @return {Object|null}     `{ from: {...}, to: {...} }` or null.
 */
export function getPresetFromTo( type, direction, options = {} ) {
	// Note: the End side only needs to declare values that DIFFER
	// from the element's natural rendered state. CSS interpolates
	// any unspecified property to the element's computed style.
	// This keeps Customize output minimal — e.g. fade adds opacity to
	// both sides because end=1 ≠ natural (which could be anything).
	switch ( type ) {
		case 'fade':
			return {
				from: { opacity: 0 },
				to: { opacity: 1 },
			};

		case 'slide': {
			const offsets = {
				btt: { x: '0px', y: '50px' },
				ttb: { x: '0px', y: '-50px' },
				ltr: { x: '-50px', y: '0px' },
				rtl: { x: '50px', y: '0px' },
			};
			const off = offsets[ direction ] || offsets.btt;
			return {
				from: {
					opacity: 0,
					translateX: off.x,
					translateY: off.y,
				},
				to: { opacity: 1 },
			};
		}

		case 'scale': {
			const offsets = {
				none: { x: '0px', y: '0px' },
				btt: { x: '0px', y: '50px' },
				ttb: { x: '0px', y: '-50px' },
				ltr: { x: '-50px', y: '0px' },
				rtl: { x: '50px', y: '0px' },
			};
			const off = offsets[ direction ] || offsets.none;
			const fromBag = { opacity: 0, scale: 0.75 };
			if ( off.x !== '0px' ) {
				fromBag.translateX = off.x;
			}
			if ( off.y !== '0px' ) {
				fromBag.translateY = off.y;
			}
			return {
				from: fromBag,
				to: { opacity: 1 },
			};
		}

		case 'rotate': {
			const angle = options.rotateAngle ?? 90;
			return {
				from: { opacity: 0, rotate: angle },
				to: { opacity: 1 },
			};
		}

		case 'blur': {
			const amount = options.blurAmount ?? 8;
			return {
				from: { opacity: 0, blur: amount },
				to: { opacity: 1 },
			};
		}

		case 'flip': {
			// Match the legacy Flip preset: 90deg rotate around the
			// axis perpendicular to the chosen direction; perspective
			// is added automatically by buildKeyframeSide.
			const flipDirs = {
				ltr: { rotateY: -90 },
				rtl: { rotateY: 90 },
				ttb: { rotateX: 90 },
				btt: { rotateX: -90 },
			};
			const f = flipDirs[ direction ] || flipDirs.ltr;
			return {
				from: { opacity: 0, ...f },
				to: { opacity: 1 },
			};
		}

		case 'curtain': {
			// Horizontal curtain clips left+right; vertical clips
			// top+bottom. Both reveal to a full inset(0).
			const curtainFrom =
				direction === 'vertical'
					? 'inset(50% 0 50% 0)'
					: 'inset(0 50% 0 50%)';
			return {
				from: { clipPath: curtainFrom },
				to: { clipPath: 'inset(0)' },
			};
		}

		case 'wipe': {
			const wipeDirs = {
				ltr: 'inset(0 100% 0 0)',
				rtl: 'inset(0 0 0 100%)',
				ttb: 'inset(100% 0 0 0)',
				btt: 'inset(0 0 100% 0)',
			};
			return {
				from: { clipPath: wipeDirs[ direction ] || wipeDirs.ltr },
				to: { clipPath: 'inset(0)' },
			};
		}

		case 'image-move': {
			// Parallax-style scroll. The img is held statically larger
			// than its frame (Scale = 1.2 on both sides). With the
			// img's layout box still at 100% of the parent (we scale
			// via transform, not width), the image can translate up
			// to ±(scale − 1) / 2 × 100% in either axis without
			// revealing the parent's clip edge — that's ±10% for
			// scale 1.2. We use 10% for a noticeable but contained
			// parallax effect.
			const SCALE = 1.2;
			const SHIFT = ( ( SCALE - 1 ) / 2 ) * 100; // 10% for SCALE=1.2
			const moveDirs = {
				btt: { y: SHIFT, x: 0 },
				ttb: { y: -SHIFT, x: 0 },
				ltr: { x: -SHIFT, y: 0 },
				rtl: { x: SHIFT, y: 0 },
			};
			const m = moveDirs[ direction ] || moveDirs.btt;
			const fromBag = { scale: SCALE };
			const toBag = { scale: SCALE };
			if ( m.x !== 0 ) {
				fromBag.translateX = `${ m.x }%`;
				toBag.translateX = `${ -m.x }%`;
			}
			if ( m.y !== 0 ) {
				fromBag.translateY = `${ m.y }%`;
				toBag.translateY = `${ -m.y }%`;
			}
			return { from: fromBag, to: toBag };
		}

		default:
			return null;
	}
}

/**
 * Test whether a value counts as "added" for the From/To editor.
 * `null`, `undefined`, and empty string all mean "not added".
 */
export function isPropertyAdded( value ) {
	return value !== null && value !== undefined && value !== '';
}

/**
 * Build the body of one side of a custom keyframe (the contents of
 * the `from { … }` or `to { … }` block, without the wrapper).
 *
 * Composes translate / scale / rotate into a single `transform`
 * declaration since CSS only animates one transform at a time.
 *
 * Returns null if the side has no added properties (so the keyframe
 * should omit that side entirely — CSS will use the element's
 * computed style on that end of the timeline).
 *
 * @param {Object} bag Property values keyed by property id, e.g.
 *                     `{ opacity: 0, translateX: '20px' }`.
 * @return {string|null}
 */
export function buildKeyframeSide( bag ) {
	const decls = [];
	if ( isPropertyAdded( bag.opacity ) ) {
		decls.push( `opacity: ${ bag.opacity }` );
	}

	// Compose `transform` from translate/scale/rotate(z)/rotateX/Y.
	// Adds `perspective()` only when a 3D rotation is present so 2D
	// transforms aren't paid for the cost of a stacking context.
	const transform = [];
	const has3D =
		isPropertyAdded( bag.rotateX ) || isPropertyAdded( bag.rotateY );
	if ( has3D ) {
		transform.push( 'perspective(800px)' );
	}
	const hasTx = isPropertyAdded( bag.translateX );
	const hasTy = isPropertyAdded( bag.translateY );
	if ( hasTx || hasTy ) {
		const x = hasTx ? bag.translateX : '0px';
		const y = hasTy ? bag.translateY : '0px';
		transform.push( `translate(${ x }, ${ y })` );
	}
	if ( isPropertyAdded( bag.scale ) ) {
		transform.push( `scale(${ bag.scale })` );
	}
	if ( isPropertyAdded( bag.rotate ) ) {
		transform.push( `rotate(${ bag.rotate }deg)` );
	}
	if ( isPropertyAdded( bag.rotateX ) ) {
		transform.push( `rotateX(${ bag.rotateX }deg)` );
	}
	if ( isPropertyAdded( bag.rotateY ) ) {
		transform.push( `rotateY(${ bag.rotateY }deg)` );
	}
	if ( transform.length > 0 ) {
		decls.push( `transform: ${ transform.join( ' ' ) }` );
	}

	if ( isPropertyAdded( bag.blur ) ) {
		decls.push( `filter: blur(${ bag.blur }px)` );
	}
	if ( isPropertyAdded( bag.clipPath ) ) {
		decls.push( `clip-path: ${ bag.clipPath }` );
	}

	if ( decls.length === 0 ) {
		return null;
	}
	return decls.join( '; ' ) + ';';
}

/**
 * Build a complete `@keyframes` rule from a Start/End bag pair.
 * Returns null when neither side has any added properties (so no
 * animation should be applied at all).
 *
 * @param {string} name        Keyframe name, e.g. `mb-custom-abc123`.
 * @param {Object} fromBag     Start side property bag.
 * @param {Object} toBag       End side property bag.
 * @return {string|null}
 */
export function buildCustomKeyframe( name, fromBag, toBag ) {
	const fromBody = buildKeyframeSide( fromBag || {} );
	const toBody = buildKeyframeSide( toBag || {} );
	if ( ! fromBody && ! toBody ) {
		return null;
	}
	const lines = [ `@keyframes ${ name } {` ];
	if ( fromBody ) {
		lines.push( `\tfrom { ${ fromBody } }` );
	}
	if ( toBody ) {
		lines.push( `\tto { ${ toBody } }` );
	}
	lines.push( '}' );
	return lines.join( '\n' );
}

/**
 * Compose a React inline-style object from a Start/End property bag.
 * Used by the preview-state feature to apply one side's values as
 * static styles to the block in the editor (no animation).
 *
 * Mirrors the CSS that `buildKeyframeSide` would emit, but as a
 * React-friendly camelCase style object instead of a CSS string.
 */
export function bagToReactStyles( bag ) {
	const styles = {};
	if ( isPropertyAdded( bag.opacity ) ) {
		styles.opacity = bag.opacity;
	}

	const transform = [];
	const has3D =
		isPropertyAdded( bag.rotateX ) || isPropertyAdded( bag.rotateY );
	if ( has3D ) {
		transform.push( 'perspective(800px)' );
	}
	const hasTx = isPropertyAdded( bag.translateX );
	const hasTy = isPropertyAdded( bag.translateY );
	if ( hasTx || hasTy ) {
		const x = hasTx ? bag.translateX : '0px';
		const y = hasTy ? bag.translateY : '0px';
		transform.push( `translate(${ x }, ${ y })` );
	}
	if ( isPropertyAdded( bag.scale ) ) {
		transform.push( `scale(${ bag.scale })` );
	}
	if ( isPropertyAdded( bag.rotate ) ) {
		transform.push( `rotate(${ bag.rotate }deg)` );
	}
	if ( isPropertyAdded( bag.rotateX ) ) {
		transform.push( `rotateX(${ bag.rotateX }deg)` );
	}
	if ( isPropertyAdded( bag.rotateY ) ) {
		transform.push( `rotateY(${ bag.rotateY }deg)` );
	}
	if ( transform.length > 0 ) {
		styles.transform = transform.join( ' ' );
	}

	if ( isPropertyAdded( bag.blur ) ) {
		styles.filter = `blur(${ bag.blur }px)`;
	}
	if ( isPropertyAdded( bag.clipPath ) ) {
		styles.clipPath = bag.clipPath;
	}

	return styles;
}

/**
 * Extract a Start/End bag from a flat attributes object.
 *
 * @param {Object} attributes Block attributes.
 * @param {Object} attrMap    FROM_ATTR or TO_ATTR.
 * @return {Object}
 */
export function attrsToBag( attributes, attrMap ) {
	const bag = {};
	for ( const def of PROPERTY_DEFINITIONS ) {
		const val = attributes[ attrMap[ def.id ] ];
		if ( isPropertyAdded( val ) ) {
			bag[ def.id ] = val;
		}
	}
	return bag;
}


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
	animationCustomTimingFunction: DEFAULT_CUSTOM_TIMING_FUNCTION,
	animationExitDelay: 0,
	animationExitAcceleration: 'ease',
	animationExitCustomTimingFunction: DEFAULT_CUSTOM_TIMING_FUNCTION,
	animationBlurAmount: 8,
	animationRotateAngle: 90,
	animationRangeStart: 'entry 0%',
	animationRangeEnd: 'exit 100%',
	// Custom (Start / End) — null = "user has not added this property
	// to this side". Adding a property writes its identity (or a
	// preset's value); removing a property writes null. The CSS
	// keyframe is generated per-block from only the non-null values,
	// so unset properties fall through to the element's computed style.
	animationFromOpacity: null,
	animationFromTranslateX: null,
	animationFromTranslateY: null,
	animationFromScale: null,
	animationFromRotate: null,
	animationFromRotateX: null,
	animationFromRotateY: null,
	animationFromBlur: null,
	animationFromClipPath: null,
	animationToOpacity: null,
	animationToTranslateX: null,
	animationToTranslateY: null,
	animationToScale: null,
	animationToRotate: null,
	animationToRotateX: null,
	animationToRotateY: null,
	animationToBlur: null,
	animationToClipPath: null,
	// Which side the user is editing (Start or End). Hoisted to an
	// attribute so it survives remounts of FromToControls — e.g. when
	// the Play-preview hack briefly clears animationType to retrigger
	// CSS animation.
	animationFromToActiveSide: 'start',
	// Eye-icon preview in the From/To panel: 'off' shows the live
	// animation; 'start' or 'end' freezes the editor block at the
	// chosen side's static values (no animation).
	animationFromToPreviewSide: 'off',
	// Custom animation target: 'block' applies transforms to the
	// block wrapper (default); 'img' applies them to the first
	// `<img>` descendant via scoped CSS so the surrounding figure /
	// figcaption / link wrapper stays stationary. Only meaningful
	// for blocks listed in IMAGE_TARGETABLE_BLOCKS.
	animationFromToTarget: 'block',
	// Stagger cascade — only meaningful when the block is a
	// STAGGER_CONTAINER_BLOCKS member. When true, the parent stops
	// animating itself and becomes the cascade controller for its
	// direct children. Step is the delay added per child (in ms).
	animationStaggerEnabled: false,
	animationStaggerStep: 100,
};
