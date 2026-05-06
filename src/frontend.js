/**
 * Motion Blocks — Frontend Script
 *
 * Handles three animation modes:
 *   1. Page load — immediate trigger with optional repeat & pause-offscreen.
 *   2. Scroll in view — Intersection Observer with enter/exit/both support.
 *   3. Interactive scroll — CSS scroll-driven animations (view-timeline).
 */

( function () {
	'use strict';

	function init() {
		initPageLoadAnimations();
		initScrollAppearAnimations();
		initScrollInteractiveAnimations();
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
	};

	/* Exit keyframe map — mirrors EXIT_KEYFRAME_MAP from constants.js */
	var EXIT_KEYFRAME_FOR = {
		fade: 'mbFadeOut',
		slide: 'mbSlideOut',
		wipe: 'mbWipeOut',
		curtain: 'mbCurtainClose',
		flip: 'mbFadeOut',
		scale: 'mbScaleOut',
		blur: 'mbBlurOut',
		rotate: 'mbRotateOut',
	};

	/* Exit class map — derives from enter type */
	var EXIT_CLASS_FOR = {
		fade: 'mb-exit-fade',
		slide: 'mb-exit-slide',
		wipe: 'mb-exit-wipe',
		curtain: 'mb-exit-curtain',
		flip: 'mb-exit-fade',
		scale: 'mb-exit-scale',
		blur: 'mb-exit-blur',
		rotate: 'mb-exit-rotate',
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
	 * Apply exit timing CSS custom properties from data attributes.
	 */
	function applyExitTimingProps( el ) {
		var duration = el.dataset.mbExitDuration;
		var delay = el.dataset.mbExitDelay;
		var acceleration = el.dataset.mbExitAcceleration;

		if ( duration ) {
			el.style.setProperty( '--mb-exit-duration', duration + 's' );
		}
		if ( delay !== undefined ) {
			el.style.setProperty( '--mb-exit-delay', delay + 's' );
		}
		if ( acceleration ) {
			el.style.setProperty( '--mb-exit-timing', acceleration );
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
	 */
	function buildSideBody( el, sideKey ) {
		var bag = {};
		CUSTOM_PROPS.forEach( function ( p ) {
			var raw =
				el.dataset[ sideKey === 'from' ? p.dataFrom : p.dataTo ];
			if ( isAddedDatasetVal( raw ) ) {
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
					( hasTx ? bag.translateX : '0px' ) +
					', ' +
					( hasTy ? bag.translateY : '0px' ) +
					')'
			);
		}
		if ( bag.scale !== undefined ) {
			tx.push( 'scale(' + bag.scale + ')' );
		}
		if ( bag.rotate !== undefined ) {
			tx.push( 'rotate(' + bag.rotate + 'deg)' );
		}
		if ( bag.rotateX !== undefined ) {
			tx.push( 'rotateX(' + bag.rotateX + 'deg)' );
		}
		if ( bag.rotateY !== undefined ) {
			tx.push( 'rotateY(' + bag.rotateY + 'deg)' );
		}
		if ( tx.length > 0 ) {
			decls.push( 'transform: ' + tx.join( ' ' ) );
		}
		if ( bag.blur !== undefined ) {
			decls.push( 'filter: blur(' + bag.blur + 'px)' );
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
		// Descendant selector — works in editor (extra wrappers) and
		// frontend (direct figure child). `:first-of-type` filters
		// to the first img in its sibling group, so figcaption stays
		// unaffected.
		var imgSelector = scope + ' img:first-of-type';
		// Match both the wrapper itself (e.g. `<figure data-mb-uid>`)
		// and any descendant of the wrapper that directly holds the
		// img. The wrapper-self case is the common Image block path.
		var parentSelector = [
			scope + ':has(> img:first-of-type)',
			scope + ' :has(> img:first-of-type)',
		].join( ', ' );

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
			];
		}

		return [
			parentSelector + ' { overflow: clip; }',
			'@supports not (overflow: clip) { ' +
				parentSelector +
				' { overflow: hidden; } }',
			imgSelector + ' { ' + animProps.join( '; ' ) + '; }',
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
	 */
	function applyCustomKeyframe( el ) {
		var type = el.dataset.mbType;
		if ( type !== 'custom' && type !== 'image-move' ) {
			return;
		}
		var fromBody;
		var toBody;
		if ( type === 'image-move' ) {
			var sides = buildImageMoveSides(
				el.dataset.mbDirection || 'btt'
			);
			fromBody = sides.fromBody;
			toBody = sides.toBody;
		} else {
			fromBody = buildSideBody( el, 'from' );
			toBody = buildSideBody( el, 'to' );
		}
		if ( ! fromBody && ! toBody ) {
			return;
		}
		customKeyframeCounter += 1;
		var name = 'mb-custom-runtime-' + customKeyframeCounter;
		var lines = [ '@keyframes ' + name + ' {' ];
		if ( fromBody ) {
			lines.push( '  from { ' + fromBody + ' }' );
		}
		if ( toBody ) {
			lines.push( '  to { ' + toBody + ' }' );
		}
		lines.push( '}' );
		var styleEl = getCustomStyleEl();
		styleEl.appendChild( document.createTextNode( lines.join( '\n' ) ) );

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
			styleEl.appendChild( document.createTextNode( scopedCSS ) );
		} else {
			el.style.animationName = name;
		}
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

	function initPageLoadAnimations() {
		var elements = document.querySelectorAll( '.mb-mode-page-load' );

		elements.forEach( function ( el ) {
			applyTimingProps( el );
			applyDirectionProps(
				el,
				el.dataset.mbType,
				el.dataset.mbDirection
			);
			applyBlurProps( el );
			applyRotateProps( el );
			applyCustomKeyframe( el );

			// Handle repeat mode.
			var repeat = el.dataset.mbRepeat || 'once';

			if ( repeat === 'loop' ) {
				el.style.animationIterationCount = 'infinite';
				el.style.animationFillMode = 'none';
			} else if ( repeat === 'alternate' ) {
				el.style.animationIterationCount = 'infinite';
				el.style.animationDirection = 'alternate';
				el.style.animationFillMode = 'none';
			}

			// Trigger the animation.
			el.classList.add( 'mb-triggered' );

			// Pause off-screen (mainly useful for looping/alternating animations).
			if ( el.dataset.mbPauseOffscreen === 'true' ) {
				setupPauseOffscreen( el );
			}
		} );
	}

	/**
	 * Pause/resume animation based on element visibility.
	 */
	function setupPauseOffscreen( el ) {
		var observer = new IntersectionObserver(
			function ( entries ) {
				entries.forEach( function ( entry ) {
					el.style.animationPlayState = entry.isIntersecting
						? 'running'
						: 'paused';
				} );
			},
			{ threshold: 0 }
		);

		observer.observe( el );
	}

	/* ---------------------------------------------------------------
	 * 2. Scroll in View Animations
	 *
	 * Supports three trigger modes:
	 *   - enter: animate in when scrolled into view
	 *   - exit: animate out when scrolled out of view
	 *   - both: animate in on enter, animate out on exit
	 *     - mirror: exit is the reverse of enter
	 *     - custom: independent exit animation config
	 * ------------------------------------------------------------- */

	function initScrollAppearAnimations() {
		var elements = document.querySelectorAll( '.mb-mode-scroll-appear' );

		if ( ! elements.length ) {
			return;
		}

		elements.forEach( function ( el ) {
			var trigger = el.dataset.mbScrollTrigger || 'enter';
			var playOnce = el.dataset.mbPlayOnce !== 'false';
			var enterType = el.dataset.mbType;
			var enterDirection = el.dataset.mbDirection || '';
			var exitMode = el.dataset.mbExitMode || 'mirror';

			// Track whether the element has been seen at least once.
			// Prevents the IO's initial "not intersecting" callback
			// from firing the exit animation before any enter.
			var hasEntered = false;

			// Determine exit animation config.
			var exitType, exitDirection;
			if ( trigger === 'exit' || trigger === 'both' ) {
				if ( exitMode === 'custom' ) {
					exitType = el.dataset.mbExitType || 'fade';
					exitDirection = el.dataset.mbExitDirection || '';
				} else {
					// Mirror: exit type = enter type.
					exitType = enterType;
					exitDirection = enterDirection;
				}
			}

			// Apply enter direction props (used by enter keyframe).
			if ( trigger !== 'exit' ) {
				applyDirectionProps( el, enterType, enterDirection );
			}

			// Apply blur amount (used by blur keyframe).
			applyBlurProps( el );
			applyRotateProps( el );
			applyCustomKeyframe( el );

			var observer = new IntersectionObserver(
				function ( entries ) {
					entries.forEach( function ( entry ) {
						if ( entry.isIntersecting ) {
							hasEntered = true;
							handleScrollEnter(
								el,
								trigger,
								enterType,
								enterDirection,
								playOnce,
								observer
							);
						} else if ( hasEntered || trigger === 'exit' ) {
							// Only fire exit after the element has entered
							// at least once (or for exit-only mode where
							// the element starts visible).
							if ( trigger === 'exit' ) {
								hasEntered = true;
							}
							handleScrollExit(
								el,
								trigger,
								exitType,
								exitDirection,
								exitMode,
								playOnce,
								observer
							);
						}
					} );
				},
				{
					threshold: 0.1,
					rootMargin: '-15% 0px -15% 0px',
				}
			);

			observer.observe( el );
		} );
	}

	/**
	 * Handle entering the viewport.
	 */
	function handleScrollEnter(
		el,
		trigger,
		enterType,
		enterDirection,
		playOnce,
		observer
	) {
		if ( trigger === 'exit' ) {
			// Exit-only: re-entering viewport — remove exit state.
			el.classList.remove( 'mb-exit-triggered' );
			return;
		}

		// Re-apply enter direction props.
		applyDirectionProps( el, enterType, enterDirection );
		applyTimingProps( el );

		// Swap classes atomically — remove exit and add enter in the
		// same frame to avoid a flash of invisible content.
		el.classList.remove( 'mb-exit-triggered' );
		el.classList.add( 'mb-triggered' );

		if ( trigger === 'enter' && playOnce ) {
			observer.unobserve( el );
		}
	}

	/**
	 * Handle exiting the viewport.
	 */
	function handleScrollExit(
		el,
		trigger,
		exitType,
		exitDirection,
		exitMode,
		playOnce,
		observer
	) {
		if ( trigger === 'enter' ) {
			if ( ! playOnce ) {
				// Re-hide so animation replays on next scroll into view.
				el.classList.remove( 'mb-triggered' );
			}
			return;
		}

		// Apply exit direction props.
		applyDirectionProps( el, exitType, exitDirection );

		// Apply exit timing if custom.
		if ( exitMode === 'custom' ) {
			applyExitTimingProps( el );
		}

		// Swap classes atomically — remove enter and add exit in the
		// same frame to avoid a flash of invisible content.
		el.classList.remove( 'mb-triggered' );
		el.classList.add( 'mb-exit-triggered' );

		if ( playOnce ) {
			observer.unobserve( el );
		}
	}

	/* ---------------------------------------------------------------
	 * 3. Interactive Scroll Animations
	 * ------------------------------------------------------------- */

	function initScrollInteractiveAnimations() {
		var elements = document.querySelectorAll(
			'.mb-mode-scroll-interactive'
		);

		if ( ! elements.length ) {
			return;
		}

		elements.forEach( function ( el ) {
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

			// Apply scroll-driven animation to container.
			var rangeStart = el.dataset.mbRangeStart || 'entry 0%';
			var rangeEnd = el.dataset.mbRangeEnd || 'exit 100%';
			el.style.animationTimeline = 'view()';
			el.style.animationRangeStart = rangeStart;
			el.style.animationRangeEnd = rangeEnd;

		} );
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
