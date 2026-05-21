/**
 * StaggerControls — "Stagger inner blocks" toggle + offset.
 *
 * Lives inside the Timing section of the mode panels (PageLoad,
 * ScrollAppear) for supported parent block types. Hidden completely
 * for blocks that aren't on the stagger whitelist, for animation
 * types that don't compose with the cascade (Custom, Image Move),
 * or for parent blocks that have fewer than two inner blocks
 * (staggering one — or zero — children is incoherent).
 *
 * When enabled, the parent block's animation classes carry through
 * to each inner block via CSS `:nth-child()` rules with a stepped
 * delay. Implementation detail lives in animations.css /
 * editor.scss; this component only writes the two attributes.
 *
 * Note: stagger offset and the existing Delay attribute are
 * orthogonal — Delay is the wait before the first inner block
 * starts (`inner_N_delay = Delay + (N - 1) * Offset`). Both fields
 * stay editable when stagger is on.
 */
import {
	ToggleControl,
	__experimentalNumberControl as NumberControl,
	__experimentalVStack as VStack,
} from '@wordpress/components';
import { useSelect } from '@wordpress/data';
import { store as blockEditorStore } from '@wordpress/block-editor';
import { __ } from '@wordpress/i18n';

import {
	STAGGER_PARENT_BLOCKS,
	STAGGER_INCOMPATIBLE_TYPES,
	staggerStepSeconds,
} from './constants';

export default function StaggerControls( {
	attributes,
	setAttributes,
	blockName,
	clientId,
} ) {
	// Read the direct-child count from the block-editor store so the
	// stagger toggle disappears when there's nothing meaningful to
	// stagger. Hooks must run before any early returns, so this lives
	// here even though the gates below short-circuit most cases.
	const innerBlockCount = useSelect(
		( select ) =>
			clientId
				? select( blockEditorStore ).getBlockOrder( clientId ).length
				: 0,
		[ clientId ]
	);

	// Hide entirely on unsupported block types — staggering "inner
	// blocks" only has a coherent meaning for parent block types
	// whose meaningful content IS their inner blocks (lists,
	// galleries, button groups, …). The Animation panel for
	// everything else is unchanged.
	if ( ! STAGGER_PARENT_BLOCKS.includes( blockName ) ) {
		return null;
	}

	// Custom (From/To) and image-move use per-block @keyframes which
	// don't compose with the simple :nth-child cascade. Hide instead
	// of disabling — keeps the panel clean.
	if ( STAGGER_INCOMPATIBLE_TYPES.includes( attributes.animationType ) ) {
		return null;
	}

	// Stagger requires at least two children to produce any visible
	// cascade. With 0 or 1 inner blocks the offset has nothing to
	// step through. Hide the toggle entirely in that case — if the
	// user re-adds children later, the toggle reappears with
	// whatever state was previously saved.
	if ( innerBlockCount < 2 ) {
		return null;
	}

	const { animationStaggerEnabled } = attributes;
	// Normalize to seconds before display. Old blocks may have the
	// value stored as milliseconds (legacy pre-seconds unit) — the
	// helper detects ms-magnitude values and converts. See
	// staggerStepSeconds() for the heuristic.
	const stepSec = staggerStepSeconds( attributes.animationStaggerStep );

	return (
		<VStack spacing={ 3 }>
			<ToggleControl
				label={ __( 'Stagger inner blocks', 'motion-blocks' ) }
				help={ __(
					'Each inner block will start animating at a different time.',
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
						'Seconds to wait between each inner block.',
						'motion-blocks'
					) }
					value={ stepSec }
					onChange={ ( v ) =>
						setAttributes( {
							animationStaggerStep: parseFloat( v ) || 0,
						} )
					}
					min={ 0 }
					max={ 5 }
					step={ 0.05 }
					spinControls="custom"
					__next40pxDefaultSize
				/>
			) }
		</VStack>
	);
}
