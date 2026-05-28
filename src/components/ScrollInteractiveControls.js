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
import { useDispatch } from '@wordpress/data';
import { store as blockEditorStore } from '@wordpress/block-editor';
import {
	arrowUp,
	arrowDown,
	arrowLeft,
	arrowRight,
} from '@wordpress/icons';

import {
	ANIMATION_TYPE_OPTIONS,
	DIRECTION_OPTIONS,
	TYPES_WITH_DIRECTION,
	DEFAULT_DIRECTION,
	ACCELERATION_OPTIONS,
	BLUR_SETTINGS,
	CUSTOM_DEFAULT_FROM_TO,
	STAGGER_INCOMPATIBLE_TYPES,
	IMAGE_EFFECT_TYPES,
	IMAGE_EFFECT_BLOCKS,
	IMAGE_TARGETABLE_BLOCKS,
	isImageTargetUnavailable,
	hasAnyCustomFromToSet,
	presetToFromToAttributes,
} from './constants';
import FromToControls from './FromToControls';
import InfoPopover from './InfoPopover';
import SubPanelModeHeader from './SubPanelModeHeader';

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
	onPaste,
	onReset,
} ) {
	const {
		animationType,
		animationDirection,
		animationAcceleration,
		animationCustomTimingFunction,
		animationBlurAmount,
		animationRotateAngle,
		animationRangeStart,
		animationRangeEnd,
		animationScrubPosition,
	} = attributes;

	// Scrub updates fire on every drag step; mark them non-persistent so
	// dragging the preview slider doesn't flood the editor undo stack.
	const { __unstableMarkNextChangeAsNotPersistent } =
		useDispatch( blockEditorStore );
	const scrubValue =
		typeof animationScrubPosition === 'number'
			? animationScrubPosition
			: 100;

	// Image effects (image-move, image-zoom) are only meaningful on
	// blocks that have a primary <img>. Hide entirely for block types
	// without one; on Cover blocks with Fixed/Repeated bg, keep them
	// visible but disabled so the user sees they exist + understands
	// why they can't pick them right now.
	const blockSupportsImageEffects = IMAGE_EFFECT_BLOCKS.includes( blockName );
	const imageEffectsBlocked = isImageTargetUnavailable( blockName, attributes );
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
	const hasDirection = TYPES_WITH_DIRECTION.includes( animationType );
	const directionOptions = DIRECTION_OPTIONS[ animationType ] || [];

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
			animationType === 'image-move' ||
			animationType === 'image-zoom';
		const newAttrs = {
			animationType: 'custom',
			animationDirection: '',
			...seed,
		};
		if ( fromImageEffect ) {
			newAttrs.animationFromToTarget = 'img';
		}
		if ( attributes.animationStaggerEnabled ) {
			newAttrs.animationStaggerEnabled = false;
		}
		setAttributes( newAttrs );
	};

	const canEditPreset =
		!! animationType &&
		animationType !== 'custom' &&
		!! presetToFromToAttributes(
			animationType,
			animationDirection,
			{
				rotateAngle: animationRotateAngle,
				blurAmount: animationBlurAmount,
			}
		);

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
									onClick={ handleEditPreset }
								>
									{ __( 'Edit', 'motion-blocks' ) }
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

			{ /* Scrub preview. Scroll Interactive can't be live-previewed
			   in the editor — its real animation-timeline: view() effect
			   crashes Chrome inside the editor iframe. This slider freezes
			   the effect at a given point (start → end) so the user can
			   drag through it. Drives animationScrubPosition, which the
			   HOC turns into a paused-and-seeked animation. */ }
			{ animationType && (
				<RangeControl
					label={ __( 'Preview', 'motion-blocks' ) }
					help={ __(
						'Drag to scrub through the animation, from start to end. Preview only — the effect plays on scroll on the front end.',
						'motion-blocks'
					) }
					value={ scrubValue }
					onChange={ ( v ) => {
						__unstableMarkNextChangeAsNotPersistent();
						setAttributes( {
							animationScrubPosition:
								typeof v === 'number' ? v : 100,
						} );
					} }
					min={ 0 }
					max={ 100 }
					step={ 1 }
					withInputField={ false }
					__next40pxDefaultSize
					__nextHasNoMarginBottom
				/>
			) }

			{ IMAGE_EFFECT_BLOCKS.includes( blockName ) &&
				isImageTargetUnavailable( blockName, attributes ) && (
					<Notice
						status="warning"
						isDismissible={ false }
						className="mb-image-effect-unavailable-notice"
					>
						{ __(
							'Some effects are not compatible with “Fixed background” and “Repeated background”. Turn off these settings under Cover block settings to use them.',
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
							( attributes.animationFromToTarget ||
								'block' ) === 'img'
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
										'Unavailable while Fixed background or Repeated background is on — see the notice above.',
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

			{ ! isCustom && animationType === 'scale' && (
				<>
					<ToggleControl
						label={ __( 'Scale with direction', 'motion-blocks' ) }
						checked={ animationDirection !== 'none' && animationDirection !== '' }
						onChange={ ( checked ) =>
							setAttributes( {
								animationDirection: checked ? 'btt' : 'none',
							} )
						}
						__nextHasNoMarginBottom
					/>
					{ animationDirection !== 'none' && animationDirection !== '' && (
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
				</>
			) }

			{ ! isCustom && hasDirection && ( animationType === 'curtain' || animationType === 'curtain-out' ) && (
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

			{ ! isCustom && hasDirection && animationType !== 'scale' && animationType !== 'curtain' && animationType !== 'curtain-out' && (
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
					onChange={ ( value ) =>
						setAttributes( {
							animationRotateAngle:
								parseInt( value, 10 ) || 0,
						} )
					}
					__next40pxDefaultSize
				/>
			) }

			{ /* "Timing" section heading — matches the Page Load and
			   Scroll Appear panels, which use the same heading above
			   their Duration / Delay / Acceleration block. For
			   Scroll Interactive the scroll position IS the timing,
			   so this section groups Start Offset / End Offset /
			   Acceleration as the equivalent timing controls. */ }
			<h2 className="mb-section-heading">
				{ __( 'Timing', 'motion-blocks' ) }
			</h2>

			<BaseControl __nextHasNoMarginBottom>
				<HStack
					alignment="center"
					spacing={ 1 }
					justify="flex-start"
				>
					<BaseControl.VisualLabel>
						{ __( 'Start Offset', 'motion-blocks' ) }
					</BaseControl.VisualLabel>
					<InfoPopover
						label={ __(
							'About start offset',
							'motion-blocks'
						) }
					>
						<p>
							{ __(
								"Where the animation begins as the element scrolls into view from the bottom of the screen. 0% triggers the moment the element starts entering; 100% waits until it's fully on screen.",
								'motion-blocks'
							) }
						</p>
					</InfoPopover>
				</HStack>
				<RangeControl
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
					alignment="center"
					spacing={ 1 }
					justify="flex-start"
				>
					<BaseControl.VisualLabel>
						{ __( 'End Offset', 'motion-blocks' ) }
					</BaseControl.VisualLabel>
					<InfoPopover
						label={ __(
							'About end offset',
							'motion-blocks'
						) }
					>
						<p>
							{ __(
								"Where the animation ends as the element scrolls out of view at the top of the screen. 0% ends the moment the element starts exiting; 100% waits until it's fully off screen.",
								'motion-blocks'
							) }
						</p>
					</InfoPopover>
				</HStack>
				<RangeControl
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
				label={ __( 'Acceleration', 'motion-blocks' ) }
				value={ animationAcceleration }
				options={ ACCELERATION_OPTIONS }
				onChange={ ( value ) =>
					setAttributes( { animationAcceleration: value } )
				}
				__next40pxDefaultSize
				__nextHasNoMarginBottom
			/>
			{ animationAcceleration === 'custom' && (
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
