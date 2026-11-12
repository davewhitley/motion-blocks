/**
 * Floating control bar for the Auto-animate live preview (prototype).
 *
 * Rendered from the plugin's render function (outside the Document
 * panel) and portaled to <body>, so it stays visible when the sidebar
 * switches to the Block tab. Only shows while a preview is active.
 */
import {
	Button,
	__experimentalToggleGroupControl as ToggleGroupControl,
	__experimentalToggleGroupControlOption as ToggleGroupControlOption,
	__experimentalHStack as HStack,
	__experimentalVStack as VStack,
} from '@wordpress/components';
import {
	useSelect,
	useDispatch,
	useRegistry,
	select as dataSelect,
} from '@wordpress/data';
import { store as blockEditorStore } from '@wordpress/block-editor';
import { store as preferencesStore } from '@wordpress/preferences';
import { store as noticesStore } from '@wordpress/notices';
import { createPortal, useEffect } from '@wordpress/element';
import { __, sprintf, _n } from '@wordpress/i18n';

import { store as autoPreviewStore } from './autoPreviewStore';
import { STYLE_PRESETS, buildReplaceUpdates } from './plan';
import { STYLE_LABELS, STYLE_DESCRIPTIONS } from './styleStrings';
import useCanvasReveal from './useCanvasReveal';

/**
 * Write auto-animate payloads to their blocks in ONE dispatch, so the
 * whole change is a single undo step. Skips blocks deleted meanwhile.
 *
 * @param {Object<string, Object>} payloads             `{ [clientId]: attrs }`.
 * @param {Function}               updateBlockAttributes Block-editor action.
 * @return {number} Number of blocks written.
 */
export function commitAutoAnimate( payloads, updateBlockAttributes ) {
	const sel = dataSelect( blockEditorStore );
	const ids = Object.keys( payloads ).filter( ( id ) => sel.getBlock( id ) );
	if ( ids.length ) {
		const byId = {};
		ids.forEach( ( id ) => {
			byId[ id ] = payloads[ id ];
		} );
		updateBlockAttributes( ids, byId, true );
	}
	return ids.length;
}

/**
 * Storage key marking that a preview turned distraction-free mode on and
 * hasn't turned it off yet. Local storage, so closing the tab counts too.
 */
const DF_MARKER = 'motion-blocks-auto-preview-df';

/**
 * Set or clear the distraction-free marker. Storage can be unavailable
 * (private windows, blocked site data): then the reload case just isn't
 * covered.
 *
 * @param {boolean} on Whether a preview has distraction-free on.
 */
function markDistractionFree( on ) {
	try {
		if ( on ) {
			window.localStorage.setItem( DF_MARKER, '1' );
		} else {
			window.localStorage.removeItem( DF_MARKER );
		}
	} catch ( e ) {}
}

/**
 * When the editor loads after a preview was cut short (reload, closed
 * tab), turn off the distraction-free mode that preview turned on.
 *
 * @param {Object} registry Data registry.
 */
function restoreAfterReload( registry ) {
	let marked = false;
	try {
		marked = window.localStorage.getItem( DF_MARKER ) === '1';
	} catch ( e ) {}
	if ( ! marked ) {
		return;
	}
	markDistractionFree( false );
	if (
		registry.select( preferencesStore ).get( 'core', 'distractionFree' )
	) {
		registry
			.dispatch( preferencesStore )
			.set( 'core', 'distractionFree', false );
	}
}

/**
 * While the preview runs, turn the editor into a preview screen:
 * distraction-free mode (no chrome, no block outlines), plus hide the
 * toolbar it would otherwise reveal on hover, and make the canvas
 * read-only (scrolling still works). Everything is restored when the
 * preview ends; distraction-free is only switched back off if this
 * turned it on.
 *
 * Sets the preference directly instead of calling
 * `toggleDistractionFree()`, which also closes the sidebar and shows a
 * notice, neither of which would be undone afterwards.
 *
 * Turning distraction-free back off happens in the effect's cleanup,
 * which never runs if the page is reloaded or closed mid-preview, and the
 * preference is saved with the user. So a marker is kept in storage while
 * the preview has it on; finding one when the editor loads means the
 * last preview never got to clean up (see restoreAfterReload).
 *
 * @param {boolean} active Whether the preview is running.
 */
