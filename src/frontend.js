/**
 * Motion Blocks — Frontend Script
 *
 * Handles three animation modes:
 *   1. Page load — immediate trigger with optional repeat & pause-offscreen.
 *   2. Scroll in view — Intersection Observer trigger with optional replay.
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
	 * Helpers
	 * ------------------------------------------------------------- */

	/**
	 * Apply CSS custom properties for duration and delay from data attributes.
	 */
	function applyTimingProps( el ) {
		var duration = el.dataset.mbDuration;
		var delay = el.dataset.mbDelay;

		if ( duration ) {
			el.style.setProperty( '--mb-duration', duration + 's' );
		}
		if ( delay ) {
			el.style.setProperty( '--mb-delay', delay + 's' );
		}
	}

	/* ---------------------------------------------------------------
	 * 1. Page Load Animations
	 * ------------------------------------------------------------- */

	function initPageLoadAnimations() {
		var elements = document.querySelectorAll(
			'.mb-mode-page-load'
		);

		elements.forEach( function ( el ) {
			applyTimingProps( el );

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
	 * Uses threshold 0 so even a sliver of the element keeps it playing.
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
	 * ------------------------------------------------------------- */

	function initScrollAppearAnimations() {
		var elements = document.querySelectorAll(
			'.mb-mode-scroll-appear'
		);

		if ( ! elements.length ) {
			return;
		}

		var observer = new IntersectionObserver(
			function ( entries ) {
				entries.forEach( function ( entry ) {
					var el = entry.target;
					var playOnce = el.dataset.mbPlayOnce !== 'false';

					if ( entry.isIntersecting ) {
						applyTimingProps( el );
						el.classList.add( 'mb-triggered' );

						if ( playOnce ) {
							observer.unobserve( el );
						}
					} else if ( ! playOnce ) {
						// Re-hide so animation replays on next scroll into view.
						el.classList.remove( 'mb-triggered' );
					}
				} );
			},
			{
				threshold: 0.1,
				rootMargin: '0px 0px -50px 0px',
			}
		);

		elements.forEach( function ( el ) {
			observer.observe( el );
		} );
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
			// Apply scroll-driven animation properties.
			// Gracefully does nothing on unsupported browsers — the element
			// stays visible with no animation.
			el.style.animationTimeline = 'view()';
			el.style.animationRangeStart =
				el.dataset.mbRangeStart || 'cover 0%';
			el.style.animationRangeEnd =
				el.dataset.mbRangeEnd || 'cover 100%';
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
