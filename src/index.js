/**
 * Motion Blocks - Block Editor Extension
 *
 * Adds animation controls to all blocks via the InspectorControls panel.
 * Supports three animation modes: page-load, scroll-appear, scroll-interactive.
 */

import { createHigherOrderComponent } from '@wordpress/compose';
import {
	InspectorControls,
	store as blockEditorStore,
} from '@wordpress/block-editor';
import { useSelect, useDispatch } from '@wordpress/data';
import { addFilter } from '@wordpress/hooks';
import { useEffect, useCallback } from '@wordpress/element';

import AnimationPanel from './components/AnimationPanel';
import {
	DEFAULT_ATTRIBUTES,
	ENTER_KEYFRAME_MAP,
	EXIT_KEYFRAME_MAP,
	DIRECTION_CSS_VARS,
	TYPES_WITH_DIRECTION,
	DEFAULT_DIRECTION,
	PROPERTY_DEFINITIONS,
	FROM_ATTR,
	TO_ATTR,
	PROPERTY_CSS_VAR,
	attrsToBag,
	bagToReactStyles,
	buildCustomKeyframe,
	getPresetFromTo,
	isPropertyAdded,
	resolveTimingFunction,
} from './components/constants';

import '../css/editor.scss';

// Page-level settings panel — registers itself via registerPlugin
// on import. Lives in the Document/Page tab of the inspector.
import './components/PageSettingsPanel';

/**
 * Get the entrance keyframe name for a given animation type.
 */
function getEnterKeyframe( type ) {
	return ENTER_KEYFRAME_MAP[ type ] || '';
}

/**
 * Get the exit keyframe name for a given animation type.
 */
function getExitKeyframe( type ) {
	return EXIT_KEYFRAME_MAP[ type ] || '';
}

/**
 * Get CSS custom properties for a given type + direction.
 */
function getDirectionStyles( type, direction ) {
	const vars = DIRECTION_CSS_VARS[ type ]?.[ direction ];
	return vars || {};
}

/**
 * Build the unique @keyframes name + rule body for a custom-type
 * block. Returns null if the user hasn't added any properties on
 * either side (no animation should run).
 *
 * Per-block keyframes mean the rule contains ONLY the properties the
 * user explicitly added — CSS interpolates unspecified properties
 * to the element's computed style, which matches the editor's
 * "current state of the element" semantic.
 *
 * @param {string} clientId   Block clientId — drives the keyframe
 *                            name so each block gets a unique rule.
 * @param {Object} attributes Block attributes.
 * @return {{ name: string, rule: string }|null}
 */
function getCustomKeyframe( clientId, attributes ) {
	if ( ! clientId ) {
		return null;
	}
	const safeId = String( clientId ).replace( /[^a-z0-9]/gi, '' );
	const name = `mb-custom-${ safeId }`;
	const fromBag = attrsToBag( attributes, FROM_ATTR );
	const toBag = attrsToBag( attributes, TO_ATTR );
	const rule = buildCustomKeyframe( name, fromBag, toBag );
	if ( ! rule ) {
		return null;
	}
	return { name, rule };
}

/**
 * Build the parallax keyframe for the `image-move` preset.
 * Synthesizes from/to bags on-the-fly from the current direction —
 * the user doesn't have to fill in any attributes; picking the
 * effect + a direction is enough.
 *
 * @param {string} clientId
 * @param {string} direction One of 'btt' | 'ttb' | 'ltr' | 'rtl'.
 * @return {{ name: string, rule: string }|null}
 */
function getImageMoveKeyframe( clientId, direction ) {
	if ( ! clientId ) {
		return null;
	}
	const preset = getPresetFromTo( 'image-move', direction || 'btt' );
	if ( ! preset ) {
		return null;
	}
	const safeId = String( clientId ).replace( /[^a-z0-9]/gi, '' );
	const name = `mb-imagemove-${ safeId }`;
	const rule = buildCustomKeyframe( name, preset.from, preset.to );
	if ( ! rule ) {
		return null;
	}
	return { name, rule };
}

/**
 * For target='img' mode, build a scoped CSS string that:
 *
 *   1. Defines the per-block @keyframes (same as block target).
 *   2. Applies `overflow: clip` to the img's immediate parent
 *      (figure / a / block wrapper) using `:has()` so the parent
 *      acts as a clipping frame for the transformed img.
 *   3. Binds the keyframe to the first <img> descendant via a
 *      comma-list of common WP markup paths (`> img:first-of-type`,
 *      `> figure > img:first-of-type`, etc.) so figcaption stays put.
 *   4. Pipes the timing/duration/iteration vars from the wrapper.
 *
 * Returns null if there's nothing to animate. The scoped selectors
 * are namespaced to a unique `data-mb-uid` so the styles only apply
 * to the one block that owns them.
 *
 * @param {string} uid          Unique id (also used in data-mb-uid).
 * @param {Object} keyframe     `{ name, rule }` from getCustomKeyframe.
 * @param {string} animationMode 'page-load' | 'scroll-appear' | 'scroll-interactive'
 * @return {string|null}
 */
