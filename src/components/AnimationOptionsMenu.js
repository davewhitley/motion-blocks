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
	Button,
	__experimentalConfirmDialog as ConfirmDialog,
} from '@wordpress/components';
import { useSelect, useDispatch, useRegistry } from '@wordpress/data';
import { useInstanceId } from '@wordpress/compose';
import { speak } from '@wordpress/a11y';
import {
	store as blockEditorStore,
	useSettings,
} from '@wordpress/block-editor';
import { store as blocksStore } from '@wordpress/blocks';
import { store as coreStore } from '@wordpress/core-data';
import { store as noticesStore } from '@wordpress/notices';
import { useEntityProp } from '@wordpress/core-data';
import apiFetch from '@wordpress/api-fetch';
import { useState, useMemo } from '@wordpress/element';
import { __, sprintf, _n } from '@wordpress/i18n';
import { moreVertical, copy, reset, trash } from '@wordpress/icons';

import {
	generateUid,
	pickAnimationAttributes,
	saveLibraryChange,
	sortLibrary,
	sortThemeLibrary,
} from './savedAnimations';
import SavedAnimationsModal from './SavedAnimationsModal';
import { selectSameTypeInfo } from './selectStable';
import { useFocusAfterDialog } from './keyboardFocus';

/**
 * Module-level clipboard — persists across block selections
 * within the current editor session.
 *
 * `attributes` here is the panel's view: block attributes with the
 * block's editor preview state laid over them (GH #29). Copy, Apply to
 * other blocks and Save all go through `pickAnimationAttributes`,
 * which leaves the preview keys out, so a block previewed with the eye
 * on never hands a frozen state to another block.
 */
let copiedAnimation = null;

