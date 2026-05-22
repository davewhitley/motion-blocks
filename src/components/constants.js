/**
 * Animation type options for the type dropdown.
 *
 * `custom` is a special type that exposes the From/To state editor.
 * Existing preset types animate via fixed @keyframes; `custom` animates
 * via a generic keyframe parameterized by CSS custom properties.
 */
export const ANIMATION_TYPE_OPTIONS = [
	{ label: 'Fade In', value: 'fade' },
	{ label: 'Fade Out', value: 'fade-out' },
	{ label: 'Slide In', value: 'slide' },
	{ label: 'Slide Out', value: 'slide-out' },
	{ label: 'Wipe', value: 'wipe' },
	// "Curtain Open" in Page Load and Scroll Interactive (the only
	// directions those modes expose). Scroll Appear's Entry slot uses
	// ENTRY_TYPE_OPTIONS which also labels it "Curtain Open"; its Exit
	// slot uses EXIT_TYPE_OPTIONS which labels the same `'curtain'`
	// value as "Curtain Close" because the slot's class prefix
	// (`mb-exit-`) binds to the `mbCurtainClose` keyframe.
	{ label: 'Curtain Open', value: 'curtain' },
	{ label: 'Flip', value: 'flip' },
	{ label: 'Scale In', value: 'scale' },
	{ label: 'Scale Out', value: 'scale-out' },
	{ label: 'Blur In', value: 'blur' },
	{ label: 'Blur Out', value: 'blur-out' },
	{ label: 'Rotate In', value: 'rotate' },
	{ label: 'Rotate Out', value: 'rotate-out' },
	{ label: 'Image Move (Beta)', value: 'image-move' },
	{ label: 'Image Zoom (Beta)', value: 'image-zoom' },
	{ label: 'Custom', value: 'custom' },
];

/**
 * Image-bound effects that always animate the first `<img>` descendant
 * (via `data-mb-target="img"`) instead of the block wrapper. Available
 * only on blocks listed in IMAGE_EFFECT_BLOCKS, and surfaced across
 * all three modes (Page Load, Scroll Appear Entry slot, Scroll
 * Interactive). Currently Beta — labels carry a "(Beta)" suffix.
 */
export const IMAGE_EFFECT_TYPES = [ 'image-move', 'image-zoom' ];

/**
 * Blocks where IMAGE_EFFECT_TYPES are exposed in the Effect dropdown.
 * Intentionally narrower than IMAGE_TARGETABLE_BLOCKS — Featured Image
 * / Avatar / Site Logo / Media&Text have more markup variants and
 * are deferred to a follow-up.
 */
export const IMAGE_EFFECT_BLOCKS = [ 'core/image', 'core/cover' ];

/**
 * Animation types that only make sense in scroll-interactive mode.
 * The PageLoad and ScrollAppear panels filter these out of their
 * effect dropdown; only ScrollInteractive offers them.
 *
 * Currently empty — `image-move` used to live here but is now exposed
 * across all three modes (in non-SI modes it animates the translate
 * over the configured duration instead of binding to scroll progress).
 */
export const SCROLL_INTERACTIVE_ONLY_TYPES = [];

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
	// Renders an author avatar <img> alongside name/bio text. The
	// avatar is part of the block's output, not a selectable inner
	// block, so users can't animate it via per-block targeting.
	'core/post-author',
	// Single <img> for a commenter's avatar inside the comment
	// template. No inner block to pick.
	'core/comment-author-avatar',
];

/**
 * Block types that support the "Stagger inner blocks" toggle. When
 * stagger is enabled on one of these parent blocks, its animation
 * config is applied to each inner block with a stepped delay
 * (computed via CSS `:nth-child()` rules in animations.css /
 * editor.scss). The parent block itself stops animating and becomes
 * the cascade controller.
 *
 * Whitelisted because stagger only makes sense for blocks whose
 * meaningful content IS their inner blocks (lists, galleries, button
 * groups, etc.). For arbitrary content blocks (e.g. core/paragraph)
 * staggering "inner blocks" doesn't have a coherent meaning.
 *
 * Terminology note: "parent block" / "inner block" matches Gutenberg's
 * own vocabulary (block.json `parent`, the `InnerBlocks` component,
 * `innerBlocks` attribute).
 */
export const STAGGER_PARENT_BLOCKS = [
	'core/group',
	'core/columns',
	'core/buttons',
	'core/gallery',
	'core/list',
];

/**
 * Animation types that don't compose with the stagger cascade.
 *
 * `image-move` and `image-zoom` are img-target effects that scope
 * the animation to the first `<img>` descendant of the parent block.
 * Stagger needs to cascade an animation across multiple inner blocks,
 * which doesn't compose meaningfully with a per-img scoped keyframe.
 *
 * `custom` USED to be on this list. It now composes via a single
 * inherited custom property: the parent block generates one
 * `mb-custom-{uid}` keyframe and exposes its name as
 * `--mb-stagger-anim-name`. Inner blocks read it back through
 * `animation-name: var(--mb-stagger-anim-name)` in animations.css.
 * One keyframe per parent block, not N — see the stagger section
 * of animations.css for the binding rule.
 */
