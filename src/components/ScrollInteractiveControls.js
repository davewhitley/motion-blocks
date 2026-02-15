/**
 * ScrollInteractiveControls — "Interactive scroll" animation sub-panel.
 *
 * Start Range and End Range map to the CSS scroll-driven animations spec:
 *   animation-range-start: cover 0%
 *   animation-range-end: cover 100%
 */

import {
	SelectControl,
	Flex,
	FlexBlock,
	FlexItem,
	Button,
	Icon,
	__experimentalNumberControl as NumberControl,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { symbol, seen, unseen } from '@wordpress/icons';

import { ANIMATION_OPTIONS, RANGE_TYPE_OPTIONS } from './constants';
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
		animationRangeStart,
		animationRangeEnd,
		animationPreviewEnabled,
	} = attributes;

	const previewOn = animationPreviewEnabled !== false;

	const rangeStart = parseRange( animationRangeStart );
	const rangeEnd = parseRange( animationRangeEnd );

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
					options={ ANIMATION_OPTIONS }
					onChange={ ( value ) =>
						setAttributes( { animationType: value } )
					}
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
