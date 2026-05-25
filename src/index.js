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
	DIRECTION_CSS_VARS,
	TYPES_WITH_DIRECTION,
	DEFAULT_DIRECTION,
	PROPERTY_DEFINITIONS,
	FROM_ATTR,
	TO_ATTR,
	PROPERTY_CSS_VAR,
	STAGGER_PARENT_BLOCKS,
	STAGGER_INCOMPATIBLE_TYPES,
	isStaggerCompatible,
	staggerStepSeconds,
	attrsToBag,
	bagToReactStyles,
	buildCustomKeyframe,
	getPresetFromTo,
	isPropertyAdded,
	migrateScrollAppearAttrs,
	resolveTimingFunction,
} from './components/constants';

import '../css/editor.scss';

// Page-level settings panel — registers itself via registerPlugin
// on import. Lives in the Document/Page tab of the inspector.
import './components/PageSettingsPanel';

/**
 * One-time runtime style injection.
 *
 * `__experimentalConfirmDialog` doesn't forward `className`, `style`,
 * or `modalProps` to its inner Modal in this WP version, so the
 * normal "set max-width via prop" path fails. Targeting the always-
 * present `.components-confirm-dialog` class via CSS works, but
 * stylesheet enqueue versioning + browser/page caches in admin make
 * dev iteration unreliable.
 *
 * Inject the rule directly into <head> as a JS-built <style>. The JS
 * bundle's asset-hash version already busts cache reliably, so this
 * styles ride along. Idempotent via the element id check.
 */
if ( typeof document !== 'undefined' ) {
	const STYLE_ID = 'mb-runtime-styles';
	if ( ! document.getElementById( STYLE_ID ) ) {
		const styleEl = document.createElement( 'style' );
		styleEl.id = STYLE_ID;
		styleEl.textContent = `
			.components-modal__frame.components-confirm-dialog { max-width: 512px; }
		`;
		document.head.appendChild( styleEl );
	}
}

/**
 * Get the entrance keyframe name for a given animation type.
 */
