/**
 * Auto-animate this page — modal UI + dispatcher.
 *
 * Reads the block tree, computes a tasteful animation plan via
 * `./plan.js`, shows a diff modal, and on apply dispatches one
 * batched `updateBlockAttributes` per category.
 *
 * Stays a presentational component: the parent (PageSettingsPanel)
 * owns the open/closed state.
 */
import {
	Modal,
	Button,
	__experimentalToggleGroupControl as ToggleGroupControl,
	__experimentalToggleGroupControlOption as ToggleGroupControlOption,
	__experimentalVStack as VStack,
	__experimentalHStack as HStack,
} from '@wordpress/components';
import {
	useSelect,
	useDispatch,
	useRegistry,
	select as dataSelect,
} from '@wordpress/data';
import { store as blockEditorStore } from '@wordpress/block-editor';
import { store as blocksStore } from '@wordpress/blocks';
import { store as noticesStore } from '@wordpress/notices';
import { useState, useMemo } from '@wordpress/element';
import { __, sprintf, _n } from '@wordpress/i18n';

import {
	STYLE_PRESETS,
	attrsForCategory,
	computeAutoAnimatePlan,
	summarizeByBlockType,
} from './plan';
import { countDescendantsIn } from '../selectStable';

// Module-level so it is the same reference on every render (GH #27).
const getBlockTypeTitle = ( name ) =>
	dataSelect( blocksStore ).getBlockType( name )?.title;

/**
 * Keeps the modal's hooks unmounted while it is closed: the component
 * is always mounted from the Document panel, and running the plan
 * against the whole block tree on every store change while nobody can
 * see it was wasted work (GH #27). The style preset lives here so the
 * choice still survives closing and reopening.
 *
 * @param {Object}   props             Component props.
 * @param {boolean}  props.isOpen      Whether the modal is shown.
 * @param {Function} props.onClose     Close handler.
 * @param {string}   props.contextNoun Editor context noun (page, template…).
 */
export default function AutoAnimateModal( { isOpen, onClose, contextNoun } ) {
	const [ stylePreset, setStylePreset ] = useState( 'smooth' );
	if ( ! isOpen ) {
		return null;
	}
	return (
		<AutoAnimateModalContent
			onClose={ onClose }
			contextNoun={ contextNoun }
			stylePreset={ stylePreset }
			setStylePreset={ setStylePreset }
		/>
	);
}

