/**
 * AnimationOptionsMenu — dropdown menu for the moreVertical button
 * in each animation sub-panel header.
 *
 * Provides Copy / Paste / Apply-to-all-of-this-type / Reset / Remove
 * actions. Copy uses a module-level variable that persists across
 * block selections within the session.
 */

import {
	DropdownMenu,
	MenuGroup,
	MenuItem,
	__experimentalConfirmDialog as ConfirmDialog,
} from '@wordpress/components';
import { useSelect, useDispatch } from '@wordpress/data';
import { store as blockEditorStore } from '@wordpress/block-editor';
import { store as blocksStore } from '@wordpress/blocks';
import { store as noticesStore } from '@wordpress/notices';
import { useState } from '@wordpress/element';
import { __, sprintf, _n } from '@wordpress/i18n';
import { moreVertical, copy, reset, trash } from '@wordpress/icons';

import { DEFAULT_ATTRIBUTES } from './constants';

const ANIMATION_KEYS = Object.keys( DEFAULT_ATTRIBUTES );

/**
 * Module-level clipboard — persists across block selections
 * within the current editor session.
 */
let copiedAnimation = null;

/**
 * Extract only animation attributes from a full attributes object.
 */
function pickAnimationAttributes( attributes ) {
	const picked = {};
	ANIMATION_KEYS.forEach( ( key ) => {
		if ( attributes[ key ] !== undefined ) {
			picked[ key ] = attributes[ key ];
		}
	} );
	return picked;
}