function getEnterKeyframe( type ) {
	return ENTER_KEYFRAME_MAP[ type ] || '';
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
 * Build the scale-in keyframe for the `image-zoom` preset.
 * No direction needed — pure scale(1) → scale(1.2). Companion to
 * getImageMoveKeyframe(); shares the same synthesis pattern.
 *
 * @param {string} clientId
 * @return {{ name: string, rule: string }|null}
 */
function getImageZoomKeyframe( clientId ) {
	if ( ! clientId ) {
		return null;
	}
	const preset = getPresetFromTo( 'image-zoom' );
	if ( ! preset ) {
		return null;
	}
	const safeId = String( clientId ).replace( /[^a-z0-9]/gi, '' );
	const name = `mb-imagezoom-${ safeId }`;
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

	// `overflow: clip` on the img's immediate parent provides a
	// static clipping rectangle that the transformed img child
	// renders against. Putting clip-path on the img instead does
	// NOT achieve the same effect: clip-path follows the img's
	// transform, so a scaled img's clip moves with the image
	// rather than acting as a fixed frame at the natural border.
	// Captioned Image blocks: the figcaption is a separate sibling
	// of the img inside the figure, so clipping at the parent does
	// pull the caption into the clipped area — that's a known
	// limitation; the caption case needs a separate wrapper around
	// just the img.
	return [
		keyframe.rule,
		`${ parentSelector } { overflow: clip; }`,
		`@supports not (overflow: clip) { ${ parentSelector } { overflow: hidden; } }`,
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
				// Matches DEFAULT_ATTRIBUTES.animationType in constants.js.
				// A block with no animation has animationMode = '' which
				// short-circuits all save-props / render paths, so the
				// non-empty default only surfaces once a mode is picked.
				default: 'fade',
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
			animationPreviewSlot: {
				type: 'string',
				default: 'entry',
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
			// Rotate / blur are stored as unit-bearing strings
			// (`"45deg"`, `"8px"`) — same convention as translate
			// (which has always been a string). Old saves carrying
			// a bare number deserialize fine and are normalized at
			// read time via `coerceWithUnit` in constants.js.
			animationFromRotate: {
				type: [ 'string', 'number', 'null' ],
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
				type: [ 'string', 'number', 'null' ],
				default: null,
			},
			// 3D rotations (Flip support).
			animationFromRotateX: {
				type: [ 'string', 'number', 'null' ],
				default: null,
			},
			animationFromRotateY: {
				type: [ 'string', 'number', 'null' ],
				default: null,
			},
			animationToRotateX: {
				type: [ 'string', 'number', 'null' ],
				default: null,
			},
			animationToRotateY: {
				type: [ 'string', 'number', 'null' ],
				default: null,
			},
			// Filter blur.
			animationFromBlur: {
				type: [ 'string', 'number', 'null' ],
				default: null,
			},
			animationToBlur: {
				type: [ 'string', 'number', 'null' ],
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
			// Stagger cascade — only meaningful on STAGGER_PARENT_BLOCKS.
			// When `animationStaggerEnabled` is true, the parent block
			// stops animating itself and becomes the cascade controller
			// for its inner blocks (step in seconds applied via CSS
			// :nth-child).
			animationStaggerEnabled: {
				type: 'boolean',
				default: false,
			},
			animationStaggerStep: {
				type: 'number',
				// Seconds, matching DEFAULT_ATTRIBUTES.animationStaggerStep.
				// Legacy ms values (e.g. 100) deserialize via the
				// `staggerStepSeconds()` heuristic in constants.js, which
				// folds anything > 5 down by /1000. New saves should
				// always be in seconds.
				default: 0.1,
			},
			// --- Slot model: per-slot attribute pairs (Scroll Appear) ---
			// Each Scroll Appear block stores its Entry and Exit slot
			// configs independently. Empty string for type = "slot is
			// empty, no animation for that phase." See constants.js →
			// migrateScrollAppearAttrs for how legacy blocks map onto
			// these.
			animationEntryType: { type: 'string', default: '' },
			animationEntryDirection: { type: 'string', default: '' },
			animationEntryDuration: { type: 'number', default: 0.6 },
			animationEntryDelay: { type: 'number', default: 0.4 },
			animationEntryAcceleration: { type: 'string', default: 'ease' },
			animationEntryCustomTimingFunction: {
				type: 'string',
				default: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
			},
			animationEntryBlurAmount: { type: 'number', default: 8 },
			animationEntryRotateAngle: { type: 'number', default: 90 },
			animationExitType: { type: 'string', default: '' },
			animationExitDirection: { type: 'string', default: '' },
			animationExitDuration: { type: 'number', default: 0.6 },
			animationExitDelay: { type: 'number', default: 0 },
			animationExitAcceleration: { type: 'string', default: 'ease' },
			animationExitCustomTimingFunction: {
				type: 'string',
				default: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
			},
			animationExitBlurAmount: { type: 'number', default: 8 },
			animationExitRotateAngle: { type: 'number', default: 90 },
			// Per-slot Custom From/To values.
			animationEntryFromOpacity: { type: [ 'number', 'null' ], default: null },
			animationEntryFromTranslateX: { type: [ 'string', 'null' ], default: null },
			animationEntryFromTranslateY: { type: [ 'string', 'null' ], default: null },
			animationEntryFromScale: { type: [ 'number', 'null' ], default: null },
			animationEntryFromRotate: { type: [ 'string', 'number', 'null' ], default: null },
			animationEntryFromRotateX: { type: [ 'string', 'number', 'null' ], default: null },
			animationEntryFromRotateY: { type: [ 'string', 'number', 'null' ], default: null },
			animationEntryFromBlur: { type: [ 'string', 'number', 'null' ], default: null },
			animationEntryFromClipPath: { type: [ 'string', 'null' ], default: null },
			animationEntryToOpacity: { type: [ 'number', 'null' ], default: null },
			animationEntryToTranslateX: { type: [ 'string', 'null' ], default: null },
			animationEntryToTranslateY: { type: [ 'string', 'null' ], default: null },
			animationEntryToScale: { type: [ 'number', 'null' ], default: null },
			animationEntryToRotate: { type: [ 'string', 'number', 'null' ], default: null },
			animationEntryToRotateX: { type: [ 'string', 'number', 'null' ], default: null },
			animationEntryToRotateY: { type: [ 'string', 'number', 'null' ], default: null },
			animationEntryToBlur: { type: [ 'string', 'number', 'null' ], default: null },
			animationEntryToClipPath: { type: [ 'string', 'null' ], default: null },
			animationExitFromOpacity: { type: [ 'number', 'null' ], default: null },
			animationExitFromTranslateX: { type: [ 'string', 'null' ], default: null },
			animationExitFromTranslateY: { type: [ 'string', 'null' ], default: null },
			animationExitFromScale: { type: [ 'number', 'null' ], default: null },
			animationExitFromRotate: { type: [ 'string', 'number', 'null' ], default: null },
			animationExitFromRotateX: { type: [ 'string', 'number', 'null' ], default: null },
			animationExitFromRotateY: { type: [ 'string', 'number', 'null' ], default: null },
			animationExitFromBlur: { type: [ 'string', 'number', 'null' ], default: null },
			animationExitFromClipPath: { type: [ 'string', 'null' ], default: null },
			animationExitToOpacity: { type: [ 'number', 'null' ], default: null },
			animationExitToTranslateX: { type: [ 'string', 'null' ], default: null },
			animationExitToTranslateY: { type: [ 'string', 'null' ], default: null },
			animationExitToScale: { type: [ 'number', 'null' ], default: null },
			animationExitToRotate: { type: [ 'string', 'number', 'null' ], default: null },
			animationExitToRotateX: { type: [ 'string', 'number', 'null' ], default: null },
			animationExitToRotateY: { type: [ 'string', 'number', 'null' ], default: null },
			animationExitToBlur: { type: [ 'string', 'number', 'null' ], default: null },
			animationExitToClipPath: { type: [ 'string', 'null' ], default: null },
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

		// Same safety net for the Play preview itself. Looping
		// animations (Repeat = Loop / Back-and-forth) keep running
		// indefinitely after the user clicks Play; if they then
		// click another block on the page the loop would otherwise
		// keep animating in the canvas with no way to halt it short
		// of re-selecting the original block and pressing Stop.
		// Non-looping previews auto-clear after duration+delay
		// anyway, but turning them off on deselect is harmless and
		// keeps the behavior consistent across Repeat options.
		useEffect( () => {
			if ( ! isSelected && attributes.animationPreviewPlaying ) {
				setAttributes( {
					animationPreviewPlaying: false,
				} );
			}
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
 * For Scroll Appear blocks, map the active slot's per-slot attrs
 * onto the shared `animationType` / `animationDuration` / etc.
 * names the preview HOC reads. Lets the rest of the HOC stay
 * mode-agnostic.
 *
 * Slot selection: when `animationPreviewPlaying` is true the HOC
 * uses `animationPreviewSlot` (set by ScrollAppearControls' Play
 * button) to pick Entry or Exit. At rest the HOC defaults to the
 * Entry slot — that's the slot whose initial-state is most
 * relevant for the editor-at-rest visual (Exit slot's initial
 * state IS the natural "visible" state of the element).
 *
 * Also copies the chosen slot's Custom From/To values onto the
 * shared `animationFrom*` / `animationTo*` keys so the custom
 * keyframe builder (which still reads the shared keys) can pick
 * them up unchanged.
 *
 * Returns the same `attrs` reference unchanged when the chosen
 * slot is empty — the preview branch will see `animationType === ''`
 * and skip animating.
 */
function aliasSlotForPreview( attrs ) {
	const previewSlot =
		attrs?.animationPreviewPlaying && attrs?.animationPreviewSlot === 'exit'
			? 'exit'
			: 'entry';
	const slotPrefix = previewSlot === 'exit' ? 'Exit' : 'Entry';
	const slotType = attrs?.[ `animation${ slotPrefix }Type` ] || '';
	if ( ! slotType ) {
		// Chosen slot is empty — preview shows nothing. Keep the
		// wrapper attrs as-is so the HOC's "no animationType" guard
		// fires. Also tag the preview slot so downstream code knows
		// which set of classes to emit even when there's no animation.
		return { ...attrs, animationType: '', __mbPreviewSlot: previewSlot };
	}
	const aliased = {
		...attrs,
		animationType: slotType,
		animationDirection: attrs[ `animation${ slotPrefix }Direction` ] || '',
		animationDuration:
			attrs[ `animation${ slotPrefix }Duration` ] ?? attrs.animationDuration,
		animationDelay:
			attrs[ `animation${ slotPrefix }Delay` ] ?? attrs.animationDelay,
		animationAcceleration:
			attrs[ `animation${ slotPrefix }Acceleration` ] ||
			attrs.animationAcceleration,
		animationCustomTimingFunction:
			attrs[ `animation${ slotPrefix }CustomTimingFunction` ] ||
			attrs.animationCustomTimingFunction,
		animationBlurAmount:
			attrs[ `animation${ slotPrefix }BlurAmount` ] ??
			attrs.animationBlurAmount,
		animationRotateAngle:
			attrs[ `animation${ slotPrefix }RotateAngle` ] ??
			attrs.animationRotateAngle,
		__mbPreviewSlot: previewSlot,
	};
	if ( slotType === 'custom' ) {
		// Copy the active slot's Custom From/To values onto the
		// shared keys that getCustomKeyframe / attrsToBag read.
		for ( const prop of Object.keys( FROM_ATTR ) ) {
			const sharedFrom = FROM_ATTR[ prop ];
			const sharedTo = TO_ATTR[ prop ];
			const slotFrom = sharedFrom.replace(
				/^animationFrom/,
				`animation${ slotPrefix }From`
			);
			const slotTo = sharedTo.replace(
				/^animationTo/,
				`animation${ slotPrefix }To`
			);
			aliased[ sharedFrom ] = attrs[ slotFrom ] ?? null;
			aliased[ sharedTo ] = attrs[ slotTo ] ?? null;
		}
	}
	return aliased;
}

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
			const { wrapperProps = {} } = props;
			// For Scroll Appear, normalize legacy attrs into slot form
			// then alias the Entry slot's per-slot attrs onto the shared
			// `animationType` / `animationDuration` / etc. names that
			// the rest of this HOC reads. The preview only ever shows
			// the Entry phase — exit previewing is out of scope today.
			// `migrateScrollAppearAttrs` runs for every mode now —
			// in addition to the slot-model migration, it normalizes
			// Custom From/To unit-bearing values (rotate / blur from
			// bare numbers to canonical strings).
			const attributes =
				props.attributes?.animationMode === 'scroll-appear'
					? aliasSlotForPreview(
							migrateScrollAppearAttrs( props.attributes )
					  )
					: migrateScrollAppearAttrs( props.attributes );
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
							<BlockListBlock
								{ ...props }
								wrapperProps={ {
									...wrapperProps,
									'data-mb-uid': safeId,
								} }
							/>
							<style>{ previewCSS }</style>
						</>
					);
				}

				return (
					// Fragment-wrap with a null sibling so this return
					// has the same React tree shape as every other
					// branch in this HOC (BlockListBlock at index 0,
					// style|null at index 1). Shape consistency keeps
					// BlockListBlock from remounting when state
					// transitions between branches.
					<>
						<BlockListBlock
							{ ...props }
							wrapperProps={ {
								...wrapperProps,
								style: {
									...( wrapperProps.style || {} ),
									...sideStyles,
									animationName: 'none',
								},
							} }
						/>
						{ null }
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
				// at index 0 — forcing a remount + visible flicker.
				return (
					<>
						<BlockListBlock { ...props } />
						{ null }
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
			// axis, no manual from/to). `image-zoom` is the same idea
			// but pure scale (no direction). Both are effectively
			// "custom with img target" with the math baked in.
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
			} else if ( animationType === 'image-zoom' ) {
				customKeyframe = getImageZoomKeyframe( props.clientId );
			}

			// `target = 'img'` reroutes the keyframe binding to a
			// scoped CSS rule that animates the first <img> descendant
			// instead of the block wrapper, with `overflow: clip` on
			// the img's parent so the surrounding markup acts as a
			// clipping frame. Image effects (image-move, image-zoom)
			// always use img target. Preset effects (fade, slide,
			// scale, blur, rotate, wipe, curtain, flip — and their
			// `-out` variants) honor the "Animate image only" toggle
			// via the global CSS redirect rules in animations.css
			// (keyed on `[data-mb-target="img"]` + `mb-enter-{type}`).
			const target = attributes.animationFromToTarget || 'block';
			const targetIsImg =
				animationType === 'image-move' ||
				animationType === 'image-zoom' ||
				( !! animationType && target === 'img' );
			const customUid = customKeyframe
				? customKeyframe.name.replace(
						/^mb-(custom|imagemove|imagezoom)-/,
						''
				  )
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
				// For target='img' (and image-move / image-zoom, which
				// are always img-target): don't animate the wrapper at
				// all — the scoped CSS targets the inner img.
				const isCustomLike =
					animationType === 'custom' ||
					animationType === 'image-move' ||
					animationType === 'image-zoom';
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
				// For img-target preset effects (fade, slide, scale,
				// etc.), the editor needs `mb-mode-scroll-interactive`
				// + `mb-enter-{type}` classes on the wrapper so the
				// global CSS in animations.css can route the keyframe
				// + scroll-timeline props onto `img:first-of-type`.
				// (Custom / image-move / image-zoom drive the img via
				// scoped data-mb-uid CSS instead — no class needed.)
				if ( targetIsImg && ! isCustomLike ) {
					computedClassName = [
						props.className || '',
						'mb-mode-scroll-interactive',
						`mb-enter-${ animationType }`,
					]
						.filter( Boolean )
						.join( ' ' );
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
					// Unified namespace with the frontend: same
					// `mb-animated` / `mb-enter-*` / `mb-triggered`
					// classes so the rules in animations.css apply
					// in both contexts. Editor-specific aliases
					// (`mb-preview`, `mb-animate-enter-*`) were
					// retired in favor of this.
					//
					// We deliberately don't emit `mb-mode-*` here —
					// that would trigger the frontend's
					// initial-hidden rules (`.mb-mode-page-load:not(
					// .mb-triggered) { opacity: 0 }`) before the
					// user clicks Play, blanking the block while
					// they're editing.
					//
					// For Scroll Appear's Exit slot preview we swap
					// `mb-enter-{type}` / `mb-triggered` for
					// `mb-exit-{type}` / `mb-exit-triggered` so the
					// matching exit keyframe binding (mbXxxOut, or
					// `var(--mb-exit-anim-name)` for Custom) fires
					// instead of the entry one.
					const previewSlot =
						attributes.__mbPreviewSlot === 'exit'
							? 'exit'
							: 'entry';
					const enterCls =
						previewSlot === 'exit'
							? `mb-exit-${ animationType }`
							: `mb-enter-${ animationType }`;
					const triggeredCls =
						previewSlot === 'exit'
							? 'mb-exit-triggered'
							: 'mb-triggered';
					computedClassName = [
						props.className || '',
						'mb-animated',
						enterCls,
						triggeredCls,
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
					// Custom-like types (custom, image-move, image-zoom)
					// bind animation-name to the per-block keyframe via
					// inline style (or scoped CSS for img-target). Inline
					// style wins over the class-based binding so the
					// unique keyframe runs instead of any shared one.
					const isCustomLikePreview =
						animationType === 'custom' ||
						animationType === 'image-move' ||
						animationType === 'image-zoom';
					if ( isCustomLikePreview ) {
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

			// Stagger cascade in the editor preview. Mirrors the save-
			// props emission so the editor renders the same cascade
			// the frontend will. Class + inline CSS var; rules in
			// editor.scss + animations.css do the rest via :nth-child.
			if (
				attributes.animationStaggerEnabled &&
				STAGGER_PARENT_BLOCKS.includes( props.name ) &&
				isStaggerCompatible( attributes )
			) {
				const step = staggerStepSeconds(
					attributes.animationStaggerStep
				);
				computedClassName = [
					computedClassName,
					'mb-stagger-parent',
				]
					.filter( Boolean )
					.join( ' ' );
				const staggerStyle = {
					...( computedWrapperProps.style || {} ),
					'--mb-stagger-step': `${ step }s`,
				};
				// Custom-type stagger: inner blocks need to bind to the
				// parent's per-block keyframe via the inherited custom
				// property. Block-target only — img-target's scoped
				// CSS isn't wired for the stagger cascade in v1.
				if (
					animationType === 'custom' &&
					customKeyframe &&
					! targetIsImg
				) {
					staggerStyle[ '--mb-stagger-anim-name' ] =
						customKeyframe.name;
				}
				computedWrapperProps = {
					...computedWrapperProps,
					style: staggerStyle,
				};
			}

			// Emit `data-mb-target="img"` on the wrapper for any
			// img-target case so the global CSS redirect rules in
			// animations.css fire in the editor preview. Mirrors the
			// save-props emission (addAnimationSaveProps /
			// saveScrollAppearProps in this file) so the editor visual
			// matches the frontend. Without this, preset effects with
			// "Animate image only" toggled on would animate the whole
			// block in the editor (the CSS suppress rule wouldn't
			// match) even though they animate the img correctly on
			// the frontend.
			if ( targetIsImg ) {
				computedWrapperProps = {
					...computedWrapperProps,
					'data-mb-target': 'img',
				};
			}

			// Single return — BlockListBlock is always at the same
			// position in the React tree (index 0 inside the Fragment),
			// so it never remounts when switching animation states.
			// The optional <style> at index 1 emits a per-block
			// @keyframes rule for custom-type animations.
			//
			// Why index 0 (BlockListBlock first) and not the reverse:
			// the injected <style> renders as a real DOM sibling of
			// the block's wrapper inside whatever container holds the
			// block list. WordPress's flex/flow layout polyfills
			// apply `margin-block-start: var(--wp--style--block-gap)`
			// to `> *:not(:first-child)`. If the <style> sits before
			// the block, it bumps the block out of first-child
			// position, and WP adds ~19.2px of top margin to it —
			// only while the keyframe is injected (i.e. only during
			// preview playback). The block visibly jumps down when
			// Play starts and back up when it ends. Putting the
			// <style> after the block keeps the block as the layout
			// container's first child; the <style> sits at second
			// position, which WP's gap rule treats as a normal
			// not-first-child (invisible since <style> has no box).
			return (
				<>
					<BlockListBlock
						{ ...props }
						className={ computedClassName }
						wrapperProps={ computedWrapperProps }
					/>
					{ injectedKeyframeRule ? (
						<style>{ injectedKeyframeRule }</style>
					) : null }
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
 *
 * Scroll Appear mode uses the slot model: `animationEntry*` /
 * `animationExit*` attribute pairs describe what plays on each
 * phase. Page Load and Scroll Interactive modes still use the
 * shared `animationType` / `animationDuration` / etc. attrs.
 */
function addAnimationSaveProps( props, blockType, attributesRaw ) {
	const mode = attributesRaw?.animationMode;
	if ( ! mode ) {
		return props;
	}

	// Apply read-time migration so legacy attrs (pre-slot-model
	// Scroll Appear blocks; pre-unit-bearing Custom From/To values)
	// emit canonical-shape data attributes without forcing a write
	// to the post on every render. `migrateScrollAppearAttrs` no-ops
	// on attrs that are already in the new shape.
	const attributes = migrateScrollAppearAttrs( attributesRaw );

	// Scroll Appear branches off into its own emission path below.
	// Page Load + Scroll Interactive continue to use the shared
	// `animationType` attribute.
	if ( mode === 'scroll-appear' ) {
		return saveScrollAppearProps( props, blockType, attributes );
	}

	const { animationType } = attributes;
	if ( ! animationType ) {
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
	// Image effects (image-move, image-zoom) always imply img target.
	// For any other effect, the "Animate image only" toggle decides
	// whether the animation targets the inner <img> or the wrapper.
	if (
		animationType === 'image-move' ||
		animationType === 'image-zoom'
	) {
		dataAttrs[ 'data-mb-target' ] = 'img';
	} else if (
		animationType &&
		( attributes.animationFromToTarget || 'block' ) === 'img'
	) {
		dataAttrs[ 'data-mb-target' ] = 'img';
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

	// Page-load: duration + delay.
	if ( mode === 'page-load' ) {
		dataAttrs[ 'data-mb-duration' ] = String(
			attributes.animationDuration ?? DEFAULT_ATTRIBUTES.animationDuration
		);
		dataAttrs[ 'data-mb-delay' ] = String(
			attributes.animationDelay ?? DEFAULT_ATTRIBUTES.animationDelay
		);
		// Page-load only: repeat + pause-offscreen.
		dataAttrs[ 'data-mb-repeat' ] =
			attributes.animationRepeat || DEFAULT_ATTRIBUTES.animationRepeat;
		dataAttrs[ 'data-mb-pause-offscreen' ] = String(
			attributes.animationPauseOffscreen ??
				DEFAULT_ATTRIBUTES.animationPauseOffscreen
		);
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

	// Stagger cascade — emit `mb-stagger-parent` class + the step as
	// a CSS var. The CSS rules in animations.css / editor.scss handle
	// the cascade via `:nth-child()`. Gated on a whitelist of parent
	// block types and incompatible animation types (only image-move
	// now — custom composes via `--mb-stagger-anim-name`, which the
	// frontend script sets at runtime in applyCustomKeyframe).
	let staggerStyle = null;
	if (
		attributes.animationStaggerEnabled &&
		STAGGER_PARENT_BLOCKS.includes( blockType.name ) &&
		isStaggerCompatible( attributes )
	) {
		classNames.push( 'mb-stagger-parent' );
		const step = staggerStepSeconds( attributes.animationStaggerStep );
		// Inline CSS variable that the nth-child rules consume.
		staggerStyle = { '--mb-stagger-step': `${ step }s` };
	}

	const out = {
		...props,
		className: classNames.filter( Boolean ).join( ' ' ).trim(),
		...dataAttrs,
	};
	if ( staggerStyle ) {
		out.style = { ...( props.style || {} ), ...staggerStyle };
	}
	return out;
}

/**
 * Save-props emission for Scroll Appear blocks (slot model).
 *
 * Emits separate class/data-attr sets for each filled slot:
 *
 *   - `mb-enter-{entryType}` + `mb-has-entry` + `data-mb-entry-*`
 *     for the Entry slot
 *   - `mb-exit-{exitType}` + `data-mb-exit-*` for the Exit slot
 *
 * Custom From/To values emit `data-mb-entry-from-{prop}` /
 * `data-mb-entry-to-{prop}` (and same for exit), so the frontend
 * can synthesize per-slot keyframes independently.
 *
 * `attributes` should already be migrated (post-migrateScrollAppearAttrs).
 */
function saveScrollAppearProps( props, blockType, attributes ) {
	const entryType = attributes.animationEntryType || '';
	const exitType = attributes.animationExitType || '';
	const hasEntry = entryType !== '';
	const hasExit = exitType !== '';

	if ( ! hasEntry && ! hasExit ) {
		// Both slots empty — no animation to emit.
		return props;
	}

	const classNames = [ props.className || '', 'mb-animated', 'mb-mode-scroll-appear' ];
	const dataAttrs = {
		'data-mb-mode': 'scroll-appear',
		'data-mb-play-once': String(
			attributes.animationPlayOnce ??
				DEFAULT_ATTRIBUTES.animationPlayOnce
		),
	};

	// img target — triggered by EITHER an image-effect type in any
	// slot (those always imply img-target) OR the "Animate image only"
	// toggle being set on any other type. The toggle is a shared attr
	// (animationFromToTarget) — applies to both slots uniformly.
	const slotTarget = attributes.animationFromToTarget || 'block';
	const hasImageEffectSlot =
		entryType === 'image-move' ||
		entryType === 'image-zoom' ||
		exitType === 'image-move' ||
		exitType === 'image-zoom';
	if (
		hasImageEffectSlot ||
		( slotTarget === 'img' && ( entryType || exitType ) )
	) {
		dataAttrs[ 'data-mb-target' ] = 'img';
	}

	// --- Entry slot ---
	if ( hasEntry ) {
		classNames.push( `mb-enter-${ entryType }`, 'mb-has-entry' );
		dataAttrs[ 'data-mb-entry-type' ] = entryType;

		const entryDirection = attributes.animationEntryDirection || '';
		if ( entryDirection ) {
			dataAttrs[ 'data-mb-entry-direction' ] = entryDirection;
		}

		dataAttrs[ 'data-mb-entry-duration' ] = String(
			attributes.animationEntryDuration ??
				DEFAULT_ATTRIBUTES.animationEntryDuration
		);
		dataAttrs[ 'data-mb-entry-delay' ] = String(
			attributes.animationEntryDelay ??
				DEFAULT_ATTRIBUTES.animationEntryDelay
		);

		const entryAccel = resolveTimingFunction(
			attributes.animationEntryAcceleration ||
				DEFAULT_ATTRIBUTES.animationEntryAcceleration,
			attributes.animationEntryCustomTimingFunction ||
				DEFAULT_ATTRIBUTES.animationEntryCustomTimingFunction
		);
		if ( entryAccel !== 'ease' ) {
			dataAttrs[ 'data-mb-entry-acceleration' ] = entryAccel;
		}

		if ( entryType === 'blur' ) {
			const v =
				attributes.animationEntryBlurAmount ??
				DEFAULT_ATTRIBUTES.animationEntryBlurAmount;
			if ( v !== DEFAULT_ATTRIBUTES.animationEntryBlurAmount ) {
				dataAttrs[ 'data-mb-entry-blur-amount' ] = String( v );
			}
		}
		if ( entryType === 'rotate' ) {
			const v =
				attributes.animationEntryRotateAngle ??
				DEFAULT_ATTRIBUTES.animationEntryRotateAngle;
			if ( v !== DEFAULT_ATTRIBUTES.animationEntryRotateAngle ) {
				dataAttrs[ 'data-mb-entry-rotate-angle' ] = String( v );
			}
		}

		if ( entryType === 'custom' ) {
			for ( const def of PROPERTY_DEFINITIONS ) {
				const cssName = PROPERTY_CSS_VAR[ def.id ];
				const fromKey = FROM_ATTR[ def.id ].replace(
					/^animationFrom/,
					'animationEntryFrom'
				);
				const toKey = TO_ATTR[ def.id ].replace(
					/^animationTo/,
					'animationEntryTo'
				);
				const fromVal = attributes[ fromKey ];
				const toVal = attributes[ toKey ];
				if ( fromVal !== undefined && fromVal !== null && fromVal !== '' ) {
					dataAttrs[ `data-mb-entry-from-${ cssName }` ] = String( fromVal );
				}
				if ( toVal !== undefined && toVal !== null && toVal !== '' ) {
					dataAttrs[ `data-mb-entry-to-${ cssName }` ] = String( toVal );
				}
			}
		}
	}

	// --- Exit slot ---
	if ( hasExit ) {
		classNames.push( `mb-exit-${ exitType }` );
		dataAttrs[ 'data-mb-exit-type' ] = exitType;

		const exitDirection = attributes.animationExitDirection || '';
		if ( exitDirection ) {
			dataAttrs[ 'data-mb-exit-direction' ] = exitDirection;
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

		if ( exitType === 'blur' ) {
			const v =
				attributes.animationExitBlurAmount ??
				DEFAULT_ATTRIBUTES.animationExitBlurAmount;
			if ( v !== DEFAULT_ATTRIBUTES.animationExitBlurAmount ) {
				dataAttrs[ 'data-mb-exit-blur-amount' ] = String( v );
			}
		}
		if ( exitType === 'rotate' ) {
			const v =
				attributes.animationExitRotateAngle ??
				DEFAULT_ATTRIBUTES.animationExitRotateAngle;
			if ( v !== DEFAULT_ATTRIBUTES.animationExitRotateAngle ) {
				dataAttrs[ 'data-mb-exit-rotate-angle' ] = String( v );
			}
		}

		if ( exitType === 'custom' ) {
			for ( const def of PROPERTY_DEFINITIONS ) {
				const cssName = PROPERTY_CSS_VAR[ def.id ];
				const fromKey = FROM_ATTR[ def.id ].replace(
					/^animationFrom/,
					'animationExitFrom'
				);
				const toKey = TO_ATTR[ def.id ].replace(
					/^animationTo/,
					'animationExitTo'
				);
				const fromVal = attributes[ fromKey ];
				const toVal = attributes[ toKey ];
				if ( fromVal !== undefined && fromVal !== null && fromVal !== '' ) {
					dataAttrs[ `data-mb-exit-from-${ cssName }` ] = String( fromVal );
				}
				if ( toVal !== undefined && toVal !== null && toVal !== '' ) {
					dataAttrs[ `data-mb-exit-to-${ cssName }` ] = String( toVal );
				}
			}
		}
	}

	// Stagger cascade — gated on parent block type + slot compatibility.
	// Reads the Entry slot's type for stagger compatibility (the CSS
	// bindings key on `mb-enter-{type}`); if only Exit is filled, the
	// inner blocks have no enter animation to cascade.
	let staggerStyle = null;
	if (
		attributes.animationStaggerEnabled &&
		STAGGER_PARENT_BLOCKS.includes( blockType.name ) &&
		isStaggerCompatible( attributes )
	) {
		classNames.push( 'mb-stagger-parent' );
		const step = staggerStepSeconds( attributes.animationStaggerStep );
		staggerStyle = { '--mb-stagger-step': `${ step }s` };
	}

	const out = {
		...props,
		className: classNames.filter( Boolean ).join( ' ' ).trim(),
		...dataAttrs,
	};
	if ( staggerStyle ) {
		out.style = { ...( props.style || {} ), ...staggerStyle };
	}
	return out;
}

addFilter(
	'blocks.getSaveContent.extraProps',
	'motion-blocks/add-save-props',
	addAnimationSaveProps
);
