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
	CheckboxControl,
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
	templatePartsWithContents,
	withTemplatePartContents,
} from './plan';
import { EMPTY_IDS } from '../selectStable';

/** Style names for the picker; plan.js keeps no UI strings. */
const STYLE_LABELS = {
	subtle: __( 'Subtle', 'motion-blocks' ),
	balanced: __( 'Balanced', 'motion-blocks' ),
	bold: __( 'Bold', 'motion-blocks' ),
};

/** One line on what each style does, shown under the picker. */
const STYLE_DESCRIPTIONS = {
	subtle: __(
		'Short, gentle moves. Each section rises as one piece.',
		'motion-blocks'
	),
	balanced: __(
		'Medium moves. Items in a section rise one after another.',
		'motion-blocks'
	),
	bold: __(
		'Long, large moves. Items rise one after another, more slowly.',
		'motion-blocks'
	),
};

/**
 * Estimate which blocks start on the visitor's first screen, measured
 * in the editor canvas. The planner picks the hero by structure (see
 * findHero), and uses this two ways:
 *
 *  - With a hero found, it only vetoes: a hero block that starts below the
 *    first screen is taken out of the opening sequence. That cutoff is
 *    generous (one screen, capped at 900px) because bottom-aligned hero
 *    text is common.
 *  - With no hero found, it is the fallback for what opens the page, asked
 *    with `strict`: only the first 60% of a screen counts. Erring short is
 *    harmless (a block just waits for the scroll, which fires at once for
 *    a block in view); erring long would play a block's opening while it
 *    is still below the fold.
 *
 * The canvas isn't the front end: it has no site header, and themes put
 * a header and often a page title above the content. So positions are
 * measured from the top of the content. Returns null for a block it
 * can't find.
 *
 * @return {Function} `(clientId) → boolean|null`.
 */
function measureFirstScreen() {
	const iframe = document.querySelector( 'iframe[name="editor-canvas"]' );
	const doc = iframe?.contentDocument || document;
	const win = iframe?.contentWindow || window;
	const fold = Math.min( win.innerHeight || 0, 900 );
	const first = doc.querySelector( '.is-root-container > [data-block]' );
	if ( ! fold || ! first ) {
		return () => null;
	}
	const contentTop = first.getBoundingClientRect().top;
	return ( clientId, strict = false ) => {
		const el = doc.querySelector( `[data-block="${ clientId }"]` );
		if ( ! el ) {
			return null;
		}
		return (
			el.getBoundingClientRect().top - contentTop <
			( strict ? fold * 0.6 : fold )
		);
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
		const el =
			screen && doc.querySelector( `[data-block="${ clientId }"]` );
		return el ? el.getBoundingClientRect().height / screen : null;
	};
}

/**
 * Keeps the modal's hooks unmounted while it is closed: the component
 * is always mounted from the Document panel, and running the plan
 * against the whole block tree on every store change while nobody can
 * see it was wasted work (GH #27). The style preset lives here so the
 * choice still survives closing and reopening, as does "Include header
 * and footer".
 *
 * @param {Object}   props                    Component props.
 * @param {boolean}  props.isOpen             Whether the modal is shown.
 * @param {Function} props.onClose            Close handler.
 * @param {Object}   props.contextStrings     Sentences for the post type being edited.
 * @param {?string}  props.rootClientId       Where the page's blocks are: `''`
 *                                            for the whole tree, the Post
 *                                            Content block when the template
 *                                            is shown, or null (see
 *                                            selectPageContentRoot).
 * @param {boolean}  props.allowTemplateParts Offer to animate inside the
 *                                            template's parts (header, footer,
 *                                            any other), in the Site Editor's
 *                                            template view.
 */
export default function AutoAnimateModal( {
	isOpen,
	onClose,
	contextStrings,
	rootClientId = '',
	allowTemplateParts = false,
} ) {
	const [ stylePreset, setStylePreset ] = useState( 'balanced' );
	// On by default: a template's parts are part of the page being
	// animated. Unticking animates each part whole, and the footer not at
	// all.
	const [ includeParts, setIncludeParts ] = useState( true );
	if ( ! isOpen ) {
		return null;
	}
	return (
		<AutoAnimateModalContent
			onClose={ onClose }
			contextStrings={ contextStrings }
			rootClientId={ rootClientId }
			stylePreset={ stylePreset }
			setStylePreset={ setStylePreset }
			allowTemplateParts={ allowTemplateParts }
			includeParts={ includeParts }
			setIncludeParts={ setIncludeParts }
		/>
	);
}