function usePreviewScreen( active ) {
	const registry = useRegistry();
	useEffect( () => {
		if ( ! active ) {
			return;
		}
		const prefs = registry.select( preferencesStore );
		const turnedOnDF = ! prefs.get( 'core', 'distractionFree' );
		if ( turnedOnDF ) {
			markDistractionFree( true );
			registry
				.dispatch( preferencesStore )
				.set( 'core', 'distractionFree', true );
		}
		registry.dispatch( blockEditorStore ).clearSelectedBlock();
		document.body.classList.add( 'mb-auto-previewing' );

		// Read-only canvas. Blocking the mouse alone isn't enough: a click
		// on the empty page still focuses it, and WordPress's "type to
		// add a block" listens for keys there. So the block list is made
		// inert (unfocusable), and typing / paste / drop are swallowed in
		// the canvas. Scroll keys still work; Escape ends the preview
		// (key events in the iframe don't reach the bar's listener).
		const canvasDoc =
			document.querySelector( 'iframe[name="editor-canvas"]' )
				?.contentDocument || null;
		let lock = null;
		let inertRoot = null;
		const SCROLL_KEYS = [
			'ArrowUp',
			'ArrowDown',
			'PageUp',
			'PageDown',
			'Home',
			'End',
			' ',
		];
		const blockInput = ( e ) => {
			if ( e.type === 'keydown' && e.key === 'Escape' ) {
				registry.dispatch( autoPreviewStore ).endAutoPreview();
			}
			if ( e.type === 'keydown' && SCROLL_KEYS.includes( e.key ) ) {
				return;
			}
			e.preventDefault();
			e.stopPropagation();
		};
		const INPUT_EVENTS = [
			'keydown',
			'keypress',
			'beforeinput',
			'paste',
			'drop',
		];
		if ( canvasDoc ) {
			canvasDoc.activeElement?.blur?.();
			lock = canvasDoc.createElement( 'style' );
			lock.textContent =
				'body, body * { pointer-events: none !important; user-select: none !important; } html { pointer-events: auto; }';
			canvasDoc.head.appendChild( lock );
			inertRoot = canvasDoc.querySelector( '.is-root-container' );
			inertRoot?.setAttribute( 'inert', '' );
			INPUT_EVENTS.forEach( ( type ) =>
				canvasDoc.addEventListener( type, blockInput, true )
			);
		}

		return () => {
			lock?.remove();
			inertRoot?.removeAttribute( 'inert' );
			INPUT_EVENTS.forEach( ( type ) =>
				canvasDoc?.removeEventListener( type, blockInput, true )
			);
			document.body.classList.remove( 'mb-auto-previewing' );
			if ( turnedOnDF ) {
				registry
					.dispatch( preferencesStore )
					.set( 'core', 'distractionFree', false );
				markDistractionFree( false );
			}
		};
	}, [ active, registry ] );
}

export default function PreviewBar() {
	useCanvasReveal();

	// Once, when the editor loads: undo a preview cut short by a reload.
	const registry = useRegistry();
	useEffect( () => restoreAfterReload( registry ), [ registry ] );

	const { active, overlays, plan, stylePreset, clearIds } = useSelect(
		( select ) => {
			const s = select( autoPreviewStore );
			return {
				active: s.isAutoPreviewActive(),
				overlays: s.getAutoPreviewOverlays(),
				plan: s.getAutoPreviewPlan(),
				stylePreset: s.getAutoPreviewStyle(),
				clearIds: s.getAutoPreviewClearIds(),
			};
		},
		[]
	);
	const { setAutoPreviewOverlays, replayAutoPreview, endAutoPreview } =
		useDispatch( autoPreviewStore );
	const { updateBlockAttributes } = useDispatch( blockEditorStore );
	const { createSuccessNotice } = useDispatch( noticesStore );

	usePreviewScreen( active );

	// Escape = Cancel.
	useEffect( () => {
		if ( ! active ) {
			return;
		}
		const onKey = ( e ) => {
			if ( e.key === 'Escape' ) {
				endAutoPreview();
			}
		};
		document.addEventListener( 'keydown', onKey );
		return () => document.removeEventListener( 'keydown', onKey );
	}, [ active, endAutoPreview ] );

	if ( ! active ) {
		return null;
	}

	// Blocks that will animate. When replacing, overlays also hold the
	// blocks being reset, which show no animation.
	const count = Object.values( overlays ).filter(
		( attrs ) => attrs.animationMode
	).length;

	const onStyle = ( preset ) => {
		if ( preset && plan ) {
			setAutoPreviewOverlays(
				buildReplaceUpdates( plan.apply, preset, clearIds )
					.attributesByClientId,
				preset
			);
		}
	};

	const onApply = () => {
		commitAutoAnimate( overlays, updateBlockAttributes );
		endAutoPreview();
		createSuccessNotice(
			sprintf(
				/* translators: %d: number of animated blocks */
				_n(
					'Animated %d block.',
					'Animated %d blocks.',
					count,
					'motion-blocks'
				),
				count
			),
			{ type: 'snackbar' }
		);
	};

	return createPortal(
		<div
			className="mb-auto-preview-card"
			role="region"
			aria-label={ __( 'Auto-animate preview', 'motion-blocks' ) }
		>
			<VStack spacing={ 4 }>
				<VStack spacing={ 1 }>
					<h2 className="mb-auto-preview-card__title">
						{ __( 'Auto-animate preview', 'motion-blocks' ) }
					</h2>
					<p className="mb-auto-preview-card__hint">
						{ sprintf(
							/* translators: %d: number of previewed blocks */
							_n(
								'Scroll the page to see %d animation.',
								'Scroll the page to see %d animations.',
								count,
								'motion-blocks'
							),
							count
						) }
					</p>
				</VStack>
				<ToggleGroupControl
					label={ __( 'Style', 'motion-blocks' ) }
					value={ stylePreset }
					onChange={ onStyle }
					help={ STYLE_DESCRIPTIONS[ stylePreset ] }
					isBlock
					__nextHasNoMarginBottom
					__next40pxDefaultSize
				>
					{ Object.entries( STYLE_PRESETS ).map( ( [ key ] ) => (
						<ToggleGroupControlOption
							key={ key }
							value={ key }
							label={ STYLE_LABELS[ key ] || key }
						/>
					) ) }
				</ToggleGroupControl>
				<HStack justify="space-between">
					<Button
						variant="tertiary"
						onClick={ replayAutoPreview }
						__next40pxDefaultSize
					>
						{ __( 'Replay', 'motion-blocks' ) }
					</Button>
					<HStack spacing={ 2 } expanded={ false }>
						<Button
							variant="tertiary"
							onClick={ endAutoPreview }
							__next40pxDefaultSize
						>
							{ __( 'Cancel', 'motion-blocks' ) }
						</Button>
						<Button
							variant="primary"
							onClick={ onApply }
							__next40pxDefaultSize
						>
							{ __( 'Apply', 'motion-blocks' ) }
						</Button>
					</HStack>
				</HStack>
			</VStack>
		</div>,
		document.body
	);
}