export default function AnimationOptionsMenu( {
	attributes,
	blockName,
	clientId,
	onPaste,
	onReset,
	onRemove,
	onBeforeModeSwitch,
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

	// Every block of the same type on the page (nested matches, e.g. an
	// Image inside a Group, included) and how many of the others
	// already have an animation. `getBlocksByName` is memoized on block
	// order and identity but not attributes, so it returns the same
	// array while the user types and this result stays shallow-equal
	// between store changes (GH #27). Paste-only menus skip it.
	const { sameTypeIds, existingCount } = useSelect(
		( select ) =>
			selectSameTypeInfo(
				select( blockEditorStore ),
				blockName,
				clientId,
				pasteOnly
			),
		[ blockName, clientId, pasteOnly ]
	);
	const matchingIds = useMemo(
		() => sameTypeIds.filter( ( id ) => id !== clientId ),
		[ sameTypeIds, clientId ]
	);

	// User saved-animation library (site option, exposed via REST).
	// Empty object until the entity loads — `useEntityProp` returns
	// `undefined` initially, so default to `{}` for safe iteration.
	// Read-only here: changes are saved straight to the server with
	// persistLibrary(), never as a pending edit on the site entity
	// (GH #28).
	const [ savedAnimations = {} ] = useEntityProp(
		'root',
		'site',
		'mb_saved_animations'
	);
	// Only users who can save site settings (`manage_options`, which
	// /wp/v2/settings requires) can save or delete library entries.
	// `undefined` while the permission check is still loading.
	const canManageLibrary = useSelect(
		( select ) => select( coreStore ).canUser( 'update', 'settings' ),
		[]
	);
	const savedEntries = sortLibrary( savedAnimations );

	// Theme-supplied animations from theme.json:
	//   settings.custom.motionBlocks.savedAnimations
	// Read-only (the user can't delete them), shown in a separate
	// menu group so the visual distinction is clear. Same shape as
	// user library: `{ [slug]: { name, attributes } }`.
	// useSettings (6.5+) replaces the deprecated useSetting, which logged
	// a deprecation warning on every menu render (2026-10-20 review, #56).
	const [ themeSetting ] = useSettings(
		'custom.motionBlocks.savedAnimations'
	);
	const themeAnimations = themeSetting || {};
	const themeEntries = sortThemeLibrary( themeAnimations );

	const { updateBlockAttributes } = useDispatch( blockEditorStore );
	// Read at click time only — no store subscription (GH #27).
	const registry = useRegistry();
	const { saveEntityRecord } = useDispatch( coreStore );
	const { createSuccessNotice, createErrorNotice } =
		useDispatch( noticesStore );

	const [ confirmOpen, setConfirmOpen ] = useState( false );
	const [ saveModalOpen, setSaveModalOpen ] = useState( false );
	const [ deletePending, setDeletePending ] = useState( null ); // { uid, name }

	// The menu item that opens a dialog unmounts with the menu, so the
	// dialog can have nowhere to return focus to. After a keyboard-
	// opened dialog closes, focus goes back to the Options toggle.
	const { ref: toggleRef, noteOpener } = useFocusAfterDialog(
		confirmOpen || saveModalOpen || !! deletePending
	);

	// The confirm dialogs hide their header, so they get their name
	// from `contentLabel` and their question as the description.
	const applyMessageId = useInstanceId(
		AnimationOptionsMenu,
		'mb-apply-to-all-message'
	);
	const deleteMessageId = useInstanceId(
		AnimationOptionsMenu,
		'mb-delete-saved-message'
	);

	const hasAnimation = !! attributes?.animationMode;
	const canApplyToAll =
		! pasteOnly &&
		hasAnimation &&
		matchingIds.length > 0 &&
		!! blockName &&
		!! clientId;
	const canSave = ! pasteOnly && hasAnimation;
	const showSave = ! pasteOnly && canManageLibrary !== false;

	const handleCopy = ( onClose ) => {
		copiedAnimation = pickAnimationAttributes( attributes );
		// Copy changes nothing on screen, so tell screen readers it worked.
		speak( __( 'Animation copied.', 'motion-blocks' ) );
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
					'Animation applied to %1$d other %2$s block.',
					'Animation applied to %1$d other %2$s blocks.',
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

	// Save one library change on its own (see saveLibraryChange). The
	// menu updates from the server's response.
	const persistLibrary = ( change ) =>
		saveLibraryChange(
			{
				cached: savedAnimations,
				fetchLibrary: () =>
					apiFetch( {
						path: '/wp/v2/settings?_fields=mb_saved_animations',
					} ).then( ( res ) => res && res.mb_saved_animations ),
				saveLibrary: ( next ) =>
					saveEntityRecord(
						'root',
						'site',
						{ mb_saved_animations: next },
						{ throwOnError: true }
					),
			},
			change
		);

	// Error notice for a failed save or delete, with the server's
	// reason when it gave one (e.g. "Sorry, you are not allowed to do
	// that.").
	const reportLibraryError = ( message, error ) => {
		createErrorNotice(
			error && error.message ? message + ' ' + error.message : message,
			{ type: 'snackbar' }
		);
	};

	const handleSaveSubmit = async ( name ) => {
		const uid = generateUid();
		const cleaned = pickAnimationAttributes( attributes );
		setSaveModalOpen( false );
		try {
			await persistLibrary( ( library ) => ( {
				...library,
				[ uid ]: {
					name,
					createdAt: new Date().toISOString(),
					attributes: cleaned,
				},
			} ) );
		} catch ( error ) {
			reportLibraryError(
				sprintf(
					/* translators: %s: user-supplied animation name */
					__( "Couldn't save '%s'.", 'motion-blocks' ),
					name
				),
				error
			);
			return;
		}
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
		// Same path as Paste: the panel's `pasteAnimation` strips
		// preview keys, normalizes From/To units and fits image-only
		// settings to the block type (GH #29, GH #30), then writes
		// through the routed setAttributes, which covers every block
		// of a multi-selection in one undo step (GH #30).
		onPaste( { ...saved.attributes } );
		const count = registry
			.select( blockEditorStore )
			.getMultiSelectedBlockClientIds().length;
		createSuccessNotice(
			count > 1
				? sprintf(
						/* translators: 1: user-supplied animation name, 2: number of selected blocks */
						_n(
							"Applied '%1$s' to %2$d selected block.",
							"Applied '%1$s' to %2$d selected blocks.",
							count,
							'motion-blocks'
						),
						saved.name || '',
						count
				  )
				: sprintf(
						/* translators: %s: user-supplied animation name */
						__( "Applied '%s' to this block.", 'motion-blocks' ),
						saved.name || ''
				  ),
			{ type: 'snackbar' }
		);
		onClose();
	};

	// A saved or theme animation in another mode remounts the panel and
	// drops focus to <body>, like a mode switch, so tell the panel first.
	const applySaved = ( saved, onClose ) => {
		const mode = saved?.attributes?.animationMode;
		if ( onBeforeModeSwitch && mode && mode !== attributes.animationMode ) {
			onBeforeModeSwitch();
		}
		handleApplySaved( saved, onClose );
	};

	const handleDeleteSaved = async () => {
		if ( ! deletePending?.uid ) {
			return;
		}
		const { uid, name } = deletePending;
		setDeletePending( null );
		try {
			await persistLibrary( ( library ) => {
				delete library[ uid ];
				return library;
			} );
		} catch ( error ) {
			reportLibraryError(
				sprintf(
					/* translators: %s: user-supplied animation name */
					__( "Couldn't delete '%s'.", 'motion-blocks' ),
					name || ''
				),
				error
			);
			return;
		}
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
						'Apply to %1$d other %2$s block',
						'Apply to %1$d other %2$s blocks',
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
				toggleProps={ { size: 'small', ref: toggleRef } }
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
									onClick={ ( event ) => {
										noteOpener( event );
										handleApplyClick( onClose );
									} }
								>
									{ applyLabel }
								</MenuItem>
							) }
						</MenuGroup>

						{ showSave && (
							<MenuGroup>
								<MenuItem
									disabled={ ! canSave }
									onClick={ ( event ) => {
										noteOpener( event );
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
											applySaved( saved, onClose )
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
												applySaved( saved, onClose )
											}
										>
											{ saved.name || uid }
										</MenuItem>
										{ canManageLibrary !== false && (
											<Button
												className="mb-saved-animation-row__delete"
												icon={ trash }
												iconSize={ 16 }
												label={ sprintf(
													/* translators: %s: saved animation name */
													__(
														'Delete %s',
														'motion-blocks'
													),
													saved.name || uid
												) }
												onClick={ ( event ) => {
													noteOpener( event );
													setDeletePending( {
														uid,
														name: saved.name,
													} );
													onClose();
												} }
											/>
										) }
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
				className="mb-confirm-dialog"
				isOpen={ confirmOpen }
				onConfirm={ onConfirmApplyToAll }
				onCancel={ () => setConfirmOpen( false ) }
				confirmButtonText={ __( 'Apply', 'motion-blocks' ) }
				contentLabel={ __(
					'Apply animation to other blocks',
					'motion-blocks'
				) }
				aria={ { describedby: applyMessageId } }
			>
				<span id={ applyMessageId }>
					{ [
						sprintf(
							/* translators: 1: target count, 2: block-type label */
							_n(
								'Apply this animation to %1$d other %2$s block?',
								'Apply this animation to %1$d other %2$s blocks?',
								matchingIds.length,
								'motion-blocks'
							),
							matchingIds.length,
							typeLabel
						),
						sprintf(
							/* translators: %d: how many of those blocks already have an animation */
							_n(
								'%d already has an animation and will be overwritten.',
								'%d already have animations and will be overwritten.',
								existingCount,
								'motion-blocks'
							),
							existingCount
						),
						__(
							'This can be reversed using the Undo button.',
							'motion-blocks'
						),
					].join( ' ' ) }
				</span>
			</ConfirmDialog>

			{ /* Save modal — name prompt */ }
			<SavedAnimationsModal
				isOpen={ saveModalOpen }
				onSubmit={ handleSaveSubmit }
				onCancel={ () => setSaveModalOpen( false ) }
			/>

			{ /* Delete confirmation */ }
			<ConfirmDialog
				className="mb-confirm-dialog"
				isOpen={ !! deletePending }
				onConfirm={ handleDeleteSaved }
				onCancel={ () => setDeletePending( null ) }
				confirmButtonText={ __( 'Delete', 'motion-blocks' ) }
				contentLabel={ __( 'Delete saved animation', 'motion-blocks' ) }
				aria={ { describedby: deleteMessageId } }
			>
				<span id={ deleteMessageId }>
					{ sprintf(
						/* translators: %s: saved animation name */
						__(
							"Delete '%s'? This won't affect blocks already using it.",
							'motion-blocks'
						),
						deletePending?.name || ''
					) }
				</span>
			</ConfirmDialog>
		</>
	);
}