function AutoAnimateModalContent( {
	onClose,
	contextNoun,
	stylePreset,
	setStylePreset,
} ) {
	// `getBlocks()` returns top-level only, memoized by the store.
	// Descendants are counted via a callback passed into the pure
	// planner so the planner stays store-free. The callback is built
	// in the useMemo below rather than returned from useSelect, so the
	// selector result stays stable between store changes (GH #27).
	const topLevelBlocks = useSelect(
		( select ) => select( blockEditorStore ).getBlocks(),
		[]
	);
	const registry = useRegistry();

	// Recompute the plan whenever the block tree changes (or the modal
	// reopens). Style preset doesn't affect the plan, only the dispatched
	// attributes — so no need to rerun on preset change.
	const plan = useMemo( () => {
		const sel = registry.select( blockEditorStore );
		return computeAutoAnimatePlan( topLevelBlocks, ( id ) =>
			countDescendantsIn( sel, id )
		);
	}, [ topLevelBlocks, registry ] );

	const { updateBlockAttributes } = useDispatch( blockEditorStore );
	const { createSuccessNotice } = useDispatch( noticesStore );

	const applyCount = plan.apply.length;
	const skippedTotal =
		plan.skipBody.length +
		plan.skipChrome.length +
		( plan.skipBroken?.length || 0 ) +
		plan.skipExisting.length +
		plan.descendantCount;

	const applySummary = useMemo(
		() => summarizeByBlockType( plan.apply, getBlockTypeTitle ),
		[ plan.apply ]
	);

	const handleApply = () => {
		if ( applyCount === 0 ) {
			onClose();
			return;
		}

		// Per-block dispatch so each animated block gets its own
		// attribute payload. Two reasons it has to be per-block:
		//   1. Direction-from-align (MEDIA): `attrsForCategory` reads
		//      `block.attributes.align` so a left-aligned image slides
		//      from the left and a right-aligned one from the right.
		//   2. STAGGER_ROW gets the stagger toggle enabled + the
		//      preset's step value — the plugin's existing stagger
		//      CSS cascade handles the per-column delay, so no
		//      manual delay math here anymore.
		plan.apply.forEach( ( item ) => {
			const baseAttrs = attrsForCategory(
				item.category,
				stylePreset,
				item.block
			);
			if ( ! baseAttrs ) {
				return;
			}
			updateBlockAttributes( item.clientId, baseAttrs );
		} );

		createSuccessNotice(
			sprintf(
				/* translators: %d: number of animated blocks */
				_n(
					'Animated %d block.',
					'Animated %d blocks.',
					applyCount,
					'motion-blocks'
				),
				applyCount
			),
			{ type: 'snackbar' }
		);
		onClose();
	};

	return (
		<Modal
			title={ sprintf(
				/* translators: %s: editor context noun — page, pattern, template, etc. */
				__( 'Auto-animate this %s', 'motion-blocks' ),
				contextNoun
			) }
			onRequestClose={ onClose }
			className="mb-auto-animate-modal"
			// 512px isn't one of WP's standard `size` values
			// (small/medium/large/fill = 384/480/840/100vw). The
			// inline style overrides whatever the default size class
			// applies. Same width applied to every dialog in the
			// plugin for visual consistency.
			style={ { maxWidth: '512px' } }
		>
			<VStack spacing={ 5 }>
				<ToggleGroupControl
					label={ __( 'Style', 'motion-blocks' ) }
					value={ stylePreset }
					onChange={ ( v ) => setStylePreset( v ) }
					isBlock
					__nextHasNoMarginBottom
					__next40pxDefaultSize
				>
					{ Object.entries( STYLE_PRESETS ).map(
						( [ key, preset ] ) => (
							<ToggleGroupControlOption
								key={ key }
								value={ key }
								label={ preset.label }
							/>
						)
					) }
				</ToggleGroupControl>

				{ applyCount > 0 ? (
					<div className="mb-auto-animate-modal__section">
						<p className="mb-auto-animate-modal__heading">
							{ sprintf(
								/* translators: %d: number of animated blocks */
								_n(
									'Will animate %d block:',
									'Will animate %d blocks:',
									applyCount,
									'motion-blocks'
								),
								applyCount
							) }
						</p>
						<ul className="mb-auto-animate-modal__list">
							{ applySummary.map( ( row ) => (
								<li key={ row.name }>
									{ row.count > 1
										? `${ row.count } × ${ row.name }`
										: row.name }
								</li>
							) ) }
						</ul>
					</div>
				) : (
					<p className="mb-auto-animate-modal__empty">
						{ sprintf(
							/* translators: %s: editor context noun — page, pattern, template, etc. */
							__(
								'Nothing to animate on this %s — every block is either body content, site chrome, or already animated.',
								'motion-blocks'
							),
							contextNoun
						) }
					</p>
				) }

				{ skippedTotal > 0 && (
					<div className="mb-auto-animate-modal__section">
						<p className="mb-auto-animate-modal__heading">
							{ sprintf(
								/* translators: %d: number of skipped blocks */
								_n(
									'Skipping %d block:',
									'Skipping %d blocks:',
									skippedTotal,
									'motion-blocks'
								),
								skippedTotal
							) }
						</p>
						<ul className="mb-auto-animate-modal__list">
							{ plan.skipBody.length > 0 && (
								<li>
									{ sprintf(
										/* translators: %d: count */
										_n(
											'%d body block (paragraph, list, etc.)',
											'%d body blocks (paragraphs, lists, etc.)',
											plan.skipBody.length,
											'motion-blocks'
										),
										plan.skipBody.length
									) }
								</li>
							) }
							{ plan.descendantCount > 0 && (
								<li>
									{ sprintf(
										/* translators: %d: count */
										_n(
											'%d nested block (handled by its container)',
											'%d nested blocks (handled by their containers)',
											plan.descendantCount,
											'motion-blocks'
										),
										plan.descendantCount
									) }
								</li>
							) }
							{ plan.skipExisting.length > 0 && (
								<li>
									{ sprintf(
										/* translators: %d: count */
										_n(
											'%d already animated',
											'%d already animated',
											plan.skipExisting.length,
											'motion-blocks'
										),
										plan.skipExisting.length
									) }
								</li>
							) }
							{ plan.skipChrome.length > 0 && (
								<li>
									{ sprintf(
										/* translators: %d: count */
										_n(
											'%d site-chrome block (spacer, separator, etc.)',
											'%d site-chrome blocks (spacers, separators, etc.)',
											plan.skipChrome.length,
											'motion-blocks'
										),
										plan.skipChrome.length
									) }
								</li>
							) }
							{ ( plan.skipBroken?.length || 0 ) > 0 && (
								<li>
									{ sprintf(
										/* translators: %d: count */
										_n(
											'%d unsupported block (plugin missing)',
											'%d unsupported blocks (plugin missing)',
											plan.skipBroken.length,
											'motion-blocks'
										),
										plan.skipBroken.length
									) }
								</li>
							) }
						</ul>
					</div>
				) }

				<p className="mb-auto-animate-modal__hint">
					{ __(
						'Use “Remove all animations” to revert. Cmd / Ctrl + Z also undoes the change.',
						'motion-blocks'
					) }
				</p>

				<HStack justify="flex-end" spacing={ 3 }>
					<Button
						variant="tertiary"
						onClick={ onClose }
						__next40pxDefaultSize
					>
						{ __( 'Cancel', 'motion-blocks' ) }
					</Button>
					<Button
						variant="primary"
						onClick={ handleApply }
						disabled={ applyCount === 0 }
						__next40pxDefaultSize
					>
						{ applyCount === 0
							? __( 'Nothing to animate', 'motion-blocks' )
							: sprintf(
									/* translators: %d: number of blocks to animate */
									_n(
										'Animate %d block',
										'Animate %d blocks',
										applyCount,
										'motion-blocks'
									),
									applyCount
							  ) }
					</Button>
				</HStack>
			</VStack>
		</Modal>
	);
}