function buildImgTargetCSS( uid, keyframe, animationMode ) {
	if ( ! keyframe ) {
		return null;
	}
	const scope = `[data-mb-uid="${ uid }"]`;
	// Use descendant selectors (no `>`) so the same rule works in
	// the editor (where every block is wrapped in extra
	// `block-editor-block-list__block` divs) and on the frontend
	// (where the figure is a direct child of the wrapper).
	// `:first-of-type` only filters among siblings, so img is still
	// scoped to "the first img in its sibling group" — figcaption
	// stays unaffected since it's a different element type.
	const imgSelector = `${ scope } img:first-of-type`;
	// `:has()` lets us style whichever element happens to be the
	// img's immediate parent without injecting a wrapper. Match
	// both:
	//   1. The block wrapper itself (e.g. `<figure data-mb-uid>`
	//      with img as its direct child — the common Image-block
	//      saved markup AND the editor's figure element).
	//   2. A descendant of the wrapper that holds the img (e.g.
	//      a `<figure>` inside a Featured Image's `<a>` wrapper).
	const parentSelector = [
		`${ scope }:has(> img:first-of-type)`,
		`${ scope } :has(> img:first-of-type)`,
	].join( ', ' );

	// Scroll-interactive mode wires the timeline directly on the
	// img so the parent stays a static clipping frame.
	const scrollDriven = animationMode === 'scroll-interactive';

	const animationProps = scrollDriven
		? [
				`animation-name: ${ keyframe.name }`,
				`animation-timeline: view()`,
				`animation-range-start: var(--mb-range-start, entry 0%)`,
				`animation-range-end: var(--mb-range-end, exit 100%)`,
				`animation-duration: 1ms`,
				`animation-fill-mode: both`,
				`animation-timing-function: var(--mb-timing, linear)`,
		  ]
		: [
				`animation-name: ${ keyframe.name }`,
				`animation-duration: var(--mb-duration, 0.6s)`,
				`animation-delay: var(--mb-delay, 0s)`,
				`animation-fill-mode: var(--mb-fill-mode, both)`,
				`animation-timing-function: var(--mb-timing, ease)`,
				`animation-iteration-count: var(--mb-iteration-count, 1)`,
				`animation-direction: var(--mb-direction, normal)`,
		  ];

	return [
		keyframe.rule,
		// Parent of the img becomes the clipping frame.
		`${ parentSelector } { overflow: clip; }`,
		// `overflow: hidden` fallback for browsers without `clip`
		// support (~3% as of 2026). `@supports not` keeps it out of
		// the way of the modern path.
		`@supports not (overflow: clip) { ${ parentSelector } { overflow: hidden; } }`,
		// Bind the keyframe to the img.
		`${ imgSelector } { ${ animationProps.join( '; ' ) }; }`,
	].join( '\n' );
}

/**
 * Add animation attributes to all blocks.
 */
