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
			ltr: { '--mb-slide-x': '-30px', '--mb-slide-y': '0' },
			rtl: { '--mb-slide-x': '30px', '--mb-slide-y': '0' },
			ttb: { '--mb-slide-x': '0', '--mb-slide-y': '-30px' },
			btt: { '--mb-slide-x': '0', '--mb-slide-y': '30px' },
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
			btt: { '--mb-scale-x': '0', '--mb-scale-y': '30px' },
			ttb: { '--mb-scale-x': '0', '--mb-scale-y': '-30px' },
			ltr: { '--mb-scale-x': '-30px', '--mb-scale-y': '0' },
			rtl: { '--mb-scale-x': '30px', '--mb-scale-y': '0' },
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

			// DEBUG: Add green/red border to visualise scroll progress.
			// Remove this block when done testing.
			var existingName = getComputedStyle( el ).animationName || 'none';
			el.style.animationName = existingName + ', mbDebugScroll';
			el.style.animationTimeline = 'view(), view()';
			el.style.animationRangeStart = rangeStart + ', ' + rangeStart;
			el.style.animationRangeEnd = rangeEnd + ', ' + rangeEnd;
			el.style.animationDuration = '1ms, 1ms';
			el.style.animationFillMode = 'both, forwards';
			el.style.animationTimingFunction = ( acceleration || 'ease' ) + ', linear';
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
