/**
 * StaggerControls — "Stagger inner blocks" toggle + offset.
 *
 * Lives inside the Timing section of the mode panels (PageLoad,
 * ScrollAppear) for supported parent block types. Hidden completely
 * for blocks that aren't on the stagger whitelist or for animation
 * types that don't compose with the cascade (Custom, Image Move).
 *
 * When enabled, the parent's animation classes carry through to
 * each direct child via CSS `:nth-child()` rules with a stepped
 * delay. Implementation detail lives in animations.css /
 * editor.scss; this component only writes the two attributes.
 *
 * Note: stagger offset and the existing Delay attribute are
 * orthogonal — Delay is the wait before the first child starts
 * (`child_N_delay = Delay + (N - 1) * Offset`). Both fields stay
 * editable when stagger is on.
 */
import {
	ToggleControl,
	__experimentalNumberControl as NumberControl,
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
	// Hide entirely on unsupported block types — staggering "inner
	// blocks" only has a coherent meaning for container blocks. The
	// Animation panel for everything else is unchanged.
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
			<ToggleControl
				label={ __( 'Stagger inner blocks', 'motion-blocks' ) }
				help={ __(
					'Each inner block will start animating at different time.',
					'motion-blocks'
				) }
				checked={ !! animationStaggerEnabled }
				onChange={ ( v ) =>
					setAttributes( { animationStaggerEnabled: v } )
				}
				__nextHasNoMarginBottom
			/>

			{ animationStaggerEnabled && (
				<NumberControl
					label={ __( 'Stagger offset', 'motion-blocks' ) }
					help={ __(
						'The amount of time to wait in between each inner block animation.',
						'motion-blocks'
					) }
					value={ animationStaggerStep }
					onChange={ ( v ) =>
						setAttributes( {
							animationStaggerStep: parseInt( v, 10 ) || 0,
						} )
					}
					min={ 0 }
					step={ 25 }
					spinControls="custom"
					__next40pxDefaultSize
				/>
			) }
		</VStack>
	);
}
