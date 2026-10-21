/**
 * AnimationPanel — Main animation controls panel.
 *
 * Shows mode-selection buttons when no animation is set,
 * or the matching sub-panel when a mode is active.
 */

import { PanelBody, Icon, Notice } from '@wordpress/components';
import { useRef, useCallback, useState, useEffect } from '@wordpress/element';
import { useSelect, useDispatch } from '@wordpress/data';
import { store as blockEditorStore } from '@wordpress/block-editor';
import { store as blocksStore } from '@wordpress/blocks';
import { __, sprintf } from '@wordpress/i18n';
import { desktop, seen } from '@wordpress/icons';
import { scrollInteractiveIcon } from './icons';

import PageLoadControls from './PageLoadControls';
import ScrollAppearControls from './ScrollAppearControls';
import ScrollInteractiveControls from './ScrollInteractiveControls';
import AnimationOptionsMenu from './AnimationOptionsMenu';
import { selectAnimatedAncestor } from './selectStable';
import { stripUiState } from './savedAnimations';
import {
	DEFAULT_ATTRIBUTES,
	PROPERTY_DEFINITIONS,
	FROM_ATTR,
	TO_ATTR,
	adaptAnimationToBlock,
	normalizeCustomFromToAttrs,
	migrateScrollAppearAttrs,
	resetAnimationAttributes,
} from './constants';

/**
 * Reset all custom From/To attributes to their identity defaults.
 * Used by selectMode / removeAnimation so the custom
 * editor starts fresh whenever the animation is reconfigured.
 */
function customFromToDefaults() {
	const out = {};
	for ( const def of PROPERTY_DEFINITIONS ) {
		out[ FROM_ATTR[ def.id ] ] = DEFAULT_ATTRIBUTES[ FROM_ATTR[ def.id ] ];
		out[ TO_ATTR[ def.id ] ] = DEFAULT_ATTRIBUTES[ TO_ATTR[ def.id ] ];
	}
	return out;
}