export default function AnimationOptionsMenu( {
	attributes,
	blockName,
	clientId,
	onPaste,
	onReset,
	onRemove,
	pasteOnly,
} ) {
	// Look up the block-type display title (e.g. "Image" for
	// `core/image`). Falls back to the raw name if the type isn't
	// registered for some reason — better than rendering nothing.
	const blockTypeTitle = useSelect(
		( select ) =>
			blockName
				? select( blocksStore ).getBlockType( blockName )?.title
				: null,
		[ blockName ]
	);

	// Walk every block on the page, find ones of the same type as
	// the current block (excluding the current block itself), and
	// note how many of those already have an animation configured.
	// `getClientIdsWithDescendants()` returns the flattened tree —
	// nested matches (e.g. an Image inside a Group) are included.
	const { matchingIds, existingCount } = useSelect(
		( select ) => {
			if ( ! blockName || ! clientId ) {
				return { matchingIds: [], existingCount: 0 };
			}
			const sel = select( blockEditorStore );
			const ids = [];
			let existing = 0;
			for ( const id of sel.getClientIdsWithDescendants() ) {
				if ( id === clientId ) {
					continue;
				}
				const block = sel.getBlock( id );
				if ( ! block || block.name !== blockName ) {
					continue;
				}
				ids.push( id );
				if ( block.attributes?.animationMode ) {
					existing++;
				}
			}
			return { matchingIds: ids, existingCount: existing };
		},
		[ blockName, clientId ]
	);

	const { updateBlockAttributes } = useDispatch( blockEditorStore );
	const { createSuccessNotice } = useDispatch( noticesStore );
	const [ confirmOpen, setConfirmOpen ] = useState( false );

	const hasAnimation = !! attributes?.animationMode;
	const canApply =
		! pasteOnly &&
		hasAnimation &&
		matchingIds.length > 0 &&
		!! blockName &&
		!! clientId;

	const handleCopy = ( onClose ) => {
		copiedAnimation = pickAnimationAttributes( attributes );
		onClose();
	};

	const handlePaste = ( onClose ) => {
		if ( copiedAnimation ) {
			onPaste( { ...copiedAnimation } );
		}
		onClose();
	};

	const applyToAll = () => {
		if ( matchingIds.length === 0 ) {
			return;
		}
		updateBlockAttributes(
			matchingIds,
			pickAnimationAttributes( attributes )
		);
		// Snackbar bottom-left of the editor, auto-dismisses. Confirms
		// the bulk apply happened (the user can't see all the blocks
		// at once, so a quick visual receipt avoids the "did anything
		// just happen?" moment).
		createSuccessNotice(
			sprintf(
				/* translators: 1: block count, 2: block-type label */
				_n(
					'Animation applied to %1$d %2$s block.',
					'Animation applied to %1$d %2$s blocks.',
					matchingIds.length,
					'motion-blocks'
				),
				matchingIds.length,
				typeLabel
			),
			{ type: 'snackbar' }
		);
	};

	const handleApplyClick = ( onClose ) => {
		// If any target already has an animation, confirm before
		// overwriting. Otherwise apply silently — there's nothing
		// to lose.
		if ( existingCount > 0 ) {
			setConfirmOpen( true );
		} else {
			applyToAll();
		}
		onClose();
	};

	const onConfirm = () => {
		applyToAll();
		setConfirmOpen( false );
	};

	// Build the apply-item label. Three states:
	//   - No matches  → disabled, "No other [Image] blocks"
	//   - Matches     → "Apply to all 3 Image blocks"
	//
	// (Block-type title isn't always loaded on first render; fall
	// back to the raw name so the label never reads "undefined".)
	const typeLabel = blockTypeTitle || blockName || '';
	const applyLabel =
		matchingIds.length === 0
			? sprintf(
					/* translators: %s: block type label, e.g. "Image" */
					__( 'No other %s blocks', 'motion-blocks' ),
					typeLabel
			  )
			: sprintf(
					/* translators: 1: count, 2: block type label */
					_n(
						'Apply to all %1$d %2$s block',
						'Apply to all %1$d %2$s blocks',
						matchingIds.length,
						'motion-blocks'
					),
					matchingIds.length,
					typeLabel
			  );

	return (
		<>
			<DropdownMenu
				icon={ moreVertical }
				label={ __( 'Options', 'motion-blocks' ) }
				className="mb-options-button"
				toggleProps={ { size: 'small' } }
			>
				{ ( { onClose } ) => (
					<>
						<MenuGroup>
							{ ! pasteOnly && (
								<MenuItem
									icon={ copy }
									onClick={ () => handleCopy( onClose ) }
								>
									{ __( 'Copy animation', 'motion-blocks' ) }
								</MenuItem>
							) }
							<MenuItem
								disabled={ ! copiedAnimation }
								onClick={ () => handlePaste( onClose ) }
							>
								{ __( 'Paste animation', 'motion-blocks' ) }
							</MenuItem>
							{ ! pasteOnly && blockName && (
								<MenuItem
									disabled={ ! canApply }
									onClick={ () =>
										handleApplyClick( onClose )
									}
								>
									{ applyLabel }
								</MenuItem>
							) }
						</MenuGroup>
						{ ! pasteOnly && (
							<MenuGroup>
								<MenuItem
									icon={ reset }
									onClick={ () => {
										onReset();
										onClose();
									} }
								>
									{ __( 'Reset settings', 'motion-blocks' ) }
								</MenuItem>
								<MenuItem
									icon={ trash }
									isDestructive
									onClick={ () => {
										onRemove();
										onClose();
									} }
								>
									{ __( 'Remove animation', 'motion-blocks' ) }
								</MenuItem>
							</MenuGroup>
						) }
					</>
				) }
			</DropdownMenu>

			<ConfirmDialog
				isOpen={ confirmOpen }
				onConfirm={ onConfirm }
				onCancel={ () => setConfirmOpen( false ) }
				confirmButtonText={ __( 'Apply', 'motion-blocks' ) }
			>
				{ sprintf(
					/* translators: 1: target count, 2: count of targets that already have animations, 3: block-type label */
					__(
						'Apply this animation to %1$d %3$s blocks? %2$d already have animations and will be overwritten. This can be reversed using the Undo button.',
						'motion-blocks'
					),
					matchingIds.length,
					existingCount,
					typeLabel
				) }
			</ConfirmDialog>
		</>
	);
}
