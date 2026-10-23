/**
 * Motion Blocks — Frontend Script
 *
 * Handles three animation modes:
 *   1. Page Load — triggered on DOMContentLoaded, with optional repeat
 *      and pause-offscreen.
 *   2. Scroll Appear — independent Entry and Exit slots, triggered from
 *      cached layout bounds woken by IntersectionObserver, ResizeObserver
 *      and a scroll listener (see "Scroll Appear trigger architecture" in
 *      the dev notes before changing it).
 *   3. Scroll Interactive — CSS scroll-driven animations (view timeline).
 *
 * Blocks are wired one at a time, including ones added after load.
 */

import SHARED from '../shared-constants.json';
import { isValidFromToValue } from './css-values';
import { setStaggerIndices } from './stagger-index';
import { imgTargetSelector, imgFrameSelector } from './img-target';
import {
	TRIGGER_ZONE_TOP_PCT,
	TRIGGER_ZONE_BOTTOM_PCT,
	TRIGGER_HYSTERESIS_PX,
	zoneBounds,
	zoneOverlap,
	isInZone,
} from './trigger-zone';
import {
	endsAtRest,
	isOneShotPageLoad,
	isOneShotScrollAppear,
	settleTargets,
} from './settle';

( function () {
	'use strict';

	// What an omitted per-slot Scroll Appear attr resolves to: the same
	// schemaDefaults the editor schema and the PHP merge use (GH #45).
	// PHP leaves default-valued per-slot attrs (ease, 8px blur, 90deg
	// rotate) out of the markup, so the runtime fills them in itself.
	// Static property access keeps the JSON import tree-shaken.
	var SLOT_DEFAULTS = {
		entry: {
			duration: SHARED.schemaDefaults.animationEntryDuration,
			delay: SHARED.schemaDefaults.animationEntryDelay,
			acceleration: SHARED.schemaDefaults.animationEntryAcceleration,
			blurAmount: SHARED.schemaDefaults.animationEntryBlurAmount,
			rotateAngle: SHARED.schemaDefaults.animationEntryRotateAngle,
		},
		exit: {
			duration: SHARED.schemaDefaults.animationExitDuration,
			delay: SHARED.schemaDefaults.animationExitDelay,
			acceleration: SHARED.schemaDefaults.animationExitAcceleration,
			blurAmount: SHARED.schemaDefaults.animationExitBlurAmount,
			rotateAngle: SHARED.schemaDefaults.animationExitRotateAngle,
		},
	};

	// Developer self-check (GH #60). When the opt-in debug setting is
	// on, PHP sets `window.motionBlocksDebug` before this script runs
	// and enqueues build/self-check.js after it. The runtime then
	// exposes read-only internals on `window.__motionBlocks` so the
	// check inspects real trigger state instead of re-deriving it. With
	// the flag off nothing is exposed and nothing else changes.
	var DEBUG = window.motionBlocksDebug === true;
	// Settings → Motion Blocks → Trigger lines (logged-in users only).
	var TRIGGER_LINES = window.motionBlocksTriggerLines === true;
	var debugApi = null;
	if ( DEBUG ) {
		debugApi = {
			// Every element a mode's init loop wired up.
			wired: new WeakSet(),
			// Scroll Appear trigger states (same objects tick() reads).
			scrollAppear: [],
			zoneBounds: zoneBounds,
			zoneOverlap: zoneOverlap,
			isInZone: isInZone,
			zone: {
				top: TRIGGER_ZONE_TOP_PCT,
				bottom: TRIGGER_ZONE_BOTTOM_PCT,
				hysteresis: TRIGGER_HYSTERESIS_PX,
			},
			ready: false,
		};
		window.__motionBlocks = debugApi;
	}

	function init() {
		wire( document );
		watchForLateContent();
		// Public hook (GH #50). Content added later is picked up on its
		// own (watchForLateContent), so themes rarely need this; it's
		// for content the observer can't see coming, e.g. blocks moved
		// by a carousel or revealed by a script that changes their
		// position without resizing the page. Re-scans `root` (default:
		// the whole document) for unwired blocks and re-measures every
		// Scroll Appear block.
		window.motionBlocks = window.motionBlocks || {};
		window.motionBlocks.refresh = function ( root ) {
			wire( root && root.querySelectorAll ? root : document );
			if ( scrollAppear ) {
				scrollAppear.refreshAll();
			}
		};
		// Read by the head failsafe on `load` (GH #57,
		// motion_blocks_print_js_marker): set only once every mode is
		// wired, so a throw above still reveals the content. Re-assert
		// the marker too, in case an optimiser delayed this script past
		// `load` and the failsafe already removed it (no-op otherwise).
		window.motionBlocksReady = true;
		document.documentElement.classList.add( 'mb-js' );
		if ( DEBUG ) {
			debugApi.ready = true;
		}
	}

	/* ---------------------------------------------------------------
	 * Wiring (GH #50)
	 *
	 * Blocks are wired one at a time, so content added after the page
	 * loads (Query Loop pagination without a full reload, infinite
	 * scroll, AJAX, popups) can be wired the same way as the original
	 * markup. Every wired block gets the `mb-wired` class. It lives in
	 * the class attribute on purpose: a script that resets the class
	 * attribute to fresh server markup (the Interactivity API router
	 * patching a reused element, morphdom, Turbo) also wipes the
	 * trigger classes, and dropping `mb-wired` with them makes the
	 * block look new, so it's wired again instead of staying hidden.
	 * ------------------------------------------------------------- */

	var WIRED_CLASS = 'mb-wired';
	var STAGGER_INNER_CLASS = 'wp-block-group__inner-container';
	// Elements wired at least once, to tell a re-wire from a first one.
	var everWired = new WeakSet();
	// Elements wired right now. The class alone isn't proof: a clone
	// (cloneNode, a carousel's looped slide, Turbo's cached page)
	// copies `mb-wired` without any of the runtime state behind it.
	var liveWired = new WeakSet();
	// The Scroll Appear engine, created on the first Scroll Appear block.
	var scrollAppear = null;

	/**
	 * `root.querySelectorAll( selector )`, plus `root` itself if it
	 * matches.
	 */
	function queryAll( root, selector ) {
		var found = Array.prototype.slice.call(
			root.querySelectorAll( selector )
		);
		if ( root.matches && root.matches( selector ) ) {
			found.unshift( root );
		}
		return found;
	}

	/** Is `el` wired, with its runtime state in place? */
	function isWired( el ) {
		return liveWired.has( el ) && el.classList.contains( WIRED_CLASS );
	}

	/** Blocks in `root` matching `selector` that need wiring. */
	function unwired( root, selector ) {
		return queryAll( root, selector ).filter( function ( el ) {
			return ! isWired( el );
		} );
	}

	/**
	 * Drop whatever an earlier wiring of `el` left running: its Scroll
	 * Appear state and observers, and its pause-offscreen observer. A
	 * re-wired block can come back in a different mode (or with
	 * different slots), and the old observers would keep adding and
	 * removing trigger classes on it.
	 */
	function release( el ) {
		liveWired.delete( el );
		if ( scrollAppear ) {
			scrollAppear.release( el );
		}
		cancelSettle( el );
		if ( pauseObservers.has( el ) ) {
			pauseObservers.get( el ).disconnect();
			pauseObservers.delete( el );
			el.style.removeProperty( '--mb-play-state' );
		}
	}

	/**
	 * Wire every not-yet-wired animated block in `root` (an Element or
	 * the document).
	 */
	function wire( root ) {
		// Number each stagger child (`--mb-stagger-index`, read by the
		// stepped-delay rule in animations.css, GH #53). Must run before
		// any trigger class lands: Page Load adds `.mb-triggered`
		// synchronously below, and a child's animation-delay is fixed
		// when its animation starts.
		queryAll( root, '.mb-stagger-parent' ).forEach( setStaggerIndices );
		unwired( root, '.mb-mode-page-load' ).forEach( function ( el ) {
			release( el );
			wirePageLoad( el );
		} );
		unwired( root, '.mb-mode-scroll-appear' ).forEach( function ( el ) {
			release( el );
			if ( ! scrollAppear ) {
				scrollAppear = createScrollAppear();
			}
			scrollAppear.add( el );
		} );
		unwired( root, '.mb-mode-scroll-interactive' ).forEach(
			function ( el ) {
				release( el );
				wireScrollInteractive( el );
			}
		);
	}

	/**
	 * Mark `el` wired. On a re-wire (its class attribute was reset, see
	 * above) its inline styles may have been reset too, so let
	 * applyCustomKeyframe() run again.
	 */
	function markWired( el ) {
		if ( everWired.has( el ) ) {
			delete el.dataset.mbKeyframeApplied;
		}
		everWired.add( el );
		liveWired.add( el );
		el.classList.add( WIRED_CLASS );
		if ( DEBUG ) {
			debugApi.wired.add( el );
		}
	}

	/**
	 * Wire animated blocks added after load, re-number stagger children
	 * when a stagger parent gains or loses children, and drop Scroll
	 * Appear state for removed blocks.
	 *
	 * MutationObserver callbacks run as a microtask, before the browser
	 * renders the change, so a new block is wired before it's ever
	 * painted: a Page Load block starts from its first frame and a
	 * Scroll Appear block is already measured when it first shows.
	 */
	function watchForLateContent() {
		if ( typeof MutationObserver === 'undefined' ) {
			return;
		}
		new MutationObserver( function ( records ) {
			var roots = [];
			var parents = [];
			var removed = false;
			records.forEach( function ( record ) {
				var target = record.target;
				if ( record.type === 'attributes' ) {
					// A wired block whose class attribute was reset.
					if ( ! target.classList.contains( WIRED_CLASS ) ) {
						if ( target.classList.contains( 'mb-animated' ) ) {
							roots.push( target );
						} else if ( liveWired.has( target ) ) {
							// No longer animated at all.
							release( target );
						}
					}
					return;
				}
				for ( var i = 0; i < record.addedNodes.length; i++ ) {
					if ( record.addedNodes[ i ].nodeType === 1 ) {
						roots.push( record.addedNodes[ i ] );
					}
				}
				if ( record.removedNodes.length ) {
					removed = true;
				}
				if ( record.addedNodes.length || record.removedNodes.length ) {
					var parent =
						target.classList &&
						target.classList.contains( STAGGER_INNER_CLASS )
							? target.parentElement
							: target;
					if (
						parent &&
						parent.classList &&
						parent.classList.contains( 'mb-stagger-parent' )
					) {
						parents.push( parent );
					}
				}
			} );
			parents.forEach( setStaggerIndices );
			roots.forEach( function ( root ) {
				// Skip nodes already detached again in the same batch.
				if ( root.isConnected ) {
					wire( root );
				}
			} );
			if ( removed && scrollAppear ) {
				scrollAppear.prune();
			}
		} ).observe( document.documentElement, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: [ 'class' ],
		} );
	}

	/* ---------------------------------------------------------------
	 * Direction → CSS Custom Property Mappings
	 *
	 * Mirrors DIRECTION_CSS_VARS from constants.js. Kept as plain
	 * objects so the frontend stays dependency-free.
	 * ------------------------------------------------------------- */

	var DIRECTION_VARS = {
		slide: {
			ltr: { '--mb-slide-x': '-50px', '--mb-slide-y': '0' },
			rtl: { '--mb-slide-x': '50px', '--mb-slide-y': '0' },
			ttb: { '--mb-slide-x': '0', '--mb-slide-y': '-50px' },
			btt: { '--mb-slide-x': '0', '--mb-slide-y': '50px' },
		},
		// Slide Out — vars are the END position. Negated from `slide`
		// so the direction value still names the motion direction
		// (btt = element moves upward, ending above its rest spot).
		'slide-out': {
			ltr: { '--mb-slide-x': '50px', '--mb-slide-y': '0' },
			rtl: { '--mb-slide-x': '-50px', '--mb-slide-y': '0' },
			ttb: { '--mb-slide-x': '0', '--mb-slide-y': '50px' },
			btt: { '--mb-slide-x': '0', '--mb-slide-y': '-50px' },
		},
		wipe: {
			ltr: { '--mb-wipe-from': 'inset(0 100% 0 0)' },
			rtl: { '--mb-wipe-from': 'inset(0 0 0 100%)' },
			ttb: { '--mb-wipe-from': 'inset(100% 0 0 0)' },
			btt: { '--mb-wipe-from': 'inset(0 0 100% 0)' },
		},
		curtain: {
			horizontal: { '--mb-curtain-from': 'inset(0 50% 0 50%)' },
			vertical: { '--mb-curtain-from': 'inset(50% 0 50% 0)' },
		},
		flip: {
			ltr: { '--mb-flip-transform': 'rotateY(-90deg)' },
			rtl: { '--mb-flip-transform': 'rotateY(90deg)' },
			ttb: { '--mb-flip-transform': 'rotateX(90deg)' },
			btt: { '--mb-flip-transform': 'rotateX(-90deg)' },
		},
		scale: {
			none: { '--mb-scale-x': '0', '--mb-scale-y': '0' },
			btt: { '--mb-scale-x': '0', '--mb-scale-y': '50px' },
			ttb: { '--mb-scale-x': '0', '--mb-scale-y': '-50px' },
			ltr: { '--mb-scale-x': '-50px', '--mb-scale-y': '0' },
			rtl: { '--mb-scale-x': '50px', '--mb-scale-y': '0' },
		},
		// Scale Out — same negation rationale as slide-out above.
		'scale-out': {
			none: { '--mb-scale-x': '0', '--mb-scale-y': '0' },
			btt: { '--mb-scale-x': '0', '--mb-scale-y': '-50px' },
			ttb: { '--mb-scale-x': '0', '--mb-scale-y': '50px' },
			ltr: { '--mb-scale-x': '50px', '--mb-scale-y': '0' },
			rtl: { '--mb-scale-x': '-50px', '--mb-scale-y': '0' },
		},
	};

	/* ---------------------------------------------------------------
	 * Helpers
	 * ------------------------------------------------------------- */

	/**
	 * Apply CSS custom properties for duration and delay from data attributes.
	 */
	function applyTimingProps( el ) {
		var duration = el.dataset.mbDuration;
		var delay = el.dataset.mbDelay;
		var acceleration = el.dataset.mbAcceleration;

		if ( duration ) {
			el.style.setProperty( '--mb-duration', duration + 's' );
		}
		if ( delay ) {
			el.style.setProperty( '--mb-delay', delay + 's' );
		}
		if ( acceleration ) {
			el.style.setProperty( '--mb-timing', acceleration );
		}
	}

	/**
	 * Apply blur amount CSS custom property from data attribute.
	 */
	function applyBlurProps( el ) {
		var blurAmount = el.dataset.mbBlurAmount;
		if ( blurAmount ) {
			el.style.setProperty( '--mb-blur-amount', blurAmount + 'px' );
		}
	}

	/**
	 * Apply rotate angle CSS custom property from data attribute.
	 */
	function applyRotateProps( el ) {
		var rotateAngle = el.dataset.mbRotateAngle;
		if ( rotateAngle ) {
			el.style.setProperty( '--mb-rotate-angle', rotateAngle + 'deg' );
		}
	}

	/* ---------------------------------------------------------------
	 * Custom (Start / End) — per-block @keyframes injection.
	 *
	 * For animationType === 'custom', the editor saves data attrs
	 * `data-mb-from-{prop}` / `data-mb-to-{prop}` for each property
	 * the user explicitly added. Properties not added are absent —
	 * which is meaningful: the keyframe will omit them and CSS will
	 * interpolate to the element's computed style on that side.
	 *
	 * For each custom-type element, we synthesize a unique
	 * `@keyframes mb-custom-{n}` rule from its data attrs, append it
	 * to a shared <style> in <head>, and bind it via inline
	 * animation-name on the element.
	 * ------------------------------------------------------------- */

	// Definition list mirrors PROPERTY_DEFINITIONS in constants.js.
	// Order matters — composes left-to-right into the transform.
	var CUSTOM_PROPS = [
		{ id: 'opacity', dataFrom: 'mbFromOpacity', dataTo: 'mbToOpacity' },
		{ id: 'translateX', dataFrom: 'mbFromTranslateX', dataTo: 'mbToTranslateX' },
		{ id: 'translateY', dataFrom: 'mbFromTranslateY', dataTo: 'mbToTranslateY' },
		{ id: 'scale', dataFrom: 'mbFromScale', dataTo: 'mbToScale' },
		{ id: 'rotate', dataFrom: 'mbFromRotate', dataTo: 'mbToRotate' },
		// 3D rotations (Flip).
		{ id: 'rotateX', dataFrom: 'mbFromRotateX', dataTo: 'mbToRotateX' },
		{ id: 'rotateY', dataFrom: 'mbFromRotateY', dataTo: 'mbToRotateY' },
		// Filter blur.
		{ id: 'blur', dataFrom: 'mbFromBlur', dataTo: 'mbToBlur' },
		// Clip path (Curtain / Wipe).
		{ id: 'clipPath', dataFrom: 'mbFromClipPath', dataTo: 'mbToClipPath' },
	];

	function isAddedDatasetVal( v ) {
		return v !== undefined && v !== null && v !== '';
	}

	/**
	 * Build the body of one side of the keyframe (the contents of
	 * `from { … }` or `to { … }`) from the element's data attrs.
	 *
	 * `attrPrefix` overrides the dataset prefix when reading per-slot
	 * Custom From/To values. Pass 'mbEntryFrom'/'mbEntryTo' or
	 * 'mbExitFrom'/'mbExitTo' to read the slot-prefixed attrs; default
	 * is the shared `mbFromX` / `mbToX` used by Page Load and Scroll
	 * Interactive.
	 */
	/**
	 * Append `unit` to `value` only when `value` looks purely
	 * numeric. Custom From/To values are stored in BOTH formats
	 * depending on which input control wrote them:
	 *   - some flows store `"-10deg"` / `"8px"` (unit included)
	 *   - others store `"0"` / `"360"` / `"40"` (bare number)
	 *
	 * The frontend has to handle both. If we always appended the
	 * unit we'd produce `rotate(-10degdeg)` for the first format
	 * (invalid CSS, invalidates the whole transform); if we never
	 * appended it we'd produce `rotate(0)` for the second format
	 * (also invalid — rotate() requires an angle unit). The regex
	 * matches an optionally-signed integer or decimal — anything
	 * with a trailing letter or `%` or `vw` etc. passes through.
	 */
	function withUnit( value, unit ) {
		if ( value === undefined || value === null ) {
			return value;
		}
		return /^-?\d+(\.\d+)?$/.test( String( value ).trim() )
			? value + unit
			: value;
	}

	function buildSideBody( el, sideKey, attrPrefix ) {
		var bag = {};
		CUSTOM_PROPS.forEach( function ( p ) {
			var key;
			if ( attrPrefix ) {
				// p.id is the lowerCamel key suffix (Opacity, TranslateX, …)
				key =
					attrPrefix +
					p.id.charAt( 0 ).toUpperCase() +
					p.id.slice( 1 );
			} else {
				key = sideKey === 'from' ? p.dataFrom : p.dataTo;
			}
			var raw = el.dataset[ key ];
			// These values become @keyframes text: malformed values are
			// dropped (see css-values.js).
			if (
				isAddedDatasetVal( raw ) &&
				isValidFromToValue( p.id, raw )
			) {
				bag[ p.id ] = raw;
			}
		} );
		var decls = [];
		if ( bag.opacity !== undefined ) {
			decls.push( 'opacity: ' + bag.opacity );
		}
		// Compose transform — perspective() only when a 3D rotation
		// is present (mirrors buildKeyframeSide in constants.js).
		var tx = [];
		var has3D =
			bag.rotateX !== undefined || bag.rotateY !== undefined;
		if ( has3D ) {
			tx.push( 'perspective(800px)' );
		}
		var hasTx = bag.translateX !== undefined;
		var hasTy = bag.translateY !== undefined;
		if ( hasTx || hasTy ) {
			tx.push(
				'translate(' +
					( hasTx ? withUnit( bag.translateX, 'px' ) : '0px' ) +
					', ' +
					( hasTy ? withUnit( bag.translateY, 'px' ) : '0px' ) +
					')'
			);
		}
		if ( bag.scale !== undefined ) {
			tx.push( 'scale(' + bag.scale + ')' );
		}
		if ( bag.rotate !== undefined ) {
			tx.push( 'rotate(' + withUnit( bag.rotate, 'deg' ) + ')' );
		}
		if ( bag.rotateX !== undefined ) {
			tx.push( 'rotateX(' + withUnit( bag.rotateX, 'deg' ) + ')' );
		}
		if ( bag.rotateY !== undefined ) {
			tx.push( 'rotateY(' + withUnit( bag.rotateY, 'deg' ) + ')' );
		}
		if ( tx.length > 0 ) {
			decls.push( 'transform: ' + tx.join( ' ' ) );
		}
		if ( bag.blur !== undefined ) {
			decls.push( 'filter: blur(' + withUnit( bag.blur, 'px' ) + ')' );
		}
		if ( bag.clipPath !== undefined ) {
			decls.push( 'clip-path: ' + bag.clipPath );
		}
		if ( decls.length === 0 ) {
			return null;
		}
		return decls.join( '; ' ) + ';';
	}

	// Shared <style> element for all custom keyframes. Created
	// lazily on first use; one rule appended per custom block.
	var customStyleEl = null;
	var customKeyframeCounter = 0;

	function getCustomStyleEl() {
		if ( ! customStyleEl ) {
			customStyleEl = document.createElement( 'style' );
			customStyleEl.setAttribute( 'data-mb-custom', '' );
			document.head.appendChild( customStyleEl );
		}
		return customStyleEl;
	}

	/**
	 * Build the scoped CSS rule string for target='img' mode.
	 * Mirrors buildImgTargetCSS in src/index.js — see that for the
	 * full reasoning. Selectors cover the common WP image markup
	 * paths (figure > img, a > img, figure > a > img, the wrapper
	 * itself, plus cover-bg). `:has()` makes the img's immediate
	 * parent the clipping frame without injecting any wrapper.
	 */
	function buildImgScopedCSS( uid, keyframeName, mode ) {
		var scope = '[data-mb-uid="' + uid + '"]';
		// The Cover's background image: a direct child of the wrapper.
		// A descendant selector also caught the first image of every
		// sibling group in the Cover's inner blocks (a logo would
		// animate with the background and be clipped by its figure).
		var imgSelector = imgTargetSelector( scope );
		// The wrapper is the clipping frame for its own image.
		var parentSelector = imgFrameSelector( scope );

		var animProps;
		if ( mode === 'scroll-interactive' ) {
			animProps = [
				'animation-name: ' + keyframeName,
				'animation-timeline: view()',
				'animation-range-start: var(--mb-range-start, entry 0%)',
				'animation-range-end: var(--mb-range-end, exit 100%)',
				'animation-duration: 1ms',
				'animation-fill-mode: both',
				'animation-timing-function: var(--mb-timing, linear)',
			];
		} else {
			animProps = [
				'animation-name: ' + keyframeName,
				'animation-duration: var(--mb-duration, 0.6s)',
				'animation-delay: var(--mb-delay, 0s)',
				'animation-fill-mode: var(--mb-fill-mode, both)',
				'animation-timing-function: var(--mb-timing, ease)',
				'animation-iteration-count: var(--mb-iteration-count, 1)',
				'animation-direction: var(--mb-direction, normal)',
				// Page Load "Pause when off-screen" (setupPauseOffscreen).
				'animation-play-state: var(--mb-play-state, running)',
			];
		}

		var imgRule = imgSelector + ' { ' + animProps.join( '; ' ) + '; }';
		if ( mode === 'scroll-interactive' ) {
			// Same gate as the static Scroll Interactive rules in
			// animations.css: without a view timeline the 1ms animation
			// would hold its END frame on the document timeline (GH #42).
			imgRule =
				'@supports (animation-timeline: view()) { ' + imgRule + ' }';
		}

		return [
			parentSelector + ' { overflow: clip; }',
			'@supports not (overflow: clip) { ' +
				parentSelector +
				' { overflow: hidden; } }',
			imgRule,
		].join( '\n' );
	}

	/**
	 * For `image-move` mode: synthesize the parallax from/to values
	 * from the direction. Mirrors getPresetFromTo('image-move') in
	 * constants.js — the formula is `(scale - 1) / 2 * 100%` for
	 * the translate distance at SCALE = 1.2.
	 */
	function buildImageMoveSides( direction ) {
		var SCALE = 1.2;
		var SHIFT = ( ( SCALE - 1 ) / 2 ) * 100; // 10 (percent)
		var dirs = {
			btt: { x: 0, y: SHIFT },
			ttb: { x: 0, y: -SHIFT },
			ltr: { x: -SHIFT, y: 0 },
			rtl: { x: SHIFT, y: 0 },
		};
		var m = dirs[ direction ] || dirs.btt;
		var fromDecls = [ 'transform: ' ];
		var toDecls = [ 'transform: ' ];
		var fromTx = [];
		var toTx = [];
		// translate first, scale second (matches buildKeyframeSide).
		if ( m.x !== 0 || m.y !== 0 ) {
			fromTx.push(
				'translate(' + m.x + '%, ' + m.y + '%)'
			);
			toTx.push(
				'translate(' + -m.x + '%, ' + -m.y + '%)'
			);
		}
		fromTx.push( 'scale(' + SCALE + ')' );
		toTx.push( 'scale(' + SCALE + ')' );
		fromDecls[ 0 ] += fromTx.join( ' ' ) + ';';
		toDecls[ 0 ] += toTx.join( ' ' ) + ';';
		return { fromBody: fromDecls[ 0 ], toBody: toDecls[ 0 ] };
	}

	/**
	 * For `image-zoom` mode: pure scale 1 → 1.2. No direction, no
	 * translate. Mirrors getPresetFromTo('image-zoom') in constants.js.
	 */
	function buildImageZoomSides() {
		return {
			fromBody: 'transform: scale(1);',
			toBody: 'transform: scale(1.2);',
		};
	}

	/**
	 * For a custom-type element: build its @keyframes rule, append
	 * it to the shared style element, set animation-name inline.
	 * No-op if neither side has any added properties.
	 *
	 * For target='img', also inject a scoped CSS rule that animates
	 * the first img descendant instead of the block wrapper, with
	 * `overflow: clip` on the img's immediate parent.
	 *
	 * For type='image-move', synthesize a parallax keyframe from the
	 * direction and treat as img-target.
	 *
	 * Idempotent — stamps the element with `data-mb-keyframe-applied`
	 * on first run so a second call (e.g. from a theme block-template
	 * re-render or a future SPA-nav handler) doesn't append duplicate
	 * keyframe rules to the shared `<style data-mb-custom>` element.
	 */
	function applyCustomKeyframe( el ) {
		if ( el.dataset.mbKeyframeApplied ) {
			return;
		}
		el.dataset.mbKeyframeApplied = 'true';
		// Scroll Appear blocks read per-slot data attributes
		// (`data-mb-entry-*` / `data-mb-exit-*`) instead of the shared
		// `data-mb-type` / `data-mb-from-*` / `data-mb-to-*`. Up to
		// two keyframes are injected (one per Custom slot) and bound
		// via `--mb-entry-anim-name` / `--mb-exit-anim-name` CSS
		// variables, which the slot-specific CSS rules consume.
		if ( el.dataset.mbMode === 'scroll-appear' ) {
			applyScrollAppearCustomKeyframes( el );
			return;
		}

		var type = el.dataset.mbType;
		if (
			type !== 'custom' &&
			type !== 'image-move' &&
			type !== 'image-zoom'
		) {
			return;
		}
		// Image effects are v1-scoped to `core/cover` (see
		// IMAGE_EFFECT_BLOCKS in constants.js). If a legacy block was
		// saved before the restriction landed and still has image-move
		// / image-zoom set on a non-Cover block, no-op rather than
		// animating into a clip-frame-less figure (would visually
		// "explode" past the figure bounds onto surrounding content).
		// The editor's dropdown no longer offers these on non-Cover
		// blocks, so users can pick a different effect on next edit.
		//
		// Also bail when the img target isn't available — Cover blocks
		// with Fixed/Repeated background render a `<div>` bg, no
		// `<img>` element to scope to. The render filter drops
		// `data-mb-target="img"` in that case (via
		// motion_blocks_is_image_target_unavailable in
		// animation-plugin.php). Without that attribute the wrapper-
		// fallback path below would synthesize a keyframe and bind it
		// to the Cover wrapper, moving the whole block instead of the
		// (non-existent) bg image.
		if (
			( type === 'image-move' || type === 'image-zoom' ) &&
			( ! el.classList.contains( 'wp-block-cover' ) ||
				el.dataset.mbTarget !== 'img' )
		) {
			return;
		}
		var fromBody;
		var toBody;
		if ( type === 'image-move' ) {
			var moveSides = buildImageMoveSides(
				el.dataset.mbDirection || 'btt'
			);
			fromBody = moveSides.fromBody;
			toBody = moveSides.toBody;
		} else if ( type === 'image-zoom' ) {
			var zoomSides = buildImageZoomSides();
			fromBody = zoomSides.fromBody;
			toBody = zoomSides.toBody;
		} else {
			fromBody = buildSideBody( el, 'from' );
			toBody = buildSideBody( el, 'to' );
		}
		if ( ! fromBody && ! toBody ) {
			return;
		}
		customKeyframeCounter += 1;
		var name = 'mb-custom-runtime-' + customKeyframeCounter;
		appendKeyframeRule( name, fromBody, toBody );

		// Branch on target: block (default) animates the wrapper;
		// img scopes the keyframe to the first <img> descendant.
		if ( el.dataset.mbTarget === 'img' ) {
			var uid = 'mb-' + customKeyframeCounter;
			el.setAttribute( 'data-mb-uid', uid );
			var scopedCSS = buildImgScopedCSS(
				uid,
				name,
				el.dataset.mbMode
			);
			getCustomStyleEl().appendChild(
				document.createTextNode( scopedCSS )
			);
		} else {
			el.style.animationName = name;
			// Stagger cascade for Custom: inner blocks bind their
			// animation-name to this same per-block keyframe via
			// `--mb-stagger-anim-name` (see animations.css). Custom
			// properties inherit by default, so simply setting it on
			// the parent block is enough — no per-child wiring
			// required. Safe to set unconditionally: the CSS rule
			// that reads it only fires on `.mb-stagger-parent`
			// elements, so non-stagger blocks ignore it.
			el.style.setProperty( '--mb-stagger-anim-name', name );
		}
	}

	/**
	 * Inject 0-2 per-block keyframes for a Scroll Appear block's
	 * Custom slots, and expose their names via CSS variables that
	 * the slot-binding rules in animations.css consume.
	 *
	 * Both slots share the wrapper's `--mb-stagger-anim-name` (which
	 * the existing Stagger cascade reads) — but only the Entry slot
	 * sets it. Exit-only Custom blocks don't compose with Stagger
	 * meaningfully (no entry animation to cascade), and the inner
	 * blocks wouldn't run an exit animation either.
	 *
	 * When the block carries `data-mb-target="img"`, the per-slot
	 * keyframes are bound to the first `<img>` descendant instead of
	 * the wrapper — same approach as Page Load + Custom + img. The
	 * wrapper is left animation-free; a CSS override keeps the
	 * `mb-has-entry` pre-hide from applying so the figure / caption
	 * remain visible.
	 */
	function applyScrollAppearCustomKeyframes( el ) {
		var entryType = el.dataset.mbEntryType || '';
		var exitType = el.dataset.mbExitType || '';
		var imgTarget = el.dataset.mbTarget === 'img';
		var entryName = null;
		var exitName = null;

		// Image effects are v1-scoped to Cover blocks. Strip orphaned
		// legacy selections on non-Cover blocks so they don't render
		// without a clip frame. See the non-slot path above for the
		// same gate + rationale.
		//
		// Also strip when img target is unavailable (Cover with
		// Fixed/Repeated bg). Same reasoning as the non-slot path:
		// without an `<img>` to scope to, the wrapper-fallback below
		// would bind the synthesized keyframe to the Cover wrapper.
		// The earlier "image effects always imply imgTarget" comment
		// no longer holds — the render filter drops the target attr
		// when no img will exist.
		var isCover = el.classList.contains( 'wp-block-cover' );
		if ( ! isCover || ! imgTarget ) {
			if ( entryType === 'image-move' || entryType === 'image-zoom' ) {
				entryType = '';
			}
			if ( exitType === 'image-move' || exitType === 'image-zoom' ) {
				exitType = '';
			}
		}

		// Entry slot. Three flavors share the same synthesis path:
		//   - `custom`        — keyframe built from the user's From/To attrs
		//   - `image-move`    — keyframe built from direction (scale + translate)
		//   - `image-zoom`    — keyframe built from scale 1 → 1.2 (no direction)
		// Image effects always imply imgTarget (the save-props layer
		// forces `data-mb-target="img"` for them).
		var entryFrom = null;
		var entryTo = null;
		if ( entryType === 'custom' ) {
			entryFrom = buildSideBody( el, null, 'mbEntryFrom' );
			entryTo = buildSideBody( el, null, 'mbEntryTo' );
		} else if ( entryType === 'image-move' ) {
			var moveSides = buildImageMoveSides(
				el.dataset.mbEntryDirection || 'btt'
			);
			entryFrom = moveSides.fromBody;
			entryTo = moveSides.toBody;
		} else if ( entryType === 'image-zoom' ) {
			var zoomSides = buildImageZoomSides();
			entryFrom = zoomSides.fromBody;
			entryTo = zoomSides.toBody;
		}
		if ( entryFrom || entryTo ) {
			customKeyframeCounter += 1;
			entryName = 'mb-custom-runtime-' + customKeyframeCounter;
			appendKeyframeRule( entryName, entryFrom, entryTo );
			if ( ! imgTarget ) {
				el.style.setProperty( '--mb-entry-anim-name', entryName );
				// Stagger cascade for the entry phase — inner blocks
				// inherit this var via the cascade.
				el.style.setProperty(
					'--mb-stagger-anim-name',
					entryName
				);
			}
		}

		// Exit slot. Same three flavors as the Entry slot. Image
		// effects play the same keyframe but on the exit phase — the
		// image zooms / parallaxes as the element scrolls out of view.
		var exitFrom = null;
		var exitTo = null;
		if ( exitType === 'custom' ) {
			exitFrom = buildSideBody( el, null, 'mbExitFrom' );
			exitTo = buildSideBody( el, null, 'mbExitTo' );
		} else if ( exitType === 'image-move' ) {
			var moveSidesExit = buildImageMoveSides(
				el.dataset.mbExitDirection || 'btt'
			);
			exitFrom = moveSidesExit.fromBody;
			exitTo = moveSidesExit.toBody;
		} else if ( exitType === 'image-zoom' ) {
			var zoomSidesExit = buildImageZoomSides();
			exitFrom = zoomSidesExit.fromBody;
			exitTo = zoomSidesExit.toBody;
		}
		if ( exitFrom || exitTo ) {
			customKeyframeCounter += 1;
			exitName = 'mb-custom-runtime-' + customKeyframeCounter;
			appendKeyframeRule( exitName, exitFrom, exitTo );
			if ( ! imgTarget ) {
				el.style.setProperty( '--mb-exit-anim-name', exitName );
			}
		}

		// img-target: emit slot-aware scoped CSS that animates the
		// first <img> descendant for each filled slot, scoped to a
		// per-block uid so multiple img-target blocks don't collide.
		if ( imgTarget && ( entryName || exitName ) ) {
			customKeyframeCounter += 1;
			var uid = 'mb-' + customKeyframeCounter;
			el.setAttribute( 'data-mb-uid', uid );
			var scopedCSS = buildScrollAppearImgScopedCSS(
				uid,
				entryName,
				exitName
			);
			if ( scopedCSS ) {
				getCustomStyleEl().appendChild(
					document.createTextNode( scopedCSS )
				);
			}
		}
	}

	/**
	 * Build slot-aware scoped CSS for Scroll Appear + Custom +
	 * img-target. Each slot binds its keyframe to the first img
	 * descendant gated on the slot's trigger class
	 * (`.mb-triggered` for entry, `.mb-exit-triggered` for exit).
	 * Animation timing reads the shared `--mb-duration` etc. vars
	 * that the IO callback swaps between phases.
	 *
	 * `overflow: clip` on the img's immediate parent (matched via
	 * `:has(> img:first-of-type)`) provides a static clipping
	 * rectangle. A transformed img child gets clipped against that
	 * rectangle — clip-path on the img itself wouldn't work because
	 * the clip transforms with the element and follows it past its
	 * natural border.
	 */
	function buildScrollAppearImgScopedCSS( uid, entryName, exitName ) {
		var scope = '[data-mb-uid="' + uid + '"]';
		var imgSelector = imgTargetSelector( scope );
		var parentSelector = imgFrameSelector( scope );
		var rules = [];
		rules.push( parentSelector + ' { overflow: clip; }' );
		rules.push(
			'@supports not (overflow: clip) { ' +
				parentSelector +
				' { overflow: hidden; } }'
		);
		var sharedAnim = [
			'animation-duration: var(--mb-duration, 0.6s)',
			'animation-delay: var(--mb-delay, 0s)',
			'animation-fill-mode: var(--mb-fill-mode, both)',
			'animation-timing-function: var(--mb-timing, ease)',
			'animation-iteration-count: var(--mb-iteration-count, 1)',
			'animation-direction: var(--mb-direction, normal)',
		];
		if ( entryName ) {
			rules.push(
				imgTargetSelector( scope + '.mb-triggered' ) +
					' { ' +
					'animation-name: ' +
					entryName +
					'; ' +
					sharedAnim.join( '; ' ) +
					'; }'
			);
		}
		if ( exitName ) {
			rules.push(
				imgTargetSelector( scope + '.mb-exit-triggered' ) +
					' { ' +
					'animation-name: ' +
					exitName +
					'; ' +
					sharedAnim.join( '; ' ) +
					'; }'
			);
		}
		return rules.join( '\n' );
	}

	/**
	 * Append a `@keyframes name { from { … } to { … } }` rule to the
	 * shared `<style data-mb-custom>` element. Either body may be null
	 * (CSS interpolates to the element's computed style on that end).
	 */
	function appendKeyframeRule( name, fromBody, toBody ) {
		var lines = [ '@keyframes ' + name + ' {' ];
		if ( fromBody ) {
			lines.push( '  from { ' + fromBody + ' }' );
		}
		if ( toBody ) {
			lines.push( '  to { ' + toBody + ' }' );
		}
		lines.push( '}' );
		getCustomStyleEl().appendChild(
			document.createTextNode( lines.join( '\n' ) )
		);
	}

	/**
	 * Apply direction CSS custom properties for a given type + direction.
	 */
	function applyDirectionProps( el, type, direction ) {
		if ( ! type || ! direction ) {
			return;
		}
		var typeVars = DIRECTION_VARS[ type ];
		if ( ! typeVars ) {
			return;
		}
		var vars = typeVars[ direction ];
		if ( ! vars ) {
			return;
		}
		for ( var prop in vars ) {
			el.style.setProperty( prop, vars[ prop ] );
		}
	}

	/* ---------------------------------------------------------------
	 * 1. Page Load Animations
	 * ------------------------------------------------------------- */

	// Pause-offscreen observers by element, so a re-wire replaces one.
	var pauseObservers = new WeakMap();

	// Pending settle listeners by element (see settleWhenFinished()).
	var settleListeners = new WeakMap();

	function wirePageLoad( el ) {
		markWired( el );
		applyTimingProps( el );
		applyDirectionProps(
			el,
			el.dataset.mbType,
			el.dataset.mbDirection
		);
		applyBlurProps( el );
		applyRotateProps( el );
		applyCustomKeyframe( el );

		// Handle repeat mode. Set CSS custom properties instead
		// of inline `animation-*` shorthand — the custom props
		// inherit through the cascade, so a staggered parent's
		// loop / alternate settings propagate to its inner blocks
		// via the `.mb-stagger-parent.mb-triggered > *` rule in
		// animations.css. Inline `animationIterationCount` on the
		// parent would NOT cascade.
		var repeat = el.dataset.mbRepeat || 'once';
		var isLooping = repeat === 'loop' || repeat === 'alternate';

		if ( repeat === 'loop' ) {
			el.style.setProperty( '--mb-iteration-count', 'infinite' );
			el.style.setProperty( '--mb-fill-mode', 'none' );
		} else if ( repeat === 'alternate' ) {
			el.style.setProperty( '--mb-iteration-count', 'infinite' );
			el.style.setProperty( '--mb-direction', 'alternate' );
			el.style.setProperty( '--mb-fill-mode', 'none' );
		}

		// A one-shot Page Load never plays again: once it finishes,
		// drop its filled last frame (GH #20).
		if ( isOneShotPageLoad( repeat ) ) {
			settleWhenFinished( el, el.dataset.mbType, 'mbTo' );
		}

		// Trigger the animation.
		el.classList.add( 'mb-triggered' );

		// Pause off-screen only applies to looping animations.
		// Pausing a one-shot while off-screen would freeze it at
		// frame 0 until it scrolls into view — turning Page Load
		// into Scroll Appear. One-shot Page Load fires on load and
		// finishes regardless of viewport, by design.
		if ( isLooping && el.dataset.mbPauseOffscreen === 'true' ) {
			setupPauseOffscreen( el );
		}
	}

	/**
	 * Pause/resume animation based on element visibility.
	 *
	 * Sets `--mb-play-state` rather than inline `animation-play-state`:
	 * a Stagger parent's children and an img-target block's image
	 * animate instead of the wrapper, and only a custom property
	 * reaches them (the triggered rules in animations.css read it).
	 * The observer stays connected — a looping animation needs it for
	 * the life of the page.
	 */
	function setupPauseOffscreen( el ) {
		if ( pauseObservers.has( el ) ) {
			pauseObservers.get( el ).disconnect();
		}
		var observer = new IntersectionObserver(
			function ( entries ) {
				entries.forEach( function ( entry ) {
					el.style.setProperty(
						'--mb-play-state',
						entry.isIntersecting ? 'running' : 'paused'
					);
				} );
			},
			{ threshold: 0 }
		);

		observer.observe( el );
		pauseObservers.set( el, observer );
	}

	/* ---------------------------------------------------------------
	 * 2. Scroll in View Animations (slot model)
	 *
	 * Each block has an Entry slot and an Exit slot, each
	 * independently filled or empty. The IO callback fires the
	 * matching slot's animation on each scroll-direction transition:
	 *
	 *   - intersecting (forward enter)     → Entry slot fires
	 *   - not intersecting (forward leave) → Exit slot fires
	 *   - intersecting after exit          → Entry slot fires again
	 *   - …
	 *
	 * `mb-has-entry` class on the wrapper signals "Entry slot is
	 * filled" — used by the CSS initial-hide rule.
	 *
	 * Slot config comes from per-slot data attributes
	 * (data-mb-entry-* / data-mb-exit-*). The frontend doesn't read
	 * `data-mb-type` for Scroll Appear blocks any more.
	 * ------------------------------------------------------------- */

	/**
	 * The Scroll Appear engine: shared scroll / resize / layout
	 * listeners plus one trigger state per block. Created once, on the
	 * first Scroll Appear block (at load or later, GH #50).
	 *
	 * @return {{add: Function, refreshAll: Function, prune: Function}} API.
	 */
	function createScrollAppear() {
		// Architecture: IntersectionObserver as a "something changed
		// near the trigger zone" wake-up signal + cached page-relative
		// LAYOUT bounds (offsetTop / offsetHeight) as the source of
		// truth for trigger decisions. Mirrors how ScrollMagic v3
		// uses IO + cached geometry (and how GSAP ScrollTrigger uses
		// scroll events + refreshed bounds).
		//
		// Why not trust IO directly: IO's intersection result uses
		// the element's CURRENT rendered geometry, which includes CSS
		// transforms. Animations that change the bbox (rotate's AABB
		// expansion, slide translates, scale grows/shrinks the box)
		// feed back into IO and produce a flicker loop where trigger
		// detection is driven by the animation itself rather than by
		// the user's scroll. Earlier downstream guards (2e9d8ce,
		// 641c8d5, 915a127) each reduced the damage but couldn't
		// eliminate the class of bug — trackpad sub-pixel jitter
		// defeats scroll-delta heuristics.
		//
		// The fix: keep IO for the wake-up (efficient, compositor-
		// thread, fires only when geometry approaches the threshold)
		// but ignore its `isIntersecting` value. Instead, on each IO
		// callback, run `tick(state)` which compares cached layout
		// bounds against the current scroll viewport. Cached bounds
		// are transform-immune (offsetTop ignores transforms), so the
		// trigger decision is stable regardless of what the animation
		// is doing visually. If the cached inZone doesn't flip, tick
		// is a no-op — bbox-bounce IO callbacks become silent.
		//
		// Direction-aware dispatch (GSAP toggleActions analog) is
		// preserved:
		//   in zone   + dir=down/same → onEnter     (fire Entry)
		//   in zone   + dir=up        → onEnterBack (reverse-play exit)
		//   out zone  + dir=down/same → onLeave     (fire Exit forward)
		//   out zone  + dir=up        → onLeaveBack (no-op)
		//
		// One exception: an element's FIRST-ever entry always dispatches
		// onEnter, even when dir=up. onEnterBack presumes a prior visit
		// to reverse; a never-entered element seen from above (reload
		// with scroll restored below it, hash-anchor landing) has none.

		var states = [];
		// Trigger state by element, so a re-wire replaces the old one.
		var stateByEl = new WeakMap();
		var prevScrollY = window.scrollY;
		// Shared scroll direction. tick() updates it ONLY when the scroll
		// position actually changes, so every element processed in a
		// single scroll frame (states.forEach(tick)) reads the same
		// direction instead of all-but-the-first collapsing to 'same'.
		var scrollDir = 'same';
		// Scrollable document height, for the trigger band's stretch at
		// the bottom of the scroll range (GH #23). Re-read once per
		// scroll frame and on every layout refresh (refreshAll runs on
		// resize, load, font swap and body resize), never per block.
		// Unknown (no stretch) until the window `load` event: before
		// that, late images and embeds can still make the page taller,
		// and a block that entered because the page briefly looked
		// short would drop out of the zone again on load.
		function readDocHeight() {
			return document.readyState === 'complete'
				? document.documentElement.scrollHeight
				: undefined;
		}
		var docHeight = readDocHeight();
		var triggerLines = TRIGGER_LINES ? createTriggerLines() : null;
		function drawTriggerLines() {
			if ( triggerLines ) {
				triggerLines.update( docHeight );
			}
		}
		drawTriggerLines();

		/**
		 * Compute the element's page-relative top via the offsetParent
		 * chain. Unlike `getBoundingClientRect()`, `offsetTop` is the
		 * layout box position — CSS transforms (rotate, scale, translate)
		 * don't affect it. That's the property we need: animation-stable
		 * trigger geometry.
		 *
		 * Edge case: a `position: fixed` ancestor breaks the offsetParent
		 * chain. For Scroll Appear blocks inside fixed containers the
		 * bounds will be off; that's a corner case we accept (the
		 * simpler implementation is worth more than the marginal
		 * accuracy gain).
		 */
		function refreshBounds( state ) {
			var top = 0;
			var n = state.el;
			while ( n && n.offsetParent !== null ) {
				top += n.offsetTop;
				n = n.offsetParent;
			}
			// The chain stops at <body>, and offsets are measured from
			// <html>'s border box, so a margin on <html> is missing:
			// WordPress adds `html { margin-top: 32px }` for the admin
			// bar, which put every trigger 32px off for logged-in users
			// (2026-10-20 review, #58). Add <html>'s own page offset.
			// Skipped when the chain ended at a fixed-position ancestor
			// (see the edge case above).
			if ( n === document.body ) {
				top +=
					document.documentElement.getBoundingClientRect().top +
					window.scrollY;
			}
			state.pageTop = top;
			state.pageHeight = state.el.offsetHeight;
			state.pageBottom = top + state.pageHeight;
		}

		/**
		 * The truth function. Reads cached bounds against the current
		 * scroll viewport, computes inZone, fires a handler only on
		 * inZone state flips. Called from IO callbacks and from
		 * ResizeObserver / window resize.
		 *
		 * `layoutDir` (optional): set by refreshAll() when a layout
		 * change, not a scroll, moved the block. 'up' = the block moved
		 * down the page (as if the reader scrolled up), 'down' = it moved
		 * up. It replaces the scroll direction for this tick only.
		 */
		function tick( state, layoutDir ) {
			if ( state.unobserved ) {
				return;
			}
			var currentScrollY = window.scrollY;
			// Update the SHARED direction only on a real position change.
			// When unchanged — every element after the first in a
			// `states.forEach(tick)` frame, or an IO/ResizeObserver
			// callback that fired without a scroll — KEEP the last
			// direction rather than collapsing to 'same'. Collapsing
			// would gate onEnterBack / onLeaveBack (dir === 'up') off for
			// every element except whichever ticked first this frame.
			if ( currentScrollY > prevScrollY ) {
				scrollDir = 'down';
			} else if ( currentScrollY < prevScrollY ) {
				scrollDir = 'up';
			}
			prevScrollY = currentScrollY;
			// A layout change is not a scroll: content above growing
			// pushes an in-zone block out through the BOTTOM of the zone,
			// which is onLeaveBack, not the "scrolled past it" onLeave
			// the last scroll direction would pick — that played the Exit
			// on a block still on screen (GH #52 follow-up).
			var dir = layoutDir || scrollDir;

			var vh = window.innerHeight;
			var viewportTop = currentScrollY;
			var viewportBottom = currentScrollY + vh;
			var zone = zoneBounds( currentScrollY, vh, docHeight );
			var overlap = zoneOverlap(
				state.pageTop,
				state.pageBottom,
				currentScrollY,
				vh,
				docHeight
			);
			var inZone = isInZone( overlap, state.pageHeight, state.inZone );

			// Off-screen reset.
			//
			// When the element fully exits the viewport at the BOTTOM
			// (user scrolled UP past it), reset trigger classes so the
			// next forward enter plays from the initial-hide state.
			// Without this, an element that has been
			// entered → exited → reverse-played settles with
			// `mb-exit-triggered` + `--mb-direction: reverse` held by
			// `animation-fill-mode: both` at the keyframe's "from"
			// (natural / opacity 1). When the next forward enter
			// swaps `mb-exit-triggered` → `mb-triggered`, the new
			// keyframe binding (mbFadeIn etc.) snaps to opacity 0
			// via its `from` state, producing a visible flash before
			// the entry animation runs.
			//
			// Doing the reset only when fully off-screen ensures the
			// snap-to-opacity-0 is invisible to the user. Top-exit
			// (scroll-down past) is left alone so the forward exit
			// animation keeps its held state — that one's needed for
			// the round-trip onEnterBack reverse-play.
			var inViewport =
				state.pageBottom > viewportTop &&
				state.pageTop < viewportBottom;
			// Off-screen cleanup defense-in-depth.
			//
			// `handleSlotLeaveBack` (Entry Replay = 'repeat' branch)
			// already resets at the trigger-zone bottom-edge crossing,
			// so most blocks won't need this. But the b667967 case
			// still applies for any state that didn't get reset there
			// — e.g., the user scrolls fast enough that the inZone
			// flip event was missed, or onLeaveBack fired in a state
			// where the Entry slot is empty but cleanup is still
			// desirable for downstream consistency.
			//
			// Gated on Entry Replay so `once` blocks (which want to
			// stay entered forever) aren't reset. A `once` block with
			// an Exit slot relies on this too: its reverse-played exit
			// state must survive off-screen so handleSlotEnter's once
			// guard can skip the Entry replay (GH #39). For empty Entry +
			// Exit Replay = 'reverse' (today's Exit-only default), the
			// reverse-played state is held by fill-mode; the next
			// forward leave detects wasReversed and force-restarts.
			// No reset needed there.
			if ( state.inViewport && ! inViewport ) {
				var exitedAtBottom = state.pageTop >= viewportBottom;
				var shouldCleanup =
					exitedAtBottom &&
					state.hasEntry &&
					state.entryReplay !== 'once';
				if ( shouldCleanup ) {
					state.el.classList.remove( 'mb-triggered' );
					state.el.classList.remove( 'mb-exit-triggered' );
					state.el.style.removeProperty( '--mb-direction' );
					// Reset inZone tracking so the next forward enter
					// is detected as a flip rather than a no-op.
					state.inZone = false;
				}
			}
			// Entry Replay 'once' + Exit, jumped back above the block.
			// A scroll that skips the zone on the way up (Home key, a
			// "back to top" link, an anchor) never fires onEnterBack, so
			// the block keeps its forward-played Exit — hidden — and the
			// next onEnter would have to replay the Entry to show it.
			// As soon as it's out of the zone on the low side (its top
			// below the zone's top, so it isn't leaving upwards), put it
			// back in its entered state instead: the same end state a
			// normal scroll back up produces. Not just "fully below the
			// screen": after a jump the block can sit visible near the
			// bottom of the screen, or just inside the zone short of
			// the overlap needed to enter, and the Entry would replay as
			// it scrolls in. A forward-played Exit can only be found there
			// after a jump, so the snap never interrupts a normal scroll.
			if (
				state.pageTop > zone.top &&
				! inZone &&
				state.hasEntry &&
				state.hasExit &&
				state.entryReplay === 'once' &&
				state.el.classList.contains( 'mb-exit-triggered' ) &&
				state.el.style.getPropertyValue( '--mb-direction' ) !==
					'reverse'
			) {
				state.el.classList.remove( 'mb-exit-triggered' );
				showEntered( state );
			}
			state.inViewport = inViewport;

			// The trigger decision (computed above, src/trigger-zone.js):
			// the zone is the middle 70% of the viewport, stretched to
			// the document edges at either end of the scroll range, and
			// an element is in it while any part of it overlaps it —
			// Entry when its top rises past the 85% line, Exit when its
			// bottom rises past the 15% line (GH #86). Entering needs a
			// few px of overlap so an edge resting on a line can't
			// flicker.
			//
			// This differs from IO's view of the same band, and that's
			// only safe because of the wake-ups: before the scroll
			// listener below existed, IO was the only wake-up, and "any
			// overlap" here (75d28ee) left IO settled while cached
			// bounds still said in-zone, so the Exit never fired. The
			// scroll listener now ticks every block on every scroll
			// frame and refreshAll() ticks them on every layout change.
			// Keep those two wake-ups.
			var triggerBottom = zone.bottom;
			if ( inZone === state.inZone ) {
				// No flip. Bbox-bounce IO callbacks land here and
				// silently no-op.
				return;
			}
			state.inZone = inZone;

			if ( inZone ) {
				// Capture BEFORE flipping hasEntered: a first-ever entry
				// must fire the Entry regardless of scroll direction.
				// onEnterBack semantics ("you've been here, reverse the
				// exit") only apply to a genuine RE-entry. Without this,
				// an element first seen from above — reload with scroll
				// restored below it, a hash-anchor landing, a jump link —
				// routes to handleSlotEnterBack, which is a no-op for the
				// Entry slot, and the element stays at its hidden "from"
				// state forever (GH #2).
				var firstEntry = ! state.hasEntered;
				state.hasEntered = true;
				if ( dir === 'up' && ! firstEntry ) {
					// onEnterBack — genuine re-entry from above; Exit
					// slot owns this.
					handleSlotEnterBack( state );
				} else {
					// onEnter — scroll-down enter, OR the first sighting
					// from any direction. Entry slot owns this.
					handleSlotEnter( state );
				}
			} else {
				// Forward-leave guard: skip if the element has
				// never been in-zone AND has no exit slot. Below-
				// the-fold blocks at page load shouldn't fire
				// exits. (Cached bounds make this guard simpler
				// than the IO version — no rootBounds inference.)
				if ( ! state.hasEntered && ! state.hasExit ) {
					return;
				}
				if ( ! state.hasEntered ) {
					// Exit-only block, never entered: only count
					// as having exited if the element is truly
					// above the trigger zone (page-relative). Below
					// the zone means we're still at page-load
					// initial state.
					if ( state.pageTop >= triggerBottom ) {
						return;
					}
					state.hasEntered = true;
				}
				// Leaving through the BOTTOM of the band means the block
				// moved down relative to it: the reader scrolled up, or
				// content above grew, or the page got taller below a block
				// near its end, which pulls the band's stretched bottom
				// edge back up (GH #23). Scrolling down can't do it (both
				// band edges move down with the scroll), so whatever the
				// last scroll direction was, this is onLeaveBack, never a
				// forward Exit on a block still on screen.
				if (
					state.pageBottom > zone.bottom &&
					state.pageTop > zone.top
				) {
					dir = 'up';
				}
				if ( dir === 'up' ) {
					// onLeaveBack — Entry slot owns this.
					handleSlotLeaveBack( state );
					return;
				}
				// onLeave — Exit slot owns this.
				handleSlotExit( state );
			}
		}

		/**
		 * Stop tracking a block: disconnect its observers and forget its
		 * state. Used when it leaves the document or is re-wired.
		 */
		function teardown( state ) {
			state.unobserved = true;
			if ( state.io ) {
				state.io.disconnect();
			}
			if ( state.ro ) {
				state.ro.disconnect();
			}
			var i = states.indexOf( state );
			if ( i !== -1 ) {
				states.splice( i, 1 );
			}
			if ( stateByEl.get( state.el ) === state ) {
				stateByEl.delete( state.el );
			}
			if ( DEBUG ) {
				var j = debugApi.scrollAppear.indexOf( state );
				if ( j !== -1 ) {
					debugApi.scrollAppear.splice( j, 1 );
				}
			}
		}

		/**
		 * Drop the states of blocks no longer in the document. Their
		 * `mb-wired` class goes too, so a block that's put back later
		 * (a modal or popup re-attaching its content) is wired again.
		 */
		function prune() {
			states.slice().forEach( function ( state ) {
				if ( ! state.el.isConnected ) {
					teardown( state );
					liveWired.delete( state.el );
					state.el.classList.remove( WIRED_CLASS );
				}
			} );
		}

		/** Forget `el`'s state, if it has one (see release()). */
		function releaseEl( el ) {
			if ( stateByEl.has( el ) ) {
				teardown( stateByEl.get( el ) );
			}
		}

		function add( el ) {
			var entry = readSlotConfig( el, 'entry' );
			var exit = readSlotConfig( el, 'exit' );
			var hasEntry = entry.type !== '';
			var hasExit = exit.type !== '';
			if ( ! hasEntry && ! hasExit ) {
				return;
			}
			if ( stateByEl.has( el ) ) {
				teardown( stateByEl.get( el ) );
			}
			markWired( el );

			// Read per-slot Replay attrs. The render filter always emits
			// them for filled slots; the fallbacks match the schema
			// defaults (Entry `once`, Exit `reverse`).
			var entryReplay = el.dataset.mbEntryReplay || 'once';
			var exitReplay = el.dataset.mbExitReplay || 'reverse';

			// Apply baseline direction / blur / rotate / custom-keyframe
			// setup. Per-slot timing is applied on each transition.
			applyCustomKeyframe( el );
			applyBlurProps( el );
			applyRotateProps( el );

			var state = {
				el: el,
				entry: entry,
				exit: exit,
				hasEntry: hasEntry,
				hasExit: hasExit,
				entryReplay: entryReplay,
				exitReplay: exitReplay,
				inZone: false,
				inViewport: false,
				hasEntered: false,
				// How many times the Entry has played (read by the
				// self-check: Entry Replay 'once' must stay at 1).
				entryPlays: 0,
				// Date.now() until which a forward Exit is still waiting
				// out its Delay (0 when none is pending). Read by
				// handleSlotEnterBack to cancel rather than reverse it.
				exitPendingUntil: 0,
				unobserved: false,
				pageTop: 0,
				pageBottom: 0,
				pageHeight: 0,
				io: null,
				ro: null,
			};
			refreshBounds( state );

			// Per-element ResizeObserver to catch layout changes
			// (image / font load, theme reflow). Transforms don't
			// trigger ResizeObserver since they don't affect layout,
			// so this is animation-safe.
			if ( typeof ResizeObserver !== 'undefined' ) {
				var ro = new ResizeObserver( function () {
					refreshBounds( state );
					tick( state );
				} );
				ro.observe( el );
				state.ro = ro;
			}

			// IO as the wake-up signal. Same threshold + rootMargin
			// the previous implementation used so the wake-up fires
			// at the right moments. The callback delegates to tick(),
			// which makes the actual trigger decision against cached
			// bounds. IO will also fire spuriously from bbox-bounce
			// during animations — tick() silently no-ops those.
			var io = new IntersectionObserver(
				function () {
					tick( state );
				},
				{
					// Wakes on first and last contact with the band,
					// which is where tick()'s rule flips (GH #86).
					threshold: 0,
					rootMargin: '-15% 0px -15% 0px',
				}
			);
			state.io = io;
			io.observe( el );

			states.push( state );
			stateByEl.set( el, state );
			if ( DEBUG ) {
				debugApi.scrollAppear.push( state );
			}
		}

		// Recompute every element's cached bounds, then re-tick. Shared
		// by resize and the late-layout refreshes below. These are layout
		// changes, not scrolls, so a block that moved picks its handler
		// from which way it moved rather than from the last scroll
		// direction (see tick()'s `layoutDir`). A block that didn't move
		// (e.g. only the viewport resized) keeps the scroll direction.
		function refreshAll() {
			docHeight = readDocHeight();
			drawTriggerLines();
			states.forEach( function ( state ) {
				var prevTop = state.pageTop;
				refreshBounds( state );
				var layoutDir = null;
				if ( state.pageTop > prevTop ) {
					layoutDir = 'up';
				} else if ( state.pageTop < prevTop ) {
					layoutDir = 'down';
				}
				tick( state, layoutDir );
			} );
		}

		// Window resize: viewport-height change affects the trigger
		// zone calculation, so re-evaluate all states. Per-element
		// ResizeObserver above catches element-level changes; this
		// catches viewport-level changes. Debounced because resize
		// fires rapidly during window drag.
		var resizeTimer = null;
		window.addEventListener( 'resize', function () {
			if ( resizeTimer ) {
				clearTimeout( resizeTimer );
			}
			resizeTimer = setTimeout( refreshAll, 100 );
		} );

		// Late-layout bounds refresh. Cached offsetTop is captured at
		// init (DOMContentLoaded), but content ABOVE a block can shift it
		// down afterwards — images without intrinsic size finishing load,
		// web fonts swapping in, theme reflow. The element's own
		// ResizeObserver only catches changes to its OWN box, not to
		// siblings above it, so without this the trigger would fire at a
		// stale scroll position. Same idea as GSAP ScrollTrigger.refresh()
		// on load. tick()'s flip guard makes the extra passes cheap
		// no-ops when nothing actually moved.
		if ( document.readyState === 'complete' ) {
			refreshAll();
		} else {
			window.addEventListener( 'load', refreshAll );
		}
		if ( document.fonts && document.fonts.ready ) {
			document.fonts.ready.then( refreshAll );
		}

		// Content above a block changing height after load — a Details
		// block opened or closed, an accordion, a late embed — moves the
		// block without resizing it, so its own ResizeObserver stays
		// quiet and the cached bounds go stale: the block fades in
		// hundreds of pixels early or late, or sits on screen hidden
		// (GH #52). Such a change resizes the body, so observe that too.
		// Transforms don't resize the body, so this stays animation-safe;
		// rAF-throttled so a burst of changes refreshes once per frame.
		if ( typeof ResizeObserver !== 'undefined' && document.body ) {
			var bodyResizeScheduled = false;
			new ResizeObserver( function () {
				if ( bodyResizeScheduled ) {
					return;
				}
				bodyResizeScheduled = true;
				requestAnimationFrame( function () {
					bodyResizeScheduled = false;
					refreshAll();
				} );
			} ).observe( document.body );
		}

		// Scroll listener safety net.
		//
		// IO is the efficient primary wake-up, but it has a known
		// failure mode with animated elements: when a bbox-changing
		// animation (rotate, scale) runs, the transformed AABB can
		// leave IO settled in the "wrong" intersection state by the
		// time the animation completes. If the user then scrolls back
		// without crossing IO's threshold from the settled state's
		// perspective, no IO callback fires and tick() never runs —
		// onEnterBack (reverse-play of the exit) never dispatches.
		//
		// The scroll listener catches these missed wake-ups. It's
		// rAF-throttled (one tick per frame max) so the cost is
		// bounded even on long pages with many animated blocks. The
		// tick() function's `inZone === state.inZone` short-circuit
		// makes redundant calls (when IO already fired for this same
		// frame) cheap no-ops.
		var scrollScheduled = false;
		window.addEventListener(
			'scroll',
			function () {
				if ( scrollScheduled ) {
					return;
				}
				scrollScheduled = true;
				requestAnimationFrame( function () {
					scrollScheduled = false;
					docHeight = readDocHeight();
					drawTriggerLines();
					// Not `forEach( tick )`: the index would land in
					// tick()'s `layoutDir` and override the direction.
					states.forEach( function ( state ) {
						tick( state );
					} );
				} );
			},
			{ passive: true }
		);

		return {
			add: add,
			release: releaseEl,
			refreshAll: refreshAll,
			prune: prune,
		};
	}

	/**
	 * Debug overlay: the two Scroll Appear trigger lines, like GSAP's
	 * `markers`. A block's Entry plays when its top passes the lower
	 * line and its Exit plays when its bottom passes the upper one
	 * (src/trigger-zone.js, GH #86). The lines follow zoneBounds(), so
	 * they also show the band stretching to the page edges at the top
	 * and bottom of the scroll range. Only created on pages with a
	 * Scroll Appear block, and only when the admin setting is on.
	 *
	 * @return {{update: Function}} Call update( docHeight ) to redraw.
	 */
	function createTriggerLines() {
		var style = document.createElement( 'style' );
		style.textContent =
			'.mb-trigger-line{position:fixed;left:0;right:0;height:0;' +
			'z-index:2147483646;pointer-events:none;' +
			'border-top:1px dashed var(--mb-line-color);}' +
			'.mb-trigger-line span{position:absolute;right:8px;' +
			'padding:2px 6px;border-radius:3px;color:#fff;' +
			'background:var(--mb-line-color);white-space:nowrap;' +
			'font:600 11px/1.4 -apple-system,BlinkMacSystemFont,' +
			'"Segoe UI",Roboto,sans-serif;}' +
			'.mb-trigger-line--entry{--mb-line-color:#0a8a3f;}' +
			'.mb-trigger-line--entry span{bottom:2px;}' +
			'.mb-trigger-line--exit{--mb-line-color:#c0392b;}' +
			'.mb-trigger-line--exit span{top:2px;}';
		document.head.appendChild( style );

		function makeLine( modifier, text ) {
			var line = document.createElement( 'div' );
			line.className = 'mb-trigger-line mb-trigger-line--' + modifier;
			line.setAttribute( 'aria-hidden', 'true' );
			var label = document.createElement( 'span' );
			label.textContent = text;
			line.appendChild( label );
			document.body.appendChild( line );
			return line;
		}

		var entry = makeLine( 'entry', 'Motion Blocks • Entry trigger' );
		var exit = makeLine( 'exit', 'Motion Blocks • Exit trigger' );

		return {
			update: function ( docHeight ) {
				var scrollY = window.scrollY;
				var zone = zoneBounds( scrollY, window.innerHeight, docHeight );
				entry.style.top = zone.bottom - scrollY + 'px';
				exit.style.top = zone.top - scrollY + 'px';
			},
		};
	}

	/**
	 * Read a slot's config from the element's data attributes. Returns
	 * an object even when the slot is empty (type === '').
	 *
	 * Omitted timing / blur / rotate values resolve to that slot's own
	 * schema defaults (SLOT_DEFAULTS): PHP leaves default-valued attrs
	 * out of the markup, and the editor preview resolves them the same
	 * way. Present dataset values are non-empty strings (even "0"), so
	 * `||` only falls back when the attr is absent.
	 */
	function readSlotConfig( el, slot ) {
		var prefix = slot === 'entry' ? 'mbEntry' : 'mbExit';
		var defaults = SLOT_DEFAULTS[ slot ];
		return {
			slot: slot,
			type: el.dataset[ prefix + 'Type' ] || '',
			direction: el.dataset[ prefix + 'Direction' ] || '',
			duration: el.dataset[ prefix + 'Duration' ] || defaults.duration,
			delay: el.dataset[ prefix + 'Delay' ] || defaults.delay,
			acceleration:
				el.dataset[ prefix + 'Acceleration' ] || defaults.acceleration,
			blurAmount:
				el.dataset[ prefix + 'BlurAmount' ] || defaults.blurAmount,
			rotateAngle:
				el.dataset[ prefix + 'RotateAngle' ] || defaults.rotateAngle,
		};
	}

	/**
	 * Apply the slot's per-property CSS custom properties to the
	 * element. Sets shared `--mb-duration` / `--mb-delay` /
	 * `--mb-timing` / `--mb-blur-amount` / `--mb-rotate-angle` so the
	 * existing CSS animation rules (which read these names) consume
	 * the right values for the current phase.
	 *
	 * Every variable is written on every call, so a slot never inherits
	 * the values the other slot left on the element (GH #45). No
	 * truthiness guards: a resolved default delay can be the number 0.
	 */
	function applySlotVars( el, slotConfig ) {
		el.style.setProperty( '--mb-duration', slotConfig.duration + 's' );
		el.style.setProperty( '--mb-delay', slotConfig.delay + 's' );
		el.style.setProperty( '--mb-timing', slotConfig.acceleration );
		el.style.setProperty(
			'--mb-blur-amount',
			slotConfig.blurAmount + 'px'
		);
		el.style.setProperty(
			'--mb-rotate-angle',
			slotConfig.rotateAngle + 'deg'
		);
		applyDirectionProps( el, slotConfig.type, slotConfig.direction );
	}

	/**
	 * Restart a CSS animation by toggling the class that binds it.
	 * Reading `offsetWidth` between remove and add forces a layout
	 * flush so the browser treats the next class application as a
	 * brand-new animation cycle rather than a continuation. Painting
	 * happens at the next frame boundary, so the brief class-less
	 * intermediate state doesn't flash visually.
	 */
	function restartAnimation( el, className ) {
		el.classList.remove( className );
		void el.offsetWidth;
		el.classList.add( className );
	}

	/**
	 * Add `.mb-settled` once the block's own animations have finished,
	 * which drops their filled last frame (GH #20, see settle.js and the
	 * Settled State rules in animations.css). That frame is a resolved
	 * identity — `matrix(1, 0, 0, 1, 0, 0)`, `blur(0px)`,
	 * `inset(0 0 0 0)` — not `none`, so it kept `position: fixed`
	 * descendants (a Navigation overlay) trapped inside the block.
	 *
	 * Only call this for a block that will never animate again:
	 * removing `.mb-settled` would replay the animation. Blocks whose
	 * last frame isn't their natural look (Out presets, Image Move /
	 * Zoom, Custom ending elsewhere) are left alone, or they would snap
	 * back. Only the block's own targets and `mb*` animations count, so
	 * a nested animated block or core's own animations (the Navigation
	 * overlay's fade-in) never settle it early.
	 *
	 * Browsers without `getAnimations()` never settle (the old
	 * behaviour).
	 *
	 * @param {Element} el       Block wrapper.
	 * @param {string}  type     Effect type that plays.
	 * @param {string}  toPrefix Dataset prefix of its Custom To values.
	 */
	function settleWhenFinished( el, type, toPrefix ) {
		cancelSettle( el );
		if (
			typeof el.getAnimations !== 'function' ||
			! endsAtRest( type, el.dataset, toPrefix )
		) {
			return;
		}
		var targets = settleTargets( el );
		if ( ! targets ) {
			return;
		}
		function isOurs( name ) {
			return typeof name === 'string' && /^mb/.test( name );
		}
		function onFinish( e ) {
			if (
				targets.indexOf( e.target ) === -1 ||
				! isOurs( e.animationName )
			) {
				return;
			}
			for ( var i = 0; i < targets.length; i++ ) {
				var running = targets[ i ]
					.getAnimations()
					.some( function ( anim ) {
						return (
							isOurs( anim.animationName ) &&
							anim.playState !== 'finished'
						);
					} );
				if ( running ) {
					// Stagger: wait for the last child.
					return;
				}
			}
			cancelSettle( el );
			el.classList.add( 'mb-settled' );
		}
		el.addEventListener( 'animationend', onFinish );
		el.addEventListener( 'animationcancel', onFinish );
		settleListeners.set( el, onFinish );
	}

	/**
	 * Stop waiting to settle `el`. A re-wired block (GH #50) may come
	 * back in a mode that animates again, so an earlier wiring's
	 * listener must not settle it.
	 */
	function cancelSettle( el ) {
		var onFinish = settleListeners.get( el );
		if ( onFinish ) {
			el.removeEventListener( 'animationend', onFinish );
			el.removeEventListener( 'animationcancel', onFinish );
			settleListeners.delete( el );
		}
	}

	/**
	 * Put a Scroll Appear block straight into its entered state without
	 * playing the Entry: bind the Entry keyframe via `mb-triggered`,
	 * then jump its animations (the wrapper's, plus staggered children
	 * or an img-target image) to their end, which fill-mode holds at
	 * the natural state. Nested animated blocks are left alone.
	 *
	 * Browsers without `getAnimations()` replay the Entry instead,
	 * which still ends visible.
	 */
	function showEntered( state ) {
		var el = state.el;
		applySlotVars( el, state.entry );
		el.style.setProperty( '--mb-direction', 'normal' );
		el.classList.add( 'mb-triggered' );
		if ( typeof el.getAnimations !== 'function' ) {
			return;
		}
		el.getAnimations( { subtree: true } ).forEach( function ( anim ) {
			var target = anim.effect && anim.effect.target;
			if ( ! target || target.closest( '.mb-animated' ) !== el ) {
				return;
			}
			try {
				anim.finish();
			} catch ( e ) {
				// Infinite iteration count: can't finish, leave it running.
			}
		} );
	}

	/**
	 * Slot ownership of the four GSAP-style positions:
	 *
	 *   onEnter     — Entry slot, bottom edge (element enters from below)
	 *   onLeaveBack — Entry slot, bottom edge (element leaves at bottom, scrolling up)
	 *   onLeave     — Exit slot,  top edge    (element exits at top, scrolling down)
	 *   onEnterBack — Exit slot,  top edge    (element re-enters from above)
	 *
	 * Each slot's Replay option (`once` | `repeat` | `reverse`)
	 * configures its TWO edge events. The forward-direction event
	 * (onEnter for Entry, onLeave for Exit) always fires the slot's
	 * animation forward; Replay only affects what happens at the
	 * back-direction event of the same edge.
	 */

	/**
	 * onEnter — Entry slot fires forward.
	 *
	 * Idempotent: if the element is already in the desired entry-
	 * triggered terminal state, do nothing. Geometry-changing
	 * animations (rotate, scale, slide) shift the bbox mid-animation;
	 * the guard keeps redundant IO events silent.
	 *
	 * Entry Replay 'once' + an Exit slot never replays the Entry: the
	 * block resumes from the reverse-played Exit instead (GH #39).
	 */
	function handleSlotEnter( state ) {
		if ( state.entry.type === '' ) {
			// Entry slot empty (Exit-only block). Nothing to fire here.
			return;
		}

		var el = state.el;
		var inExited = el.classList.contains( 'mb-exit-triggered' );
		var inTriggered = el.classList.contains( 'mb-triggered' );
		var wasReversed =
			el.style.getPropertyValue( '--mb-direction' ) === 'reverse';

		// Already forward-entered — skip redundant fire. EXCEPT when the
		// element is mid-reverse (Entry 'reverse' played at the bottom
		// edge and we scrolled back down before it cleared off-screen);
		// there we restart it forward so the cycle resumes cleanly.
		if ( inTriggered && ! inExited && ! wasReversed ) {
			return;
		}

		// Entry Replay = 'once' with an Exit slot: the block stays
		// observed (see below) but the Entry never replays. After an
		// Exit round-trip the reverse-played exit holds the block at its
		// natural, visible state, so re-entering from below leaves it
		// alone (restarting mb-triggered would snap it to the Entry's
		// hidden "from" and fade it in again). Any other state (exit
		// played forward and then jumped past, or classes cleared by
		// Exit Replay 'repeat') falls through, so the block is never
		// left invisible in the zone.
		if ( state.entryReplay === 'once' && inExited && wasReversed ) {
			return;
		}

		state.entryPlays++;
		applySlotVars( el, state.entry );
		el.style.setProperty( '--mb-direction', 'normal' );
		el.classList.remove( 'mb-exit-triggered' );
		if ( wasReversed ) {
			restartAnimation( el, 'mb-triggered' );
		} else {
			el.classList.add( 'mb-triggered' );
		}

		// Entry Replay = 'once' with no Exit slot: nothing else can ever
		// play, so stop observing. With an Exit slot the block stays
		// observed so onLeave / onEnterBack still fire (GH #39); the
		// guard above keeps the Entry from replaying.
		if ( isOneShotScrollAppear( state.entryReplay, state.hasExit ) ) {
			state.unobserved = true;
			if ( state.io ) {
				state.io.unobserve( el );
			}
			// Nothing can replay it either, so once the Entry finishes
			// drop its filled last frame (GH #20).
			settleWhenFinished( el, state.entry.type, 'mbEntryTo' );
		}
	}

	/**
	 * onEnterBack — element RE-enters the trigger zone from the top
	 * while user is scrolling up. Only reached for elements that have
	 * entered before: tick() routes a first-ever entry to
	 * handleSlotEnter regardless of direction, so this handler never
	 * has to invent a "reverse" for an animation that hasn't played.
	 * Both slots can have configured behavior here:
	 *
	 *   - When Exit slot is filled, Exit's Replay option wins (it's the
	 *     most-recently-forward-played animation, so reversing it
	 *     produces the smoothest visual round-trip).
	 *   - When Exit slot is empty, Entry's Replay option drives.
	 *
	 * Per-slot action mapping:
	 *
	 *   Exit Replay:
	 *     'once':    no-op
	 *     'repeat':  clear exit state — element snap-returns to natural
	 *     'reverse': reverse-play exit keyframe (smooth round-trip)
	 *
	 *   Entry Replay (Exit slot empty): no-op for every mode. Entry
	 *     never re-fires at onEnterBack — its per-mode action (reset for
	 *     'repeat', reverse-play for 'reverse') happens at the bottom
	 *     edge (onLeaveBack) / off-screen instead.
	 */
	function handleSlotEnterBack( state ) {
		var el = state.el;

		if ( state.hasExit ) {
			// Exit slot wins at onEnterBack.
			var inExited = el.classList.contains( 'mb-exit-triggered' );

			if ( state.exitReplay === 'once' ) {
				return;
			}
			if ( state.exitReplay === 'repeat' ) {
				if ( inExited ) {
					el.classList.remove( 'mb-exit-triggered' );
					el.style.removeProperty( '--mb-direction' );
					// With an Entry slot, a class-less block matches the
					// Scroll Appear initial-hide rule and would sit blank
					// in the zone. Snap it back to its entered state
					// instead (GH #39 follow-up).
					if ( state.hasEntry ) {
						showEntered( state );
					}
				}
				return;
			}
			// 'reverse' — reverse-play exit.
			if ( ! inExited ) {
				return;
			}
			var alreadyReversedExit =
				el.style.getPropertyValue( '--mb-direction' ) === 'reverse';
			if ( alreadyReversedExit ) {
				return;
			}
			// The forward Exit is still waiting out its Delay, so the
			// block never visibly left. Reverse-playing it with no delay
			// would start at the Exit's end frame: the block would snap
			// to hidden and fade back in. Cancel it instead, the way the
			// 'repeat' branch above does.
			if ( Date.now() < state.exitPendingUntil ) {
				state.exitPendingUntil = 0;
				el.classList.remove( 'mb-exit-triggered' );
				el.style.removeProperty( '--mb-direction' );
				if ( state.hasEntry ) {
					showEntered( state );
				}
				return;
			}
			// The reverse round trip doesn't wait on the Exit Delay, so
			// content comes back promptly (GH #33). One write covers the
			// wrapper, Stagger children (inherited) and the img target;
			// handleSlotExit restores the Delay through applySlotVars on
			// the next forward leave.
			el.style.setProperty( '--mb-delay', '0s' );
			el.style.setProperty( '--mb-direction', 'reverse' );
			restartAnimation( el, 'mb-exit-triggered' );
			return;
		}

		// Exit slot empty — the Entry slot does nothing at onEnterBack.
		// Every Entry Replay mode is "play none none X": scrolling back
		// UP into the element never re-fires it. The per-mode action
		// (reset for 'repeat', reverse-play for 'reverse') happens at the
		// bottom edge instead — see handleSlotLeaveBack.
	}

	/**
	 * onLeave — Exit slot fires forward.
	 *
	 * If Exit slot is empty, behavior falls back to Entry Replay rules
	 * (the forward leave at the top edge is owned by Exit, but when
	 * Exit is empty there's nothing animation-wise to do; the element
	 * just scrolls off in whatever state it was in).
	 *
	 * Idempotent in the same way as handleSlotEnter.
	 */
	function handleSlotExit( state ) {
		var el = state.el;
		if ( state.exit.type === '' ) {
			// Exit-empty + Entry slot filled. Element scrolls past
			// the top in its entered state. No-op — the next forward
			// enter (handleSlotEnter idempotency) handles re-fire if
			// needed.
			return;
		}

		var inExited = el.classList.contains( 'mb-exit-triggered' );
		var wasReversed =
			el.style.getPropertyValue( '--mb-direction' ) === 'reverse';

		// Already in forward-played exit state. Skip redundant fire.
		if ( inExited && ! wasReversed ) {
			return;
		}

		applySlotVars( el, state.exit );
		el.style.setProperty( '--mb-direction', 'normal' );
		state.exitPendingUntil =
			Date.now() + ( parseFloat( state.exit.delay ) || 0 ) * 1000;
		el.classList.remove( 'mb-triggered' );

		if ( inExited ) {
			// Coming from a reverse-played state (Exit Replay =
			// 'reverse' round-trip going forward again). Force restart
			// so the keyframe replays forward.
			restartAnimation( el, 'mb-exit-triggered' );
		} else {
			// First forward exit since most recent entry/reset.
			el.classList.add( 'mb-exit-triggered' );
		}

		// Exit Replay = 'once': fire once and stop observing.
		if ( state.exitReplay === 'once' ) {
			state.unobserved = true;
			if ( state.io ) {
				state.io.unobserve( el );
			}
		}
	}

	/**
	 * onLeaveBack — element scrolls off the bottom of the viewport
	 * while user is going up. Generic cleanup so the next forward
	 * enter starts from a clean state:
	 *
	 *   - If Entry Replay = 'once': skip (preserve the entered state,
	 *     since the user wants this block to stay animated forever).
	 *   - Otherwise: reset all trigger classes and `--mb-direction`.
	 *     This is the b667967 cleanup, now triggered at the trigger-
	 *     zone bottom-edge crossing rather than the full-viewport
	 *     boundary. Most users won't see the snap because the element
	 *     is mostly off-screen at this point.
	 */
	function handleSlotLeaveBack( state ) {
		// Fires at the trigger-zone bottom edge while scrolling up — the
		// element is leaving at the bottom of the viewport. Entry-owned.
		//
		//   'once':    no-op (stays entered forever, or holds the
		//              reverse-played Exit when an Exit slot is filled).
		//   'repeat':  no-op here. Clearing the trigger classes at this
		//              edge would snap the element to its hidden state
		//              while still partly on-screen (a visible flash);
		//              the reset happens off-screen instead, via the
		//              tick() cleanup (gated on entryReplay !== 'once').
		//   'reverse': play the entry keyframe BACKWARD so the element
		//              animates out as it leaves the bottom of the
		//              viewport (GSAP "play none none reverse"). The
		//              tick() off-screen cleanup then clears it so the
		//              next onEnter replays forward.
		if ( state.entryReplay !== 'reverse' || ! state.hasEntry ) {
			return;
		}
		// With an Exit slot present, onLeave already drove the Exit
		// animation forward — don't override it with an entry reverse.
		if ( state.hasExit ) {
			return;
		}
		var el = state.el;
		if (
			el.style.getPropertyValue( '--mb-direction' ) === 'reverse'
		) {
			return; // already reversing
		}
		applySlotVars( el, state.entry );
		el.style.setProperty( '--mb-direction', 'reverse' );
		el.classList.remove( 'mb-exit-triggered' );
		restartAnimation( el, 'mb-triggered' );
	}

	/* ---------------------------------------------------------------
	 * 3. Interactive Scroll Animations
	 * ------------------------------------------------------------- */

	function wireScrollInteractive( el ) {
		markWired( el );
		var type = el.dataset.mbType;

		applyDirectionProps(
			el,
			type,
			el.dataset.mbDirection
		);
		applyBlurProps( el );
		applyRotateProps( el );
		applyCustomKeyframe( el );

		// Apply acceleration (timing function).
		var acceleration = el.dataset.mbAcceleration;
		if ( acceleration ) {
			el.style.setProperty( '--mb-timing', acceleration );
		}

		// Apply scroll-driven animation to container. Set both
		// inline animation props (so the figure itself animates)
		// AND CSS custom properties (so img-target blocks can
		// read the custom range via inheritance — the img's
		// scoped CSS rule consumes `var(--mb-range-start)`,
		// which doesn't propagate from inline `animation-range-*`
		// declarations on the parent).
		var rangeStart = el.dataset.mbRangeStart || 'entry 0%';
		var rangeEnd = el.dataset.mbRangeEnd || 'exit 100%';
		el.style.animationTimeline = 'view()';
		el.style.animationRangeStart = rangeStart;
		el.style.animationRangeEnd = rangeEnd;
		el.style.setProperty( '--mb-range-start', rangeStart );
		el.style.setProperty( '--mb-range-end', rangeEnd );
	}

	/* ---------------------------------------------------------------
	 * Initialise
	 * ------------------------------------------------------------- */

	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', init );
	} else {
		init();
	}
} )();
