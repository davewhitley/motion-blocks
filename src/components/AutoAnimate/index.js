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
import { useSelect, useDispatch } from '@wordpress/data';
import { store as blockEditorStore } from '@wordpress/block-editor';
import { store as blocksStore } from '@wordpress/blocks';
import { store as noticesStore } from '@wordpress/notices';
import { useState, useMemo } from '@wordpress/element';
import { __, sprintf, _n } from '@wordpress/i18n';

import {
	STYLE_PRESETS,
	attrsForCategory,
	computeAutoAnimatePlan,
	groupApplyByCategory,
	summarizeByBlockType,
} from './plan';

export default function AutoAnimateModal( { isOpen, onClose } ) {
	const [ stylePreset, setStylePreset ] = useState( 'smooth' );

	// Pull what we need from the store. `getBlocks()` returns top-level
	// only; descendants are queried via `getClientIdsWithDescendants`
	// passed as a callback into the pure planner so the planner stays
	// store-free.
	const { topLevelBlocks, countDescendants, getBlockTypeTitle } = useSelect(
		( select ) => {
			const sel = select( blockEditorStore );
			const blocksSel = select( blocksStore );
			return {
				topLevelBlocks: sel.getBlocks(),
				// For a given parent clientId, count how many blocks
				// are nested below it (not including itself).
				countDescendants: ( clientId ) => {
					const tree = sel.getClientIdsOfDescendants
						? sel.getClientIdsOfDescendants( [ clientId ] )
						: sel
								.getClientIdsWithDescendants()
								.filter( ( id ) => {
									if ( id === clientId ) {
										return false;
									}
									let parent =
										sel.getBlockRootClientId( id );
									while ( parent ) {
										if ( parent === clientId ) {
											return true;
										}
										parent =
											sel.getBlockRootClientId(
												parent
											);
									}
									return false;
								} );
					return Array.isArray( tree ) ? tree.length : 0;
				},
				getBlockTypeTitle: ( name ) =>
					blocksSel.getBlockType( name )?.title,
			};
		},
		[]
	);

	// Recompute the plan whenever the block tree changes (or the modal
	// reopens). Style preset doesn't affect the plan, only the dispatched
	// attributes — so no need to rerun on preset change.
	const plan = useMemo(
		() => computeAutoAnimatePlan( topLevelBlocks, countDescendants ),
		[ topLevelBlocks, countDescendants ]
	);

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
		[ plan.apply, getBlockTypeTitle ]
	);

	const handleApply = () => {
		if ( applyCount === 0 ) {
			onClose();
			return;
		}

		const grouped = groupApplyByCategory( plan.apply );

		// One dispatch per category. HERO needs special handling for
		// the 0.15s stagger on the second hero so they don't fire
		// simultaneously: send the first immediately, then a second
		// dispatch with the staggered delay attribute.
		for ( const [ category, items ] of grouped ) {
			const baseAttrs = attrsForCategory( category, stylePreset );
			if ( ! baseAttrs ) {
				continue;
			}
			if ( category === 'HERO' && items.length > 1 ) {
				// First hero: zero delay (already in baseAttrs).
				updateBlockAttributes( items[ 0 ].clientId, baseAttrs );
				// Second hero: delayed.
				updateBlockAttributes( items[ 1 ].clientId, {
					...baseAttrs,
					animationDelay: 0.15,
				} );
				// Any further hero blocks (rare — we cap at 2 in the
				// planner) get the same delayed bag for predictability.
				for ( let i = 2; i < items.length; i++ ) {
					updateBlockAttributes( items[ i ].clientId, {
						...baseAttrs,
						animationDelay: 0.15,
					} );
				}
			} else {
				const ids = items.map( ( item ) => item.clientId );
				updateBlockAttributes( ids, baseAttrs );
			}
		}

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

	if ( ! isOpen ) {
		return null;
	}

	return (
		<Modal
			title={ __( 'Auto-animate this page', 'motion-blocks' ) }
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
						{ __(
							'Nothing to animate on this page — every block is either body content, site chrome, or already animated.',
							'motion-blocks'
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
