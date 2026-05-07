/**
 * StaggerControls — "Stagger children" toggle + step slider.
 *
 * Rendered by the mode panels (PageLoad / ScrollAppear) for
 * supported parent block types. Hidden completely for blocks that
 * aren't on the stagger whitelist or for animation types that don't
 * compose with the cascade (Custom, Image Move).
 *
 * When enabled, the parent's animation classes carry through to
 * each direct child via CSS `:nth-child()` rules with a stepped
 * delay. Implementation detail lives in animations.css /
 * editor.scss; this component only writes the two attributes.
 */
import {
	ToggleControl,
	RangeControl,
	__experimentalVStack as VStack,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';

import {
	STAGGER_CONTAINER_BLOCKS,
	STAGGER_INCOMPATIBLE_TYPES,
} from './constants';

export default function StaggerControls( {
	attributes,
	setAttributes,
	blockName,
} ) {
	// Hide entirely on unsupported block types — staggering "children"
	// only has a coherent meaning for container blocks. The Animation
	// panel for everything else is unchanged.
	if ( ! STAGGER_CONTAINER_BLOCKS.includes( blockName ) ) {
		return null;
	}

	// Custom (From/To) and image-move use per-block @keyframes which
	// don't compose with the simple :nth-child cascade. Hide instead
	// of disabling — keeps the panel clean.
	if ( STAGGER_INCOMPATIBLE_TYPES.includes( attributes.animationType ) ) {
		return null;
	}

	const { animationStaggerEnabled, animationStaggerStep } = attributes;

	return (
		<VStack spacing={ 3 }>
			<div className="mb-section-heading">
				{ __( 'Children', 'motion-blocks' ) }
			</div>

			<ToggleControl
				label={ __( 'Stagger children', 'motion-blocks' ) }
				help={ __(
					'Animate each child one after another instead of animating the whole container at once.',
					'motion-blocks'
				) }
				checked={ !! animationStaggerEnabled }
				onChange={ ( v ) =>
					setAttributes( { animationStaggerEnabled: v } )
				}
				__nextHasNoMarginBottom
			/>

			{ animationStaggerEnabled && (
				<RangeControl
					label={ __( 'Step (ms)', 'motion-blocks' ) }
					value={ animationStaggerStep }
					onChange={ ( v ) =>
						setAttributes( {
							animationStaggerStep: parseInt( v, 10 ) || 0,
						} )
					}
					min={ 0 }
					max={ 1000 }
					step={ 25 }
					renderTooltipContent={ ( v ) => `${ v }ms` }
					__next40pxDefaultSize
					__nextHasNoMarginBottom
				/>
			) }
		</VStack>
	);
}
