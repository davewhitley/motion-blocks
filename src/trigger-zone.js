/**
 * Scroll Appear trigger-zone geometry (shared by frontend.js tick() and
 * the developer self-check, so the check can never drift from where
 * blocks actually fire).
 *
 * The zone is the middle band of the viewport, 15% to 85% of its
 * height. A block counts as "in the zone" once it overlaps the band by
 * 10% of its own height, or by half the band if that's less (GH #23).
 *
 * Two adjustments keep every block reachable (GH #23):
 *
 * - **Tall blocks.** 10% of a block taller than 7 screens is more than
 *   the whole band, so it could never count as in. Capping the required
 *   overlap at half the band means a tall block enters once its top
 *   reaches mid-screen, and leaves once its bottom passes mid-screen.
 *   Blocks up to 3.5 screens tall are unaffected.
 *
 * - **Page edges.** At the top and bottom of the scroll range the band
 *   stretches to the edge of the document, so blocks in the first or
 *   last 15% of a screen's height (a footer row, a block at the top of a
 *   page that can't scroll) can still be reached. The stretch is
 *   gradual: over the first 15% of a screen of scrolling the band's top
 *   edge moves from the top of the document to its usual place (it moves
 *   at twice the scroll speed), and the bottom edge does the same over
 *   the last 15%. Everywhere else the band is exactly as before.
 */

export const TRIGGER_ZONE_TOP_PCT = 0.15;
export const TRIGGER_ZONE_BOTTOM_PCT = 0.85;
export const TRIGGER_OVERLAP_RATIO = 0.1;
// The most overlap a block ever needs, as a fraction of the band.
export const TRIGGER_BAND_CAP = 0.5;

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
 * The trigger decision: is `overlap` px enough for an element
 * `pageHeight` px tall to count as in the zone?
 *
 * @param {number} overlap    From zoneOverlap().
 * @param {number} pageHeight Element height, px.
 * @param {number} vh         Viewport height, px (sets the cap).
 * @return {boolean} In the zone.
 */
export function isInZone( overlap, pageHeight, vh ) {
	if ( ! ( pageHeight > 0 ) || ! ( overlap > 0 ) ) {
		return false;
	}
	let required = pageHeight * TRIGGER_OVERLAP_RATIO;
	if ( vh > 0 ) {
		const band = vh * ( TRIGGER_ZONE_BOTTOM_PCT - TRIGGER_ZONE_TOP_PCT );
		required = Math.min( required, band * TRIGGER_BAND_CAP );
	}
	return overlap >= required;
}