function addAnimationAttributes( settings ) {
	if ( settings.attributes?.animationMode ) {
		return settings;
	}

	return {
		...settings,
		attributes: {
			...settings.attributes,
			animationMode: {
				type: 'string',
				default: '',
			},
			animationType: {
				type: 'string',
				default: '',
			},
			animationDirection: {
				type: 'string',
				default: '',
			},
			animationDuration: {
				type: 'number',
				default: 0.6,
			},
			animationDelay: {
				type: 'number',
				default: 0.4,
			},
			animationRepeat: {
				type: 'string',
				default: 'once',
			},
			animationPauseOffscreen: {
				type: 'boolean',
				default: true,
			},
			animationPlayOnce: {
				type: 'boolean',
				default: true,
			},
			animationScrollTrigger: {
				type: 'string',
				default: 'enter',
			},
			animationExitMode: {
				type: 'string',
				default: 'mirror',
			},
			animationExitType: {
				type: 'string',
				default: 'fade',
			},
			animationExitDirection: {
				type: 'string',
				default: '',
			},
			animationExitDuration: {
				type: 'number',
				default: 0.6,
			},
			animationAcceleration: {
				type: 'string',
				default: 'ease',
			},
			// Stored CSS timing function used when animationAcceleration
			// is set to 'custom'. Free-form so users can enter any valid
			// CSS value (cubic-bezier, steps, linear() with stops, etc.).
			animationCustomTimingFunction: {
				type: 'string',
				default: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
			},
			animationExitDelay: {
				type: 'number',
				default: 0,
			},
			animationExitAcceleration: {
				type: 'string',
				default: 'ease',
			},
			animationExitCustomTimingFunction: {
				type: 'string',
				default: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
			},
			animationBlurAmount: {
				type: 'number',
				default: 8,
			},
			animationRotateAngle: {
				type: 'number',
				default: 90,
			},
			animationRangeStart: {
				type: 'string',
				default: 'entry 0%',
			},
			animationRangeEnd: {
				type: 'string',
				default: 'exit 100%',
			},
			animationPreviewEnabled: {
				type: 'boolean',
				default: true,
			},
			animationPreviewPlaying: {
				type: 'boolean',
				default: false,
			},
			// Custom (Start / End) state — only consulted when
			// animationType === 'custom'. `null` = property not added
			// on that side; the per-block keyframe omits it and CSS
			// falls through to the element's computed style.
			animationFromOpacity: {
				type: [ 'number', 'null' ],
				default: null,
			},
			animationFromTranslateX: {
				type: [ 'string', 'null' ],
				default: null,
			},
			animationFromTranslateY: {
				type: [ 'string', 'null' ],
				default: null,
			},
			animationFromScale: {
				type: [ 'number', 'null' ],
				default: null,
			},
			animationFromRotate: {
				type: [ 'number', 'null' ],
				default: null,
			},
			animationToOpacity: {
				type: [ 'number', 'null' ],
				default: null,
			},
			animationToTranslateX: {
				type: [ 'string', 'null' ],
				default: null,
			},
			animationToTranslateY: {
				type: [ 'string', 'null' ],
				default: null,
			},
			animationToScale: {
				type: [ 'number', 'null' ],
				default: null,
			},
			animationToRotate: {
				type: [ 'number', 'null' ],
				default: null,
			},
			// 3D rotations (Flip support).
			animationFromRotateX: {
				type: [ 'number', 'null' ],
				default: null,
			},
			animationFromRotateY: {
				type: [ 'number', 'null' ],
				default: null,
			},
			animationToRotateX: {
				type: [ 'number', 'null' ],
				default: null,
			},
			animationToRotateY: {
				type: [ 'number', 'null' ],
				default: null,
			},
			// Filter blur.
			animationFromBlur: {
				type: [ 'number', 'null' ],
				default: null,
			},
			animationToBlur: {
				type: [ 'number', 'null' ],
				default: null,
			},
			// Clip-path (Curtain / Wipe support). Stored as the
			// raw CSS value (e.g. `inset(0 50% 0 50%)`).
			animationFromClipPath: {
				type: [ 'string', 'null' ],
				default: null,
			},
			animationToClipPath: {
				type: [ 'string', 'null' ],
				default: null,
			},
			// Which side the user is editing — saved as attribute so
			// it survives remounts of FromToControls.
			animationFromToActiveSide: {
				type: 'string',
				default: 'start',
			},
			// Eye-icon preview side. When set to 'start' or 'end',
			// the editor freezes the block at that side's static
			// values instead of running the keyframe animation.
			animationFromToPreviewSide: {
				type: 'string',
				default: 'off',
			},
			// Animation target: 'block' (default) animates the block
			// wrapper; 'img' animates the first <img> descendant via
			// scoped CSS, with `overflow: clip` on the img's parent
			// so the surrounding markup acts as a clipping frame.
			animationFromToTarget: {
				type: 'string',
				default: 'block',
			},
		},
	};
}

addFilter(
	'blocks.registerBlockType',
	'motion-blocks/add-attributes',
	addAnimationAttributes
);

/**
 * Add animation controls to the block inspector.
 */
