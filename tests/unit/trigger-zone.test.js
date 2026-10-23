/**
 * Scroll Appear trigger zone: every block must be reachable (GH #23).
 *
 * The trigger band is 15%–85% of the viewport and a block counted as in
 * the zone only once it overlapped the band by 10% of its own height.
 * Blocks taller than 7 screens, and blocks in the first or last 15% of a
 * screen of the page, could never get there and stayed hidden.
 * src/trigger-zone.js caps the required overlap at half the band and
 * stretches the band to the document edges at either end of the scroll
 * range. Everything else must behave exactly as before.
 *
 * Run: npm run test:unit
 */
import {
	zoneBounds,
	zoneOverlap,
	isInZone,
	TRIGGER_ZONE_TOP_PCT,
	TRIGGER_ZONE_BOTTOM_PCT,
} from '../../src/trigger-zone';

const VH = 800;
const DOC = 10000; // max scroll = 9200
const MAX_SCROLL = DOC - VH;

/**
 * Old rule (main @ 3c4ef43): fixed band, 10% of the block's height.
 *
 * @param {number} top     Block top, page px.
 * @param {number} bottom  Block bottom, page px.
 * @param {number} scrollY Scroll position.
 * @return {boolean} In zone under the old rule.
 */
function oldInZone( top, bottom, scrollY ) {
	const bandTop = scrollY + VH * TRIGGER_ZONE_TOP_PCT;
	const bandBottom = scrollY + VH * TRIGGER_ZONE_BOTTOM_PCT;
	const overlap = Math.max(
		0,
		Math.min( bottom, bandBottom ) - Math.max( top, bandTop )
	);
	return overlap / ( bottom - top ) >= 0.1;
}

function inZoneAt( top, bottom, scrollY, doc = DOC ) {
	return isInZone(
		zoneOverlap( top, bottom, scrollY, VH, doc ),
		bottom - top,
		VH
	);
}

function reachable( top, bottom, doc = DOC ) {
	const max = Math.max( 0, doc - VH );
	for ( let s = 0; s <= max; s += 1 ) {
		if ( inZoneAt( top, bottom, s, doc ) ) {
			return true;
		}
	}
	return false;
}

describe( 'zoneBounds', () => {
	it( 'is the usual 15%–85% band away from the page edges', () => {
		expect( zoneBounds( 3000, VH, DOC ) ).toEqual( {
			top: 3120,
			bottom: 3680,
		} );
	} );

	it( 'reaches the top of the document at scroll 0', () => {
		expect( zoneBounds( 0, VH, DOC ).top ).toBe( 0 );
	} );

	it( 'reaches the end of the document at maximum scroll', () => {
		expect( zoneBounds( MAX_SCROLL, VH, DOC ).bottom ).toBe( DOC );
	} );

	it( 'covers the whole viewport on a page that cannot scroll', () => {
		expect( zoneBounds( 0, VH, 600 ) ).toEqual( { top: 0, bottom: VH } );
	} );

	it( 'moves continuously as the page scrolls (no jumps)', () => {
		let prev = zoneBounds( 0, VH, DOC );
		for ( let s = 1; s <= MAX_SCROLL; s++ ) {
			const z = zoneBounds( s, VH, DOC );
			expect( z.top - prev.top ).toBeGreaterThanOrEqual( 0 );
			expect( z.top - prev.top ).toBeLessThanOrEqual( 2 );
			expect( z.bottom - prev.bottom ).toBeGreaterThanOrEqual( 0 );
			expect( z.bottom - prev.bottom ).toBeLessThanOrEqual( 2 );
			prev = z;
		}
	} );

	it( 'clamps rubber-band overscroll to the document edges', () => {
		expect( zoneBounds( -40, VH, DOC ).top ).toBe( -40 );
		expect( zoneBounds( MAX_SCROLL + 40, VH, DOC ).bottom ).toBe(
			DOC + 40
		);
	} );

	it( 'without a document height, the bottom edge never stretches', () => {
		expect( zoneBounds( 3000, VH ).bottom ).toBe( 3680 );
	} );
} );

describe( 'isInZone', () => {
	it( 'needs 10% of a normal block', () => {
		expect( isInZone( 39, 400, VH ) ).toBe( false );
		expect( isInZone( 40, 400, VH ) ).toBe( true );
	} );

	it( 'needs at most half the band for a tall block', () => {
		// 10% of 30 000px is 3000px, more than the 560px band.
		expect( isInZone( 279, 30000, VH ) ).toBe( false );
		expect( isInZone( 280, 30000, VH ) ).toBe( true );
	} );

	it( 'is never in the zone with no overlap or no height', () => {
		expect( isInZone( 0, 400, VH ) ).toBe( false );
		expect( isInZone( 10, 0, VH ) ).toBe( false );
	} );
} );

describe( 'unchanged behaviour away from the page edges', () => {
	it( 'matches the old rule for blocks up to 3.5 screens tall', () => {
		for ( const height of [ 20, 200, 800, 1600, 2800 ] ) {
			for ( let top = 1000; top < 5000; top += 137 ) {
				for ( let s = VH * 0.15; s < MAX_SCROLL - VH * 0.15; s += 53 ) {
					expect( [
						height,
						top,
						s,
						inZoneAt( top, top + height, s ),
					] ).toEqual( [
						height,
						top,
						s,
						oldInZone( top, top + height, s ),
					] );
				}
			}
		}
	} );
} );

describe( 'every block can be reached (GH #23)', () => {
	it( 'a block taller than 7 screens', () => {
		// 9000px on an 800px screen: the old rule could never fire.
		expect( reachable( 500, 9500 ) ).toBe( true );
	} );

	it( 'a tall block enters once its top reaches mid-screen', () => {
		const top = 2000;
		const bottom = top + 9000;
		const doc = 20000;
		// Mid-screen: scrollY + 400 = top → scrollY 1600.
		expect( inZoneAt( top, bottom, 1599, doc ) ).toBe( false );
		expect( inZoneAt( top, bottom, 1600, doc ) ).toBe( true );
	} );

	it( 'a footer row in the last 15% of a screen', () => {
		expect( reachable( DOC - 60, DOC - 10 ) ).toBe( true );
		expect( oldInZone( DOC - 60, DOC - 10, MAX_SCROLL ) ).toBe( false );
	} );

	it( 'a block in the first 15% of a screen of the page', () => {
		expect( inZoneAt( 10, 80, 0 ) ).toBe( true );
		expect( oldInZone( 10, 80, 0 ) ).toBe( false );
	} );

	it( 'blocks at both edges of a page too short to scroll', () => {
		expect( reachable( 0, 50, 700 ) ).toBe( true );
		expect( reachable( 650, 700, 700 ) ).toBe( true );
	} );

	it( 'any block anywhere on the page', () => {
		const doc = 4000;
		for ( const height of [ 10, 100, 1000, 3990 ] ) {
			for ( let top = 0; top + height <= doc; top += 97 ) {
				expect( [
					top,
					height,
					reachable( top, top + height, doc ),
				] ).toEqual( [ top, height, true ] );
			}
		}
	} );
} );