function AutoAnimateModalContent( {
	onClose,
	contextStrings,
	rootClientId,
	stylePreset,
	setStylePreset,
	allowTemplateParts,
	includeParts,
	setIncludeParts,
} ) {
	// `getBlocks()` returns top-level only, memoized by the store. With
	// the template shown, the top level is the Post Content block's.
	// Descendants are counted via a callback passed into the pure
	// planner so the planner stays store-free. The callback is built
	// in the useMemo below rather than returned from useSelect, so the
	// selector result stays stable between store changes (GH #27).
	const topLevelBlocks = useSelect(
		( select ) =>
			rootClientId === null
				? EMPTY_IDS
				: select( blockEditorStore ).getBlocks(
						rootClientId || undefined
				  ),
		[ rootClientId ]
	);
	const registry = useRegistry();

	// A template's parts (header, footer…) show up in `getBlocks()` as empty
	// blocks: their contents belong to each part's own document. They are
	// read once per opening of the modal, which blocks editing while open.
	const filledBlocks = useMemo( () => {
		if ( ! allowTemplateParts ) {
			return topLevelBlocks;
		}
		const sel = registry.select( blockEditorStore );
		return withTemplatePartContents( topLevelBlocks, ( id ) =>
			sel.getBlocks( id )
		);
	}, [ topLevelBlocks, registry, allowTemplateParts ] );
	const hasParts = useMemo(
		() => templatePartsWithContents( filledBlocks ).length > 0,
		[ filledBlocks ]
	);
	const usesParts = hasParts && includeParts;
	// Parts with an animation somewhere inside. With parts left out of
	// the run, the planner would otherwise animate such a header whole,
	// on top of what is already inside it (GH #140).
	const animatedPartIds = useMemo( () => {
		const ids = new Set();
		const isAnimated = ( blocks ) =>
			( blocks || [] ).some(
				( block ) =>
					!! block.attributes?.animationMode ||
					isAnimated( block.innerBlocks )
			);
		templatePartsWithContents( filledBlocks ).forEach( ( part ) => {
			if ( isAnimated( part.innerBlocks ) ) {
				ids.add( part.clientId );
			}
		} );
		return ids;
	}, [ filledBlocks ] );

	// Recompute the plan whenever the block tree changes (or the modal
	// reopens). Style preset doesn't affect the plan, only the dispatched
	// attributes — so no need to rerun on preset change.
	const plan = useMemo( () => {
		return computeAutoAnimatePlan(
			usesParts ? filledBlocks : topLevelBlocks,
			{
				isOnFirstScreen: measureFirstScreen(),
				screensTall: measureScreensTall(),
				includeParts: usesParts,
				// Template parts that hold an animation, read from the
				// filled tree even when parts are left out of the run.
				partHasAnimation: ( id ) => animatedPartIds.has( id ),
			}
		);
	}, [ topLevelBlocks, filledBlocks, usesParts, animatedPartIds ] );

	const { updateBlockAttributes } = useDispatch( blockEditorStore );
	const { createSuccessNotice } = useDispatch( noticesStore );

	const applyCount = plan.apply.length;
	// Blocks that stay still aren't listed. The one exception is invalid
	// blocks: their saved HTML no longer matches, so any change to them is
	// lost on save, and they need recovering before they can be animated.
	const invalidCount = plan.skipInvalid?.length || 0;
	// Nothing left to animate because it is all animated already: the
	// usual case when the dialog is opened a second time (GH #138).
	const alreadyAnimated =
		applyCount === 0 && ( plan.skipExisting?.length || 0 ) > 0;

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
			title={ contextStrings.autoAnimateTitle }
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
					help={ STYLE_DESCRIPTIONS[ stylePreset ] }
					isBlock
					__nextHasNoMarginBottom
					__next40pxDefaultSize
				>
					{ Object.entries( STYLE_PRESETS ).map(
						( [ key, preset ] ) => (
							<ToggleGroupControlOption
								key={ key }
								value={ key }
								label={ STYLE_LABELS[ key ] || preset.label }
							/>
						)
					) }
				</ToggleGroupControl>

				{ hasParts && (
					<CheckboxControl
						label={ __(
							'Include header, footer, and other template parts',
							'motion-blocks'
						) }
						help={ __(
							'They are shared, so this changes every page that uses them.',
							'motion-blocks'
						) }
						checked={ includeParts }
						onChange={ setIncludeParts }
						__nextHasNoMarginBottom
					/>
				) }

				{ applyCount === 0 && (
					<p className="mb-auto-animate-modal__note">
						{ alreadyAnimated
							? contextStrings.alreadyAnimated
							: contextStrings.nothingToAnimate }
					</p>
				) }

				{ invalidCount > 0 && (
					<p className="mb-auto-animate-modal__note">
						{ sprintf(
							/* translators: %d: number of invalid blocks */
							_n(
								'%d invalid block won’t be animated: choose “Attempt recovery” on it, then run this again.',
								'%d invalid blocks won’t be animated: choose “Attempt recovery” on each, then run this again.',
								invalidCount,
								'motion-blocks'
							),
							invalidCount
						) }
					</p>
				) }

				<p className="mb-auto-animate-modal__hint">
					{ __(
						'You can edit each block’s animation after it’s applied. To take them all off again, use “Remove all animations”.',
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
							? alreadyAnimated
								? __( 'Already animated', 'motion-blocks' )
								: __( 'Nothing to animate', 'motion-blocks' )
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