const withAnimationControls = createHigherOrderComponent( ( BlockEdit ) => {
	return ( props ) => {
		const { attributes, setAttributes, isSelected, name, clientId } =
			props;

		// Read the full selection from the store. Two reasons:
		//   1. To fan attribute updates across all selected blocks
		//      via `updateBlockAttributes(ids[], attrs)`.
		//   2. To decide whether THIS block should render the
		//      InspectorControls. During multi-select, WP sets
		//      `isSelected: false` on every block — so the prop
		//      alone never lets the panel render. We render for
		//      the first multi-selected block instead.
		const { selectedClientIds, isMultiSelecting, shouldRenderPanel } =
			useSelect(
				( select ) => {
					const sel = select( blockEditorStore );
					const single = sel.getSelectedBlockClientId();
					const multi = sel.getMultiSelectedBlockClientIds
						? sel.getMultiSelectedBlockClientIds()
						: [];
					const ids =
						multi.length > 0
							? multi
							: single
							? [ single ]
							: [];
					const isMulti = multi.length > 1;
					// Render only one copy of the panel: for single
					// selection use the standard isSelected prop;
					// for multi, render on the first selected block.
					const renderHere = isMulti
						? multi[ 0 ] === clientId
						: single === clientId;
					return {
						selectedClientIds:
							ids.length > 0 ? ids : [ clientId ],
						isMultiSelecting: isMulti,
						shouldRenderPanel: renderHere,
					};
				},
				[ clientId ]
			);
		const { updateBlockAttributes } = useDispatch( blockEditorStore );

		// When multi-selecting, route attribute updates through the
		// store dispatch so they apply to every selected block at
		// once. Single-selection falls through to the standard
		// per-block setAttributes for parity with everything else.
		const fanSetAttributes = useCallback(
			( newAttrs ) => {
				if ( isMultiSelecting ) {
					updateBlockAttributes( selectedClientIds, newAttrs );
				} else {
					setAttributes( newAttrs );
				}
			},
			[
				isMultiSelecting,
				selectedClientIds,
				setAttributes,
				updateBlockAttributes,
			]
		);

		// Safety net: when the block deselects, turn off the From/To
		// preview. Otherwise a user who previewed a side that moved
		// the block far off-screen would be unable to click it again
		// to disable the preview — the click target is wherever the
		// transform put it.
		useEffect( () => {
			if (
				! isSelected &&
				attributes.animationFromToPreviewSide &&
				attributes.animationFromToPreviewSide !== 'off'
			) {
				setAttributes( {
					animationFromToPreviewSide: 'off',
				} );
			}
			// Only react to selection changes — running this on every
			// attribute change would clear the preview as soon as the
			// user toggles it on.
			// eslint-disable-next-line react-hooks/exhaustive-deps
		}, [ isSelected ] );

		return (
			<>
				<BlockEdit { ...props } />
				{ shouldRenderPanel && (
					<InspectorControls>
						<AnimationPanel
							attributes={ attributes }
							setAttributes={ fanSetAttributes }
							blockName={ name }
							clientId={ clientId }
							multiSelectCount={
								isMultiSelecting
									? selectedClientIds.length
									: 0
							}
						/>
					</InspectorControls>
				) }
			</>
		);
	};
}, 'withAnimationControls' );

addFilter(
	'editor.BlockEdit',
	'motion-blocks/with-animation-controls',
	withAnimationControls
);

/**
 * Apply animation preview via BlockListBlock className.
 *
 * The toolbar lives in the parent document while blocks render inside
 * an iframe, so className-based animation on the block element does
 * NOT affect the toolbar.
 */
