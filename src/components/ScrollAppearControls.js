/**
 * ScrollAppearControls — "Scroll in view" animation sub-panel.
 *
 * Supports three trigger modes:
 *   - Enter viewport: entrance animation only
 *   - Exit viewport: exit animation only
 *   - Both: entrance + exit (mirror or custom)
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
	TYPES_WITH_EXIT,
	DEFAULT_DIRECTION,
	SCROLL_TRIGGER_OPTIONS,
	EXIT_MODE_OPTIONS,
	ACCELERATION_OPTIONS,
	BLUR_SETTINGS,
	DURATION_SETTINGS,
	DELAY_SETTINGS,
} from './constants';
import AnimationOptionsMenu from './AnimationOptionsMenu';

const playIcon = (
	<SVG xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
		<Path d="M8 5.14v13.72l11-6.86L8 5.14z" />
	</SVG>
);

/**
 * Filter animation type options to only those with exit variants.
 */
const EXIT_TYPE_OPTIONS = ANIMATION_TYPE_OPTIONS.filter( ( opt ) =>
	TYPES_WITH_EXIT.includes( opt.value )
);

export default function ScrollAppearControls( {
	attributes,
	setAttributes,
	onRemove,
	onPreview,
	onPaste,
	onReset,
} ) {
	const {
		animationType,
		animationDirection,
		animationDuration,
		animationDelay,
		animationPlayOnce,
		animationScrollTrigger,
		animationExitMode,
		animationExitType,
		animationExitDirection,
		animationAcceleration,
		animationBlurAmount,
		animationExitDuration,
		animationExitDelay,
		animationExitAcceleration,
	} = attributes;

	const trigger = animationScrollTrigger || 'enter';
	const exitMode = animationExitMode || 'mirror';
	const showEnterConfig = trigger === 'enter' || trigger === 'both';
	const showExitConfig = trigger === 'exit' || trigger === 'both';
	const showCustomExit =
		showExitConfig && ( trigger === 'exit' || exitMode === 'custom' );

	// For enter config: all types available.
	const enterHasDirection = TYPES_WITH_DIRECTION.includes( animationType );
	const enterDirectionOptions = DIRECTION_OPTIONS[ animationType ] || [];

	// For exit config: only types with exit variants.
	const exitType = animationExitType || 'fade';
	const exitHasDirection = TYPES_WITH_DIRECTION.includes( exitType );
	const exitDirectionOptions = DIRECTION_OPTIONS[ exitType ] || [];

	/**
	 * When enter animation type changes, auto-set direction.
	 */
	const handleEnterTypeChange = ( value ) => {
		const newAttrs = { animationType: value };
		if ( TYPES_WITH_DIRECTION.includes( value ) ) {
			newAttrs.animationDirection = DEFAULT_DIRECTION[ value ] || '';
		} else {
			newAttrs.animationDirection = '';
		}
		setAttributes( newAttrs );
	};

	/**
	 * When exit animation type changes, auto-set exit direction.
	 */
	const handleExitTypeChange = ( value ) => {
		const newAttrs = { animationExitType: value };
		if ( TYPES_WITH_DIRECTION.includes( value ) ) {
			newAttrs.animationExitDirection = DEFAULT_DIRECTION[ value ] || '';
		} else {
			newAttrs.animationExitDirection = '';
		}
		setAttributes( newAttrs );
	};

	/**
	 * When trigger changes to exit-only, use the exit type options.
	 * When trigger changes to enter or both, ensure enter type is set.
	 */
	const handleTriggerChange = ( value ) => {
		const newAttrs = { animationScrollTrigger: value };

		// If switching to exit-only and current enter type has no exit
		// variant (e.g., flip), switch to fade.
		if (
			value === 'exit' &&
			! TYPES_WITH_EXIT.includes( animationType )
		) {
			newAttrs.animationType = 'fade';
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
							{ __( 'Scroll in view', 'motion-blocks' ) }
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
							'The animation is triggered when the block is scrolled into view.',
							'motion-blocks'
						) }
					</p>
				</div>
			</div>

			{ /* Trigger selector */ }
			<SelectControl
				label={ __( 'Trigger', 'motion-blocks' ) }
				value={ trigger }
				options={ SCROLL_TRIGGER_OPTIONS }
				onChange={ handleTriggerChange }
				size="__unstable-large"
				__nextHasNoMarginBottom
			/>

			{ /* ---- Enter animation config ---- */ }
			{ showEnterConfig && (
				<>
					<div className="mb-select-row">
						<SelectControl
							label={
								trigger === 'both'
									? __( 'Enter animation', 'motion-blocks' )
									: __( 'Animation', 'motion-blocks' )
							}
							value={ animationType }
							options={
								trigger === 'enter'
									? ANIMATION_TYPE_OPTIONS
									: EXIT_TYPE_OPTIONS
							}
							onChange={ handleEnterTypeChange }
							size="__unstable-large"
							__nextHasNoMarginBottom
						/>
						<Button
							icon={ playIcon }
							label={ __(
								'Preview animation',
								'motion-blocks'
							) }
							variant="secondary"
							size="default"
							className="mb-preview-button"
							onClick={ onPreview }
							__next40pxDefaultSize
						/>
					</div>

					{ enterHasDirection && (
						<SelectControl
							label={ __( 'Direction', 'motion-blocks' ) }
							value={ animationDirection }
							options={ enterDirectionOptions }
							onChange={ ( value ) =>
								setAttributes( {
									animationDirection: value,
								} )
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
								setAttributes( {
									animationBlurAmount: value,
								} )
							}
							min={ BLUR_SETTINGS.min }
							max={ BLUR_SETTINGS.max }
							step={ BLUR_SETTINGS.step }
							renderTooltipContent={ ( value ) =>
								`${ value }px`
							}
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
							setAttributes( {
								animationAcceleration: value,
							} )
						}
						size="__unstable-large"
						__nextHasNoMarginBottom
					/>
				</>
			) }

			{ /* ---- Exit mode selector (only when trigger is 'both') ---- */ }
			{ trigger === 'both' && (
				<SelectControl
					label={ __( 'Exit animation', 'motion-blocks' ) }
					value={ exitMode }
					options={ EXIT_MODE_OPTIONS }
					onChange={ ( value ) =>
						setAttributes( { animationExitMode: value } )
					}
					size="__unstable-large"
					__nextHasNoMarginBottom
				/>
			) }

			{ /* ---- Exit-only or custom exit config ---- */ }
			{ showCustomExit && (
				<>
					{ trigger === 'exit' && (
						<div className="mb-select-row">
							<SelectControl
								label={ __( 'Animation', 'motion-blocks' ) }
								value={ animationType }
								options={ EXIT_TYPE_OPTIONS }
								onChange={ handleEnterTypeChange }
								size="__unstable-large"
								__nextHasNoMarginBottom
							/>
							<Button
								icon={ playIcon }
								label={ __(
									'Preview animation',
									'motion-blocks'
								) }
								variant="secondary"
								size="default"
								className="mb-preview-button"
								onClick={ onPreview }
								__next40pxDefaultSize
							/>
						</div>
					) }

					{ trigger === 'exit' && enterHasDirection && (
						<SelectControl
							label={ __( 'Direction', 'motion-blocks' ) }
							value={ animationDirection }
							options={ enterDirectionOptions }
							onChange={ ( value ) =>
								setAttributes( {
									animationDirection: value,
								} )
							}
							size="__unstable-large"
							__nextHasNoMarginBottom
						/>
					) }

					{ trigger === 'exit' && animationType === 'blur' && (
						<RangeControl
							label={ __( 'Blur', 'motion-blocks' ) }
							value={ animationBlurAmount }
							onChange={ ( value ) =>
								setAttributes( {
									animationBlurAmount: value,
								} )
							}
							min={ BLUR_SETTINGS.min }
							max={ BLUR_SETTINGS.max }
							step={ BLUR_SETTINGS.step }
							renderTooltipContent={ ( value ) =>
								`${ value }px`
							}
							__next40pxDefaultSize
							__nextHasNoMarginBottom
						/>
					) }

					{ trigger === 'exit' && (
						<>
							<RangeControl
								label={ __( 'Duration', 'motion-blocks' ) }
								value={ animationDuration }
								onChange={ ( value ) =>
									setAttributes( {
										animationDuration: value,
									} )
								}
								min={ DURATION_SETTINGS.min }
								max={ DURATION_SETTINGS.max }
								step={ DURATION_SETTINGS.step }
								renderTooltipContent={ ( value ) =>
									`${ value }s`
								}
								__next40pxDefaultSize
								__nextHasNoMarginBottom
							/>

							<RangeControl
								label={ __( 'Delay', 'motion-blocks' ) }
								value={ animationDelay }
								onChange={ ( value ) =>
									setAttributes( {
										animationDelay: value,
									} )
								}
								min={ DELAY_SETTINGS.min }
								max={ DELAY_SETTINGS.max }
								step={ DELAY_SETTINGS.step }
								renderTooltipContent={ ( value ) =>
									`${ value }s`
								}
								__next40pxDefaultSize
								__nextHasNoMarginBottom
							/>

							<SelectControl
								label={ __(
									'Acceleration',
									'motion-blocks'
								) }
								value={ animationAcceleration }
								options={ ACCELERATION_OPTIONS }
								onChange={ ( value ) =>
									setAttributes( {
										animationAcceleration: value,
									} )
								}
								size="__unstable-large"
								__nextHasNoMarginBottom
							/>
						</>
					) }

					{ /* Custom exit controls (when trigger is 'both' + custom) */ }
					{ trigger === 'both' && exitMode === 'custom' && (
						<>
							<SelectControl
								label={ __(
									'Exit type',
									'motion-blocks'
								) }
								value={ exitType }
								options={ EXIT_TYPE_OPTIONS }
								onChange={ handleExitTypeChange }
								size="__unstable-large"
								__nextHasNoMarginBottom
							/>

							{ exitHasDirection && (
								<SelectControl
									label={ __(
										'Exit direction',
										'motion-blocks'
									) }
									value={ animationExitDirection }
									options={ exitDirectionOptions }
									onChange={ ( value ) =>
										setAttributes( {
											animationExitDirection: value,
										} )
									}
									size="__unstable-large"
									__nextHasNoMarginBottom
								/>
							) }

							<RangeControl
								label={ __(
									'Exit duration',
									'motion-blocks'
								) }
								value={ animationExitDuration }
								onChange={ ( value ) =>
									setAttributes( {
										animationExitDuration: value,
									} )
								}
								min={ DURATION_SETTINGS.min }
								max={ DURATION_SETTINGS.max }
								step={ DURATION_SETTINGS.step }
								renderTooltipContent={ ( value ) =>
									`${ value }s`
								}
								__next40pxDefaultSize
								__nextHasNoMarginBottom
							/>

							<RangeControl
								label={ __(
									'Exit delay',
									'motion-blocks'
								) }
								value={ animationExitDelay }
								onChange={ ( value ) =>
									setAttributes( {
										animationExitDelay: value,
									} )
								}
								min={ DELAY_SETTINGS.min }
								max={ DELAY_SETTINGS.max }
								step={ DELAY_SETTINGS.step }
								renderTooltipContent={ ( value ) =>
									`${ value }s`
								}
								__next40pxDefaultSize
								__nextHasNoMarginBottom
							/>

							<SelectControl
								label={ __(
									'Exit acceleration',
									'motion-blocks'
								) }
								value={ animationExitAcceleration }
								options={ ACCELERATION_OPTIONS }
								onChange={ ( value ) =>
									setAttributes( {
										animationExitAcceleration: value,
									} )
								}
								size="__unstable-large"
								__nextHasNoMarginBottom
							/>
						</>
					) }
				</>
			) }

			<ToggleControl
				label={ __( 'Play once', 'motion-blocks' ) }
				checked={ animationPlayOnce }
				onChange={ ( value ) =>
					setAttributes( { animationPlayOnce: value } )
				}
				help={ __(
					'Animate the element only once when scrolling for the first time.',
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
