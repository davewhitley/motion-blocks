/**
 * Motion Blocks — Page-level settings panel.
 *
 * Renders inside the Document/Page tab of the post inspector via
 * `PluginDocumentSettingPanel`. Provides three actions that operate
 * across the entire page rather than a single block:
 *
 *   1. Disable all animations on this page (post meta)
 *   2. Disable on mobile (≤ 768px) only      (post meta)
 *   3. Clear all animations on this page     (block-attr action)
 *
 * The two toggles persist as post meta (registered server-side in
 * animation-plugin.php). The frontend reads the meta off `<body>`
 * (server-emitted body classes) and CSS handles the disable.
 *
 * "Clear" is a destructive one-shot: walks every block on the page
 * and resets `animationMode` to empty. Reversible via WP's native
 * undo (one undo step per block edit batch).
 */
import { __, sprintf, _n } from '@wordpress/i18n';
import { registerPlugin } from '@wordpress/plugins';
import { PluginDocumentSettingPanel } from '@wordpress/editor';
import { useSelect, useDispatch, select as dataSelect } from '@wordpress/data';
import { store as editorStore } from '@wordpress/editor';
import { store as blockEditorStore } from '@wordpress/block-editor';
import { useEntityProp } from '@wordpress/core-data';
import {
	ToggleControl,
	Button,
	__experimentalVStack as VStack,
} from '@wordpress/components';

const META_DISABLED = 'mb_animations_disabled';
const META_DISABLED_MOBILE = 'mb_animations_disabled_mobile';

/**
 * Animation attributes that get reset when the user clicks
 * "Clear all animations". `animationMode: ''` is the kill switch
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

	// Skip rendering if there's no post being edited (e.g. in some
	// site-editor contexts where the document panel still mounts).
	const [ meta = {}, setMeta ] = useEntityProp(
		'postType',
		postType,
		'meta'
	);

	const disabled = !! meta[ META_DISABLED ];
	const disabledMobile = !! meta[ META_DISABLED_MOBILE ];

	// Count animated blocks for context next to the Clear button.
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

	const setMetaValue = ( key, value ) => {
		setMeta( { ...meta, [ key ]: value } );
	};

	const handleClearAll = () => {
		if ( animatedCount === 0 ) {
			return;
		}
		// eslint-disable-next-line no-alert
		const ok = window.confirm(
			sprintf(
				/* translators: %d: number of animated blocks */
				_n(
					'Clear animation from %d block? This can be undone.',
					'Clear animations from %d blocks? This can be undone.',
					animatedCount,
					'motion-blocks'
				),
				animatedCount
			)
		);
		if ( ! ok ) {
			return;
		}

		// Collect just the ids that actually need updating — avoids
		// dirtying every block on the page. Use a fresh `select`
		// snapshot at click time rather than the (potentially stale)
		// useSelect-cached count.
		const sel = dataSelect( blockEditorStore );
		const ids = sel
			.getClientIdsWithDescendants()
			.filter( ( id ) => hasAnimation( sel.getBlock( id ) ) );

		if ( ids.length === 0 ) {
			return;
		}

		// Single dispatch, batched: one undo step covers the whole
		// clear operation.
		updateBlockAttributes( ids, CLEAR_ATTRS );
	};

	return (
		<PluginDocumentSettingPanel
			name="motion-blocks-page-settings"
			title={ __( 'Animations', 'motion-blocks' ) }
			className="mb-page-settings"
		>
			<VStack spacing={ 4 }>
				<ToggleControl
					label={ __(
						'Disable on this page',
						'motion-blocks'
					) }
					help={ __(
						'Animations stay configured on each block, but won’t play on the published page.',
						'motion-blocks'
					) }
					checked={ disabled }
					onChange={ ( v ) => setMetaValue( META_DISABLED, v ) }
					__nextHasNoMarginBottom
				/>

				<ToggleControl
					label={ __(
						'Disable on mobile',
						'motion-blocks'
					) }
					help={ __(
						'Skip animations on screens 768px and narrower. Useful for performance and battery on smaller devices.',
						'motion-blocks'
					) }
					checked={ disabledMobile }
					onChange={ ( v ) =>
						setMetaValue( META_DISABLED_MOBILE, v )
					}
					disabled={ disabled }
					__nextHasNoMarginBottom
				/>

				<div>
					<Button
						variant="secondary"
						isDestructive
						onClick={ handleClearAll }
						disabled={ animatedCount === 0 }
						__next40pxDefaultSize
					>
						{ animatedCount === 0
							? __(
									'No animations to clear',
									'motion-blocks'
							  )
							: sprintf(
									/* translators: %d: number of animated blocks */
									_n(
										'Clear animation from %d block',
										'Clear animations from %d blocks',
										animatedCount,
										'motion-blocks'
									),
									animatedCount
							  ) }
					</Button>
				</div>
			</VStack>
		</PluginDocumentSettingPanel>
	);
}

registerPlugin( 'motion-blocks-page-settings', {
	render: MotionBlocksPagePanel,
} );
