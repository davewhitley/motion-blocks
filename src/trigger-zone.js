/**
 * Scroll Appear trigger-zone geometry (shared by frontend.js tick() and
 * the developer self-check, so the check can never drift from where
 * blocks actually fire).
 *
 * The zone is the middle band of the viewport, 15% to 85% of its
 * height, and a block is "in the zone" while any part of it overlaps
 * the band (GH #86). Put as two lines, the way GSAP ScrollTrigger
 * describes it:
 *
 * - **Entry** plays when the block's top edge rises past the 85% line.
 * - **Exit** plays when the block's bottom edge rises past the 15% line.
 *
 * Scrolling back up crosses the same lines the other way. Block height
 * doesn't change when a block fires, so tall blocks need no special
 * case.
 *
 * **Hysteresis.** Entering needs a few px of overlap
 * (`TRIGGER_HYSTERESIS_PX`, at most half the block), leaving needs
 * none. An edge resting exactly on a line, or trackpad jitter of a
 * pixel or two, then can't toggle the block in and out.
 *
 * **Page edges.** At the top and bottom of the scroll range the band
 * stretches to the edge of the document, so blocks in the first or last
 * 15% of a screen's height (a footer row, a block at the top of a page
 * that can't scroll) can still be reached (GH #23). The stretch is
 * gradual: over the first 15% of a screen of scrolling the band's top
 * edge moves from the top of the document to its usual place (it moves
 * at twice the scroll speed), and the bottom edge does the same over
 * the last 15%. A hard clamp (GSAP's `clamp()`) would instead make a
 * block near the top of the page Exit on the first scrolled pixel, and
 * a footer fire only at the exact last pixel of scroll.
 */

export const TRIGGER_ZONE_TOP_PCT = 0.15;
export const TRIGGER_ZONE_BOTTOM_PCT = 0.85;
// Overlap needed to enter the zone (leaving needs none), px.
export const TRIGGER_HYSTERESIS_PX = 8;

/**
 * The trigger band in page coordinates at a given scroll position.
 *
 * @param {number} scrollY     window.scrollY.
 * @param {number} vh          Viewport height (window.innerHeight).
 * @param {number} [docHeight] Scrollable document height
 *                             (documentElement.scrollHeight). Without it the
 *                             bottom edge never stretches.
 * @return {{top: number, bottom: number}} Band edges, page-relative px.
 */
export function zoneBounds( scrollY, vh, docHeight ) {
	const topInset = vh * TRIGGER_ZONE_TOP_PCT;
	const bottomInset = vh * ( 1 - TRIGGER_ZONE_BOTTOM_PCT );
	// Scrolled distance from the top, and still to go to the bottom.
	// Clamped so rubber-band overscroll can't push the band past the
	// document edges.
	const fromTop = Math.max( 0, scrollY );
	const toBottom =
		typeof docHeight === 'number' && docHeight > 0
			? Math.max( 0, docHeight - vh - scrollY )
			: bottomInset;
	return {
		top: scrollY + Math.min( topInset, fromTop ),
		bottom: scrollY + vh - Math.min( bottomInset, toBottom ),
	};
}

/**
 * How much of an element (page-relative layout bounds) overlaps the
 * trigger zone at a given scroll position, in px.
 *
 * @param {number} pageTop     Element top, page-relative px.
 * @param {number} pageBottom  Element bottom, page-relative px.
 * @param {number} scrollY     window.scrollY.
 * @param {number} vh          Viewport height.
 * @param {number} [docHeight] Scrollable document height (see zoneBounds).
 * @return {number} Overlap in px (0 when none).
 */
export function zoneOverlap( pageTop, pageBottom, scrollY, vh, docHeight ) {
	const zone = zoneBounds( scrollY, vh, docHeight );
	return Math.max(
		0,
		Math.min( pageBottom, zone.bottom ) - Math.max( pageTop, zone.top )
	);
}

/**
 * The trigger decision: does an element `pageHeight` px tall that
 * overlaps the zone by `overlap` px count as in the zone?
 *
 * @param {number}  overlap    From zoneOverlap().
 * @param {number}  pageHeight Element height, px.
 * @param {boolean} [wasIn]    Whether it was in the zone last time.
 *                             Entering needs TRIGGER_HYSTERESIS_PX (at
 *                             most half the element); staying in only
 *                             needs some overlap.
 * @return {boolean} In the zone.
 */
export function isInZone( overlap, pageHeight, wasIn ) {
	if ( ! ( pageHeight > 0 ) || ! ( overlap > 0 ) ) {
		return false;
	}
	if ( wasIn ) {
		return true;
	}
	return overlap >= Math.min( TRIGGER_HYSTERESIS_PX, pageHeight / 2 );
}
