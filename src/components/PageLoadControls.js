/**
 * PageLoadControls — "On page load" animation sub-panel.
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
import { useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import {
	arrowUp,
	arrowDown,
	arrowLeft,
	arrowRight,
} from '@wordpress/icons';
import { SVG, Path } from '@wordpress/primitives';

import {
	ANIMATION_TYPE_OPTIONS,
	DIRECTION_OPTIONS,
	TYPES_WITH_DIRECTION,
	DEFAULT_DIRECTION,
	ACCELERATION_OPTIONS,
	BLUR_SETTINGS,
	REPEAT_OPTIONS,
	CUSTOM_DEFAULT_FROM_TO,
	STAGGER_INCOMPATIBLE_TYPES,
	IMAGE_EFFECT_TYPES,
	IMAGE_EFFECT_BLOCKS,
	IMAGE_TARGETABLE_BLOCKS,
	isImageTargetUnavailable,
	hasAnyCustomFromToSet,
	presetToFromToAttributes,
	editPresetAttributes,
} from './constants';
import { SecondsSuffix, DegreesSuffix } from './UnitSuffix';
import FromToControls from './FromToControls';
import StaggerControls from './StaggerControls';
import SubPanelModeHeader from './SubPanelModeHeader';

const playIcon = (
	<SVG xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
		<Path d="M8 5.14v13.72l11-6.86L8 5.14z" />
	</SVG>
);

const stopIcon = (
	<SVG xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
		<Path d="M7 7h10v10H7z" />
	</SVG>
);

const DIRECTION_ICON_MAP = {
	btt: arrowUp,
	ttb: arrowDown,
	ltr: arrowRight,
	rtl: arrowLeft,
};

export default function PageLoadControls( {
	attributes,
	setAttributes,
	blockName,
	clientId,
	onRemove,
	onBeforeModeSwitch,
	onPreview,
	onStopPreview,
	isLoopRunning,
	isPlayPending,
	onPaste,
	onReset,
} ) {
	const {
		animationType,
		animationDirection,
		animationDuration,
		animationDelay,
		animationAcceleration,
		animationCustomTimingFunction,
		animationBlurAmount,
		animationRotateAngle,
		animationRepeat,
		animationPauseOffscreen,
	} = attributes;

	// True when the last Preview press came from the keyboard. See the
	// Preview button below.
	const [ keepFocusWhilePending, setKeepFocusWhilePending ] =
		useState( false );

	// Filter dropdown options:
	// - `-out` preset variants (`fade-out`, `slide-out`, etc.) are
	//   dropped here. Out variants in Page Load would mean "splash on
	//   page load" patterns — the element loads visible, then fades
	//   away. Out of scope for the slot-model redesign; the values
	//   remain registered so existing splash blocks deserialize cleanly,
	//   but they're not reachable through the new UI.
	// - Image effects (image-move, image-zoom) are only meaningful on
	//   blocks with a primary <img>. Hide them entirely for block types
	//   that don't have one. For Cover blocks with Fixed/Repeated
	//   background (no <img> rendered), keep them in the dropdown but
	//   disabled — discoverability + clear "you'd need to turn off X"
	//   signal beats silently filtering them out.
	const blockSupportsImageEffects = IMAGE_EFFECT_BLOCKS.includes( blockName );
	const imageEffectsBlocked = isImageTargetUnavailable( blockName, attributes );
	const typeOptions = ANIMATION_TYPE_OPTIONS.filter( ( opt ) => {
		if ( opt.value.endsWith( '-out' ) ) {
			return false;
		}
		if (
			! blockSupportsImageEffects &&
			IMAGE_EFFECT_TYPES.includes( opt.value )
		) {
			return false;
		}
		return true;
	} ).map( ( opt ) => {
		if (
			imageEffectsBlocked &&
			IMAGE_EFFECT_TYPES.includes( opt.value )
		) {
			return { ...opt, disabled: true };
		}
		return opt;
	} );


	const isCustom = animationType === 'custom';
	const hasDirection = TYPES_WITH_DIRECTION.includes( animationType );
	const directionOptions = DIRECTION_OPTIONS[ animationType ] || [];

	/**
	 * When animation type changes, auto-set direction to the default
	 * for the new type (or clear it if the type has no direction).
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
		// Stagger isn't supported on image-move / image-zoom (each
		// block needs its own img-scoped keyframe — see
		// STAGGER_INCOMPATIBLE_TYPES; Custom composes via
		// --mb-stagger-anim-name, so it stays compatible).
		// StaggerControls already hides the toggle for those types,
		// but the attribute would silently persist as `true`, which
		// is confusing: switch to a preset later and the cascade
		// suddenly re-activates with no UI breadcrumb. Clear it on
		// the way in so what you see matches what's saved.
		if (
			STAGGER_INCOMPATIBLE_TYPES.includes( value ) &&
			attributes.animationStaggerEnabled
		) {
			newAttrs.animationStaggerEnabled = false;
		}
		setAttributes( newAttrs );
	};

	/**
	 * "Edit" button next to the Effect dropdown: convert the current
	 * preset to Custom mode with the equivalent From/To values
	 * pre-filled. Lets the user start from a familiar preset and
	 * fine-tune individual properties instead of building one from
	 * scratch.
	 *
	 * Visible whenever the current type maps to a From/To
	 * representation. Image effects (image-move, image-zoom) qualify —
	 * their from/to bags are just scale + translate, which Custom
	 * supports directly. When converting from an image effect we also
	 * set `animationFromToTarget: 'img'` so the converted Custom keeps
	 * targeting the inner img (matches the original visual; the user
	 * can flip the "Animate image only" toggle off if they want to
	 * animate the whole wrapper instead).
	 *
	 * Stagger is left as-is: Custom can cascade too (GH #64). The
	 * patch itself lives in editPresetAttributes so it can be tested.
	 */
	const handleEditPreset = () => {
		const newAttrs = editPresetAttributes( attributes );
		if ( ! newAttrs ) {
			return;
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
				mode="page-load"
				attributes={ attributes }
				setAttributes={ setAttributes }
				blockName={ blockName }
				clientId={ clientId }
				onPaste={ onPaste }
				onReset={ onReset }
				onRemove={ onRemove }
				onBeforeModeSwitch={ onBeforeModeSwitch }
				helpText={ __(
					'Plays once (or loops continuously) when the page first loads.',
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
				<Button
					icon={ isLoopRunning ? stopIcon : playIcon }
					label={
						isLoopRunning
							? __( 'Stop preview', 'motion-blocks' )
							: __( 'Preview animation', 'motion-blocks' )
					}
					variant="secondary"
					onClick={ ( event ) => {
						// `detail` is 0 for Enter / Space presses.
						setKeepFocusWhilePending( event.detail === 0 );
						const handler = isLoopRunning
							? onStopPreview
							: onPreview;
						if ( handler ) {
							handler( event );
						}
					} }
					onBlur={ ( event ) => {
						// Ignore the blur the browser sends when the whole
						// window loses focus (switching apps or tabs mid
						// preview): focus is still on the button and comes
						// back to it, so it must stay focusable.
						if ( event.currentTarget.ownerDocument.hasFocus() ) {
							setKeepFocusWhilePending( false );
						}
					} }
					// Disable while a one-shot preview is in flight to
					// prevent jumpy mid-playback restarts. Looping
					// previews are exempt — the button is a stop
					// toggle in that mode.
					disabled={ ! isLoopRunning && isPlayPending }
					// A natively disabled button drops keyboard focus
					// to the page. After a keyboard press, disable it
					// with aria-disabled instead so focus stays put.
					// Mouse clicks keep the native disable, so the
					// button still loses focus (and its focus ring)
					// as before. `__experimentalIsFocusable` is the
					// pre-6.7 name of the same prop.
					accessibleWhenDisabled={ keepFocusWhilePending }
					__experimentalIsFocusable={ keepFocusWhilePending }
					__next40pxDefaultSize
				/>
			</HStack>

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
						label={ __(
							'Animate image only',
							'motion-blocks'
						) }
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
					suffix={ <DegreesSuffix /> }
					onChange={ ( value ) =>
						setAttributes( {
							animationRotateAngle:
								parseInt( value, 10 ) || 0,
						} )
					}
					__next40pxDefaultSize
				/>
			) }

			<h2 className="mb-section-heading">
				{ __( 'Timing', 'motion-blocks' ) }
			</h2>

			{ /* Stagger lives inside Timing — semantically it's about
			   when each inner block starts animating. Renders nothing
			   on non-parent block types or incompatible animation
			   types. Stagger Offset and Delay are orthogonal:
			   `inner_N_delay = Delay + (N-1) * Offset`. */ }
			<StaggerControls
				attributes={ attributes }
				setAttributes={ setAttributes }
				blockName={ blockName }
				clientId={ clientId }
			/>

			<HStack spacing={ 3 }>
				<FlexBlock>
					<NumberControl
						label={ __( 'Duration', 'motion-blocks' ) }
						value={ animationDuration }
						min={ 0 }
						step={ 0.01 }
						// Keep two decimals (0.25) when typed; +/- and arrow keys
						// still move by 0.1 (step × spinFactor).
						spinFactor={ 10 }
						spinControls="custom"
						suffix={ <SecondsSuffix /> }
						onChange={ ( value ) =>
							setAttributes( {
								animationDuration: parseFloat( value ) || 0,
							} )
						}
						__next40pxDefaultSize
					/>
				</FlexBlock>
				<FlexBlock>
					<NumberControl
						label={ __( 'Delay', 'motion-blocks' ) }
						value={ animationDelay }
						min={ 0 }
						step={ 0.01 }
						spinFactor={ 10 }
						spinControls="custom"
						suffix={ <SecondsSuffix /> }
						onChange={ ( value ) =>
							setAttributes( {
								animationDelay: parseFloat( value ) || 0,
							} )
						}
						__next40pxDefaultSize
					/>
				</FlexBlock>
			</HStack>

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

			<SelectControl
				label={ __( 'Repeat', 'motion-blocks' ) }
				value={ animationRepeat }
				options={ REPEAT_OPTIONS }
				onChange={ ( value ) =>
					setAttributes( { animationRepeat: value } )
				}
				__next40pxDefaultSize
				__nextHasNoMarginBottom
			/>

			{ /* Pause off-screen only applies to looping animations —
			   for a one-shot, pausing while off-screen would freeze it
			   at frame 0 until scrolled into view, turning Page Load
			   into Scroll Appear. Hidden for non-looping repeats so the
			   setting can't be misapplied. */ }
			{ ( animationRepeat === 'loop' ||
				animationRepeat === 'alternate' ) && (
				<ToggleControl
					label={ __( 'Pause off-screen', 'motion-blocks' ) }
					checked={ animationPauseOffscreen }
					onChange={ ( value ) =>
						setAttributes( {
							animationPauseOffscreen: value,
						} )
					}
					help={ __(
						'Pause the loop while the block is off-screen for better performance.',
						'motion-blocks'
					) }
					__nextHasNoMarginBottom
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
