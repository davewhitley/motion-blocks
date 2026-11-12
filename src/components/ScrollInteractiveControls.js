/**
 * ScrollInteractiveControls — "Interactive scroll" animation sub-panel.
 *
 * Start Range and End Range map to the CSS scroll-driven animations spec:
 *   animation-range-start: entry 0%
 *   animation-range-end: exit 100%
 */

import {
	BaseControl,
	SelectControl,
	RangeControl,
	ToggleControl,
	TextControl,
	__experimentalToggleGroupControl as ToggleGroupControl,
	__experimentalToggleGroupControlOption as ToggleGroupControlOption,
	__experimentalToggleGroupControlOptionIcon as ToggleGroupControlOptionIcon,
	__experimentalHStack as HStack,
	__experimentalNumberControl as NumberControl,
	FlexBlock,
	Button,
	Notice,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { arrowUp, arrowDown, arrowLeft, arrowRight } from '@wordpress/icons';

import {
	ANIMATION_TYPE_OPTIONS,
	DIRECTION_OPTIONS,
	TYPES_WITH_DIRECTION,
	DEFAULT_DIRECTION,
	EASING_OPTIONS,
	BLUR_SETTINGS,
	CUSTOM_DEFAULT_FROM_TO,
	STAGGER_INCOMPATIBLE_TYPES,
	IMAGE_EFFECT_TYPES,
	IMAGE_EFFECT_BLOCKS,
	IMAGE_TARGETABLE_BLOCKS,
	isImageTargetUnavailable,
	isChosenImageEffectBlocked,
	hasAnyCustomFromToSet,
	presetToFromToAttributes,
	defaultEasing,
} from './constants';
import { DegreesSuffix } from './UnitSuffix';
import FromToControls from './FromToControls';
import InfoPopover from './InfoPopover';
import SubPanelModeHeader from './SubPanelModeHeader';
import { scrubFromIcon, scrubToIcon } from './icons';
import { customizeAndKeepFocus } from './keyboardFocus';

const DIRECTION_ICON_MAP = {
	btt: arrowUp,
	ttb: arrowDown,
	ltr: arrowRight,
	rtl: arrowLeft,
};

/**
 * Extract the offset percentage from a range string like "entry 20%".
 */
function parseOffset( value, fallback ) {
	return parseInt( ( value || fallback ).split( ' ' )[ 1 ], 10 ) || 0;
}

export default function ScrollInteractiveControls( {
	attributes,
	setAttributes,
	blockName,
	clientId,
	onRemove,
	onBeforeModeSwitch,
	onPaste,
	onReset,
} ) {
	const {
		animationType,
		animationDirection,
		animationEasing,
		animationCustomTimingFunction,
		animationBlurAmount,
		animationRotateAngle,
		animationRangeStart,
		animationRangeEnd,
		animationPreviewEnabled,
		animationScrubPosition,
	} = attributes;

	// The preview switch and the scrubber are editor preview state. `setAttributes`
	// is the panel's router, which sends them to the
	// motion-blocks/editor-preview store, so neither the switch nor a drag
	// adds undo steps or reaches the saved block (GH #29).
	const scrubValue =
		typeof animationScrubPosition === 'number'
			? animationScrubPosition
			: 100;
	// The Scroll preview switch governs the editor preview: it shows/hides the scrub
	// slider AND (when the live-preview beta is on) the live scroll
	// animation. Off = the block renders its natural, un-animated state
	// (same as deselecting).
	const previewOn = animationPreviewEnabled !== false;
	// Live preview active = the beta opt-in is on AND preview is on. While
	// live, the scrub slider is hidden: you preview by scrolling the canvas
	// (and hold any frame just by stopping), so the slider is redundant —
	// and keeping both would put two controls in conflict over one
	// element's animation timeline. The slider returns when the beta is off.
	const liveActive =
		previewOn &&
		typeof window !== 'undefined' &&
		!! window.motionBlocksBetaLivePreview;

	// Image effects (image-move, image-zoom) are only meaningful on
	// blocks that have a primary <img>. Hide entirely for block types
	// without one; on Cover blocks with Fixed/Repeated bg, keep them
	// visible but disabled so the user sees they exist + understands
	// why they can't pick them right now.
	const blockSupportsImageEffects = IMAGE_EFFECT_BLOCKS.includes( blockName );
	const imageEffectsBlocked = isImageTargetUnavailable(
		blockName,
		attributes
	);
	const typeOptions = (
		blockSupportsImageEffects
			? ANIMATION_TYPE_OPTIONS
			: ANIMATION_TYPE_OPTIONS.filter(
					( opt ) => ! IMAGE_EFFECT_TYPES.includes( opt.value )
			  )
	).map( ( opt ) =>
		imageEffectsBlocked && IMAGE_EFFECT_TYPES.includes( opt.value )
			? { ...opt, disabled: true }
			: opt
	);

	const isCustom = animationType === 'custom';
	// Scale In and Scale Out both have a plain, no-direction version,
	// so both get the "Scale with direction" toggle (GH #137).
	const isScale = animationType === 'scale' || animationType === 'scale-out';
	const hasDirection = TYPES_WITH_DIRECTION.includes( animationType );
	const directionOptions = DIRECTION_OPTIONS[ animationType ] || [];

	const effectDefaultEasing = defaultEasing(
		'scroll-interactive',
		animationType
	);

	const startOffset = parseOffset( animationRangeStart, 'entry 0%' );
	const endOffset = parseOffset( animationRangeEnd, 'exit 100%' );

	/**
	 * When animation type changes, auto-set direction.
	 */
	const handleTypeChange = ( value ) => {
		const newAttrs = { animationType: value };
		if ( TYPES_WITH_DIRECTION.includes( value ) ) {
			newAttrs.animationDirection = DEFAULT_DIRECTION[ value ] || '';
		} else {
			newAttrs.animationDirection = '';
		}
		// Seed the four default From/To rows when picking Custom for
		// the first time. Preserves any existing custom config.
		if ( value === 'custom' && ! hasAnyCustomFromToSet( attributes ) ) {
			Object.assign( newAttrs, CUSTOM_DEFAULT_FROM_TO );
		}
		// Stagger isn't supported on custom / image-move — clear the
		// flag on the way in so it doesn't silently persist and then
		// re-activate when the user switches back to a preset. See
		// PageLoadControls.handleTypeChange for the full rationale.
		if (
			STAGGER_INCOMPATIBLE_TYPES.includes( value ) &&
			attributes.animationStaggerEnabled
		) {
			newAttrs.animationStaggerEnabled = false;
		}
		setAttributes( newAttrs );
	};

	/**
	 * "Edit" — convert the current preset into Custom mode with its
	 * From/To values pre-filled. See PageLoadControls.handleEditPreset
	 * for the full rationale, including img-target carry-over for
	 * image-move / image-zoom.
	 */
	const handleEditPreset = () => {
		const seed = presetToFromToAttributes(
			animationType,
			animationDirection,
			{
				rotateAngle: animationRotateAngle,
				blurAmount: animationBlurAmount,
			}
		);
		if ( ! seed ) {
			return;
		}
		const fromImageEffect =
			animationType === 'image-move' || animationType === 'image-zoom';
		const newAttrs = {
			animationType: 'custom',
			animationDirection: '',
			...seed,
		};
		if ( fromImageEffect ) {
			newAttrs.animationFromToTarget = 'img';
		}
		// Custom defaults to Linear here. A preset that was on its
		// default Ease keeps Ease, so Edit doesn't change how it moves.
		if (
			! animationEasing &&
			effectDefaultEasing !==
				defaultEasing( 'scroll-interactive', 'custom' )
		) {
			newAttrs.animationEasing = effectDefaultEasing;
		}
		if ( attributes.animationStaggerEnabled ) {
			newAttrs.animationStaggerEnabled = false;
		}
		setAttributes( newAttrs );
	};

	const canEditPreset =
		!! animationType &&
		animationType !== 'custom' &&
		!! presetToFromToAttributes( animationType, animationDirection, {
			rotateAngle: animationRotateAngle,
			blurAmount: animationBlurAmount,
		} );

	return (
		<div className="mb-sub-panel">
			<SubPanelModeHeader
				mode="scroll-interactive"
				attributes={ attributes }
				setAttributes={ setAttributes }
				blockName={ blockName }
				clientId={ clientId }
				onPaste={ onPaste }
				onReset={ onReset }
				onRemove={ onRemove }
				onBeforeModeSwitch={ onBeforeModeSwitch }
				helpText={ __(
					'Ties animation progress directly to scroll position.',
					'motion-blocks'
				) }
			/>

			<HStack alignment="bottom" spacing={ 3 }>
				<FlexBlock>
					<div className="mb-effect-field">
						<HStack
							className="mb-effect-field__label-row"
							justify="flex-start"
							spacing={ 2 }
						>
							<BaseControl.VisualLabel>
								{ __( 'Effect', 'motion-blocks' ) }
							</BaseControl.VisualLabel>
							{ canEditPreset && (
								<Button
									variant="link"
									size="small"
									aria-label={ __(
										'Customize: change this effect to a Custom animation',
										'motion-blocks'
									) }
									onClick={ ( event ) =>
										customizeAndKeepFocus(
											event,
											handleEditPreset
										)
									}
								>
									{ __( 'Customize', 'motion-blocks' ) }
								</Button>
							) }
						</HStack>
						<SelectControl
							label={ __( 'Effect', 'motion-blocks' ) }
							hideLabelFromVision
							value={ animationType }
							options={ typeOptions }
							onChange={ handleTypeChange }
							__next40pxDefaultSize
							__nextHasNoMarginBottom
						/>
					</div>
				</FlexBlock>
			</HStack>

			{ /* Scroll preview switch: a labelled toggle, so it is as easy
			   to find as the Play button in the other modes (GH #137).
			   Off by default, and off clears the scrub value, returning
			   the block to its natural state (same as deselecting).
			   Independent of the From/To start/end eye icons in the
			   Custom panel. */ }
			{ animationType && (
				<ToggleControl
					label={ __( 'Scroll preview', 'motion-blocks' ) }
					checked={ previewOn }
					onChange={ ( on ) =>
						setAttributes(
							on
								? { animationPreviewEnabled: true }
								: {
										animationPreviewEnabled: false,
										animationScrubPosition: undefined,
								  }
						)
					}
					help={
						liveActive
							? undefined
							: __(
									'Drag the slider to see the animation in the editor, from start to end. On the live site it follows the scroll.',
									'motion-blocks'
							  )
					}
					__nextHasNoMarginBottom
				/>
			) }

			{ /* Scrub slider — shown while Scroll preview is on and the
			   live-preview beta is OFF. Freezes the effect at a point
			   (start → end) via a paused, delay-seeked animation so you
			   can drag through it without a real scroll timeline. When
			   the live beta is on, this is hidden in favor of scrolling
			   the canvas (see the hint below), so the two never fight
			   over one element. */ }
			{ animationType && previewOn && ! liveActive && (
				<RangeControl
					label={ __( 'Scroll preview position', 'motion-blocks' ) }
					hideLabelFromVision
					className="mb-scrub-range"
					value={ scrubValue }
					onChange={ ( v ) => {
						setAttributes( {
							animationScrubPosition:
								typeof v === 'number' ? v : 100,
						} );
					} }
					min={ 0 }
					max={ 100 }
					step={ 1 }
					withInputField={ false }
					beforeIcon={ scrubFromIcon }
					afterIcon={ scrubToIcon }
					__next40pxDefaultSize
					__nextHasNoMarginBottom
				/>
			) }

			{ /* Live-preview hint — replaces the scrub slider while the
			   beta is active. Scrolling the canvas is the preview. */ }
			{ animationType && liveActive && (
				<BaseControl
					__nextHasNoMarginBottom
					help={ __(
						'Scroll the editor canvas to preview. The animation follows your scroll.',
						'motion-blocks'
					) }
				>
					<BaseControl.VisualLabel>
						{ __( 'Live scroll preview', 'motion-blocks' ) }
					</BaseControl.VisualLabel>
				</BaseControl>
			) }

			{ isChosenImageEffectBlocked(
				blockName,
				attributes,
				animationType
			) && (
				<Notice
					status="warning"
					isDismissible={ false }
					className="mb-image-effect-unavailable-notice"
				>
					{ __(
						'Image Move, Image Zoom, and “Animate image only” don’t work with “Fixed background” or “Repeated background”. Turn those off in the Cover block’s settings to use them.',
						'motion-blocks'
					) }
				</Notice>
			) }

			{ IMAGE_TARGETABLE_BLOCKS.includes( blockName ) &&
				animationType &&
				! IMAGE_EFFECT_TYPES.includes( animationType ) && (
					<ToggleControl
						label={ __( 'Animate image only', 'motion-blocks' ) }
						checked={
							( attributes.animationFromToTarget || 'block' ) ===
							'img'
						}
						disabled={ isImageTargetUnavailable(
							blockName,
							attributes
						) }
						onChange={ ( on ) =>
							setAttributes( {
								animationFromToTarget: on ? 'img' : 'block',
							} )
						}
						help={
							isImageTargetUnavailable( blockName, attributes )
								? __(
										'Unavailable while “Fixed background” or “Repeated background” is on.',
										'motion-blocks'
								  )
								: __(
										'Animate the background only. Text and other inner blocks are excluded.',
										'motion-blocks'
								  )
						}
						__nextHasNoMarginBottom
					/>
				) }

			{ isCustom && (
				<FromToControls
					attributes={ attributes }
					setAttributes={ setAttributes }
					blockName={ blockName }
				/>
			) }

			{ ! isCustom && isScale && (
				<>
					<ToggleControl
						label={ __( 'Scale with direction', 'motion-blocks' ) }
						checked={
							animationDirection !== 'none' &&
							animationDirection !== ''
						}
						onChange={ ( checked ) =>
							setAttributes( {
								animationDirection: checked ? 'btt' : 'none',
							} )
						}
						__nextHasNoMarginBottom
					/>
					{ animationDirection !== 'none' &&
						animationDirection !== '' && (
							<ToggleGroupControl
								label={ __( 'Direction', 'motion-blocks' ) }
								value={ animationDirection }
								onChange={ ( value ) =>
									setAttributes( {
										animationDirection: value,
									} )
								}
								isBlock
								__nextHasNoMarginBottom
							>
								{ directionOptions.map( ( opt ) => (
									<ToggleGroupControlOptionIcon
										key={ opt.value }
										value={ opt.value }
										icon={ DIRECTION_ICON_MAP[ opt.value ] }
										label={ opt.label }
									/>
								) ) }
							</ToggleGroupControl>
						) }
				</>
			) }

			{ ! isCustom &&
				hasDirection &&
				( animationType === 'curtain' ||
					animationType === 'curtain-out' ) && (
					<ToggleGroupControl
						label={ __( 'Direction', 'motion-blocks' ) }
						value={ animationDirection }
						onChange={ ( value ) =>
							setAttributes( { animationDirection: value } )
						}
						isBlock
						__nextHasNoMarginBottom
					>
						{ directionOptions.map( ( opt ) => (
							<ToggleGroupControlOption
								key={ opt.value }
								value={ opt.value }
								label={ opt.label }
							/>
						) ) }
					</ToggleGroupControl>
				) }

			{ ! isCustom &&
				hasDirection &&
				! isScale &&
				animationType !== 'curtain' &&
				animationType !== 'curtain-out' && (
					<ToggleGroupControl
						label={ __( 'Direction', 'motion-blocks' ) }
						value={ animationDirection }
						onChange={ ( value ) =>
							setAttributes( { animationDirection: value } )
						}
						isBlock
						__nextHasNoMarginBottom
					>
						{ directionOptions.map( ( opt ) => (
							<ToggleGroupControlOptionIcon
								key={ opt.value }
								value={ opt.value }
								icon={ DIRECTION_ICON_MAP[ opt.value ] }
								label={ opt.label }
							/>
						) ) }
					</ToggleGroupControl>
				) }

			{ ! isCustom && animationType === 'blur' && (
				<RangeControl
					label={ __( 'Blur', 'motion-blocks' ) }
					value={ animationBlurAmount }
					onChange={ ( value ) =>
						setAttributes( { animationBlurAmount: value } )
					}
					min={ BLUR_SETTINGS.min }
					max={ BLUR_SETTINGS.max }
					step={ BLUR_SETTINGS.step }
					renderTooltipContent={ ( value ) => `${ value }px` }
					__next40pxDefaultSize
					__nextHasNoMarginBottom
				/>
			) }

			{ ! isCustom && animationType === 'rotate' && (
				<NumberControl
					label={ __( 'Angle', 'motion-blocks' ) }
					value={ animationRotateAngle ?? 90 }
					step={ 1 }
					spinControls="custom"
					suffix={ <DegreesSuffix /> }
					onChange={ ( value ) =>
						setAttributes( {
							animationRotateAngle: parseInt( value, 10 ) || 0,
						} )
					}
					__next40pxDefaultSize
				/>
			) }

			{ /* "Timing" section heading — matches the Page Load and
			   Scroll Appear panels, which use the same heading above
			   their Duration / Delay / Easing block. For
			   Scroll Interactive the scroll position IS the timing,
			   so this section groups Start Offset / End Offset /
			   Easing as the equivalent timing controls. */ }
			<h3 className="mb-section-heading">
				{ __( 'Timing', 'motion-blocks' ) }
			</h3>

			<BaseControl __nextHasNoMarginBottom>
				<HStack
					className="mb-info-label-row"
					alignment="center"
					spacing={ 1 }
					justify="flex-start"
				>
					<BaseControl.VisualLabel>
						{ __( 'Start offset', 'motion-blocks' ) }
					</BaseControl.VisualLabel>
					<InfoPopover
						label={ __( 'About start offset', 'motion-blocks' ) }
					>
						<p>
							{ __(
								/* translators: "0%" and "100%" are amounts of the block, not placeholders. */
								'Where the animation begins as the block scrolls into view from the bottom of the screen. 0% triggers the moment the block starts entering; 100% waits until it’s fully on screen.',
								'motion-blocks'
							) }
						</p>
					</InfoPopover>
				</HStack>
				<RangeControl
					label={ __( 'Start offset', 'motion-blocks' ) }
					hideLabelFromVision
					value={ startOffset }
					onChange={ ( value ) =>
						setAttributes( {
							animationRangeStart: `entry ${ value }%`,
						} )
					}
					min={ 0 }
					max={ 100 }
					beforeIcon={ arrowDown }
					renderTooltipContent={ ( value ) => `${ value }%` }
					__next40pxDefaultSize
					__nextHasNoMarginBottom
				/>
			</BaseControl>

			<BaseControl __nextHasNoMarginBottom>
				<HStack
					className="mb-info-label-row"
					alignment="center"
					spacing={ 1 }
					justify="flex-start"
				>
					<BaseControl.VisualLabel>
						{ __( 'End offset', 'motion-blocks' ) }
					</BaseControl.VisualLabel>
					<InfoPopover
						label={ __( 'About end offset', 'motion-blocks' ) }
					>
						<p>
							{
								/* translators: "0%" and "100%" are amounts of the block, not placeholders. */ __(
									'Where the animation ends as the block scrolls out of view at the top of the screen. 0% ends the moment the block starts exiting; 100% waits until it’s fully off screen.',
									'motion-blocks'
								)
							}
						</p>
					</InfoPopover>
				</HStack>
				<RangeControl
					label={ __( 'End offset', 'motion-blocks' ) }
					hideLabelFromVision
					value={ endOffset }
					onChange={ ( value ) =>
						setAttributes( {
							animationRangeEnd: `exit ${ value }%`,
						} )
					}
					min={ 0 }
					max={ 100 }
					beforeIcon={ arrowUp }
					renderTooltipContent={ ( value ) => `${ value }%` }
					__next40pxDefaultSize
					__nextHasNoMarginBottom
				/>
			</BaseControl>

			<SelectControl
				label={ __( 'Easing', 'motion-blocks' ) }
				help={ __(
					'How the speed changes from start to finish.',
					'motion-blocks'
				) }
				value={ animationEasing || effectDefaultEasing }
				options={ EASING_OPTIONS }
				onChange={ ( value ) =>
					// Picking the effect's default stores '' so the block
					// keeps following it when the effect changes.
					setAttributes( {
						animationEasing:
							value === effectDefaultEasing ? '' : value,
					} )
				}
				__next40pxDefaultSize
				__nextHasNoMarginBottom
			/>
			{ animationEasing === 'custom' && (
				<TextControl
					label={ __( 'Custom timing function', 'motion-blocks' ) }
					value={ animationCustomTimingFunction }
					onChange={ ( v ) =>
						setAttributes( {
							animationCustomTimingFunction: v,
						} )
					}
					help={ __(
						'Any valid CSS timing function, e.g. cubic-bezier(0.4, 0, 0.2, 1).',
						'motion-blocks'
					) }
					__nextHasNoMarginBottom
					__next40pxDefaultSize
				/>
			) }

			<Button
				variant="secondary"
				isDestructive
				className="mb-remove-button"
				onClick={ onRemove }
				__next40pxDefaultSize
			>
				{ __( 'Remove animation', 'motion-blocks' ) }
			</Button>
		</div>
	);
}
