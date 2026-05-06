/**
 * Motion Blocks — Page-level settings panel.
 *
 * Renders inside the Document/Page tab of the post inspector via
 * `PluginDocumentSettingPanel`. Provides:
 *
 *   1. Three per-device "Disable on …" checkboxes (desktop / tablet
 *      / mobile). Three independent flags — to disable everywhere,
 *      check all three.
 *   2. "Remove all animations" — destructive action that walks every
 *      block and resets `animationMode`. Reversible via WP Undo.
 *
 * The toggles persist as post meta (registered server-side in
 * animation-plugin.php). The frontend reads them via body classes
 * and the matching media-query CSS in animations.css.
 */
import { __, sprintf, _n } from '@wordpress/i18n';
import { registerPlugin } from '@wordpress/plugins';
import { PluginDocumentSettingPanel } from '@wordpress/editor';
import {
	useSelect,
	useDispatch,
	select as dataSelect,
} from '@wordpress/data';
import { store as editorStore } from '@wordpress/editor';
import { store as blockEditorStore } from '@wordpress/block-editor';
import { useEntityProp } from '@wordpress/core-data';
import { useState } from '@wordpress/element';
import {
	CheckboxControl,
	Button,
	Icon,
	__experimentalVStack as VStack,
	__experimentalHStack as HStack,
	__experimentalConfirmDialog as ConfirmDialog,
} from '@wordpress/components';
import { desktop, tablet, mobile } from '@wordpress/icons';

const DEVICE_OPTIONS = [
	{
		key: 'mb_animations_disabled_desktop',
		label: __( 'Disable on Desktop', 'motion-blocks' ),
		icon: desktop,
	},
	{
		key: 'mb_animations_disabled_tablet',
		label: __( 'Disable on Tablet', 'motion-blocks' ),
		icon: tablet,
	},
	{
		key: 'mb_animations_disabled_mobile',
		label: __( 'Disable on Mobile', 'motion-blocks' ),
		icon: mobile,
	},
];

/**
 * Animation attributes that get reset when the user clicks
 * "Remove all animations". `animationMode: ''` is the kill switch
 * (no class is emitted, no `data-mb-*` attrs); we also clear the
 * From/To bag so a future re-enable doesn't surprise the user with
 * stale values.
 */
const CLEAR_ATTRS = {
	animationMode: '',
	animationType: 'fade',
	animationDirection: '',
	animationFromToTarget: 'block',
	animationFromToPreviewSide: 'off',
	animationFromOpacity: null,
	animationFromTranslateX: null,
	animationFromTranslateY: null,
	animationFromScale: null,
	animationFromRotate: null,
	animationFromRotateX: null,
	animationFromRotateY: null,
	animationFromBlur: null,
	animationFromClipPath: null,
	animationToOpacity: null,
	animationToTranslateX: null,
	animationToTranslateY: null,
	animationToScale: null,
	animationToRotate: null,
	animationToRotateX: null,
	animationToRotateY: null,
	animationToBlur: null,
	animationToClipPath: null,
};

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

	const [ meta = {}, setMeta ] = useEntityProp(
		'postType',
		postType,
		'meta'
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

	const [ confirmOpen, setConfirmOpen ] = useState( false );

	const setMetaValue = ( key, value ) => {
		setMeta( { ...meta, [ key ]: value } );
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
		setConfirmOpen( false );
	};

	return (
		<PluginDocumentSettingPanel
			name="motion-blocks-page-settings"
			title={ __( 'Animations', 'motion-blocks' ) }
			className="mb-page-settings"
		>
			<VStack spacing={ 4 }>
				<p className="mb-page-settings__intro">
					{ __(
						'Hide animations on selected screen sizes. Helpful for reducing motion on smaller devices.',
						'motion-blocks'
					) }
				</p>

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

				<Button
					variant="secondary"
					isDestructive
					className="mb-remove-button"
					onClick={ () => setConfirmOpen( true ) }
					disabled={ animatedCount === 0 }
					__next40pxDefaultSize
				>
					{ __( 'Remove all animations', 'motion-blocks' ) }
				</Button>
			</VStack>

			<ConfirmDialog
				isOpen={ confirmOpen }
				onConfirm={ handleRemoveAll }
				onCancel={ () => setConfirmOpen( false ) }
				confirmButtonText={ __( 'Remove', 'motion-blocks' ) }
			>
				{ sprintf(
					/* translators: %d: number of animated blocks */
					_n(
						'Remove all animations on this page (%d block)? This can be reversed using the Undo button.',
						'Remove all animations on this page (%d blocks)? This can be reversed using the Undo button.',
						animatedCount,
						'motion-blocks'
					),
					animatedCount
				) }
			</ConfirmDialog>
		</PluginDocumentSettingPanel>
	);
}

registerPlugin( 'motion-blocks-page-settings', {
	render: MotionBlocksPagePanel,
} );