export const STAGGER_INCOMPATIBLE_TYPES = [ 'image-move', 'image-zoom' ];

/**
 * Default stagger step in seconds — matches the units used by
 * `animationDuration` and `animationDelay` so all three timing
 * controls in the panel are read the same way.
 *
 * Stored on the block as `animationStaggerStep`.
 */
export const DEFAULT_STAGGER_STEP_SECONDS = 0.1;

/**
 * Stagger steps used to live in milliseconds (default 100). They're
 * now seconds (default 0.1) to match the rest of the timing
 * controls. Some blocks in the wild still carry the legacy value.
 *
 * Heuristic: anything > 5 is ms-magnitude (was 100, 200, 500, …).
 * Anything ≤ 5 is the new seconds-magnitude (0.05, 0.5, 2, …). The
 * panel caps input at 5 so new data can't ever land in the ms zone,
 * making this a stable one-way migration.
 *
 * Read every saved value through here in both editor preview and
 * frontend save-props so old blocks keep working without a forced
 * write-back to the data store.
 */
export function staggerStepSeconds( raw ) {
	if ( raw == null || raw === '' ) {
		return DEFAULT_STAGGER_STEP_SECONDS;
	}
	const n = parseFloat( raw );
	if ( ! Number.isFinite( n ) || n < 0 ) {
		return DEFAULT_STAGGER_STEP_SECONDS;
	}
	return n > 5 ? n / 1000 : n;
}

/**
 * Direction options per animation type.
 *
 * The "Out" variants of slide/scale reuse the same four direction
 * values (btt/ttb/ltr/rtl), where the value names the DIRECTION OF
 * MOTION — btt means "the element moves upward during the
 * animation," whether that's "starts below, ends at rest" (slide-in)
 * or "starts at rest, ends above" (slide-out).
 */
const FOUR_AXIS_OPTIONS = [
	{ label: 'Bottom to top', value: 'btt' },
	{ label: 'Top to bottom', value: 'ttb' },
	{ label: 'Left to right', value: 'ltr' },
	{ label: 'Right to left', value: 'rtl' },
];

export const DIRECTION_OPTIONS = {
	slide: FOUR_AXIS_OPTIONS,
	'slide-out': FOUR_AXIS_OPTIONS,
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
	scale: FOUR_AXIS_OPTIONS,
	'scale-out': FOUR_AXIS_OPTIONS,
	'image-move': FOUR_AXIS_OPTIONS,
};

/**
 * Types that show a direction control.
 */
export const TYPES_WITH_DIRECTION = [ 'slide', 'slide-out', 'wipe', 'curtain', 'flip', 'scale', 'scale-out', 'image-move' ];

/**
 * Default direction when a directional type is first selected.
 */
export const DEFAULT_DIRECTION = {
	slide: 'btt',
	'slide-out': 'ttb',
	wipe: 'ltr',
	curtain: 'horizontal',
	flip: 'ltr',
	scale: 'none',
	'scale-out': 'none',
	'image-move': 'btt',
};

/**
 * CSS custom property values per type + direction.
 * Used by both editor preview and frontend to parameterize keyframes.
 *
 * The "Out" variants negate the In offsets so the direction value
 * always names the motion direction, not the start position:
 *
 *   slide + btt  → starts at y=+50px (below), ends at y=0 → moves UP
 *   slide-out + btt → starts at y=0, ends at y=-50px (above) → moves UP
 *
 * The keyframe interpolates between (0,0) and the var values; for
 * `slide` the var is the START, for `slide-out` the var is the END.
 */
