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
	seen,
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
	TYPES_WITH_EXIT,
	SCROLL_INTERACTIVE_ONLY_TYPES,
	DEFAULT_DIRECTION,
	EXIT_MODE_OPTIONS,
	ACCELERATION_OPTIONS,
	BLUR_SETTINGS,
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

const DIRECTION_ICON_MAP = {
	btt: arrowUp,
	ttb: arrowDown,
	ltr: arrowRight,
	rtl: arrowLeft,
};

/**
 * Filter animation type options to only those with exit variants.
 */
const EXIT_TYPE_OPTIONS = ANIMATION_TYPE_OPTIONS.filter( ( opt ) =>
	TYPES_WITH_EXIT.includes( opt.value )
);

export default function ScrollAppearControls( {
	attributes,
	setAttributes,
	blockName,
	clientId,
	onRemove,
	onPreview,
	isPlayPending,
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
		animationCustomTimingFunction,
		animationBlurAmount,
		animationRotateAngle,
		animationExitDuration,
		animationExitDelay,
		animationExitAcceleration,
		animationExitCustomTimingFunction,
	} = attributes;

	// Image Move is parallax — only meaningful in scroll-interactive
	// mode. Filter it out of the scroll-appear dropdown too.
	const typeOptions = ANIMATION_TYPE_OPTIONS.filter(
		( opt ) => ! SCROLL_INTERACTIVE_ONLY_TYPES.includes( opt.value )
	);
	const exitTypeOptions = EXIT_TYPE_OPTIONS;

	const isCustom = animationType === 'custom';

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
		// Seed the four default From/To rows when picking Custom for
		// the first time. Preserves any existing custom config.
		if ( value === 'custom' && ! hasAnyCustomFromToSet( attributes ) ) {
			Object.assign( newAttrs, CUSTOM_DEFAULT_FROM_TO );
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
				<div className="mb-sub-panel-title-row">
					<Icon icon={ seen } size={ 24 } />
					<span className="mb-sub-panel-title">
						{ __( 'Appear on scroll', 'motion-blocks' ) }
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
						'Trigger animation when the element scrolls into the viewport.',
						'motion-blocks'
					) }
				</p>
			</div>

			{ /* Trigger selector */ }
			<ToggleGroupControl
				label={ __( 'Trigger', 'motion-blocks' ) }
				value={ trigger }
				onChange={ handleTriggerChange }
				isBlock
				__nextHasNoMarginBottom
			>
				<ToggleGroupControlOption
					value="enter"
					label={ __( 'Enter', 'motion-blocks' ) }
				/>
				<ToggleGroupControlOption
					value="exit"
					label={ __( 'Exit', 'motion-blocks' ) }
				/>
				<ToggleGroupControlOption
					value="both"
					label={ __( 'Both', 'motion-blocks' ) }
				/>
			</ToggleGroupControl>

			{ /* ---- Enter animation config ---- */ }
			{ showEnterConfig && (
				<>
					<HStack alignment="bottom" spacing={ 3 }>
						<FlexBlock>
							<SelectControl
								label={
									trigger === 'both'
										? __( 'Enter effect', 'motion-blocks' )
										: __( 'Effect', 'motion-blocks' )
								}
								value={ animationType }
								options={
									trigger === 'enter'
										? typeOptions
										: exitTypeOptions
								}
								onChange={ handleEnterTypeChange }
								__next40pxDefaultSize
								__nextHasNoMarginBottom
							/>
						</FlexBlock>
						<Button
							icon={ playIcon }
							label={ __(
								'Preview animation',
								'motion-blocks'
							) }
							variant="secondary"
							onClick={ onPreview }
							disabled={ isPlayPending }
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
										setAttributes( {
											animationDirection: value,
										} )
									}
									isBlock
									__nextHasNoMarginBottom
								>
									{ enterDirectionOptions.map( ( opt ) => (
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

					{ ! isCustom && enterHasDirection && animationType === 'curtain' && (
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
							{ enterDirectionOptions.map( ( opt ) => (
								<ToggleGroupControlOption
									key={ opt.value }
									value={ opt.value }
									label={ opt.label }
								/>
							) ) }
						</ToggleGroupControl>
					) }

					{ ! isCustom && enterHasDirection && animationType !== 'scale' && animationType !== 'curtain' && (
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
							{ enterDirectionOptions.map( ( opt ) => (
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

					{ /* Stagger inside Timing — same as PageLoad. */ }
					<StaggerControls
						attributes={ attributes }
						setAttributes={ setAttributes }
						blockName={ blockName }
					/>

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
										animationDuration:
											parseFloat( value ) || 0,
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
										animationDelay:
											parseFloat( value ) || 0,
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
							setAttributes( {
								animationAcceleration: value,
							} )
						}
						__next40pxDefaultSize
						__nextHasNoMarginBottom
					/>
					{ animationAcceleration === 'custom' && (
						<TextControl
							label={ __(
								'Custom timing function',
								'motion-blocks'
							) }
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
					__next40pxDefaultSize
					__nextHasNoMarginBottom
				/>
			) }

			{ /* ---- Exit-only or custom exit config ---- */ }
			{ showCustomExit && (
				<>
					{ trigger === 'exit' && (
						<HStack alignment="bottom" spacing={ 3 }>
							<FlexBlock>
								<SelectControl
									label={ __( 'Effect', 'motion-blocks' ) }
									value={ animationType }
									options={ exitTypeOptions }
									onChange={ handleEnterTypeChange }
									__next40pxDefaultSize
									__nextHasNoMarginBottom
								/>
							</FlexBlock>
							<Button
								icon={ playIcon }
								label={ __(
									'Preview animation',
									'motion-blocks'
								) }
								variant="secondary"
								onClick={ onPreview }
								disabled={ isPlayPending }
								__next40pxDefaultSize
							/>
						</HStack>
					) }

					{ trigger === 'exit' && animationType === 'scale' && (
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
										setAttributes( {
											animationDirection: value,
										} )
									}
									isBlock
									__nextHasNoMarginBottom
								>
									{ enterDirectionOptions.map( ( opt ) => (
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

					{ trigger === 'exit' && enterHasDirection && animationType === 'curtain' && (
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
							{ enterDirectionOptions.map( ( opt ) => (
								<ToggleGroupControlOption
									key={ opt.value }
									value={ opt.value }
									label={ opt.label }
								/>
							) ) }
						</ToggleGroupControl>
					) }

					{ trigger === 'exit' && enterHasDirection && animationType !== 'scale' && animationType !== 'curtain' && (
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
							{ enterDirectionOptions.map( ( opt ) => (
								<ToggleGroupControlOptionIcon
									key={ opt.value }
									value={ opt.value }
									icon={ DIRECTION_ICON_MAP[ opt.value ] }
									label={ opt.label }
								/>
							) ) }
						</ToggleGroupControl>
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

					{ trigger === 'exit' && animationType === 'rotate' && (
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

					{ trigger === 'exit' && (
						<>
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
												animationDuration:
													parseFloat( value ) || 0,
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
												animationDelay:
													parseFloat( value ) || 0,
											} )
										}
										__next40pxDefaultSize
									/>
								</FlexBlock>
							</HStack>

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
								__next40pxDefaultSize
								__nextHasNoMarginBottom
							/>
							{ animationAcceleration === 'custom' && (
								<TextControl
									label={ __(
										'Custom timing function',
										'motion-blocks'
									) }
									value={
										animationCustomTimingFunction
									}
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
								options={ exitTypeOptions }
								onChange={ handleExitTypeChange }
								__next40pxDefaultSize
								__nextHasNoMarginBottom
							/>

							{ exitType === 'scale' && (
								<>
									<ToggleControl
										label={ __( 'Scale with direction', 'motion-blocks' ) }
										checked={ animationExitDirection !== 'none' && animationExitDirection !== '' }
										onChange={ ( checked ) =>
											setAttributes( {
												animationExitDirection: checked ? 'btt' : 'none',
											} )
										}
										__nextHasNoMarginBottom
									/>
									{ animationExitDirection !== 'none' && animationExitDirection !== '' && (
										<ToggleGroupControl
											label={ __(
												'Exit direction',
												'motion-blocks'
											) }
											value={ animationExitDirection }
											onChange={ ( value ) =>
												setAttributes( {
													animationExitDirection: value,
												} )
											}
											isBlock
											__nextHasNoMarginBottom
										>
											{ exitDirectionOptions.map( ( opt ) => (
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

							{ exitHasDirection && exitType === 'curtain' && (
								<ToggleGroupControl
									label={ __(
										'Exit direction',
										'motion-blocks'
									) }
									value={ animationExitDirection }
									onChange={ ( value ) =>
										setAttributes( {
											animationExitDirection: value,
										} )
									}
									isBlock
									__nextHasNoMarginBottom
								>
									{ exitDirectionOptions.map( ( opt ) => (
										<ToggleGroupControlOption
											key={ opt.value }
											value={ opt.value }
											label={ opt.label }
										/>
									) ) }
								</ToggleGroupControl>
							) }

							{ exitHasDirection && exitType !== 'scale' && exitType !== 'curtain' && (
								<ToggleGroupControl
									label={ __(
										'Exit direction',
										'motion-blocks'
									) }
									value={ animationExitDirection }
									onChange={ ( value ) =>
										setAttributes( {
											animationExitDirection: value,
										} )
									}
									isBlock
									__nextHasNoMarginBottom
								>
									{ exitDirectionOptions.map( ( opt ) => (
										<ToggleGroupControlOptionIcon
											key={ opt.value }
											value={ opt.value }
											icon={ DIRECTION_ICON_MAP[ opt.value ] }
											label={ opt.label }
										/>
									) ) }
								</ToggleGroupControl>
							) }

							{ exitType === 'rotate' && (
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
								{ __( 'Exit timing', 'motion-blocks' ) }
							</div>

							<HStack spacing={ 3 }>
								<FlexBlock>
									<NumberControl
										label={ __(
											'Exit duration',
											'motion-blocks'
										) }
										value={ animationExitDuration }
										min={ 0 }
										step={ 0.1 }
										spinControls="custom"
										onChange={ ( value ) =>
											setAttributes( {
												animationExitDuration:
													parseFloat( value ) || 0,
											} )
										}
										__next40pxDefaultSize
									/>
								</FlexBlock>
								<FlexBlock>
									<NumberControl
										label={ __(
											'Exit delay',
											'motion-blocks'
										) }
										value={ animationExitDelay }
										min={ 0 }
										step={ 0.1 }
										spinControls="custom"
										onChange={ ( value ) =>
											setAttributes( {
												animationExitDelay:
													parseFloat( value ) || 0,
											} )
										}
										__next40pxDefaultSize
									/>
								</FlexBlock>
							</HStack>

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
								__next40pxDefaultSize
								__nextHasNoMarginBottom
							/>
							{ animationExitAcceleration === 'custom' && (
								<TextControl
									label={ __(
										'Custom timing function',
										'motion-blocks'
									) }
									value={
										animationExitCustomTimingFunction
									}
									onChange={ ( v ) =>
										setAttributes( {
											animationExitCustomTimingFunction: v,
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