const withAnimationPreview = createHigherOrderComponent(
	( BlockListBlock ) => {
		return ( props ) => {
			const { attributes, wrapperProps = {} } = props;
			const {
				animationMode,
				animationType,
				animationDirection,
				animationDuration,
				animationDelay,
				animationAcceleration,
				animationCustomTimingFunction,
				animationBlurAmount,
				animationRotateAngle,
				animationRepeat,
				animationRangeStart,
				animationRangeEnd,
				animationPreviewEnabled,
				animationPreviewPlaying,
				animationFromToPreviewSide,
			} = attributes;

			// Static state preview — eye icon in the From/To panel.
			// When 'start' or 'end' is chosen, freeze the editor block
			// at that side's values (no animation, no triggered class
			// hides). Takes precedence over every animation branch
			// below.
			if (
				animationType === 'custom' &&
				animationFromToPreviewSide &&
				animationFromToPreviewSide !== 'off'
			) {
				const sideMap =
					animationFromToPreviewSide === 'start'
						? FROM_ATTR
						: TO_ATTR;
				const bag = attrsToBag( attributes, sideMap );
				const sideStyles = bagToReactStyles( bag );
				// Force opacity:1 if the user didn't add opacity to
				// this side — otherwise the .mb-mode-page-load /
				// scroll-appear initial-hide rules would render the
				// block invisible during preview.
				if ( sideStyles.opacity === undefined ) {
					sideStyles.opacity = 1;
				}

				// Honor Target = Image only: apply the preview
				// styles to the inner <img> via scoped CSS rather
				// than the block wrapper. Mirrors the same selector
				// pattern used by the live image-target keyframe.
				const target =
					attributes.animationFromToTarget || 'block';
				if ( target === 'img' ) {
					const safeId = String( props.clientId ).replace(
						/[^a-z0-9]/gi,
						''
					);
					const scope = `[data-mb-uid="${ safeId }"]`;
					const decls = Object.entries( sideStyles )
						.map( ( [ k, v ] ) => {
							const cssK = k.replace(
								/[A-Z]/g,
								( m ) => '-' + m.toLowerCase()
							);
							return `${ cssK }: ${ v }`;
						} )
						.join( '; ' );
					const previewCSS = [
						`${ scope }:has(> img:first-of-type), ${ scope } :has(> img:first-of-type) { overflow: clip; }`,
						`@supports not (overflow: clip) { ${ scope }:has(> img:first-of-type), ${ scope } :has(> img:first-of-type) { overflow: hidden; } }`,
						`${ scope } img:first-of-type { ${ decls }; animation-name: none; }`,
					].join( '\n' );
					return (
						<>
							<style>{ previewCSS }</style>
							<BlockListBlock
								{ ...props }
								className={ props.className }
								wrapperProps={ {
									...wrapperProps,
									'data-mb-uid': safeId,
								} }
							/>
						</>
					);
				}

				return (
					// Fragment-wrap with a null sibling so this return
					// has the same React tree shape as every other
					// branch in this HOC (style|null at index 0,
					// BlockListBlock at index 1). Shape consistency
					// keeps BlockListBlock from remounting when state
					// transitions between branches.
					<>
						{ null }
						<BlockListBlock
							{ ...props }
							className={ props.className }
							wrapperProps={ {
								...wrapperProps,
								style: {
									...( wrapperProps.style || {} ),
									...sideStyles,
									animationName: 'none',
								},
							} }
						/>
					</>
				);
			}

			// Custom mode at rest — page-load and scroll-appear normally
			// auto-play the keyframe animation in the editor on every
			// re-render, which is distracting while the user is editing
			// per-property values. Skip the animation entirely until
			// the user clicks Play (which sets animationPreviewPlaying).
			// Scroll-interactive doesn't auto-play in editor anyway
			// (no scroll), so it's left alone.
			if (
				animationType === 'custom' &&
				( animationMode === 'page-load' ||
					animationMode === 'scroll-appear' ) &&
				! animationPreviewPlaying
			) {
				// Same Fragment shape as every other return in this
				// HOC. Without the wrapping Fragment, transitioning
				// from "rest" (this branch) to "playing" (the main
				// path) would change the React tree shape from a
				// bare BlockListBlock to a Fragment with BlockListBlock
				// at index 1 — forcing a remount + visible flicker.
				return (
					<>
						{ null }
						<BlockListBlock { ...props } />
					</>
				);
			}

			// Resolve `custom` acceleration to the user's custom CSS
			// timing function string. Used wherever the legacy code
			// passed `animationAcceleration` directly.
			const resolvedTiming = resolveTimingFunction(
				animationAcceleration,
				animationCustomTimingFunction
			);

			// Computed values — updated by the matching branch below.
			let computedWrapperProps = wrapperProps;
			let computedClassName = props.className;
			// Per-block @keyframes rule for custom-type animations.
			// Injected next to BlockListBlock as a sibling <style>.
			let injectedKeyframeRule = null;

			// Resolve the keyframe once — used by both branches.
			// `image-move` is a parallax preset that synthesizes its
			// keyframe from the direction (the user only picks an
			// axis, no manual from/to). It's effectively "custom
			// with img target" with the parallax math baked in.
			let customKeyframe = null;
			if ( animationType === 'custom' ) {
				customKeyframe = getCustomKeyframe(
					props.clientId,
					attributes
				);
			} else if ( animationType === 'image-move' ) {
				customKeyframe = getImageMoveKeyframe(
					props.clientId,
					animationDirection
				);
			}

			// `target = 'img'` reroutes the keyframe binding to a
			// scoped CSS rule that animates the first <img> descendant
			// instead of the block wrapper, with `overflow: clip` on
			// the img's parent so the surrounding markup acts as a
			// clipping frame. `image-move` always uses img target.
			const target = attributes.animationFromToTarget || 'block';
			const targetIsImg =
				animationType === 'image-move' ||
				( animationType === 'custom' && target === 'img' );
			const customUid = customKeyframe
				? customKeyframe.name.replace( /^mb-(custom|imagemove)-/, '' )
				: null;
			const imgTargetCSS = targetIsImg
				? buildImgTargetCSS(
						customUid,
						customKeyframe,
						animationMode
				  )
				: null;

			// Scroll-interactive: persistent scroll-driven animation.
			if (
				animationMode === 'scroll-interactive' &&
				animationType &&
				animationPreviewEnabled !== false
			) {
				const dirStyles =
					animationType === 'custom'
						? {}
						: getDirectionStyles(
								animationType,
								animationDirection
						  );

				const rangeStartVal =
					animationRangeStart || 'entry 0%';
				const rangeEndVal =
					animationRangeEnd || 'exit 100%';
				// For custom: use the per-block keyframe name; if no
				// properties are added, animation-name is empty and
				// the block won't animate (which is the right call).
				// For target='img' (and image-move, which is always
				// img-target): don't animate the wrapper at all —
				// the scoped CSS targets the inner img.
				const isCustomLike =
					animationType === 'custom' ||
					animationType === 'image-move';
				const resolvedAnimationName = targetIsImg
					? 'none'
					: isCustomLike
					? customKeyframe
						? customKeyframe.name
						: 'none'
					: getEnterKeyframe( animationType );
				const scrollInteractiveStyles = {
					...( wrapperProps.style || {} ),
					...dirStyles,
					animationName: resolvedAnimationName,
				};
				// Only set scroll-driven props on the wrapper when
				// it's the animation target; for img target the same
				// props go on the img via scoped CSS.
				if ( ! targetIsImg ) {
					scrollInteractiveStyles.animationTimeline = 'view()';
					scrollInteractiveStyles.animationRangeStart =
						rangeStartVal;
					scrollInteractiveStyles.animationRangeEnd =
						rangeEndVal;
					scrollInteractiveStyles.animationDuration = '1ms';
					scrollInteractiveStyles.animationTimingFunction =
						resolvedTiming;
					scrollInteractiveStyles.animationFillMode = 'both';
				} else {
					// Pass timing vars down so img CSS can read them.
					scrollInteractiveStyles[ '--mb-range-start' ] =
						rangeStartVal;
					scrollInteractiveStyles[ '--mb-range-end' ] =
						rangeEndVal;
					scrollInteractiveStyles[ '--mb-timing' ] =
						resolvedTiming;
				}
				if ( animationType === 'blur' ) {
					scrollInteractiveStyles[ '--mb-blur-amount' ] =
						( animationBlurAmount ?? 8 ) + 'px';
				}
				if ( animationType === 'rotate' ) {
					scrollInteractiveStyles[ '--mb-rotate-angle' ] =
						( animationRotateAngle ?? 90 ) + 'deg';
				}
				if ( imgTargetCSS ) {
					injectedKeyframeRule = imgTargetCSS;
				} else if ( customKeyframe ) {
					injectedKeyframeRule = customKeyframe.rule;
				}
				computedWrapperProps = {
					...wrapperProps,
					style: scrollInteractiveStyles,
				};
				if ( targetIsImg && customUid ) {
					computedWrapperProps[ 'data-mb-uid' ] = customUid;
				}
			}

			// Page-load / Scroll-appear: class-based preview.
			else {
				const repeat = animationRepeat || 'once';
				const isLooping =
					repeat === 'loop' || repeat === 'alternate';

				const isPageLoadOrScrollAppear =
					animationMode === 'page-load' ||
					animationMode === 'scroll-appear';
				const shouldAnimate =
					isPageLoadOrScrollAppear && animationType
						? isLooping
							? animationPreviewPlaying
							: true
						: false;

				if ( shouldAnimate ) {
					computedClassName = [
						props.className || '',
						'mb-preview',
						`mb-animate-enter-${ animationType }`,
					]
						.filter( Boolean )
						.join( ' ' );

					const duration = animationDuration || 0.6;
					const delay = animationDelay || 0;
					const dirStyles =
						animationType === 'custom'
							? {}
							: getDirectionStyles(
									animationType,
									animationDirection
							  );

					const previewStyles = {
						...( wrapperProps.style || {} ),
						...dirStyles,
						'--mb-duration': `${ duration }s`,
						'--mb-delay': `${ delay }s`,
						'--mb-timing': resolvedTiming,
						'--mb-iteration-count': isLooping
							? 'infinite'
							: '1',
						'--mb-direction':
							repeat === 'alternate'
								? 'alternate'
								: 'normal',
						'--mb-fill-mode': isLooping ? 'none' : 'both',
					};
					if ( animationType === 'blur' ) {
						previewStyles[ '--mb-blur-amount' ] =
							( animationBlurAmount ?? 8 ) + 'px';
					}
					if ( animationType === 'rotate' ) {
						previewStyles[ '--mb-rotate-angle' ] =
							( animationRotateAngle ?? 90 ) + 'deg';
					}
					// Custom-type: bind animation-name to the per-block
					// keyframe via inline style. Inline style wins over
					// the class-based binding so the unique keyframe
					// runs instead of any shared one.
					if ( animationType === 'custom' ) {
						if ( targetIsImg ) {
							// Wrapper doesn't animate; the scoped CSS
							// drives the img. The CSS reads timing
							// vars from the wrapper via inheritance.
							previewStyles.animationName = 'none';
							if ( imgTargetCSS ) {
								injectedKeyframeRule = imgTargetCSS;
							}
						} else if ( customKeyframe ) {
							previewStyles.animationName = customKeyframe.name;
							injectedKeyframeRule = customKeyframe.rule;
						} else {
							// No properties added — disable animation.
							previewStyles.animationName = 'none';
						}
					}
					computedWrapperProps = {
						...wrapperProps,
						style: previewStyles,
					};
					if ( targetIsImg && customUid ) {
						computedWrapperProps[ 'data-mb-uid' ] = customUid;
					}
				}
			}

			// Single return — BlockListBlock is always at the same
			// position in the React tree (index 1 inside the Fragment),
			// so it never remounts when switching animation states.
			// The optional <style> at index 0 emits a per-block
			// @keyframes rule for custom-type animations.
			return (
				<>
					{ injectedKeyframeRule ? (
						<style>{ injectedKeyframeRule }</style>
					) : null }
					<BlockListBlock
						{ ...props }
						className={ computedClassName }
						wrapperProps={ computedWrapperProps }
					/>
				</>
			);
		};
	},
	'withAnimationPreview'
);

