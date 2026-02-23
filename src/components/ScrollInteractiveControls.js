/**
 * ScrollInteractiveControls — "Interactive scroll" animation sub-panel.
 *
 * Start Range and End Range map to the CSS scroll-driven animations spec:
 *   animation-range-start: cover 0%
 *   animation-range-end: cover 100%
 */

import {
	SelectControl,
	RangeControl,
	Flex,
	FlexBlock,
	FlexItem,
	Button,
	Icon,
	__experimentalNumberControl as NumberControl,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { symbol, seen, unseen } from '@wordpress/icons';

import {
	ANIMATION_TYPE_OPTIONS,
	DIRECTION_OPTIONS,
	TYPES_WITH_DIRECTION,
	DEFAULT_DIRECTION,
	ACCELERATION_OPTIONS,
	BLUR_SETTINGS,
	RANGE_TYPE_OPTIONS,
} from './constants';
import AnimationOptionsMenu from './AnimationOptionsMenu';

/**
 * Parse a range value like "cover 20%" into { type, percent }.
 */
function parseRange( value ) {
	const parts = ( value || 'cover 0%' ).split( ' ' );
	return {
		type: parts[ 0 ] || 'cover',
		percent: parseInt( parts[ 1 ], 10 ) || 0,
	};
}

/**
 * Combine type and percent back into a range string.
 */
function buildRange( type, percent ) {
	return `${ type } ${ percent }%`;
}

export default function ScrollInteractiveControls( {
	attributes,
	setAttributes,
	onRemove,
	onPaste,
	onReset,
} ) {
	const {
		animationType,
		animationDirection,
		animationAcceleration,
		animationBlurAmount,
		animationRangeStart,
		animationRangeEnd,
		animationPreviewEnabled,
	} = attributes;

	const previewOn = animationPreviewEnabled !== false;
	const hasDirection = TYPES_WITH_DIRECTION.includes( animationType );
	const directionOptions = DIRECTION_OPTIONS[ animationType ] || [];

	const rangeStart = parseRange( animationRangeStart );
	const rangeEnd = parseRange( animationRangeEnd );

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
		setAttributes( newAttrs );
	};

	return (
		<div className="mb-sub-panel">
			<div className="mb-sub-panel-header">
				<Icon icon={ symbol } size={ 24 } />
				<div className="mb-sub-panel-info">
					<div className="mb-sub-panel-title-row">
						<h2 className="mb-sub-panel-title">
							{ __( 'Interactive scroll', 'motion-blocks' ) }
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
							'Animation timeline is tied to scrolling up and down.',
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
					icon={ previewOn ? seen : unseen }
					label={
						previewOn
							? __( 'Disable preview', 'motion-blocks' )
							: __( 'Enable preview', 'motion-blocks' )
					}
					variant="secondary"
					size="default"
					className="mb-preview-button"
					onClick={ () =>
						setAttributes( {
							animationPreviewEnabled: ! previewOn,
						} )
					}
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

			<div className="mb-range-control">
				<Flex align="flex-end" gap={ 2 }>
					<FlexBlock>
						<SelectControl
							label={ __( 'Start Range', 'motion-blocks' ) }
							value={ rangeStart.type }
							options={ RANGE_TYPE_OPTIONS }
							onChange={ ( value ) =>
								setAttributes( {
									animationRangeStart: buildRange(
										value,
										rangeStart.percent
									),
								} )
							}
							size="__unstable-large"
							__nextHasNoMarginBottom
						/>
					</FlexBlock>
					<FlexItem>
						<NumberControl
							value={ rangeStart.percent }
							onChange={ ( value ) =>
								setAttributes( {
									animationRangeStart: buildRange(
										rangeStart.type,
										parseInt( value, 10 ) || 0
									),
								} )
							}
							min={ 0 }
							max={ 100 }
							suffix="%"
							hideHTMLArrows
							__next40pxDefaultSize
							__nextHasNoMarginBottom
						/>
					</FlexItem>
				</Flex>
			</div>

			<div className="mb-range-control">
				<Flex align="flex-end" gap={ 2 }>
					<FlexBlock>
						<SelectControl
							label={ __( 'End Range', 'motion-blocks' ) }
							value={ rangeEnd.type }
							options={ RANGE_TYPE_OPTIONS }
							onChange={ ( value ) =>
								setAttributes( {
									animationRangeEnd: buildRange(
										value,
										rangeEnd.percent
									),
								} )
							}
							size="__unstable-large"
							__nextHasNoMarginBottom
						/>
					</FlexBlock>
					<FlexItem>
						<NumberControl
							value={ rangeEnd.percent }
							onChange={ ( value ) =>
								setAttributes( {
									animationRangeEnd: buildRange(
										rangeEnd.type,
										parseInt( value, 10 ) || 0
									),
								} )
							}
							min={ 0 }
							max={ 100 }
							suffix="%"
							hideHTMLArrows
							__next40pxDefaultSize
							__nextHasNoMarginBottom
						/>
					</FlexItem>
				</Flex>
			</div>

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
