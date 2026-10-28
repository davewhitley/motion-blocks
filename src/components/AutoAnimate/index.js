/**
 * Auto-animate this page — modal UI + dispatcher.
 *
 * Reads the block tree, computes a tasteful animation plan via
 * `./plan.js`, shows a diff modal, and on apply dispatches one
 * `updateBlockAttributes` action carrying each block's own payload,
 * so the whole apply is one undo step.
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
import { useSelect, useDispatch, useRegistry } from '@wordpress/data';
import { store as blockEditorStore } from '@wordpress/block-editor';
import { store as noticesStore } from '@wordpress/notices';
import { useState, useMemo } from '@wordpress/element';
import { __, sprintf, _n } from '@wordpress/i18n';

import {
	STYLE_PRESETS,
	buildAutoAnimateUpdates,
	computeAutoAnimatePlan,
	summarizeChoreography,
} from './plan';
import { countDescendantsIn } from '../selectStable';

/**
 * Estimate which blocks start on the visitor's first screen, measured
 * in the editor canvas. Used to build the opening sequence.
 *
 * The canvas isn't the front end: it has no site header, and themes put
 * a header and often a page title above the content. So positions are
 * measured from the top of the content, and only the first 60% of a
 * screen (capped at 900px) counts. Erring short is harmless (a block
 * just waits for the scroll); erring long would play a block's opening
 * animation while it's still below the fold. Returns null for a block
 * it can't find; the planner then falls back to "the first top-level
 * block is the first screen".
 *
 * @return {Function} `(clientId) → boolean|null`.
 */
function measureFirstScreen() {
	const iframe = document.querySelector( 'iframe[name="editor-canvas"]' );
	const doc = iframe?.contentDocument || document;
	const win = iframe?.contentWindow || window;
	const fold = Math.min( win.innerHeight || 0, 900 ) * 0.6;
	const first = doc.querySelector( '.is-root-container > [data-block]' );
	if ( ! fold || ! first ) {
		return () => null;
	}
	const contentTop = first.getBoundingClientRect().top;
	return ( clientId ) => {
		const el = doc.querySelector( `[data-block="${ clientId }"]` );
		if ( ! el ) {
			return null;
		}
		return el.getBoundingClientRect().top - contentTop < fold;
	};
}

/**
 * How tall each block is in screens of the editor canvas, so the planner
 * can tell a row of columns from a Columns block that wraps the page.
 * Returns null for a block it can't find.
 *
 * @return {Function} `(clientId) → number|null`.
 */
function measureScreensTall() {
	const iframe = document.querySelector( 'iframe[name="editor-canvas"]' );
	const doc = iframe?.contentDocument || document;
	const win = iframe?.contentWindow || window;
	const screen = win.innerHeight || 0;
	return ( clientId ) => {
		const el = screen && doc.querySelector( `[data-block="${ clientId }"]` );
		return el ? el.getBoundingClientRect().height / screen : null;
	};
}

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
		return computeAutoAnimatePlan(
			topLevelBlocks,
			( id ) => countDescendantsIn( sel, id ),
			{
				isOnFirstScreen: measureFirstScreen(),
				screensTall: measureScreensTall(),
			}
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

	const choreography = useMemo(
		() => summarizeChoreography( plan.apply ),
		[ plan.apply ]
	);
	// What the reader will see, in order.
	const applySummary = [
		choreography.opening > 0 &&
			sprintf(
				/* translators: %d: number of blocks */
				_n(
					'%d block opens the page as soon as it loads',
					'%d blocks open the page in sequence as soon as it loads',
					choreography.opening,
					'motion-blocks'
				),
				choreography.opening
			),
		choreography.hero > 0 &&
			sprintf(
				/* translators: %d: number of Cover blocks */
				_n(
					'%d Cover background settles from a slow zoom',
					'%d Cover backgrounds settle from a slow zoom',
					choreography.hero,
					'motion-blocks'
				),
				choreography.hero
			),
		choreography.cascades > 0 &&
			sprintf(
				/* translators: %d: number of sections and rows */
				_n(
					'%d section or row cascades in, item by item',
					'%d sections and rows cascade in, item by item',
					choreography.cascades,
					'motion-blocks'
				),
				choreography.cascades
			),
		choreography.media > 0 &&
			sprintf(
				/* translators: %d: number of images and media blocks */
				_n(
					'%d image settles into place',
					'%d images settle into place',
					choreography.media,
					'motion-blocks'
				),
				choreography.media
			),
		choreography.rises > 0 &&
			sprintf(
				/* translators: %d: number of blocks */
				_n(
					'%d other block rises into place',
					'%d other blocks rise into place',
					choreography.rises,
					'motion-blocks'
				),
				choreography.rises
			),
	].filter( Boolean );

	const handleApply = () => {
		if ( applyCount === 0 ) {
			onClose();
			return;
		}

		// Each animated block gets its own payload: its role's motion,
		// its place in the opening sequence or its section, and the
		// preset's timing (see plan.js). They go out in one action via
		// `uniqueByBlock` so a single Cmd/Ctrl+Z reverts the whole
		// apply (GH #33 / #56).
		const { clientIds, attributesByClientId } = buildAutoAnimateUpdates(
			plan.apply,
			stylePreset
		);
		if ( clientIds.length ) {
			updateBlockAttributes( clientIds, attributesByClientId, true );
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

				<p className="mb-auto-animate-modal__intro">
					{ __(
						'Everything rises into place on one smooth curve, in reading order: the first screen plays as an opening sequence, and each section cascades in as it scrolls into view. Long runs of text stay still.',
						'motion-blocks'
					) }
				</p>
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
								<li key={ row }>{ row }</li>
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
