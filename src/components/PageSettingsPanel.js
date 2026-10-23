/**
 * Motion Blocks — Page-level settings panel.
 *
 * Renders inside the Document/Page tab of the post inspector via
 * `PluginDocumentSettingPanel`. Provides:
 *
 *   1. "Auto-animate this page" — opens a modal that walks the block
 *      tree and applies tasteful animations per block-type category.
 *   2. Three per-device "Disable on …" checkboxes (desktop / tablet
 *      / mobile). Three independent flags — to disable everywhere,
 *      check all three.
 *   3. "Remove all animations" — destructive action that walks every
 *      block and resets `animationMode`. Reversible via WP Undo.
 *
 * The toggles persist as post meta (registered server-side in
 * animation-plugin.php). The frontend reads them via body classes
 * and the matching media-query CSS in animations.css.
 */
import { __, sprintf, _n } from '@wordpress/i18n';
import { registerPlugin } from '@wordpress/plugins';
import { PluginDocumentSettingPanel } from '@wordpress/editor';
import { useSelect, useDispatch, select as dataSelect } from '@wordpress/data';
import { store as editorStore } from '@wordpress/editor';
import { store as blockEditorStore } from '@wordpress/block-editor';
import { store as noticesStore } from '@wordpress/notices';
import { useEntityProp } from '@wordpress/core-data';
import { useState } from '@wordpress/element';
import { useInstanceId } from '@wordpress/compose';
import {
	CheckboxControl,
	Button,
	Icon,
	__experimentalVStack as VStack,
	__experimentalHStack as HStack,
	__experimentalConfirmDialog as ConfirmDialog,
} from '@wordpress/components';
import { desktop, tablet, mobile } from '@wordpress/icons';

import AutoAnimateModal from './AutoAnimate';
import { store as previewStore } from './previewStore';
import { useFocusAfterDialog } from './keyboardFocus';
import { clearAnimationAttributes } from './constants';

const DEVICE_OPTIONS = [
	{
		key: 'mb_disabled_desktop',
		label: __( 'Disable on Desktop', 'motion-blocks' ),
		icon: desktop,
	},
	{
		key: 'mb_disabled_tablet',
		label: __( 'Disable on Tablet', 'motion-blocks' ),
		icon: tablet,
	},
	{
		key: 'mb_disabled_mobile',
		label: __( 'Disable on Mobile', 'motion-blocks' ),
		icon: mobile,
	},
];

/**
 * The "Motion Effects" panel renders in every post-editor context, not
 * just pages — the pattern editor (`wp_block`), templates, and template
 * parts all show it. Map the current post type to a noun so the copy
 * reads correctly ("this pattern" / "this template" / …) instead of
 * always saying "page". Unknown / transient post types fall back to the
 * neutral "content".
 */
const EDITOR_CONTEXT_NOUNS = {
	page: __( 'page', 'motion-blocks' ),
	post: __( 'post', 'motion-blocks' ),
	wp_block: __( 'pattern', 'motion-blocks' ),
	wp_template: __( 'template', 'motion-blocks' ),
	wp_template_part: __( 'template part', 'motion-blocks' ),
};

const editorContextNoun = ( postType ) =>
	EDITOR_CONTEXT_NOUNS[ postType ] || __( 'content', 'motion-blocks' );

/**
 * Animation attributes that get reset when the user clicks
 * "Remove all animations": every animation setting back to its
 * registered default, the Scroll Appear slots and Stagger included
 * (GH #56), so a later re-enable doesn't bring stale values back.
 * Editor preview state (the eye, Play, …) is not an attribute; it is
 * cleared in the preview store instead (GH #29).
 */
const CLEAR_ATTRS = clearAnimationAttributes();

/**
 * A block "has an animation" when its mode is set. Mode is the gate:
 * everything downstream (class emission, frontend wiring, body-class
 * disable) keys off it.
 */
function hasAnimation( block ) {
	return !! block?.attributes?.animationMode;
}

