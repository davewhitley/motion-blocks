/**
 * Motion Blocks — Front-end self-check (developer tool, GH #60)
 *
 * Checks runtime invariants on the published page and reports anything
 * that would leave content stuck invisible or moving when it shouldn't.
 * Each check is written from a bug that shipped or was found in review.
 *
 * Only enqueued for logged-in users when the debug setting is on (see
 * motion_blocks_enqueue_block_assets), so visitors never load it. Reads
 * trigger state from `window.__motionBlocks`, which frontend.js exposes
 * in debug mode only.
 *
 * Output:
 *   - a badge in the bottom-left corner with the issue count; click it
 *     to list issues and outline the blocks involved
 *   - a collapsed console group whenever the set of issues changes
 *   - `window.motionBlocksSelfCheck()` returns the current issues;
 *     `motionBlocksSelfCheck( { sweep: true } )` scrolls through the
 *     whole page first and resolves with everything found. Fixture
 *     pages with expected results: tests/self-check/fixtures.php.
 */

( function () {
	'use strict';

	var ISSUE_URL = 'https://github.com/davewhitley/motion-blocks/issues/';

	// How long a block must sit on screen, hidden and untriggered,
	// before it counts as stuck. Longer than any Entry delay the panel
	// offers would make sense to wait through while scrolling.
	var STUCK_AFTER_MS = 1500;

	// animations.css only has :nth-child delay rules for this many
	// stagger children.
	var STAGGER_RULE_LIMIT = 30;

	/**
	 * The elements a stagger parent animates. Classic themes (and
	 * Groups saved before WordPress 5.9) wrap a Group's children in
	 * `.wp-block-group__inner-container`; animations.css skips that
	 * wrapper and staggers its children instead (GH #66).
	 *
	 * @param {Element} el Stagger parent.
	 * @return {HTMLCollection} Its staggered children.
	 */
	function staggerChildren( el ) {
		var inner = el.querySelector(
			':scope > .wp-block-group__inner-container'
		);
		return inner ? inner.children : el.children;
	}

	// Cap on descendants scanned per block for the fixed-position check.
	var FIXED_SCAN_LIMIT = 1500;

	var supportsViewTimeline =
		typeof CSS !== 'undefined' &&
		CSS.supports &&
		CSS.supports( 'animation-timeline: view()' );

	var reducedMotionQuery = window.matchMedia(
		'(prefers-reduced-motion: reduce)'
	);

	// Per-device disable breakpoints. Mirror the media queries in
	// animations.css ("Per-device disable").
	var DEVICE_QUERIES = {
		desktop: '(min-width: 1024px)',
		tablet: '(min-width: 768px) and (max-width: 1023px)',
		mobile: '(max-width: 767px)',
	};

	// Element → first time it was seen on screen, hidden and untriggered.
	var hiddenSince = new Map();
	var lastSignature = null;
	var current = [];
	// True while a sweep drives the scroll position; the regular
	// scroll-triggered runs stand down so they don't overwrite it.
	var sweeping = false;

	/* ---------------------------------------------------------------
	 * Helpers
	 * ------------------------------------------------------------- */

	/**
	 * Human name for a block: "Group", "Cover", "Media & Text"-ish from
	 * its `wp-block-*` class, falling back to the tag name.
	 */
	function blockLabel( el ) {
		for ( var i = 0; i < el.classList.length; i++ ) {
			var match = /^wp-block-([a-z0-9-]+)$/.exec( el.classList[ i ] );
			if ( match && match[ 1 ].indexOf( '__' ) === -1 ) {
				var name = match[ 1 ].replace( /-/g, ' ' );
				return name.charAt( 0 ).toUpperCase() + name.slice( 1 );
			}
		}
		return '<' + el.tagName.toLowerCase() + '>';
	}

	function isRendered( el ) {
		return (
			el.getClientRects().length > 0 &&
			getComputedStyle( el ).visibility !== 'hidden'
		);
	}

	/**
	 * Motion Blocks' own CSS animations: preset keyframes are `mb*`,
	 * runtime Custom keyframes are `mb-custom-runtime-*`. Theme or
	 * third-party animations inside a block are ignored.
	 */
	function isOurAnimation( animation ) {
		return (
			typeof animation.animationName === 'string' &&
			/^mb/i.test( animation.animationName )
		);
	}

	function ourAnimations( root ) {
		var list = root
			? root.getAnimations( { subtree: true } )
			: document.getAnimations();
		return list.filter( isOurAnimation );
	}

	function currentDevice() {
		for ( var device in DEVICE_QUERIES ) {
			if ( window.matchMedia( DEVICE_QUERIES[ device ] ).matches ) {
				return device;
			}
		}
		return null;
	}

	/**
	 * Reduced motion, or animations disabled for this page on this
	 * device: the CSS pins every block at rest, so nothing is hidden and
	 * nothing is expected to play.
	 */
	function motionIsOff() {
		var device = currentDevice();
		return (
			reducedMotionQuery.matches ||
			( !! device &&
				document.body.classList.contains( 'mb-disabled-' + device ) )
		);
	}

	function issue( id, severity, el, message, ref ) {
		return {
			id: id,
			severity: severity,
			element: el,
			block: blockLabel( el ),
			message: message,
			issue: ref || null,
		};
	}

	/* ---------------------------------------------------------------
	 * Checks
	 *
	 * Each returns an array of issues. `api` is window.__motionBlocks.
	 * ------------------------------------------------------------- */

	/**
	 * Nothing invisible on screen: a block that sits in the trigger zone
	 * for a while with no trigger class and opacity 0 is stuck.
	 */
	function checkInvisibleOnScreen( api, stuckAfterMs ) {
		var found = [];
		var now = performance.now();
		var vh = window.innerHeight;
		var seen = new Set();

		document.querySelectorAll( '.mb-animated' ).forEach( function ( el ) {
			var isScrollInteractive = el.classList.contains(
				'mb-mode-scroll-interactive'
			);
			// Scroll Interactive blocks are legitimately at opacity 0 at
			// some scroll positions; they only get stuck when the
			// browser can't drive them from scroll at all.
			if ( isScrollInteractive && supportsViewTimeline ) {
				return;
			}
			// A reverse-played Exit (Exit Replay = 'reverse', scrolling
			// back up) ends at the visible "from" state, so a block in
			// that state that is still hidden is stuck (GH #51).
			var reversedExit =
				el.classList.contains( 'mb-exit-triggered' ) &&
				el.style.getPropertyValue( '--mb-direction' ) === 'reverse';
			if (
				el.classList.contains( 'mb-triggered' ) ||
				( el.classList.contains( 'mb-exit-triggered' ) &&
					! reversedExit )
			) {
				return;
			}
			// Unwired blocks are reported by checkNeverWired instead.
			if ( ! api.wired.has( el ) || ! isRendered( el ) ) {
				return;
			}
			var rect = el.getBoundingClientRect();
			var onScreen =
				rect.height > 0 &&
				rect.top < vh * 0.85 &&
				rect.bottom > vh * 0.15;
			if ( ! onScreen ) {
				return;
			}
			// A stagger parent stays at opacity 1; its children carry
			// the hidden state.
			var target = el.classList.contains( 'mb-stagger-parent' )
				? staggerChildren( el )[ 0 ] || el
				: el;
			if ( getComputedStyle( target ).opacity !== '0' ) {
				return;
			}

			seen.add( el );
			if ( ! hiddenSince.has( el ) ) {
				hiddenSince.set( el, now );
			}
			if ( now - hiddenSince.get( el ) < stuckAfterMs ) {
				return;
			}
			found.push(
				isScrollInteractive
					? issue(
							'invisible-on-screen',
							'error',
							el,
							blockLabel( el ) +
								' is invisible: this browser can’t run scroll-linked animations, so it froze on its final frame.',
							42
					  )
					: reversedExit
					? issue(
							'invisible-on-screen',
							'error',
							el,
							blockLabel( el ) +
								' is back on screen but still hidden — its Exit played in reverse but left it at the hidden end state.',
							51
					  )
					: issue(
							'invisible-on-screen',
							'error',
							el,
							blockLabel( el ) +
								' is on screen but still hidden — its Entry animation never fired.',
							null
					  )
			);
		} );

		// Forget blocks that are no longer stuck so a later stall is
		// timed from scratch.
		hiddenSince.forEach( function ( _, el ) {
			if ( ! seen.has( el ) ) {
				hiddenSince.delete( el );
			}
		} );
		return found;
	}

	/**
	 * Is there any scroll position at which tick() would put this block
	 * in the zone? Overlap is piecewise linear in scroll position, so
	 * its maximum is at a breakpoint or at either end of the scroll
	 * range; testing those is exhaustive.
	 */
	function canReachZone( api, state ) {
		var vh = window.innerHeight;
		var maxScroll = Math.max(
			0,
			document.documentElement.scrollHeight - vh
		);
		var candidates = [
			0,
			maxScroll,
			state.pageTop - vh * api.zone.top,
			state.pageBottom - vh * api.zone.bottom,
			state.pageTop - vh * api.zone.bottom,
			state.pageBottom - vh * api.zone.top,
		];
		return candidates.some( function ( scrollY ) {
			var s = Math.min( Math.max( scrollY, 0 ), maxScroll );
			return api.isInZone(
				api.zoneOverlap( state.pageTop, state.pageBottom, s, vh ),
				state.pageHeight
			);
		} );
	}

	/**
	 * Nothing can never play: Scroll Appear settings that can't work on
	 * this page at this screen size.
	 */
	function checkCanNeverPlay( api ) {
		var found = [];
		if ( motionIsOff() ) {
			return found;
		}
		var vh = window.innerHeight;
		var band = vh * ( api.zone.bottom - api.zone.top );

		api.scrollAppear.forEach( function ( state ) {
			var el = state.el;
			if ( ! el.isConnected || ! isRendered( el ) ) {
				return;
			}
			if ( state.pageHeight > 0 && ! canReachZone( api, state ) ) {
				var why =
					state.pageHeight * api.zone.ratio > band
						? 'it is ' +
						  Math.round( state.pageHeight ) +
						  'px tall (' +
						  ( state.pageHeight / vh ).toFixed( 1 ) +
						  '× the screen), too tall to ever overlap the trigger zone enough'
						: 'it sits too close to the top or bottom of the page for the trigger zone to reach it';
				found.push(
					issue(
						'can-never-play',
						state.hasEntry ? 'error' : 'warning',
						el,
						blockLabel( el ) +
							( state.hasEntry
								? ' will stay hidden at this screen size: '
								: '’s Exit can never play at this screen size: ' ) +
							why +
							'.',
						23
					)
				);
			}
		} );
		return found;
	}

	/**
	 * Entry Replay 'once' means the Entry plays once. With an Exit slot
	 * the block stays observed (GH #39), so coming back to it after an
	 * Exit round trip must not play the Entry again.
	 */
	function checkEntryOnceReplayed( api ) {
		var found = [];
		api.scrollAppear.forEach( function ( state ) {
			if (
				state.entryReplay !== 'once' ||
				! state.hasEntry ||
				! ( state.entryPlays > 1 )
			) {
				return;
			}
			found.push(
				issue(
					'entry-once-replayed',
					'warning',
					state.el,
					blockLabel( state.el ) +
						'’s Entry is set to play once but has played ' +
						state.entryPlays +
						' times.',
					39
				)
			);
		} );
		return found;
	}

	/**
	 * Everything got wired: an animated block the runtime never set up
	 * stays at its hidden start state.
	 */
	function checkNeverWired( api ) {
		var found = [];
		document.querySelectorAll( '.mb-animated' ).forEach( function ( el ) {
			if ( api.wired.has( el ) ) {
				return;
			}
			// Only modes whose CSS hides or freezes an unwired block.
			// A Scroll Appear block with no Entry slot starts visible.
			var startsHidden =
				el.classList.contains( 'mb-mode-page-load' ) ||
				el.classList.contains( 'mb-mode-scroll-interactive' ) ||
				( el.classList.contains( 'mb-mode-scroll-appear' ) &&
					el.classList.contains( 'mb-has-entry' ) );
			if ( ! startsHidden ) {
				return;
			}
			found.push(
				issue(
					'never-wired',
					'error',
					el,
					blockLabel( el ) +
						' was added after the page loaded (pagination, AJAX, a popup…), so Motion Blocks never set it up and it stays hidden.',
					50
				)
			);
		} );
		return found;
	}

	/**
	 * Any of our animations still applied where motion should be off.
	 * Grouped per animated block so a stagger group reports once.
	 */
	function motionLeaks( id, reason, ref ) {
		var byBlock = new Map();
		ourAnimations().forEach( function ( animation ) {
			if ( animation.playState === 'idle' ) {
				return;
			}
			var target = animation.effect && animation.effect.target;
			var block = target && target.closest( '.mb-animated' );
			if ( block && ! byBlock.has( block ) ) {
				byBlock.set( block, target );
			}
		} );
		var found = [];
		byBlock.forEach( function ( target, block ) {
			var part =
				target === block
					? ''
					: target.tagName === 'IMG'
					? ' (its image)'
					: ' (its inner blocks)';
			found.push(
				issue(
					id,
					'error',
					block,
					blockLabel( block ) +
						part +
						' is still animating ' +
						reason +
						'.',
					ref
				)
			);
		} );
		return found;
	}

	function checkReducedMotion() {
		if ( ! reducedMotionQuery.matches ) {
			return [];
		}
		return motionLeaks(
			'reduced-motion-leak',
			'with reduced motion turned on',
			26
		);
	}

	function checkDisabledDevice() {
		var device = currentDevice();
		if ( ! device || ! document.body.classList.contains( 'mb-disabled-' + device ) ) {
			return [];
		}
		return motionLeaks(
			'disabled-device-leak',
			'although animations are disabled on ' + device + ' for this page',
			44
		);
	}

	/**
	 * Triggered but nothing ran: the block got its trigger class (or,
	 * for Scroll Interactive, its view timeline) yet none of our
	 * animations exist on it or inside it. That's what a preset whose
	 * class binding or @keyframes is missing or misspelled looks like —
	 * CSS fails silently, so this is the only signal.
	 */
	function checkNeverAnimated( api ) {
		var found = [];
		if ( motionIsOff() ) {
			return found;
		}
		document.querySelectorAll( '.mb-animated' ).forEach( function ( el ) {
			if ( ! api.wired.has( el ) || ! isRendered( el ) ) {
				return;
			}
			// `.mb-settled` drops a finished one-shot animation on purpose.
			if ( el.classList.contains( 'mb-settled' ) ) {
				return;
			}
			var isScrollInteractive = el.classList.contains(
				'mb-mode-scroll-interactive'
			);
			var triggered =
				el.classList.contains( 'mb-triggered' ) ||
				el.classList.contains( 'mb-exit-triggered' );
			if ( isScrollInteractive ? ! supportsViewTimeline : ! triggered ) {
				return;
			}
			if ( ourAnimations( el ).length ) {
				return;
			}
			var effectClasses = Array.prototype.filter
				.call( el.classList, function ( c ) {
					return /^mb-(enter|exit)-/.test( c );
				} )
				.join( ' ' );
			found.push(
				issue(
					'never-animated',
					'error',
					el,
					blockLabel( el ) +
						' was triggered but no animation ran. The CSS for its effect (' +
						( effectClasses || 'no mb-enter-/mb-exit- class' ) +
						') or its @keyframes is probably missing.',
					null
				)
			);
		} );
		return found;
	}

	/**
	 * Stagger delays come from a fixed list of :nth-child rules, so
	 * children past the last rule all start together.
	 */
	function checkStaggerLimit() {
		var found = [];
		document
			.querySelectorAll( '.mb-stagger-parent' )
			.forEach( function ( el ) {
				var count = staggerChildren( el ).length;
				if ( count <= STAGGER_RULE_LIMIT ) {
					return;
				}
				found.push(
					issue(
						'stagger-limit',
						'warning',
						el,
						blockLabel( el ) +
							' has ' +
							count +
							' inner blocks, but stagger delays stop at ' +
							STAGGER_RULE_LIMIT +
							', so blocks ' +
							( STAGGER_RULE_LIMIT + 1 ) +
							'–' +
							count +
							' all start together.',
						null
					)
				);
			} );
		return found;
	}

	/**
	 * A finished animation that keeps its last frame applied (fill
	 * forwards/both) still has a transform, even an identity one, so
	 * fixed-position descendants are laid out relative to the block
	 * instead of the screen. This is the bug `.mb-settled` exists for.
	 */
	function checkFixedTrap() {
		var found = [];
		document.querySelectorAll( '.mb-animated' ).forEach( function ( el ) {
			var mine = el.getAnimations().filter( isOurAnimation );
			if ( ! mine.length ) {
				return;
			}
			var holding = mine.every( function ( animation ) {
				var fill = animation.effect.getComputedTiming().fill;
				return (
					animation.playState === 'finished' &&
					( fill === 'forwards' || fill === 'both' )
				);
			} );
			if ( ! holding ) {
				return;
			}
			var style = getComputedStyle( el );
			var containsFixed =
				style.transform !== 'none' ||
				style.filter !== 'none' ||
				style.transformStyle === 'preserve-3d';
			if ( ! containsFixed ) {
				return;
			}
			var descendants = el.querySelectorAll( '*' );
			var limit = Math.min( descendants.length, FIXED_SCAN_LIMIT );
			for ( var i = 0; i < limit; i++ ) {
				if ( getComputedStyle( descendants[ i ] ).position === 'fixed' ) {
					found.push(
						issue(
							'fixed-trap',
							'error',
							el,
							blockLabel( el ) +
								' keeps its finished animation applied, so the fixed-position ' +
								blockLabel( descendants[ i ] ) +
								' inside it is placed relative to the block instead of the screen (e.g. a mobile menu that renders clipped).',
							null
						)
					);
					return;
				}
			}
		} );
		return found;
	}

	/* ---------------------------------------------------------------
	 * Run
	 * ------------------------------------------------------------- */

	function runChecks( stuckAfterMs ) {
		var api = window.__motionBlocks;
		if ( ! api || ! api.ready ) {
			// Only reachable once the page has loaded: the runtime
			// either failed to load or threw before finishing init().
			// Every hidden-start block is now stuck.
			return document.querySelector( '.mb-animated' )
				? [
						issue(
							'runtime-missing',
							'error',
							document.body,
							'The Motion Blocks front-end script didn’t finish starting up, so animated blocks that start hidden will stay hidden. Check the console for an earlier error.',
							null
						),
				  ]
				: [];
		}
		// Geometry checks need a real viewport; a hidden or still-sizing
		// window reports 0 and would flag every block.
		var hasViewport = window.innerHeight > 0;
		return []
			.concat( hasViewport ? checkInvisibleOnScreen( api, stuckAfterMs ) : [] )
			.concat( hasViewport ? checkCanNeverPlay( api ) : [] )
			.concat( checkNeverWired( api ) )
			.concat( checkEntryOnceReplayed( api ) )
			.concat( checkReducedMotion() )
			.concat( checkDisabledDevice() )
			.concat( checkNeverAnimated( api ) )
			.concat( checkStaggerLimit() )
			.concat( checkFixedTrap() );
	}

	var followUpTimer = null;

	function run() {
		current = runChecks( STUCK_AFTER_MS );
		report( current );
		render( current );

		// A block that just became hidden-on-screen needs a second look
		// once STUCK_AFTER_MS has passed.
		clearTimeout( followUpTimer );
		if ( hiddenSince.size ) {
			followUpTimer = setTimeout( run, STUCK_AFTER_MS + 100 );
		}
	}

	var scheduled = null;
	function schedule( delay ) {
		if ( sweeping ) {
			return;
		}
		clearTimeout( scheduled );
		scheduled = setTimeout( run, delay );
	}

	function report( results ) {
		var signature = results
			.map( function ( r ) {
				return r.id + ':' + r.message;
			} )
			.join( '|' );
		if ( signature === lastSignature ) {
			return;
		}
		lastSignature = signature;

		var title =
			'[Motion Blocks] self-check: ' +
			( results.length
				? results.length + ' issue' + ( results.length === 1 ? '' : 's' )
				: 'no issues' );
		/* eslint-disable no-console */
		if ( ! results.length ) {
			console.info( title );
			return;
		}
		console.groupCollapsed( title );
		console.table(
			results.map( function ( r ) {
				return {
					check: r.id,
					severity: r.severity,
					block: r.block,
					detail: r.message,
					issue: r.issue ? '#' + r.issue : '',
				};
			} )
		);
		results.forEach( function ( r ) {
			console.log( '[' + r.id + ']', r.message, r.element );
		} );
		console.groupEnd();
		/* eslint-enable no-console */
	}

	/* ---------------------------------------------------------------
	 * Badge + issue list
	 *
	 * Lives in a shadow root so theme CSS can't restyle it and its CSS
	 * can't leak into the page.
	 * ------------------------------------------------------------- */

	var ui = null;

	var CSS_TEXT =
		':host{all:initial}' +
		'*{box-sizing:border-box;font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}' +
		'.badge{position:fixed;left:12px;bottom:12px;z-index:2147483646;display:flex;align-items:center;gap:6px;padding:6px 10px;border:0;border-radius:999px;background:#1e1e1e;color:#fff;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.25)}' +
		'.badge:focus-visible{outline:2px solid #3858e9;outline-offset:2px}' +
		'.dot{width:8px;height:8px;border-radius:50%;background:#00a32a}' +
		'.dot.warning{background:#dba617}.dot.error{background:#d63638}' +
		'.panel{position:fixed;left:12px;bottom:52px;z-index:2147483646;width:min(420px,calc(100vw - 24px));max-height:min(60vh,480px);overflow:auto;margin:0;padding:6px;list-style:none;border-radius:8px;background:#fff;color:#1e1e1e;box-shadow:0 4px 24px rgba(0,0,0,.25)}' +
		'.panel[hidden]{display:none}' +
		'.row{display:flex;gap:8px;align-items:flex-start;padding:8px;border-radius:4px;cursor:pointer}' +
		'.row:hover,.row:focus-visible{background:#f0f0f0;outline:0}' +
		'.row .dot{flex:none;margin-top:6px}' +
		'.id{display:block;color:#757575;font-size:11px}' +
		'.row a{color:#3858e9}' +
		'.empty{padding:8px;color:#757575}' +
		'.box{position:fixed;z-index:2147483645;pointer-events:none;border:2px dashed #d63638;background:rgba(214,54,56,.06)}' +
		'.box.warning{border-color:#dba617;background:rgba(219,166,23,.08)}' +
		'.box.focus{border-style:solid}';

	function buildUi() {
		var host = document.createElement( 'div' );
		host.setAttribute( 'data-mb-self-check', '' );
		var root = host.attachShadow( { mode: 'open' } );
		var style = document.createElement( 'style' );
		style.textContent = CSS_TEXT;
		root.appendChild( style );

		var badge = document.createElement( 'button' );
		badge.type = 'button';
		badge.className = 'badge';
		badge.setAttribute( 'aria-expanded', 'false' );
		var dot = document.createElement( 'span' );
		dot.className = 'dot';
		var text = document.createElement( 'span' );
		badge.appendChild( dot );
		badge.appendChild( text );
		root.appendChild( badge );

		var panel = document.createElement( 'ul' );
		panel.className = 'panel';
		panel.hidden = true;
		root.appendChild( panel );

		var boxes = document.createElement( 'div' );
		root.appendChild( boxes );

		badge.addEventListener( 'click', function () {
			panel.hidden = ! panel.hidden;
			badge.setAttribute( 'aria-expanded', String( ! panel.hidden ) );
			drawBoxes();
		} );

		document.body.appendChild( host );
		return {
			badge: badge,
			dot: dot,
			text: text,
			panel: panel,
			boxes: boxes,
			focus: null,
		};
	}

	function worstSeverity( results ) {
		if ( ! results.length ) {
			return '';
		}
		return results.some( function ( r ) {
			return r.severity === 'error';
		} )
			? 'error'
			: 'warning';
	}

	function render( results ) {
		if ( ! ui ) {
			ui = buildUi();
		}
		var worst = worstSeverity( results );
		ui.dot.className = 'dot ' + worst;
		ui.text.textContent = results.length
			? 'Motion Blocks: ' +
			  results.length +
			  ' issue' +
			  ( results.length === 1 ? '' : 's' )
			: 'Motion Blocks: no issues';
		ui.badge.setAttribute(
			'aria-label',
			ui.text.textContent + '. Show details.'
		);

		ui.panel.textContent = '';
		if ( ! results.length ) {
			var empty = document.createElement( 'li' );
			empty.className = 'empty';
			empty.textContent =
				'Nothing to report on this screen. Scroll the page and resize the window to check more.';
			ui.panel.appendChild( empty );
		}
		results.forEach( function ( r ) {
			var row = document.createElement( 'li' );
			row.className = 'row';
			row.tabIndex = 0;
			var dot = document.createElement( 'span' );
			dot.className = 'dot ' + r.severity;
			var body = document.createElement( 'span' );
			var id = document.createElement( 'span' );
			id.className = 'id';
			id.textContent = r.id;
			body.appendChild( id );
			body.appendChild( document.createTextNode( r.message + ' ' ) );
			if ( r.issue ) {
				var link = document.createElement( 'a' );
				link.href = ISSUE_URL + r.issue;
				link.target = '_blank';
				link.rel = 'noopener';
				link.textContent = '#' + r.issue;
				link.addEventListener( 'click', function ( event ) {
					event.stopPropagation();
				} );
				body.appendChild( link );
			}
			row.appendChild( dot );
			row.appendChild( body );

			var focusBlock = function () {
				ui.focus = r.element;
				r.element.scrollIntoView( { block: 'center' } );
				drawBoxes();
			};
			row.addEventListener( 'click', focusBlock );
			row.addEventListener( 'keydown', function ( event ) {
				if ( event.key === 'Enter' || event.key === ' ' ) {
					event.preventDefault();
					focusBlock();
				}
			} );
			ui.panel.appendChild( row );
		} );
		drawBoxes();
	}

	/**
	 * Outline every block with an issue while the list is open. Boxes
	 * are fixed-position copies of each block's rect, redrawn on scroll.
	 */
	function drawBoxes() {
		if ( ! ui ) {
			return;
		}
		ui.boxes.textContent = '';
		if ( ui.panel.hidden ) {
			return;
		}
		var drawn = new Set();
		current.forEach( function ( r ) {
			if ( drawn.has( r.element ) || r.element === document.body ) {
				return;
			}
			drawn.add( r.element );
			var rect = r.element.getBoundingClientRect();
			if ( ! rect.width && ! rect.height ) {
				return;
			}
			var box = document.createElement( 'div' );
			box.className =
				'box ' +
				r.severity +
				( r.element === ui.focus ? ' focus' : '' );
			box.style.top = rect.top + 'px';
			box.style.left = rect.left + 'px';
			box.style.width = rect.width + 'px';
			box.style.height = rect.height + 'px';
			ui.boxes.appendChild( box );
		} );
	}

	/* ---------------------------------------------------------------
	 * Wiring
	 * ------------------------------------------------------------- */

	function start() {
		run();

		var boxFrame = false;
		window.addEventListener(
			'scroll',
			function () {
				if ( ! boxFrame ) {
					boxFrame = true;
					requestAnimationFrame( function () {
						boxFrame = false;
						drawBoxes();
					} );
				}
				// `scrollend` isn't everywhere yet; a debounce covers
				// the rest.
				schedule( 250 );
			},
			{ passive: true }
		);
		window.addEventListener( 'resize', function () {
			schedule( 250 );
		} );
		document.addEventListener( 'visibilitychange', function () {
			schedule( 250 );
		} );
		reducedMotionQuery.addEventListener( 'change', function () {
			schedule( 100 );
		} );

		// Blocks added later (pagination, AJAX, popups).
		new MutationObserver( function ( mutations ) {
			var added = mutations.some( function ( m ) {
				return Array.prototype.some.call( m.addedNodes, function ( n ) {
					return (
						n.nodeType === 1 &&
						! n.hasAttribute( 'data-mb-self-check' ) &&
						( n.matches( '.mb-animated' ) ||
							n.querySelector( '.mb-animated' ) )
					);
				} );
			} );
			if ( added ) {
				schedule( 300 );
			}
		} ).observe( document.body, { childList: true, subtree: true } );
	}

	/* ---------------------------------------------------------------
	 * Sweep
	 *
	 * Most problems only show at some scroll position, so a sweep
	 * scrolls down the whole page in steps, back up, and down again,
	 * lets the runtime react at each one, and keeps every issue seen on
	 * the way. This is what a
	 * test runner calls; it's also the quickest way to check a page by
	 * hand.
	 * ------------------------------------------------------------- */

	function wait( ms ) {
		return new Promise( function ( resolve ) {
			setTimeout( resolve, ms );
		} );
	}

	/**
	 * Resolves false when requestAnimationFrame is paused (background
	 * tab, hidden window). The runtime's scroll handling runs on rAF,
	 * so a sweep there would report every block as stuck.
	 */
	function framesRunning() {
		return new Promise( function ( resolve ) {
			var timer = setTimeout( function () {
				resolve( false );
			}, 500 );
			requestAnimationFrame( function () {
				clearTimeout( timer );
				resolve( true );
			} );
		} );
	}

	function sweep( options ) {
		if ( sweeping ) {
			return Promise.reject( new Error( 'A sweep is already running.' ) );
		}
		// How far each step scrolls, as a fraction of the screen
		// height, and how long to give the runtime after each scroll.
		// Triggers fire within a frame or two of a scroll, so a block
		// still hidden and untriggered after `settleMs` is stuck.
		var step = options.step || 0.5;
		var settleMs = options.settleMs || 500;
		var roundTrip = options.roundTrip !== false;
		var startY = window.scrollY;
		var merged = [];
		// Element → keys already recorded for it, so a block seen at
		// several scroll positions is listed once per problem.
		var seen = new Map();

		function collect() {
			runChecks( 0 ).forEach( function ( r ) {
				var key = r.id + '|' + r.message;
				var keys = seen.get( r.element ) || new Set();
				if ( ! keys.has( key ) ) {
					keys.add( key );
					seen.set( r.element, keys );
					merged.push( r );
				}
			} );
		}

		function scrollAndCollect( y ) {
			window.scrollTo( { top: y, behavior: 'instant' } );
			return wait( settleMs ).then( collect );
		}

		sweeping = true;
		clearTimeout( scheduled );
		clearTimeout( followUpTimer );

		return framesRunning()
			.then( function ( ok ) {
				if ( ! ok ) {
					throw new Error(
						'requestAnimationFrame is paused (background tab or hidden window), so Motion Blocks can’t trigger anything and every block would look stuck. Bring the page to the front and try again.'
					);
				}
				var vh = window.innerHeight;
				var maxScroll = Math.max(
					0,
					document.documentElement.scrollHeight - vh
				);
				var positions = [];
				for ( var y = 0; y < maxScroll; y += vh * step ) {
					positions.push( Math.round( y ) );
				}
				positions.push( maxScroll );
				// Then back up and down again, so the scroll-up
				// handlers (Exit reverse / repeat, Entry reverse) and a
				// second pass down (Entry Replay 'once' after an Exit
				// round trip, GH #39) are checked too. Finally jump
				// straight back to the top and go down once more: a jump
				// skips the scroll-up handlers entirely (Home key, a
				// "back to top" link), which is its own code path.
				if ( roundTrip ) {
					var down = positions.slice();
					var up = down.slice( 0, -1 ).reverse();
					positions = down.concat( up, down.slice( 1 ), down );
				}

				return positions.reduce( function ( chain, y ) {
					return chain.then( function () {
						return scrollAndCollect( y );
					} );
				}, Promise.resolve() );
			} )
			.then( function () {
				window.scrollTo( { top: startY, behavior: 'instant' } );
				return wait( settleMs );
			} )
			.then( function () {
				hiddenSince.clear();
				current = merged;
				report( current );
				render( current );
				return current.slice();
			} )
			.finally( function () {
				sweeping = false;
			} );
	}

	/**
	 * Scripted access.
	 *
	 *   motionBlocksSelfCheck()
	 *     Issues found right now, at the current scroll position. A block
	 *     that only just became hidden on screen isn't included until it
	 *     has stayed that way for STUCK_AFTER_MS.
	 *
	 *   motionBlocksSelfCheck( { sweep: true, step?, settleMs?, roundTrip? } )
	 *     Promise of every issue found while scrolling through the whole
	 *     page (down, up and down again, then a jump to the top and down
	 *     once more; `roundTrip: false` scrolls down only). The badge shows the sweep's results until the next
	 *     scroll.
	 */
	window.motionBlocksSelfCheck = function ( options ) {
		if ( options && options.sweep ) {
			return sweep( options );
		}
		run();
		return current.slice();
	};

	// Give load-time Entry animations and late layout a moment first.
	function onLoad() {
		setTimeout( start, 1000 );
	}
	if ( document.readyState === 'complete' ) {
		onLoad();
	} else {
		window.addEventListener( 'load', onLoad );
	}
} )();