// Priority 190 ensures this HOC runs after other filters that modify
// wrapperProps (e.g. block supports), so our style/className wins.
addFilter(
	'editor.BlockListBlock',
	'motion-blocks/with-animation-preview',
	withAnimationPreview,
	190
);

/**
 * Add animation classes and data attributes to saved block content.
 */
function addAnimationSaveProps( props, blockType, attributes ) {
	const { animationMode, animationType } = attributes;

	const mode = animationMode;

	if ( ! mode || ! animationType ) {
		return props;
	}

	const classNames = [
		props.className || '',
		'mb-animated',
		`mb-enter-${ animationType }`,
		`mb-mode-${ mode }`,
	];

	const dataAttrs = {
		'data-mb-mode': mode,
		'data-mb-type': animationType,
	};

	// Animation target ('img' vs 'block'). When 'img', the frontend
	// script generates a per-element uid at init time and injects
	// scoped CSS that animates the first <img> descendant with
	// `overflow: clip` on its parent. The saved HTML only needs to
	// signal the intent — the uid is a runtime detail.
	//
	// `image-move` always implies img target (it's a parallax preset
	// scoped to a child img, not the wrapper).
	if ( animationType === 'image-move' ) {
		dataAttrs[ 'data-mb-target' ] = 'img';
	} else if ( animationType === 'custom' ) {
		const target = attributes.animationFromToTarget || 'block';
		if ( target === 'img' ) {
			dataAttrs[ 'data-mb-target' ] = 'img';
		}
	}

	// Acceleration (timing function). Resolve the `custom` sentinel
	// to the actual CSS timing function string so the frontend
	// doesn't need to know about it.
	const acceleration = resolveTimingFunction(
		attributes.animationAcceleration ||
			DEFAULT_ATTRIBUTES.animationAcceleration,
		attributes.animationCustomTimingFunction ||
			DEFAULT_ATTRIBUTES.animationCustomTimingFunction
	);
	if ( acceleration !== 'ease' ) {
		dataAttrs[ 'data-mb-acceleration' ] = acceleration;
	}

	// Direction (for types that have one).
	if ( attributes.animationDirection ) {
		dataAttrs[ 'data-mb-direction' ] = attributes.animationDirection;
	}

	// Blur amount (only when type is blur and value differs from default).
	if ( animationType === 'blur' ) {
		const blurAmount =
			attributes.animationBlurAmount ??
			DEFAULT_ATTRIBUTES.animationBlurAmount;
		if ( blurAmount !== DEFAULT_ATTRIBUTES.animationBlurAmount ) {
			dataAttrs[ 'data-mb-blur-amount' ] = String( blurAmount );
		}
	}

	// Rotate angle (only when type is rotate and value differs from default).
	if ( animationType === 'rotate' ) {
		const rotateAngle =
			attributes.animationRotateAngle ??
			DEFAULT_ATTRIBUTES.animationRotateAngle;
		if ( rotateAngle !== DEFAULT_ATTRIBUTES.animationRotateAngle ) {
			dataAttrs[ 'data-mb-rotate-angle' ] = String( rotateAngle );
		}
	}

	// Custom (From/To) — emit one data attr per side per property.
	// Frontend reads these and sets the matching `--mb-from-*` /
	// `--mb-to-*` CSS custom properties on the element.
	if ( animationType === 'custom' ) {
		for ( const def of PROPERTY_DEFINITIONS ) {
			const cssName = PROPERTY_CSS_VAR[ def.id ];
			const fromVal = attributes[ FROM_ATTR[ def.id ] ];
			const toVal = attributes[ TO_ATTR[ def.id ] ];
			if (
				fromVal !== undefined &&
				fromVal !== null &&
				fromVal !== ''
			) {
				dataAttrs[ `data-mb-from-${ cssName }` ] = String( fromVal );
			}
			if ( toVal !== undefined && toVal !== null && toVal !== '' ) {
				dataAttrs[ `data-mb-to-${ cssName }` ] = String( toVal );
			}
		}
	}

	// Page-load and scroll-appear: duration + delay.
	if ( mode === 'page-load' || mode === 'scroll-appear' ) {
		dataAttrs[ 'data-mb-duration' ] = String(
			attributes.animationDuration ?? DEFAULT_ATTRIBUTES.animationDuration
		);
		dataAttrs[ 'data-mb-delay' ] = String(
			attributes.animationDelay ?? DEFAULT_ATTRIBUTES.animationDelay
		);
	}

	// Page-load only: repeat + pause-offscreen.
	if ( mode === 'page-load' ) {
		dataAttrs[ 'data-mb-repeat' ] =
			attributes.animationRepeat || DEFAULT_ATTRIBUTES.animationRepeat;
		dataAttrs[ 'data-mb-pause-offscreen' ] = String(
			attributes.animationPauseOffscreen ??
				DEFAULT_ATTRIBUTES.animationPauseOffscreen
		);
	}

	// Scroll-appear: trigger, exit, play-once.
	if ( mode === 'scroll-appear' ) {
		const trigger =
			attributes.animationScrollTrigger ||
			DEFAULT_ATTRIBUTES.animationScrollTrigger;
		dataAttrs[ 'data-mb-scroll-trigger' ] = trigger;
		dataAttrs[ 'data-mb-play-once' ] = String(
			attributes.animationPlayOnce ??
				DEFAULT_ATTRIBUTES.animationPlayOnce
		);

		// Determine exit type for class and data attrs.
		if ( trigger === 'exit' || trigger === 'both' ) {
			const exitMode =
				attributes.animationExitMode ||
				DEFAULT_ATTRIBUTES.animationExitMode;
			dataAttrs[ 'data-mb-exit-mode' ] = exitMode;

			if ( exitMode === 'custom' ) {
				const exitType =
					attributes.animationExitType ||
					DEFAULT_ATTRIBUTES.animationExitType;
				classNames.push( `mb-exit-${ exitType }` );
				dataAttrs[ 'data-mb-exit-type' ] = exitType;
				if ( attributes.animationExitDirection ) {
					dataAttrs[ 'data-mb-exit-direction' ] =
						attributes.animationExitDirection;
				}
				dataAttrs[ 'data-mb-exit-duration' ] = String(
					attributes.animationExitDuration ??
						DEFAULT_ATTRIBUTES.animationExitDuration
				);
				dataAttrs[ 'data-mb-exit-delay' ] = String(
					attributes.animationExitDelay ??
						DEFAULT_ATTRIBUTES.animationExitDelay
				);
				const exitAccel = resolveTimingFunction(
					attributes.animationExitAcceleration ||
						DEFAULT_ATTRIBUTES.animationExitAcceleration,
					attributes.animationExitCustomTimingFunction ||
						DEFAULT_ATTRIBUTES.animationExitCustomTimingFunction
				);
				if ( exitAccel !== 'ease' ) {
					dataAttrs[ 'data-mb-exit-acceleration' ] = exitAccel;
				}
			} else {
				// Mirror: exit class derived from enter type.
				classNames.push( `mb-exit-${ animationType }` );
			}
		}

		// Exit-only: the enter class is still on the element for the
		// enter type, but we also need the exit class.
		if ( trigger === 'exit' ) {
			// For exit-only, the "enter type" is actually the exit animation.
			// Re-map: remove the enter class, add exit class instead.
			const exitIdx = classNames.indexOf(
				`mb-enter-${ animationType }`
			);
			if ( exitIdx !== -1 ) {
				classNames[ exitIdx ] = `mb-exit-${ animationType }`;
			}
		}
	}

	// Scroll-interactive: range.
	if ( mode === 'scroll-interactive' ) {
		dataAttrs[ 'data-mb-range-start' ] =
			attributes.animationRangeStart ||
			DEFAULT_ATTRIBUTES.animationRangeStart;
		dataAttrs[ 'data-mb-range-end' ] =
			attributes.animationRangeEnd ||
			DEFAULT_ATTRIBUTES.animationRangeEnd;
		if ( attributes.animationDirection ) {
			dataAttrs[ 'data-mb-direction' ] = attributes.animationDirection;
		}
	}

	return {
		...props,
		className: classNames.filter( Boolean ).join( ' ' ).trim(),
		...dataAttrs,
	};
}

addFilter(
	'blocks.getSaveContent.extraProps',
	'motion-blocks/add-save-props',
	addAnimationSaveProps
);
