/**
 * AnimationOptionsMenu — dropdown menu for the moreVertical button
 * in each animation sub-panel header.
 *
 * Provides:
 *   - Copy / Paste (in-session clipboard)
 *   - Apply to all blocks of this type (with overwrite confirm)
 *   - Save animation as… (persists to site option `mb_saved_animations`)
 *   - Apply / Delete saved animations
 *   - Reset / Remove
 *
 * Saved-animation library is site-wide. Storage and shape live in
 * `savedAnimations.js` and the PHP `register_setting` block.
 */

import {
	DropdownMenu,
	MenuGroup,
	MenuItem,
	Icon,
	__experimentalConfirmDialog as ConfirmDialog,
} from '@wordpress/components';
import { useSelect, useDispatch } from '@wordpress/data';
import {
	store as blockEditorStore,
	useSetting,
} from '@wordpress/block-editor';
import { store as blocksStore } from '@wordpress/blocks';
import { store as coreStore } from '@wordpress/core-data';
import { store as noticesStore } from '@wordpress/notices';
import { useEntityProp } from '@wordpress/core-data';
import { useState } from '@wordpress/element';
import { __, sprintf, _n } from '@wordpress/i18n';
import { moreVertical, copy, reset, trash } from '@wordpress/icons';

import { DEFAULT_ATTRIBUTES } from './constants';
import {
	generateUid,
	sortLibrary,
	sortThemeLibrary,
	stripUiState,
} from './savedAnimations';
import SavedAnimationsModal from './SavedAnimationsModal';

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

	// User saved-animation library (site option, exposed via REST).
	// Empty object until the entity loads — `useEntityProp` returns
	// `undefined` initially, so default to `{}` for safe iteration.
	const [ savedAnimations = {}, setSavedAnimations ] = useEntityProp(
		'root',
		'site',
		'mb_saved_animations'
	);
	const savedEntries = sortLibrary( savedAnimations );

	// Theme-supplied animations from theme.json:
	//   settings.custom.motionBlocks.savedAnimations
	// Read-only (the user can't delete them), shown in a separate
	// menu group so the visual distinction is clear. Same shape as
	// user library: `{ [slug]: { name, attributes } }`.
	const themeAnimations =
		useSetting( 'custom.motionBlocks.savedAnimations' ) || {};
	const themeEntries = sortThemeLibrary( themeAnimations );

	const { updateBlockAttributes } = useDispatch( blockEditorStore );
	const { saveEditedEntityRecord } = useDispatch( coreStore );
	const { createSuccessNotice } = useDispatch( noticesStore );

	const [ confirmOpen, setConfirmOpen ] = useState( false );
	const [ saveModalOpen, setSaveModalOpen ] = useState( false );
	const [ deletePending, setDeletePending ] = useState( null ); // { uid, name }

	const hasAnimation = !! attributes?.animationMode;
	const canApplyToAll =
		! pasteOnly &&
		hasAnimation &&
		matchingIds.length > 0 &&
		!! blockName &&
		!! clientId;
	const canSave = ! pasteOnly && hasAnimation;

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

	// ── Apply to all blocks of this type ─────────────────────────

	const typeLabel = blockTypeTitle || blockName || '';

	const applyToAll = () => {
		if ( matchingIds.length === 0 ) {
			return;
		}
		updateBlockAttributes(
			matchingIds,
			pickAnimationAttributes( attributes )
		);
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
		if ( existingCount > 0 ) {
			setConfirmOpen( true );
		} else {
			applyToAll();
		}
		onClose();
	};

	const onConfirmApplyToAll = () => {
		applyToAll();
		setConfirmOpen( false );
	};

	// ── Save / Apply saved / Delete saved ────────────────────────

	const persistLibrary = async ( nextLibrary ) => {
		setSavedAnimations( nextLibrary );
		// `useEntityProp` only edits the local entity record; persist
		// to the server explicitly. Without this the change vanishes
		// on the next REST round-trip.
		await saveEditedEntityRecord( 'root', 'site', undefined, {
			mb_saved_animations: nextLibrary,
		} );
	};

	const handleSaveSubmit = async ( name ) => {
		const uid = generateUid();
		const cleaned = stripUiState( pickAnimationAttributes( attributes ) );
		const next = {
			...( savedAnimations || {} ),
			[ uid ]: {
				name,
				createdAt: new Date().toISOString(),
				attributes: cleaned,
			},
		};
		await persistLibrary( next );
		setSaveModalOpen( false );
		createSuccessNotice(
			sprintf(
				/* translators: %s: user-supplied animation name */
				__( "Animation saved as '%s'.", 'motion-blocks' ),
				name
			),
			{ type: 'snackbar' }
		);
	};

	const handleApplySaved = ( saved, onClose ) => {
		if ( ! saved?.attributes ) {
			onClose();
			return;
		}
		updateBlockAttributes( clientId, saved.attributes );
		createSuccessNotice(
			sprintf(
				/* translators: %s: user-supplied animation name */
				__( "Applied '%s' to this block.", 'motion-blocks' ),
				saved.name || ''
			),
			{ type: 'snackbar' }
		);
		onClose();
	};

	const handleDeleteSaved = async () => {
		if ( ! deletePending?.uid ) {
			return;
		}
		const next = { ...( savedAnimations || {} ) };
		delete next[ deletePending.uid ];
		await persistLibrary( next );
		const name = deletePending.name;
		setDeletePending( null );
		createSuccessNotice(
			sprintf(
				/* translators: %s: user-supplied animation name */
				__( "Deleted '%s'.", 'motion-blocks' ),
				name || ''
			),
			{ type: 'snackbar' }
		);
	};

	// ── Apply-to-all menu label ──────────────────────────────────

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
									disabled={ ! canApplyToAll }
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
									disabled={ ! canSave }
									onClick={ () => {
										setSaveModalOpen( true );
										onClose();
									} }
								>
									{ __(
										'Save animation as…',
										'motion-blocks'
									) }
								</MenuItem>
							</MenuGroup>
						) }

						{ themeEntries.length > 0 && (
							<MenuGroup
								label={ __(
									'Theme animations',
									'motion-blocks'
								) }
							>
								{ themeEntries.map( ( [ slug, saved ] ) => (
									<MenuItem
										key={ slug }
										onClick={ () =>
											handleApplySaved(
												saved,
												onClose
											)
										}
									>
										{ saved.name || slug }
									</MenuItem>
								) ) }
							</MenuGroup>
						) }

						{ savedEntries.length > 0 && (
							<MenuGroup
								label={
									themeEntries.length > 0
										? __(
												'Your saved animations',
												'motion-blocks'
										  )
										: __(
												'Apply saved animation',
												'motion-blocks'
										  )
								}
							>
								{ savedEntries.map( ( [ uid, saved ] ) => (
									<div
										key={ uid }
										className="mb-saved-animation-row"
									>
										<MenuItem
											className="mb-saved-animation-row__apply"
											onClick={ () =>
												handleApplySaved(
													saved,
													onClose
												)
											}
										>
											{ saved.name || uid }
										</MenuItem>
										<button
											type="button"
											className="mb-saved-animation-row__delete"
											aria-label={ sprintf(
												/* translators: %s: saved animation name */
												__(
													'Delete %s',
													'motion-blocks'
												),
												saved.name || uid
											) }
											onClick={ () => {
												setDeletePending( {
													uid,
													name: saved.name,
												} );
												onClose();
											} }
										>
											<Icon icon={ trash } size={ 16 } />
										</button>
									</div>
								) ) }
							</MenuGroup>
						) }

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
									{ __(
										'Remove animation',
										'motion-blocks'
									) }
								</MenuItem>
							</MenuGroup>
						) }
					</>
				) }
			</DropdownMenu>

			{ /* Apply-to-all overwrite confirmation */ }
			<ConfirmDialog
				isOpen={ confirmOpen }
				onConfirm={ onConfirmApplyToAll }
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

			{ /* Save modal — name prompt */ }
			<SavedAnimationsModal
				isOpen={ saveModalOpen }
				onSubmit={ handleSaveSubmit }
				onCancel={ () => setSaveModalOpen( false ) }
			/>

			{ /* Delete confirmation */ }
			<ConfirmDialog
				isOpen={ !! deletePending }
				onConfirm={ handleDeleteSaved }
				onCancel={ () => setDeletePending( null ) }
				confirmButtonText={ __( 'Delete', 'motion-blocks' ) }
			>
				{ sprintf(
					/* translators: %s: saved animation name */
					__(
						"Delete '%s'? This won't affect blocks already using it.",
						'motion-blocks'
					),
					deletePending?.name || ''
				) }
			</ConfirmDialog>
		</>
	);
}
