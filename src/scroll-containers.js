/**
 * Motion Blocks — scroll containers around a block (front end).
 *
 * Both scroll modes assume the page is what scrolls. A box around the
 * block with `overflow: hidden`, `auto` or `scroll` breaks that in two
 * ways:
 *
 *   - Scroll Interactive binds `view()`, which follows the NEAREST
 *     scroll container. A box that crops but never scrolls counts as
 *     one, so the effect froze part-way (GH #126).
 *   - Scroll Appear compares the block's place in the page with the
 *     window's scroll position, so scrolling a box inside the page
 *     never moved a block into the trigger band (GH #4).
 *
 * This module answers "which boxes around this block are scroll
 * containers, and can they scroll?" and does the geometry both fixes
 * share. No state: frontend.js calls it on wire and on layout changes.
 */

function isScrollValue( v ) {
	return v === 'hidden' || v === 'auto' || v === 'scroll';
}

/**
 * The scroll containers around `el`, nearest first. The page's own
 * scroller is never in the list: not <html>, and not <body> when its
 * overflow passes through to the viewport (which it does whenever
 * <html>'s overflow is `visible`).
 *
 * `live` means a visitor can scroll it up and down: `overflow-y` is
 * `auto` or `scroll` and there is something to scroll. `overflow:
 * hidden` boxes are never live.
 *
 * @param {Element} el Block element.
 * @return {{el: Element, live: boolean}[]} Containers, nearest first.
 */
export function scrollContainersOf( el ) {
	const out = [];
	const doc = el.ownerDocument;
	const view = doc.defaultView;
	const root = doc.documentElement;
	const rootStyle = view.getComputedStyle( root );
	const bodyPassesThrough =
		! isScrollValue( rootStyle.overflowX ) &&
		! isScrollValue( rootStyle.overflowY );
	for ( let n = el.parentElement; n && n !== root; n = n.parentElement ) {
		if ( n === doc.body && bodyPassesThrough ) {
			continue;
		}
		const s = view.getComputedStyle( n );
		if (
			! isScrollValue( s.overflowX ) &&
			! isScrollValue( s.overflowY )
		) {
			continue;
		}
		out.push( {
			el: n,
			live:
				( s.overflowY === 'auto' || s.overflowY === 'scroll' ) &&
				n.scrollHeight > n.clientHeight + 1,
		} );
	}
	return out;
}

/**
 * An element's layout top, through the offsetParent chain (transforms
 * don't move it). Measured from the top of the page, or from the top
 * of the screen when the chain ends at a `position: fixed` box.
 * `null` when the element has no layout box (hidden).
 *
 * @param {Element} el Element.
 * @return {?{top: number, fixed: boolean}} Top and what it is measured from.
 */
export function layoutTopOf( el ) {
	let top = 0;
	let n = el;
	while ( n && n.offsetParent !== null ) {
		top += n.offsetTop;
		n = n.offsetParent;
	}
	const doc = el.ownerDocument;
	const view = doc.defaultView;
	if ( n === doc.body ) {
		// Offsets are measured from <html>'s border box, so add its own
		// page offset (the admin bar's `html { margin-top: 32px }`).
		return {
			top:
				top +
				doc.documentElement.getBoundingClientRect().top +
				view.scrollY,
			fixed: false,
		};
	}
	if (
		n &&
		n.nodeType === 1 &&
		view.getComputedStyle( n ).position === 'fixed'
	) {
		return { top: top + n.offsetTop, fixed: true };
	}
	return null;
}

/**
 * The page scroll positions where a block's Scroll Interactive range
 * starts and ends: what `view()` with `entry <start>%` / `exit <end>%`
 * works out by itself when the page is its scroll container.
 *
 *   entry 0%   the block's top reaches the bottom of the screen
 *   entry 100% the block is fully on screen (or fills it, if taller)
 *   exit 0%    the block starts to leave at the top
 *   exit 100%  the block's bottom leaves the top of the screen
 *
 * @param {number} top      Block's page top.
 * @param {number} height   Block's height.
 * @param {number} vh       Viewport height.
 * @param {number} startPct `entry` percentage, 0–100.
 * @param {number} endPct   `exit` percentage, 0–100.
 * @return {{start: number, end: number}} Scroll positions in px.
 */
export function pageScrollRange( top, height, vh, startPct, endPct ) {
	const entry0 = top - vh;
	const entry100 = Math.min( top + height - vh, top );
	const exit0 = Math.max( top + height - vh, top );
	const exit100 = top + height;
	return {
		start: entry0 + ( ( entry100 - entry0 ) * startPct ) / 100,
		end: exit0 + ( ( exit100 - exit0 ) * endPct ) / 100,
	};
}

/**
 * Read the percentage from a range string like `entry 20%`.
 *
 * @param {string} value    Range string.
 * @param {number} fallback Percentage when there is none.
 * @return {number} Percentage.
 */
export function rangePercent( value, fallback ) {
	const m = /(-?\d+(?:\.\d+)?)%/.exec( value || '' );
	return m ? parseFloat( m[ 1 ] ) : fallback;
}
