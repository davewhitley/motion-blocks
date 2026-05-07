/**
 * PageLoadControls — "On page load" animation sub-panel.
 */

import {
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
	Icon,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import {
	desktop,
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
	SCROLL_INTERACTIVE_ONLY_TYPES,
	DEFAULT_DIRECTION,
	ACCELERATION_OPTIONS,
	BLUR_SETTINGS,
	REPEAT_OPTIONS,
	CUSTOM_DEFAULT_FROM_TO,
	hasAnyCustomFromToSet,
} from './constants';
import AnimationOptionsMenu from './AnimationOptionsMenu';
import FromToControls from './FromToControls';
import StaggerControls from './StaggerControls';

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

	// Image Move is parallax — only meaningful in scroll-interactive
	// mode. Filter it out of the page-load dropdown.
	const typeOptions = ANIMATION_TYPE_OPTIONS.filter(
		( opt ) => ! SCROLL_INTERACTIVE_ONLY_TYPES.includes( opt.value )
	);

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
		setAttributes( newAttrs );
	};

	return (
		<div className="mb-sub-panel">
			<div className="mb-sub-panel-header">
				<div className="mb-sub-panel-title-row">
					<Icon icon={ desktop } size={ 24 } />
					<span className="mb-sub-panel-title">
						{ __( 'On page load', 'motion-blocks' ) }
					</span>
					<AnimationOptionsMenu
						attributes={ attributes }
						blockName={ blockName }
						clientId={ clientId }
						onPaste={ onPaste }
						onReset={ onReset }
						onRemove={ onRemove }
					/>
				</div>
				<p className="mb-help-text">
					{ __(
						'Animate when the page first loads. Great for hero sections and above-the-fold content.',
						'motion-blocks'
					) }
				</p>
			</div>

			{ /* Stagger lives at the top — it's a structural decision
			   ("animate the container as one vs. cascade through its
			   children") that should be visible before per-effect
			   options. Renders nothing on non-container block types. */ }
			<StaggerControls
				attributes={ attributes }
				setAttributes={ setAttributes }
				blockName={ blockName }
			/>

			<HStack alignment="bottom" spacing={ 3 }>
				<FlexBlock>
					<SelectControl
						label={ __( 'Effect', 'motion-blocks' ) }
						value={ animationType }
						options={ typeOptions }
						onChange={ handleTypeChange }
						__next40pxDefaultSize
						__nextHasNoMarginBottom
					/>
				</FlexBlock>
				<Button
					icon={ isLoopRunning ? stopIcon : playIcon }
					label={
						isLoopRunning
							? __( 'Stop preview', 'motion-blocks' )
							: __( 'Preview animation', 'motion-blocks' )
					}
					variant="secondary"
					onClick={ isLoopRunning ? onStopPreview : onPreview }
					// Disable while a one-shot preview is in flight to
					// prevent jumpy mid-playback restarts. Looping
					// previews are exempt — the button is a stop
					// toggle in that mode.
					disabled={ ! isLoopRunning && isPlayPending }
					__next40pxDefaultSize
				/>
			</HStack>

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

			{ ! isCustom && hasDirection && animationType === 'curtain' && (
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

			{ ! isCustom && hasDirection && animationType !== 'scale' && animationType !== 'curtain' && (
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

			<div className="mb-section-heading">
				{ __( 'Timing', 'motion-blocks' ) }
			</div>

			<HStack spacing={ 3 }>
				<FlexBlock>
					<NumberControl
						label={ __( 'Duration', 'motion-blocks' ) }
						value={ animationDuration }
						min={ 0 }
						step={ 0.1 }
						spinControls="custom"
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
						step={ 0.1 }
						spinControls="custom"
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

			<ToggleControl
				label={ __( 'Pause off-screen', 'motion-blocks' ) }
				checked={ animationPauseOffscreen }
				onChange={ ( value ) =>
					setAttributes( { animationPauseOffscreen: value } )
				}
				help={ __(
					'Animation will pause when the block is not visible for better performance.',
					'motion-blocks'
				) }
				__nextHasNoMarginBottom
			/>

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