export default function AnimationPanel( {
	attributes,
	setAttributes,
	blockName,
	clientId,
	multiSelectCount = 0,
} ) {
	// Detect whether any ancestor of this block has an animation set.
	// If so, the user is editing an inner block of an animated parent
	// block — the empty mode-selector below would be confusing without
	// a hint pointing them at the ancestor that owns the animation.
	// Always a fixed-shape object of primitives (`clientId: null` when
	// there is none) so `useSelect`'s shallow compare passes and the
	// panel doesn't re-render on every store change (GH #27).
	const animatedAncestor = useSelect(
		( select ) =>
			selectAnimatedAncestor(
				select( blockEditorStore ),
				select( blocksStore ),
				clientId
			),
		[ clientId ]
	);
	const { selectBlock } = useDispatch( blockEditorStore );

	// Play / Stop only flip preview state. `setAttributes` here is the
	// router in withAnimationControls (src/index.js): it sends the
	// preview keys to the motion-blocks/editor-preview store, so they
	// add no undo step and never reach the block (GH #29).
	const {
		animationMode,
		animationType,
		animationRepeat,
		animationPreviewPlaying,
		animationDuration,
		animationDelay,
		animationFromToPreviewSide,
	} = attributes;
	const savedType = useRef( '' );

	// Looping is a Page Load concept (`animationRepeat` Loop /
	// Alternate). Scroll Appear and Scroll Interactive never use it.
	const isLoopingMode =
		animationMode === 'page-load' &&
		( animationRepeat === 'loop' || animationRepeat === 'alternate' );

	// Pending state for one-shot previews. The button uses this to
	// disable itself while the animation is in flight — without it,
	// re-clicking mid-playback restarts the keyframe (visible jump)
	// AND the original setTimeout still fires partway into the
	// second run, killing the preview prematurely.
	//
	// Looping previews don't use this — the button is a play/stop
	// toggle in that mode, not a one-shot trigger.
	const [ isPlayPending, setIsPlayPending ] = useState( false );
	const playTimeoutRef = useRef( null );
	const playFrameRef = useRef( null );
	// The pending timer's stop call, bound at click time to the
	// router of that render, so it stops exactly the blocks that
	// started playing (all of a multi-selection).
	const playStopRef = useRef( null );

	const clearPlayTimers = useCallback( () => {
		if ( playTimeoutRef.current !== null ) {
			clearTimeout( playTimeoutRef.current );
			playTimeoutRef.current = null;
		}
		if ( playFrameRef.current !== null ) {
			cancelAnimationFrame( playFrameRef.current );
			playFrameRef.current = null;
		}
		playStopRef.current = null;
	}, [] );

	// Cancel any pending preview when the component unmounts or the
	// selected block changes. Otherwise a stale setTimeout could fire
	// against a different block's setAttributes. A one-shot Play cut
	// short this way is stopped now instead of left running.
	useEffect( () => {
		return () => {
			const stop = playStopRef.current;
			clearPlayTimers();
			if ( stop ) {
				stop();
			}
		};
	}, [ clearPlayTimers, clientId ] );

	/**
	 * Replay the current animation preview.
	 *
	 * - Looping mode: just sets the play flag; the looping animation
	 *   keeps cycling until stopped.
	 * - Custom mode: also uses the play flag, but auto-clears it
	 *   after duration+delay so the animation runs once. (Custom is
	 *   static-by-default in the editor; the flag is the only thing
	 *   that lets the keyframe attach.)
	 * - Preset modes (Fade/Slide/etc.): briefly clears `animationType`
	 *   so the HOC re-attaches the className, restarting the CSS
	 *   animation.
	 */
	const replayPreview = useCallback(
		( slotArg ) => {
			// Slot-model Scroll Appear blocks store the effect, duration
			// and delay on per-slot attribute pairs. The Preview button
			// in SlotControls passes the active slot name; for other
			// modes we fall back to the shared attrs as before.
			const slot = slotArg === 'exit' ? 'exit' : 'entry';
			const isSlotMode = animationMode === 'scroll-appear';
			const slotPrefix = slot === 'entry' ? 'Entry' : 'Exit';
			// Read the slot through the migration shim: a legacy-shaped
			// block (both slot types empty) keeps its effect on the
			// shared keys until its first slot edit (GH #25).
			const view = isSlotMode
				? migrateScrollAppearAttrs( attributes )
				: attributes;
			const current = isSlotMode
				? view[ `animation${ slotPrefix }Type` ] || ''
				: animationType;
			if ( ! current ) {
				return;
			}
			// Defensive — the button should be disabled, but bail anyway
			// if a previous play is still in flight.
			if ( isPlayPending ) {
				return;
			}
			// If the user is currently previewing a Start/End state via
			// the eye icon, that preview branch in the HOC takes
			// precedence over the animated branch (it returns early). Play
			// would visually do nothing. Turn the eye preview off so Play
			// wins. The eye toggle itself is fine to leave alone for
			// future clicks — we're only nullifying the active override.
			const baseAttrs =
				animationFromToPreviewSide &&
				animationFromToPreviewSide !== 'off'
					? { animationFromToPreviewSide: 'off' }
					: {};
			// Tell the HOC which slot is being previewed so it can
			// apply the right class set (mb-triggered for entry,
			// mb-exit-triggered for exit) and source from the right
			// slot's per-slot attrs.
			if ( isSlotMode ) {
				baseAttrs.animationPreviewSlot = slot;
			}
			if ( isLoopingMode ) {
				setAttributes( {
					...baseAttrs,
					animationPreviewPlaying: true,
				} );
				return;
			}

			// Compute the total runtime for the disable-button window.
			// Used by both custom and preset paths so we cover the entire
			// animation duration regardless of preview mechanism.
			const sharedDuration = parseFloat( animationDuration ) || 0.6;
			const sharedDelay = parseFloat( animationDelay ) || 0;
			const duration = isSlotMode
				? parseFloat( view[ `animation${ slotPrefix }Duration` ] ) ||
				  0.6
				: sharedDuration;
			const delay = isSlotMode
				? parseFloat( view[ `animation${ slotPrefix }Delay` ] ) || 0
				: sharedDelay;
			const totalMs = ( duration + delay ) * 1000;

			setIsPlayPending( true );
			clearPlayTimers();

			// Single-path preview: toggle `animationPreviewPlaying` on,
			// let the HOC's DOM-side restart effect (in
			// `withAnimationPreview` in src/index.js) handle the CSS
			// animation restart, then toggle off after the animation
			// completes.
			//
			// Previously this branch used a "clear `animationType`, rAF,
			// restore `animationType`" dance to force the HOC to drop
			// and re-add the trigger class. React 18 batching across
			// the rAF — plus the iframe boundary slowing dispatch /
			// commit — frequently collapsed both setAttributes calls
			// into a single render, so the intermediate "no class"
			// state never reached the DOM and the animation didn't
			// restart. Direct DOM manipulation inside the HOC is
			// reliable regardless of React commit timing.
			setAttributes( {
				...baseAttrs,
				animationPreviewPlaying: true,
			} );
			const stop = () =>
				setAttributes( { animationPreviewPlaying: false } );
			playStopRef.current = stop;
			playTimeoutRef.current = setTimeout( () => {
				stop();
				setIsPlayPending( false );
				playTimeoutRef.current = null;
				playStopRef.current = null;
			}, totalMs + 100 );
		},
		[
			attributes,
			animationMode,
			animationType,
			animationFromToPreviewSide,
			setAttributes,
			isLoopingMode,
			isPlayPending,
			animationDuration,
			animationDelay,
			clearPlayTimers,
		]
	);

	/**
	 * Stop a looping preview.
	 */
	const stopPreview = useCallback( () => {
		setAttributes( { animationPreviewPlaying: false } );
	}, [ setAttributes ] );

	/**
	 * Set animation mode and initialize defaults.
	 *
	 * For Scroll Appear, also seed the Entry slot's type so the slot
	 * dropdown opens pre-populated instead of empty. Without this,
	 * the user picks "Appear on scroll" from the mode card and then
	 * lands on a panel whose Effect dropdown reads "None" — the
	 * shared `animationType` is set but the slot model doesn't read
	 * that key, only `animationEntryType` / `animationExitType`. The
	 * `migrateScrollAppearAttrs` shim only kicks in for legacy blocks
	 * carrying `animationScrollTrigger`, not freshly-created ones.
	 */
	const selectMode = ( mode ) => {
		const next = {
			animationMode: mode,
			animationType: DEFAULT_ATTRIBUTES.animationType,
			animationDirection: DEFAULT_ATTRIBUTES.animationDirection,
			animationDuration: DEFAULT_ATTRIBUTES.animationDuration,
			animationDelay: DEFAULT_ATTRIBUTES.animationDelay,
			animationScrollTrigger: DEFAULT_ATTRIBUTES.animationScrollTrigger,
			animationAcceleration: DEFAULT_ATTRIBUTES.animationAcceleration,
			animationBlurAmount: DEFAULT_ATTRIBUTES.animationBlurAmount,
			...customFromToDefaults(),
		};
		if ( mode === 'scroll-appear' ) {
			next.animationEntryType = DEFAULT_ATTRIBUTES.animationType;
			next.animationEntryDirection = '';
			next.animationEntryDuration = DEFAULT_ATTRIBUTES.animationDuration;
			next.animationEntryDelay = DEFAULT_ATTRIBUTES.animationDelay;
			// Reset Replay to the default ('once') in case the block still
			// carries an earlier choice. It equals
			// the schema default, so WordPress omits it on save and the
			// render filter resolves the omitted key to 'once' as well.
			next.animationEntryReplay = DEFAULT_ATTRIBUTES.animationEntryReplay;
			next.animationExitType = '';
		}
		setAttributes( next );
	};

	/**
	 * Paste animation — apply copied attributes to the current block.
	 *
	 * Routes through `normalizeCustomFromToAttrs` so pasted blobs that
	 * predate the unit-bearing storage convention (e.g. an old saved
	 * recipe or a copy from a stale clipboard) are upgraded on apply.
	 * Preview keys are stripped first (GH #29): the router would send
	 * them to the preview store anyway, but pasted data should only
	 * ever carry the animation. Image-only settings copied from a Cover
	 * fall back to block-level ones on other block types (GH #30).
	 */
	const pasteAnimation = useCallback(
		( data ) => {
			setAttributes(
				adaptAnimationToBlock(
					normalizeCustomFromToAttrs( stripUiState( data ) ),
					blockName
				)
			);
		},
		[ setAttributes, blockName ]
	);

	/**
	 * Reset settings — revert properties to defaults, keep the current mode.
	 *
	 * Resets every animation attribute, the Scroll Appear Entry / Exit
	 * slots included (GH #56).
	 */
	const resetSettings = useCallback( () => {
		setAttributes( {
			...resetAnimationAttributes( animationMode ),
			animationPreviewPlaying: false,
		} );
	}, [ setAttributes, animationMode ] );

	/**
	 * Remove animation — clear the mode and the shared settings.
	 *
	 * Also resets "Animate image only" (GH #56): left at 'img', it came
	 * back the next time a mode was picked, and a block that isn't a
	 * Cover (no toggle to turn it off) stayed unable to animate.
	 */
	const removeAnimation = () => {
		setAttributes( {
			animationMode: '',
			animationType: '',
			animationDirection: '',
			animationFromToTarget: DEFAULT_ATTRIBUTES.animationFromToTarget,
			animationDuration: DEFAULT_ATTRIBUTES.animationDuration,
			animationDelay: DEFAULT_ATTRIBUTES.animationDelay,
			animationAcceleration: DEFAULT_ATTRIBUTES.animationAcceleration,
			animationBlurAmount: DEFAULT_ATTRIBUTES.animationBlurAmount,
			animationRepeat: DEFAULT_ATTRIBUTES.animationRepeat,
			animationPauseOffscreen: DEFAULT_ATTRIBUTES.animationPauseOffscreen,
			animationPlayOnce: DEFAULT_ATTRIBUTES.animationPlayOnce,
			animationScrollTrigger: DEFAULT_ATTRIBUTES.animationScrollTrigger,
			animationRangeStart: DEFAULT_ATTRIBUTES.animationRangeStart,
			animationRangeEnd: DEFAULT_ATTRIBUTES.animationRangeEnd,
			animationPreviewPlaying: false,
			...customFromToDefaults(),
		} );
	};

	const panelTitle = animationMode ? (
		<span className="mb-panel-title">
			{ __( 'Motion Effects', 'motion-blocks' ) }
			<span
				className="mb-panel-title__dot"
				aria-label={ __(
					'Motion effect configured on this block',
					'motion-blocks'
				) }
			/>
		</span>
	) : (
		__( 'Motion Effects', 'motion-blocks' )
	);

	return (
		<PanelBody
			title={ panelTitle }
			initialOpen={ !! animationMode }
		>
			{ multiSelectCount > 1 && (
				<div className="mb-panel-notice">
					<Notice status="info" isDismissible={ false }>
						{ sprintf(
							/* translators: %d: number of blocks currently selected */
							__(
								'Changes apply to all %d selected blocks.',
								'motion-blocks'
							),
							multiSelectCount
						) }
					</Notice>
				</div>
			) }

			{ ! animationMode && animatedAncestor.clientId && (
				<div className="mb-panel-notice">
					<Notice
						status="warning"
						isDismissible={ false }
						actions={ [
							{
								label: __(
									'Select parent block',
									'motion-blocks'
								),
								onClick: () =>
									selectBlock( animatedAncestor.clientId ),
								variant: 'link',
							},
						] }
					>
						{ sprintf(
							/* translators: %s: ancestor block-type label, e.g. "Columns" */
							__(
								'A parent block (%s) already has an animation. The animation includes this inner block.',
								'motion-blocks'
							),
							animatedAncestor.title
						) }
					</Notice>
				</div>
			) }

			{ ! animationMode && (
				<div className="mb-mode-selector">
					<div className="mb-mode-selector__header">
						<span className="mb-mode-selector__label">
							{ __( 'Animation type', 'motion-blocks' ) }
						</span>
						<AnimationOptionsMenu
							attributes={ attributes }
							blockName={ blockName }
							clientId={ clientId }
							onPaste={ pasteAnimation }
							pasteOnly
						/>
					</div>
					<div className="mb-mode-selector__cards">
						<button
							type="button"
							className="mb-mode-card"
							onClick={ () => selectMode( 'page-load' ) }
						>
							<div className="mb-mode-card__header">
								<Icon icon={ desktop } size={ 24 } />
								<span className="mb-mode-card__title">
									{ __(
										'On page load',
										'motion-blocks'
									) }
								</span>
							</div>
							<p className="mb-mode-card__description">
								{ __(
									'Plays once (or loops continuously) when the page first loads.',
									'motion-blocks'
								) }
							</p>
						</button>
						<button
							type="button"
							className="mb-mode-card"
							onClick={ () => selectMode( 'scroll-appear' ) }
						>
							<div className="mb-mode-card__header">
								<Icon icon={ seen } size={ 24 } />
								<span className="mb-mode-card__title">
									{ __(
										'Appear on scroll',
										'motion-blocks'
									) }
								</span>
							</div>
							<p className="mb-mode-card__description">
								{ __(
									'Trigger animations when the element enters or exits the screen.',
									'motion-blocks'
								) }
							</p>
						</button>
						<button
							type="button"
							className="mb-mode-card"
							onClick={ () =>
								selectMode( 'scroll-interactive' )
							}
						>
							<div className="mb-mode-card__header">
								<Icon icon={ scrollInteractiveIcon } size={ 24 } />
								<span className="mb-mode-card__title">
									{ __(
										'Interactive scroll',
										'motion-blocks'
									) }
								</span>
							</div>
							<p className="mb-mode-card__description">
								{ __(
									'Ties animation progress directly to scroll position.',
									'motion-blocks'
								) }
							</p>
						</button>
					</div>
				</div>
			) }

			{ animationMode === 'page-load' && (
				<PageLoadControls
					attributes={ attributes }
					setAttributes={ setAttributes }
					blockName={ blockName }
					clientId={ clientId }
					onRemove={ removeAnimation }
					onPreview={ replayPreview }
					onStopPreview={ stopPreview }
					isLoopRunning={
						isLoopingMode && animationPreviewPlaying
					}
					isPlayPending={ isPlayPending }
					onPaste={ pasteAnimation }
					onReset={ resetSettings }
				/>
			) }

			{ animationMode === 'scroll-appear' && (
				<ScrollAppearControls
					attributes={ attributes }
					setAttributes={ setAttributes }
					blockName={ blockName }
					clientId={ clientId }
					onRemove={ removeAnimation }
					onPreview={ replayPreview }
					isPlayPending={ isPlayPending }
					onPaste={ pasteAnimation }
					onReset={ resetSettings }
				/>
			) }

			{ animationMode === 'scroll-interactive' && (
				<ScrollInteractiveControls
					attributes={ attributes }
					setAttributes={ setAttributes }
					blockName={ blockName }
					clientId={ clientId }
					onRemove={ removeAnimation }
					onPaste={ pasteAnimation }
					onReset={ resetSettings }
				/>
			) }
		</PanelBody>
	);
}
