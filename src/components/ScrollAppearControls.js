/**
 * ScrollAppearControls — "Scroll in view" animation sub-panel.
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
	ANIMATION_OPTIONS,
	DURATION_SETTINGS,
	DELAY_SETTINGS,
} from './constants';
import AnimationOptionsMenu from './AnimationOptionsMenu';

const playIcon = (
	<SVG xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
		<Path d="M8 5.14v13.72l11-6.86L8 5.14z" />
	</SVG>
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
		animationDuration,
		animationDelay,
		animationPlayOnce,
	} = attributes;

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
					icon={ playIcon }
					label={ __( 'Preview animation', 'motion-blocks' ) }
					variant="secondary"
					size="default"
					className="mb-preview-button"
					onClick={ onPreview }
					__next40pxDefaultSize
				/>
			</div>

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

			<ToggleControl
				label={ __( 'Play once', 'motion-blocks' ) }
				checked={ animationPlayOnce }
				onChange={ ( value ) =>
					setAttributes( { animationPlayOnce: value } )
				}
				help={ __(
					'Animate the element only once when scrolling down for the first time.',
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
