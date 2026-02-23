/**
 * PageLoadControls — "On page load" animation sub-panel.
 */

import {
	SelectControl,
	RangeControl,
	ToggleControl,
	Button,
	Icon,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { symbol } from '@wordpress/icons';
import { SVG, Path } from '@wordpress/primitives';

import {
	ANIMATION_TYPE_OPTIONS,
	DIRECTION_OPTIONS,
	TYPES_WITH_DIRECTION,
	DEFAULT_DIRECTION,
	ACCELERATION_OPTIONS,
	BLUR_SETTINGS,
	REPEAT_OPTIONS,
	DURATION_SETTINGS,
	DELAY_SETTINGS,
} from './constants';
import AnimationOptionsMenu from './AnimationOptionsMenu';

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

export default function PageLoadControls( {
	attributes,
	setAttributes,
	onRemove,
	onPreview,
	onStopPreview,
	isLoopRunning,
	onPaste,
	onReset,
} ) {
	const {
		animationType,
		animationDirection,
		animationDuration,
		animationDelay,
		animationAcceleration,
		animationBlurAmount,
		animationRepeat,
		animationPauseOffscreen,
	} = attributes;

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
		setAttributes( newAttrs );
	};

	return (
		<div className="mb-sub-panel">
			<div className="mb-sub-panel-header">
				<Icon icon={ symbol } size={ 24 } />
				<div className="mb-sub-panel-info">
					<div className="mb-sub-panel-title-row">
						<h2 className="mb-sub-panel-title">
							{ __( 'On page load', 'motion-blocks' ) }
						</h2>
						<AnimationOptionsMenu
							attributes={ attributes }
							onPaste={ onPaste }
							onReset={ onReset }
							onRemove={ onRemove }
						/>
					</div>
					<p className="mb-help-text">
						{ __(
							'The animation plays when the page is loaded.',
							'motion-blocks'
						) }
					</p>
				</div>
			</div>

			<div className="mb-select-row">
				<SelectControl
					label={ __( 'Animation', 'motion-blocks' ) }
					value={ animationType }
					options={ ANIMATION_TYPE_OPTIONS }
					onChange={ handleTypeChange }
					size="__unstable-large"
					__nextHasNoMarginBottom
				/>
				<Button
					icon={ isLoopRunning ? stopIcon : playIcon }
					label={
						isLoopRunning
							? __( 'Stop preview', 'motion-blocks' )
							: __( 'Preview animation', 'motion-blocks' )
					}
					variant="secondary"
					size="default"
					className="mb-preview-button"
					onClick={ isLoopRunning ? onStopPreview : onPreview }
					__next40pxDefaultSize
				/>
			</div>

			{ hasDirection && (
				<SelectControl
					label={ __( 'Direction', 'motion-blocks' ) }
					value={ animationDirection }
					options={ directionOptions }
					onChange={ ( value ) =>
						setAttributes( { animationDirection: value } )
					}
					size="__unstable-large"
					__nextHasNoMarginBottom
				/>
			) }

			{ animationType === 'blur' && (
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

			<RangeControl
				label={ __( 'Duration', 'motion-blocks' ) }
				value={ animationDuration }
				onChange={ ( value ) =>
					setAttributes( { animationDuration: value } )
				}
				min={ DURATION_SETTINGS.min }
				max={ DURATION_SETTINGS.max }
				step={ DURATION_SETTINGS.step }
				renderTooltipContent={ ( value ) => `${ value }s` }
				__next40pxDefaultSize
				__nextHasNoMarginBottom
			/>

			<RangeControl
				label={ __( 'Delay', 'motion-blocks' ) }
				value={ animationDelay }
				onChange={ ( value ) =>
					setAttributes( { animationDelay: value } )
				}
				min={ DELAY_SETTINGS.min }
				max={ DELAY_SETTINGS.max }
				step={ DELAY_SETTINGS.step }
				renderTooltipContent={ ( value ) => `${ value }s` }
				__next40pxDefaultSize
				__nextHasNoMarginBottom
			/>

			<SelectControl
				label={ __( 'Acceleration', 'motion-blocks' ) }
				value={ animationAcceleration }
				options={ ACCELERATION_OPTIONS }
				onChange={ ( value ) =>
					setAttributes( { animationAcceleration: value } )
				}
				size="__unstable-large"
				__nextHasNoMarginBottom
			/>

			<SelectControl
				label={ __( 'Repeat', 'motion-blocks' ) }
				value={ animationRepeat }
				options={ REPEAT_OPTIONS }
				onChange={ ( value ) =>
					setAttributes( { animationRepeat: value } )
				}
				size="__unstable-large"
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