function MotionBlocksPagePanel() {
	const postType = useSelect(
		( select ) => select( editorStore ).getCurrentPostType(),
		[]
	);
	const contextNoun = editorContextNoun( postType );

	const [ meta, setMeta ] = useEntityProp( 'postType', postType, 'meta' );
	// The screen-size toggles are post meta, registered only for public
	// post types with the block editor. Templates, template parts and
	// synced patterns don't have it: the REST response carries no such
	// keys, a toggle there was dropped on save, and the front end never
	// reads it (2026-10-20 review, #56). Show them only where the
	// loaded record actually has the keys.
	const supportsDeviceToggles =
		!! meta &&
		typeof meta === 'object' &&
		DEVICE_OPTIONS.every( ( opt ) =>
			Object.prototype.hasOwnProperty.call( meta, opt.key )
		);

	// Count animated blocks for context next to the Remove button.
	// `getClientIdsWithDescendants()` returns a flat array of all
	// block ids, including nested ones — exactly what we want.
	const animatedCount = useSelect( ( select ) => {
		const sel = select( blockEditorStore );
		const ids = sel.getClientIdsWithDescendants();
		let n = 0;
		for ( const id of ids ) {
			if ( hasAnimation( sel.getBlock( id ) ) ) {
				n++;
			}
		}
		return n;
	}, [] );

	const { updateBlockAttributes } = useDispatch( blockEditorStore );
	const { clearPreview } = useDispatch( previewStore );
	const { createSuccessNotice } = useDispatch( noticesStore );

	const [ confirmOpen, setConfirmOpen ] = useState( false );
	const [ autoAnimateOpen, setAutoAnimateOpen ] = useState( false );

	// Confirming "Remove all animations" disables the button that
	// opened the dialog, so the dialog can't return focus to it. After
	// a keyboard-opened dialog, focus goes to "Auto-animate this …".
	const { ref: autoAnimateRef, noteOpener } =
		useFocusAfterDialog( confirmOpen );

	// The confirm dialog hides its header, so it gets its name from
	// `contentLabel` and its question as the description.
	const removeAllMessageId = useInstanceId(
		MotionBlocksPagePanel,
		'mb-remove-all-message'
	);

	const setMetaValue = ( key, value ) => {
		setMeta( { ...( meta || {} ), [ key ]: value } );
	};

	const handleRemoveAll = () => {
		// Use a fresh `select` snapshot at click time rather than
		// the (potentially stale) useSelect-cached count.
		const sel = dataSelect( blockEditorStore );
		const ids = sel
			.getClientIdsWithDescendants()
			.filter( ( id ) => hasAnimation( sel.getBlock( id ) ) );

		if ( ids.length === 0 ) {
			setConfirmOpen( false );
			return;
		}

		// Single dispatch, batched: one undo step covers the whole
		// remove operation.
		updateBlockAttributes( ids, CLEAR_ATTRS );
		// Stop any Play loop or eye preview on the cleared blocks.
		clearPreview( ids );
		createSuccessNotice(
			sprintf(
				/* translators: %d: number of blocks animations were removed from */
				_n(
					'Animation removed from %d block.',
					'Animations removed from %d blocks.',
					ids.length,
					'motion-blocks'
				),
				ids.length
			),
			{ type: 'snackbar' }
		);
		setConfirmOpen( false );
	};

	return (
		<PluginDocumentSettingPanel
			name="motion-blocks-page-settings"
			title={ __( 'Motion Effects', 'motion-blocks' ) }
			className="mb-page-settings"
		>
			<VStack spacing={ 5 }>
				{ /* Primary action: walk the page and apply tasteful
				   animations in one click. */ }
				<Button
					ref={ autoAnimateRef }
					variant="primary"
					className="mb-auto-animate-button"
					onClick={ () => setAutoAnimateOpen( true ) }
					__next40pxDefaultSize
				>
					{ sprintf(
						/* translators: %s: editor context noun — page, pattern, template, etc. */
						__( 'Auto-animate this %s', 'motion-blocks' ),
						contextNoun
					) }
				</Button>

				<div className="mb-page-settings__divider" />

				<VStack spacing={ 4 }>
					{ supportsDeviceToggles && (
						<p className="mb-page-settings__intro">
							{ __(
								'Hide animations on selected screen sizes. Helpful for reducing motion on smaller devices.',
								'motion-blocks'
							) }
						</p>
					) }

					{ supportsDeviceToggles && (
						<VStack spacing={ 3 }>
							{ DEVICE_OPTIONS.map( ( opt ) => (
								<HStack
									key={ opt.key }
									alignment="center"
									justify="space-between"
									spacing={ 3 }
								>
									<CheckboxControl
										label={ opt.label }
										checked={ !! meta[ opt.key ] }
										onChange={ ( v ) =>
											setMetaValue( opt.key, v )
										}
										__nextHasNoMarginBottom
									/>
									<Icon icon={ opt.icon } />
								</HStack>
							) ) }
						</VStack>
					) }

					<Button
						variant="secondary"
						isDestructive
						className="mb-remove-button"
						onClick={ ( event ) => {
							noteOpener( event );
							setConfirmOpen( true );
						} }
						disabled={ animatedCount === 0 }
						__next40pxDefaultSize
					>
						{ __( 'Remove all animations', 'motion-blocks' ) }
					</Button>
				</VStack>
			</VStack>

			<ConfirmDialog
				className="mb-confirm-dialog"
				isOpen={ confirmOpen }
				onConfirm={ handleRemoveAll }
				onCancel={ () => setConfirmOpen( false ) }
				confirmButtonText={ __( 'Remove', 'motion-blocks' ) }
				contentLabel={ __( 'Remove all animations', 'motion-blocks' ) }
				aria={ { describedby: removeAllMessageId } }
			>
				<span id={ removeAllMessageId }>
					{ sprintf(
						/* translators: 1: editor context noun — page, pattern, template, etc.; 2: number of animated blocks */
						_n(
							'Remove all animations on this %1$s (%2$d block)? This can be reversed using the Undo button.',
							'Remove all animations on this %1$s (%2$d blocks)? This can be reversed using the Undo button.',
							animatedCount,
							'motion-blocks'
						),
						contextNoun,
						animatedCount
					) }
				</span>
			</ConfirmDialog>

			<AutoAnimateModal
				isOpen={ autoAnimateOpen }
				onClose={ () => setAutoAnimateOpen( false ) }
				contextNoun={ contextNoun }
			/>
		</PluginDocumentSettingPanel>
	);
}

registerPlugin( 'motion-blocks-page-settings', {
	render: MotionBlocksPagePanel,
} );
