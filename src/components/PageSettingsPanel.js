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
 * animation-plugin.php). The front end reads them via body classes and
 * keeps `html.mb-motion` off on those devices (src/motion-gate.js). The
 * device ranges are WordPress core's viewport breakpoints, which follow
 * the theme (motion_blocks_device_media_queries()); each toggle's help
 * text shows the range it covers.
 */
import { __, sprintf, _n } from '@wordpress/i18n';
import { registerPlugin } from '@wordpress/plugins';
import {
	PluginDocumentSettingPanel,
	store as editorStore,
} from '@wordpress/editor';
import { useSelect, useDispatch, select as dataSelect } from '@wordpress/data';
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
import { deviceRangeHelp } from './deviceRanges';
import { selectPageContentRoot, clientIdsUnder } from './selectStable';
import { editorContextStrings } from './editorContextStrings';

const DEVICE_OPTIONS = [
	{
		key: 'motion_blocks_disabled_desktop',
		device: 'desktop',
		label: __( 'Disable on Desktop', 'motion-blocks' ),
		icon: desktop,
	},
	{
		key: 'motion_blocks_disabled_tablet',
		device: 'tablet',
		label: __( 'Disable on Tablet', 'motion-blocks' ),
		icon: tablet,
	},
	{
		key: 'motion_blocks_disabled_mobile',
		device: 'mobile',
		label: __( 'Disable on Mobile', 'motion-blocks' ),
		icon: mobile,
	},
];

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
	const contextStrings = editorContextStrings( postType );

	// The page's own blocks. With "Show template" on, the tree is the whole
	// template, and these tools must not change it (see
	// selectPageContentRoot).
	const rootClientId = useSelect(
		( select ) =>
			selectPageContentRoot(
				select( blockEditorStore ),
				postType,
				select( editorStore ).getRenderingMode?.()
			),
		[ postType ]
	);

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

	// Count animated blocks for context next to the Remove button: every
	// block id under the page's root, nested ones included. In a template
	// that includes the blocks inside its template parts (header, footer,
	// or any other), which are shared with other pages, so those are
	// counted apart for the confirm dialog (GH #101). Primitives only, so
	// the result is shallow-equal between runs (GH #27).
	const { animatedCount, animatedInPartsCount } = useSelect(
		( select ) => {
			const sel = select( blockEditorStore );
			const ids = clientIdsUnder( sel, rootClientId );
			let n = 0;
			let inParts = 0;
			for ( const id of ids ) {
				if ( hasAnimation( sel.getBlock( id ) ) ) {
					n++;
					if (
						sel
							.getBlockParents( id )
							.some(
								( parent ) =>
									sel.getBlockName( parent ) ===
									'core/template-part'
							)
					) {
						inParts++;
					}
				}
			}
			return { animatedCount: n, animatedInPartsCount: inParts };
		},
		[ rootClientId ]
	);

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
		const ids = clientIdsUnder( sel, rootClientId ).filter( ( id ) =>
			hasAnimation( sel.getBlock( id ) )
		);

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
					{ contextStrings.autoAnimateTitle }
				</Button>

				<div className="mb-page-settings__divider" />

				<VStack spacing={ 4 }>
					{ supportsDeviceToggles && (
						<p className="mb-page-settings__intro">
							{ __(
								'Disable animations on this page for selected screen sizes. Helpful for reducing motion on smaller devices.',
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
										help={ deviceRangeHelp( opt.device ) }
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
					{ contextStrings.removeAllConfirm( animatedCount ) }
					{ animatedInPartsCount > 0 &&
						' ' +
							sprintf(
								/* translators: %d: number of animated blocks inside template parts */
								_n(
									'%d of them is in a template part (header, footer…), which is shared: it will lose its animation on every page that uses it.',
									'%d of them are in template parts (header, footer…), which are shared: they will lose their animations on every page that uses them.',
									animatedInPartsCount,
									'motion-blocks'
								),
								animatedInPartsCount
							) }
				</span>
			</ConfirmDialog>

			<AutoAnimateModal
				isOpen={ autoAnimateOpen }
				onClose={ () => setAutoAnimateOpen( false ) }
				contextStrings={ contextStrings }
				rootClientId={ rootClientId }
				// Only a template in the Site Editor has template parts whose
				// contents can be edited from here (GH #101).
				allowTemplateParts={ postType === 'wp_template' }
			/>
		</PluginDocumentSettingPanel>
	);
}

registerPlugin( 'motion-blocks-page-settings', {
	render: MotionBlocksPagePanel,
} );