export const DIRECTION_CSS_VARS = {
	slide: {
		ltr: { '--mb-slide-x': '-50px', '--mb-slide-y': '0' },
		rtl: { '--mb-slide-x': '50px', '--mb-slide-y': '0' },
		ttb: { '--mb-slide-x': '0', '--mb-slide-y': '-50px' },
		btt: { '--mb-slide-x': '0', '--mb-slide-y': '50px' },
	},
	'slide-out': {
		ltr: { '--mb-slide-x': '50px', '--mb-slide-y': '0' },
		rtl: { '--mb-slide-x': '-50px', '--mb-slide-y': '0' },
		ttb: { '--mb-slide-x': '0', '--mb-slide-y': '50px' },
		btt: { '--mb-slide-x': '0', '--mb-slide-y': '-50px' },
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
	'scale-out': {
		none: { '--mb-scale-x': '0', '--mb-scale-y': '0' },
		btt: { '--mb-scale-x': '0', '--mb-scale-y': '-50px' },
		ttb: { '--mb-scale-x': '0', '--mb-scale-y': '50px' },
		ltr: { '--mb-scale-x': '50px', '--mb-scale-y': '0' },
		rtl: { '--mb-scale-x': '-50px', '--mb-scale-y': '0' },
	},
};

/**
 * Entrance keyframe name per type.
 *
 * The "Out" variants (currently just `fade-out`) flip the convention:
 * the keyframe that plays when triggered is the "out" keyframe of
 * the underlying effect, so the element animates from visible to
 * hidden when it enters the viewport / loads.
 */
export const ENTER_KEYFRAME_MAP = {
	fade: 'mbFadeIn',
	'fade-out': 'mbFadeOut',
	slide: 'mbSlideIn',
	'slide-out': 'mbSlideOut',
	wipe: 'mbWipeIn',
	curtain: 'mbCurtainReveal',
	flip: 'mbFlipIn',
	scale: 'mbScaleIn',
	'scale-out': 'mbScaleOut',
	blur: 'mbBlurIn',
	'blur-out': 'mbBlurOut',
	rotate: 'mbRotateIn',
	'rotate-out': 'mbRotateOut',
	// `custom` intentionally not mapped — its keyframe name is
	// generated per-block (mb-custom-{clientId}) and bound inline.
};

/**
 * Exit keyframe name per type.
 *
 * For "In" variants, exit is the natural reverse (mbFadeIn → mbFadeOut).
 * For "Out" variants, exit is the reverse of the Out keyframe — which
 * is the original In keyframe. Mirror trigger uses both halves to
 * round-trip the visual state.
 * Flip falls back to fade-out since it has no exit variant.
 */
export const EXIT_KEYFRAME_MAP = {
	fade: 'mbFadeOut',
	'fade-out': 'mbFadeIn',
	slide: 'mbSlideOut',
	'slide-out': 'mbSlideIn',
	wipe: 'mbWipeOut',
	curtain: 'mbCurtainClose',
	flip: 'mbFadeOut',
	scale: 'mbScaleOut',
	'scale-out': 'mbScaleIn',
	blur: 'mbBlurOut',
	'blur-out': 'mbBlurIn',
	rotate: 'mbRotateOut',
	'rotate-out': 'mbRotateIn',
	// `custom` intentionally not mapped — see ENTER_KEYFRAME_MAP.
};

/**
 * Scroll in View trigger options.
 *
 * v2 collapsed the legacy "Both" + exitMode (mirror/custom) into a
 * single "Mirror" value: a Mirror animation enters on view, then
 * reverse-plays itself on exit. Saved blocks with the older 'both'
 * value are aliased to 'mirror' at read-time on every consumer
 * (panel, frontend JS, frontend CSS, PHP render). Custom exit
 * animations are deferred to v3.
 */
export const SCROLL_TRIGGER_OPTIONS = [
	{ label: 'Enter viewport', value: 'enter' },
	{ label: 'Exit viewport', value: 'exit' },
	{ label: 'Mirror', value: 'mirror' },
];

/**
 * Normalize the legacy scroll-appear trigger attribute for read
 * paths. Old saves can carry 'both' from v1; treat it as the v2
 * 'mirror'. Only used by `migrateScrollAppearAttrs` and historical
 * tooling — the slot model UI never reads this attribute directly.
 */
export function normalizeScrollTrigger( raw ) {
	if ( raw === 'both' ) {
		return 'mirror';
	}
	return raw || 'enter';
}

/**
 * Effect dropdown options for the Scroll Appear Entry slot.
 *
 * Same underlying values as the Exit slot's list (both store
 * 'fade', 'slide', etc.); the difference is the label exposed to
 * the user. The slot's class prefix (`mb-enter-` vs `mb-exit-`) is
 * what actually picks between the In and Out keyframe at render
 * time, so no value-level distinction is needed.
 *
 * The SlotControls component prepends a `{ label: 'None', value: '' }`
 * entry — that's UI state for "this slot is empty" and lives in
 * the component, not the constants list.
 */
export const ENTRY_TYPE_OPTIONS = [
	{ label: 'Fade In', value: 'fade' },
	{ label: 'Slide In', value: 'slide' },
	{ label: 'Scale In', value: 'scale' },
	{ label: 'Blur In', value: 'blur' },
	{ label: 'Rotate In', value: 'rotate' },
	{ label: 'Wipe', value: 'wipe' },
	{ label: 'Curtain Open', value: 'curtain' },
	{ label: 'Flip', value: 'flip' },
	{ label: 'Image Move (Beta)', value: 'image-move' },
	{ label: 'Image Zoom (Beta)', value: 'image-zoom' },
	{ label: 'Custom', value: 'custom' },
];

/**
 * Effect dropdown options for the Scroll Appear Exit slot.
 *
 * No Flip entry — the existing CSS falls back to mbFadeOut for
 * Flip's exit, which would look broken next to the other Out
 * variants. Wipe and Curtain are symmetric (no In/Out direction
 * to distinguish via label).
 */
export const EXIT_TYPE_OPTIONS = [
	{ label: 'Fade Out', value: 'fade' },
	{ label: 'Slide Out', value: 'slide' },
	{ label: 'Scale Out', value: 'scale' },
	{ label: 'Blur Out', value: 'blur' },
	{ label: 'Rotate Out', value: 'rotate' },
	{ label: 'Wipe', value: 'wipe' },
	{ label: 'Curtain Close', value: 'curtain' },
	{ label: 'Image Move (Beta)', value: 'image-move' },
	{ label: 'Image Zoom (Beta)', value: 'image-zoom' },
	{ label: 'Custom', value: 'custom' },
];

/**
 * Read-time migration shim. Maps legacy Scroll Appear attributes
 * (`animationType` + `animationScrollTrigger` + `animationFrom*`/
 * `animationTo*`) onto the slot model. Idempotent: runs in O(1) if
 * the block has already been migrated (writes happen on the next
 * user edit; this shim only normalizes the in-memory attrs that
 * downstream code consumes).
 *
 * Returns a NEW object when migration is needed, or the same
 * `attrs` reference unchanged when nothing applies — cheap to call
 * on every render.
 *
 * @param {Object} attrs Block attributes (raw, as-saved).
 * @return {Object} Normalized attributes.
 */
export function migrateScrollAppearAttrs( attrs ) {
	if ( ! attrs || attrs.animationMode !== 'scroll-appear' ) {
		return attrs;
	}
	// Already migrated — the user has interacted with the new UI and
	// `animationEntryType` carries the canonical slot config.
	const entrySet =
		typeof attrs.animationEntryType === 'string' &&
		attrs.animationEntryType !== '';
	const exitSet =
		typeof attrs.animationExitType === 'string' &&
		attrs.animationExitType !== '';
	if ( entrySet || exitSet ) {
		return attrs;
	}

	// Block predates the slot model. Derive slot config from the
	// legacy `animationScrollTrigger` + `animationType` pair.
	const trigger = normalizeScrollTrigger( attrs.animationScrollTrigger );
	const rawType = attrs.animationType || '';
	const baseType = rawType.replace( /-out$/, '' ); // strip -out suffix; slot encodes direction now
	const direction = attrs.animationDirection || '';
	const duration =
		attrs.animationDuration ?? DEFAULT_ATTRIBUTES.animationDuration;
	const delay = attrs.animationDelay ?? DEFAULT_ATTRIBUTES.animationDelay;
	const acceleration =
		attrs.animationAcceleration ?? DEFAULT_ATTRIBUTES.animationAcceleration;
	const customTiming =
		attrs.animationCustomTimingFunction ??
		DEFAULT_ATTRIBUTES.animationCustomTimingFunction;
	const blur =
		attrs.animationBlurAmount ?? DEFAULT_ATTRIBUTES.animationBlurAmount;
	const rotate =
		attrs.animationRotateAngle ?? DEFAULT_ATTRIBUTES.animationRotateAngle;

	// Copy shared Custom From/To values onto the appropriate slot's
	// keyframe attrs. Same property bag goes to both slots if Mirror
	// (round-trip needs the same keyframe endpoints).
	const customFromTo = {};
	for ( const prop of Object.keys( FROM_ATTR ) ) {
		const fromKey = FROM_ATTR[ prop ];
		const toKey = TO_ATTR[ prop ];
		customFromTo[ fromKey ] = attrs[ fromKey ] ?? null;
		customFromTo[ toKey ] = attrs[ toKey ] ?? null;
	}

	const out = { ...attrs };
	const fillSlot = ( prefix ) => {
		out[ `animation${ prefix }Type` ] = baseType;
		out[ `animation${ prefix }Direction` ] = direction;
		out[ `animation${ prefix }Duration` ] = duration;
		out[ `animation${ prefix }Delay` ] = prefix === 'Exit' ? 0 : delay;
		out[ `animation${ prefix }Acceleration` ] = acceleration;
		out[ `animation${ prefix }CustomTimingFunction` ] = customTiming;
		out[ `animation${ prefix }BlurAmount` ] = blur;
		out[ `animation${ prefix }RotateAngle` ] = rotate;
		if ( baseType === 'custom' ) {
			for ( const prop of Object.keys( FROM_ATTR ) ) {
				const fromKey = FROM_ATTR[ prop ];
				const toKey = TO_ATTR[ prop ];
				const slotFromKey = `animation${ prefix }From${
					fromKey.replace( /^animationFrom/, '' )
				}`;
				const slotToKey = `animation${ prefix }To${
					toKey.replace( /^animationTo/, '' )
				}`;
				out[ slotFromKey ] = customFromTo[ fromKey ];
				out[ slotToKey ] = customFromTo[ toKey ];
			}
		}
	};

	if ( trigger === 'enter' ) {
		fillSlot( 'Entry' );
	} else if ( trigger === 'exit' ) {
		fillSlot( 'Exit' );
	} else {
		// mirror — fill both slots with the same config
		fillSlot( 'Entry' );
		fillSlot( 'Exit' );
	}
	return out;
}

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
	// Single-bump overshoot curves (easings.net "Back" family). A
	// true multi-bump bounce requires the CSS `linear()` function
	// with multiple stops, which we don't ship a preset for — pick
	// Custom and paste a linear() string for that. These three cover
	// the common "settle past target, snap back" feel.
	{ label: 'Bounce In', value: 'cubic-bezier(0.36, 0, 0.66, -0.56)' },
	{ label: 'Bounce Out', value: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
	{ label: 'Bounce In-Out', value: 'cubic-bezier(0.68, -0.6, 0.32, 1.6)' },
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
		// Opacity anchors every From/To animation — almost every preset
		// uses it (fade, slide, scale, blur, rotate…) and it's the
		// property users reach for first. Pinning it via
		// isShownByDefault keeps the row always visible and renders
		// the kebab menu entry with disabled (grey-checkmark) styling,
		// matching the "Size" pattern in WP's Typography panel.
		isShownByDefault: true,
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
		// Widened from ±180° to ±360° so spin animations are
		// expressible end-to-end on the slider without typing.
		// Two full rotations is enough range for any natural
		// spin pattern; the precision loss (~0.36° per pixel of
		// drag at typical sidebar width) is acceptable for an
		// effect that doesn't need sub-degree accuracy.
		min: -360,
		max: 360,
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
 * Identity values for the four standard From/To rows (Opacity,
 * Scale, Move X, Move Y). Seeding all eight slots means the
 * ToolsPanel renders these four rows by default — without it the
 * panel would open empty and the user would have to add each row
 * via the kebab menu.
 *
 * Used both as the base for `CUSTOM_DEFAULT_FROM_TO` (smart-default
 * seed) and `presetToFromToAttributes()` (Edit-button conversion) so
 * the panel layout is identical no matter how the user landed in
 * Custom mode.
 */
const CUSTOM_STANDARD_IDENTITY_FROM_TO = {
	animationFromOpacity: 1,
	animationToOpacity: 1,
	animationFromScale: 1,
	animationToScale: 1,
	animationFromTranslateX: '0px',
	animationToTranslateX: '0px',
	animationFromTranslateY: '0px',
	animationToTranslateY: '0px',
};

/**
 * Seed applied the first time the user picks "Custom" from the
 * effect dropdown. A slide-up + fade-in smart default (opacity 0→1,
 * translateY 50px→0) — useful out of the box without forcing the
 * user to type values into eight empty fields. Identity values for
 * Scale and Move X keep those rows visible for tweaking.
 *
 * Re-seeding policy: only applied when no From/To attribute is
 * currently set on the block. If the user has ANY existing custom
 * value, switching to Custom preserves their work.
 */
export const CUSTOM_DEFAULT_FROM_TO = {
	...CUSTOM_STANDARD_IDENTITY_FROM_TO,
	animationFromOpacity: 0,
	animationFromTranslateY: '50px',
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
 * Pass `slot` to check the slot-prefixed attribute names instead
 * of the shared ones. Leave undefined for Page Load / Scroll
 * Interactive (which still use the shared attrs).
 *
 * @param {Object} attributes Block attributes.
 * @param {?('entry'|'exit')} slot
 * @return {boolean}
 */
export function hasAnyCustomFromToSet( attributes, slot ) {
	if ( ! attributes ) {
		return false;
	}
	const keys = slot
		? customFromToKeysForSlot( slot )
		: ALL_CUSTOM_FROM_TO_KEYS;
	return keys.some( ( key ) => {
		const v = attributes[ key ];
		return v !== null && v !== undefined;
	} );
}

/**
 * Translate the shared `CUSTOM_DEFAULT_FROM_TO` seed (used by the
 * legacy single-side path) into the slot-prefixed attribute names.
 * Returns an object ready to spread into `setAttributes` so the
 * Entry/Exit slot's Custom mode opens with the same four-row
 * default that the shared path has always seeded.
 *
 * Entry seed mirrors the existing default (fade-up).
 * Exit seed is the natural inverse (fade-down / fade-out) so an
 * Exit Custom slot opens with values that make visual sense for
 * "element animating out."
 *
 * @param {'entry'|'exit'} slot
 * @return {Object}
 */
export function customDefaultFromToForSlot( slot ) {
	const prefix = slot === 'entry' ? 'animationEntry' : 'animationExit';
	const seed = slot === 'entry'
		? {
				// Same as shared CUSTOM_DEFAULT_FROM_TO: opacity 0→1,
				// translateY 50px→0 (slide up + fade in).
				FromOpacity: 0,
				ToOpacity: 1,
				FromScale: 1,
				ToScale: 1,
				FromTranslateX: '0px',
				ToTranslateX: '0px',
				FromTranslateY: '50px',
				ToTranslateY: '0px',
		  }
		: {
				// Inverse: opacity 1→0, translateY 0→50px (slide down
				// + fade out). Makes a sensible default for "Exit
				// Custom" without forcing the user to flip every value.
				FromOpacity: 1,
				ToOpacity: 0,
				FromScale: 1,
				ToScale: 1,
				FromTranslateX: '0px',
				ToTranslateX: '0px',
				FromTranslateY: '0px',
				ToTranslateY: '50px',
		  };
	const out = {};
	for ( const [ k, v ] of Object.entries( seed ) ) {
		out[ `${ prefix }${ k }` ] = v;
	}
	return out;
}

/**
 * Enumerate the per-slot Custom From/To attribute names. Used by
 * `hasAnyCustomFromToSet( attrs, slot )` to decide whether the
 * slot is empty before seeding defaults on the first Custom pick.
 *
 * @param {'entry'|'exit'} slot
 * @return {string[]}
 */
function customFromToKeysForSlot( slot ) {
	const prefix = slot === 'entry' ? 'animationEntry' : 'animationExit';
	const out = [];
	for ( const fromKey of Object.values( FROM_ATTR ) ) {
		out.push( fromKey.replace( /^animationFrom/, `${ prefix }From` ) );
	}
	for ( const toKey of Object.values( TO_ATTR ) ) {
		out.push( toKey.replace( /^animationTo/, `${ prefix }To` ) );
	}
	return out;
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

		case 'fade-out':
			return {
				from: { opacity: 1 },
				to: { opacity: 0 },
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

		case 'slide-out': {
			// End-side offsets — element moves AWAY from rest in the
			// direction of motion. Negated relative to `slide` so btt
			// still means "upward motion."
			const offsets = {
				btt: { x: '0px', y: '-50px' },
				ttb: { x: '0px', y: '50px' },
				ltr: { x: '50px', y: '0px' },
				rtl: { x: '-50px', y: '0px' },
			};
			const off = offsets[ direction ] || offsets.ttb;
			return {
				from: { opacity: 1 },
				to: {
					opacity: 0,
					translateX: off.x,
					translateY: off.y,
				},
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

		case 'scale-out': {
			// End-side offsets — element moves AWAY in the direction
			// of motion (negated from `scale`).
			const offsets = {
				none: { x: '0px', y: '0px' },
				btt: { x: '0px', y: '-50px' },
				ttb: { x: '0px', y: '50px' },
				ltr: { x: '50px', y: '0px' },
				rtl: { x: '-50px', y: '0px' },
			};
			const off = offsets[ direction ] || offsets.none;
			const toBag = { opacity: 0, scale: 0.75 };
			if ( off.x !== '0px' ) {
				toBag.translateX = off.x;
			}
			if ( off.y !== '0px' ) {
				toBag.translateY = off.y;
			}
			return {
				from: { opacity: 1 },
				to: toBag,
			};
		}

		case 'rotate': {
			const angle = options.rotateAngle ?? 90;
			return {
				from: { opacity: 0, rotate: angle },
				to: { opacity: 1 },
			};
		}

		case 'rotate-out': {
			const angle = options.rotateAngle ?? 90;
			return {
				from: { opacity: 1 },
				to: { opacity: 0, rotate: angle },
			};
		}

		case 'blur': {
			const amount = options.blurAmount ?? 8;
			return {
				from: { opacity: 0, blur: amount },
				to: { opacity: 1 },
			};
		}

		case 'blur-out': {
			const amount = options.blurAmount ?? 8;
			return {
				from: { opacity: 1 },
				to: { opacity: 0, blur: amount },
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

		case 'image-zoom': {
			// Slow scale-in: 1 → 1.2. No translate, no direction.
			// The wrapper's overflow:clip frames the scaled image
			// to its natural border-box so the zoom feels contained.
			return {
				from: { scale: 1 },
				to: { scale: 1.2 },
			};
		}

		default:
			return null;
	}
}

/**
 * Convert a preset (type + direction + options) into the flat
 * `animationFrom*` / `animationTo*` attributes used by the From/To
 * panel. Powers the "Edit" button: clicking it on a preset switches
 * the block to Custom mode with the same visual effect already
 * filled in, ready for fine-tuning.
 *
 * Returns null for presets that don't have a From/To representation
 * (none today, but the contract follows `getPresetFromTo`).
 *
 * The result always includes the four standard rows (Opacity, Scale,
 * Move X, Move Y) so the panel layout stays consistent. The preset's
 * own non-identity values are layered on top of those defaults.
 *
 * @param {string} type      Animation type (fade/slide/scale/...).
 * @param {string} direction Direction value if the preset has one.
 * @param {Object} options   Extra preset params (rotateAngle, blurAmount).
 * @return {Object|null}     Flat attributes ready for setAttributes(),
 *                           or null if the type can't be customized.
 */
export function presetToFromToAttributes( type, direction, options = {} ) {
	const preset = getPresetFromTo( type, direction, options );
	if ( ! preset ) {
		return null;
	}
	// Start from identity for the four standard rows so the panel
	// always shows Opacity/Scale/Move X/Move Y. The preset's actual
	// values (which may also include blur/rotate/clipPath/etc.) are
	// applied on top — any extra rows appear because their attribute
	// is now non-null, which `isPropertyAdded` reads as "added".
	const out = { ...CUSTOM_STANDARD_IDENTITY_FROM_TO };
	for ( const [ propId, val ] of Object.entries( preset.from || {} ) ) {
		const attr = FROM_ATTR[ propId ];
		if ( attr ) {
			out[ attr ] = val;
		}
	}
	for ( const [ propId, val ] of Object.entries( preset.to || {} ) ) {
		const attr = TO_ATTR[ propId ];
		if ( attr ) {
			out[ attr ] = val;
		}
	}
	return out;
}

/**
 * Slot-prefixed variant of `presetToFromToAttributes`. Returns an
 * attribute payload keyed by `animationEntryFrom*` /
 * `animationEntryTo*` (or `animationExit*`) instead of the shared
 * `animationFrom*` / `animationTo*`. Used by SlotControls when the
 * user clicks Edit on a preset inside an Entry/Exit slot.
 *
 * For Exit slot: also swaps From↔To values, so the Custom keyframe
 * runs visually like the original preset's reverse (the way the
 * Exit slot's `mb-exit-{type}` class binds to mbXxxOut today).
 * Example: Slide In btt → from { y: 50px, opacity: 0 } to
 * { y: 0, opacity: 1 }. Slide Out btt should run the opposite:
 * from { y: 0, opacity: 1 } to { y: -50px, opacity: 0 }. We can't
 * compute the "out direction" inversion generically here, so we
 * simply swap From/To — same visual as playing the preset's In
 * keyframe in reverse.
 *
 * @param {string} type      Animation type.
 * @param {string} direction Direction value.
 * @param {Object} options   { rotateAngle?, blurAmount? }
 * @param {'entry'|'exit'} slot
 * @return {Object|null}
 */
export function presetToSlotFromToAttributes( type, direction, options, slot ) {
	const flat = presetToFromToAttributes( type, direction, options );
	if ( ! flat ) {
		return null;
	}
	const prefix = slot === 'entry' ? 'animationEntry' : 'animationExit';
	const out = {};
	for ( const [ key, val ] of Object.entries( flat ) ) {
		const slotted = key
			.replace( /^animationFrom/, `${ prefix }From` )
			.replace( /^animationTo/, `${ prefix }To` );
		out[ slotted ] = val;
	}
	if ( slot === 'exit' ) {
		// Swap From↔To so the slot's "forward" plays the visual
		// reverse of the In preset.
		const swapped = {};
		for ( const [ key, val ] of Object.entries( out ) ) {
			if ( key.startsWith( `${ prefix }From` ) ) {
				const twin = key.replace(
					new RegExp( `^${ prefix }From` ),
					`${ prefix }To`
				);
				swapped[ twin ] = val;
			} else if ( key.startsWith( `${ prefix }To` ) ) {
				const twin = key.replace(
					new RegExp( `^${ prefix }To` ),
					`${ prefix }From`
				);
				swapped[ twin ] = val;
			}
		}
		return swapped;
	}
	return out;
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
	// Legacy trigger attribute. The Scroll Appear panel no longer
	// reads or writes this — it's been replaced by the slot model
	// (animationEntry* / animationExit*). Kept registered so old
	// saves continue to deserialize cleanly; migrated on read by
	// migrateScrollAppearAttrs().
	animationScrollTrigger: 'enter',
	animationAcceleration: 'ease',
	animationCustomTimingFunction: DEFAULT_CUSTOM_TIMING_FUNCTION,
	animationBlurAmount: 8,
	animationRotateAngle: 90,
	animationRangeStart: 'entry 0%',
	animationRangeEnd: 'exit 100%',
	// --- Slot model: Scroll Appear's Entry / Exit slots ---
	// Each slot mirrors the shared animation attrs but scoped to a
	// single direction. '' = slot is empty (no animation for that
	// phase). Both slots filled = round-trip (replaces the old
	// "Mirror" trigger). Only Entry filled = "enter trigger." Only
	// Exit filled = "exit trigger." See constants.js → migration
	// shim for how legacy blocks map onto this.
	animationEntryType: '',
	animationEntryDirection: '',
	animationEntryDuration: 0.6,
	animationEntryDelay: 0.4,
	animationEntryAcceleration: 'ease',
	animationEntryCustomTimingFunction: DEFAULT_CUSTOM_TIMING_FUNCTION,
	animationEntryBlurAmount: 8,
	animationEntryRotateAngle: 90,
	animationExitType: '',
	animationExitDirection: '',
	animationExitDuration: 0.6,
	animationExitDelay: 0,
	animationExitAcceleration: 'ease',
	animationExitCustomTimingFunction: DEFAULT_CUSTOM_TIMING_FUNCTION,
	animationExitBlurAmount: 8,
	animationExitRotateAngle: 90,
	// Per-slot Custom From/To values (only relevant when the slot's
	// type is 'custom'). The shared animationFrom* / animationTo*
	// attributes below are still used by Page Load and Scroll
	// Interactive modes.
	animationEntryFromOpacity: null,
	animationEntryFromTranslateX: null,
	animationEntryFromTranslateY: null,
	animationEntryFromScale: null,
	animationEntryFromRotate: null,
	animationEntryFromRotateX: null,
	animationEntryFromRotateY: null,
	animationEntryFromBlur: null,
	animationEntryFromClipPath: null,
	animationEntryToOpacity: null,
	animationEntryToTranslateX: null,
	animationEntryToTranslateY: null,
	animationEntryToScale: null,
	animationEntryToRotate: null,
	animationEntryToRotateX: null,
	animationEntryToRotateY: null,
	animationEntryToBlur: null,
	animationEntryToClipPath: null,
	animationExitFromOpacity: null,
	animationExitFromTranslateX: null,
	animationExitFromTranslateY: null,
	animationExitFromScale: null,
	animationExitFromRotate: null,
	animationExitFromRotateX: null,
	animationExitFromRotateY: null,
	animationExitFromBlur: null,
	animationExitFromClipPath: null,
	animationExitToOpacity: null,
	animationExitToTranslateX: null,
	animationExitToTranslateY: null,
	animationExitToScale: null,
	animationExitToRotate: null,
	animationExitToRotateX: null,
	animationExitToRotateY: null,
	animationExitToBlur: null,
	animationExitToClipPath: null,
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
	// STAGGER_PARENT_BLOCKS member. When true, the parent block
	// stops animating itself and becomes the cascade controller for
	// its inner blocks. Step is the delay added per inner block (in
	// seconds — see staggerStepSeconds for the legacy-ms heuristic).
	animationStaggerEnabled: false,
	animationStaggerStep: DEFAULT_STAGGER_STEP_SECONDS,
};

/**
 * Mode metadata for the in-place mode picker in the sub-panel
 * header. Icon imports live in the consumer (SubPanelModeHeader)
 * because constants.js shouldn't pull React/JSX. We only carry the
 * icon *key* here (the string name in @wordpress/icons) and the
 * consumer resolves it to a real icon. `scroll-interactive` uses
 * our local custom icon — the consumer special-cases that.
 */
export const MODE_META = {
	'page-load': {
		label: 'On page load',
		iconName: 'desktop',
	},
	'scroll-appear': {
		label: 'Appear on scroll',
		iconName: 'seen',
	},
	'scroll-interactive': {
		label: 'Interactive scroll',
		iconName: 'scrollInteractive', // custom icon, see icons.js
	},
};

/**
 * Order modes show up in the picker dropdown — matches the order
 * of the empty-state mode-selector cards in AnimationPanel.js.
 */
export const MODE_ORDER = [ 'page-load', 'scroll-appear', 'scroll-interactive' ];

/**
 * Compute the attribute payload to dispatch when the user changes
 * an existing animation's mode in place (NOT the same as the
 * empty-state `selectMode()` in AnimationPanel.js, which seeds
 * defaults for a fresh animation).
 *
 * Mode-agnostic attributes (effect, direction, timing, From/To
 * values, stagger, blur, rotate, clip-overflow…) are preserved
 * by simply omitting them from the output — `setAttributes` only
 * touches keys present in the partial. Mode-specific attributes
 * for the OLD mode get reset to defaults so they don't linger
 * on a block that no longer supports them.
 *
 * Image effects (`image-move`, `image-zoom`) used to be coerced to
 * `slide` when leaving scroll-interactive mode, but they're now
 * exposed across all three modes — no coercion needed.
 *
 * Also resets `animationPreviewPlaying` so a preview running on
 * the old mode's branch doesn't auto-resume on the new mode.
 *
 * @param {Object} attributes Current block attributes.
 * @param {string} newMode    One of 'page-load' | 'scroll-appear' |
 *                            'scroll-interactive'.
 * @return {Object} Partial attribute payload ready for setAttributes().
 */
export function switchModeAttributes( attributes, newMode ) {
	const oldMode = attributes?.animationMode;
	const out = {
		animationMode: newMode,
		animationPreviewPlaying: false,
	// Which slot is currently being previewed in the editor — only
	// consulted for Scroll Appear blocks. 'entry' or 'exit'. Lets
	// the preview HOC know whether to fire `mb-triggered` (Entry) or
	// `mb-exit-triggered` (Exit) and which slot's attrs to source.
	animationPreviewSlot: 'entry',
	};

	// Reset attributes that belonged to the OLD mode and don't
	// apply to the new one. Each block only fires when the user
	// is leaving that specific mode.
	if ( oldMode === 'page-load' ) {
		out.animationRepeat = DEFAULT_ATTRIBUTES.animationRepeat;
		out.animationPauseOffscreen = DEFAULT_ATTRIBUTES.animationPauseOffscreen;
	}
	if ( oldMode === 'scroll-appear' ) {
		out.animationScrollTrigger = DEFAULT_ATTRIBUTES.animationScrollTrigger;
	}
	if ( oldMode === 'scroll-interactive' ) {
		out.animationRangeStart = DEFAULT_ATTRIBUTES.animationRangeStart;
		out.animationRangeEnd = DEFAULT_ATTRIBUTES.animationRangeEnd;
	}

	return out;
}
