/**
 * Scroll Appear trigger zone.
 *
 * The trigger band is 15%–85% of the viewport. A block is in the zone
 * while any part of it overlaps the band: Entry when its top rises past
 * the 85% line, Exit when its bottom rises past the 15% line (GH #86).
 * Entering needs TRIGGER_HYSTERESIS_PX of overlap so an edge resting on
 * a line can't flicker. The band stretches to the document edges at
 * either end of the scroll range, so every block can be reached
 * (GH #23).
 *
 * Run: npm run test:unit
 */
import {
	zoneBounds,
	zoneOverlap,
	isInZone,
	TRIGGER_ZONE_TOP_PCT,
	TRIGGER_ZONE_BOTTOM_PCT,
	TRIGGER_HYSTERESIS_PX,
} from '../../src/trigger-zone';

const VH = 800;
const DOC = 10000; // max scroll = 9200
const MAX_SCROLL = DOC - VH;

function inZoneAt( top, bottom, scrollY, doc = DOC, wasIn = false ) {
	return isInZone(
		zoneOverlap( top, bottom, scrollY, VH, doc ),
		bottom - top,
		wasIn
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
	it( 'enters with a few px of overlap, whatever the block height', () => {
		for ( const height of [ 40, 400, 30000 ] ) {
			expect( isInZone( TRIGGER_HYSTERESIS_PX - 1, height ) ).toBe(
				false
			);
			expect( isInZone( TRIGGER_HYSTERESIS_PX, height ) ).toBe( true );
		}
	} );

	it( 'a tiny block enters at half its height', () => {
		expect( isInZone( 1.9, 4 ) ).toBe( false );
		expect( isInZone( 2, 4 ) ).toBe( true );
	} );

	it( 'stays in until there is no overlap at all', () => {
		expect( isInZone( 1, 400, true ) ).toBe( true );
		expect( isInZone( 0, 400, true ) ).toBe( false );
	} );

	it( 'is never in the zone with no overlap or no height', () => {
		expect( isInZone( 0, 400 ) ).toBe( false );
		expect( isInZone( 10, 0 ) ).toBe( false );
		expect( isInZone( 10, 0, true ) ).toBe( false );
	} );
} );

describe( 'edge lines (GH #86)', () => {
	const entryLine = ( s ) => s + VH * TRIGGER_ZONE_BOTTOM_PCT;
	const exitLine = ( s ) => s + VH * TRIGGER_ZONE_TOP_PCT;

	it( 'Entry fires when the top rises past the 85% line, at any height', () => {
		for ( const height of [ 20, 200, 800, 2400, 9000 ] ) {
			const top = 4000;
			// Top is `TRIGGER_HYSTERESIS_PX` above the 85% line.
			const s =
				top + TRIGGER_HYSTERESIS_PX - VH * TRIGGER_ZONE_BOTTOM_PCT;
			const at = Math.min( TRIGGER_HYSTERESIS_PX, height / 2 );
			const fire = top + at - VH * TRIGGER_ZONE_BOTTOM_PCT;
			expect( [
				height,
				inZoneAt( top, top + height, fire - 1, 20000 ),
			] ).toEqual( [ height, false ] );
			expect( [
				height,
				inZoneAt( top, top + height, fire, 20000 ),
			] ).toEqual( [ height, true ] );
			expect( entryLine( s ) - top ).toBe( TRIGGER_HYSTERESIS_PX );
		}
	} );

	it( 'Exit fires when the bottom rises past the 15% line, at any height', () => {
		for ( const height of [ 20, 200, 800, 2400, 9000 ] ) {
			const top = 4000;
			const bottom = top + height;
			// Scroll position where the 15% line meets the bottom edge.
			const s = bottom - VH * TRIGGER_ZONE_TOP_PCT;
			expect( exitLine( s ) ).toBe( bottom );
			expect( [
				height,
				inZoneAt( top, bottom, s - 1, 20000, true ),
			] ).toEqual( [ height, true ] );
			expect( [
				height,
				inZoneAt( top, bottom, s, 20000, true ),
			] ).toEqual( [ height, false ] );
		}
	} );

	it( 'an edge jittering on a line does not flicker', () => {
		const top = 4000;
		const bottom = top + 400;
		// Scroll to just past the Entry point, then jitter ±2px around
		// it: once in, it stays in.
		const fire = top + TRIGGER_HYSTERESIS_PX - VH * TRIGGER_ZONE_BOTTOM_PCT;
		let wasIn = false;
		const flips = [];
		for ( const s of [
			fire - 3,
			fire,
			fire - 2,
			fire + 1,
			fire - 2,
			fire,
		] ) {
			const now = inZoneAt( top, bottom, s, DOC, wasIn );
			if ( now !== wasIn ) {
				flips.push( s );
			}
			wasIn = now;
		}
		expect( flips ).toEqual( [ fire ] );
	} );
} );

describe( 'every block can be reached (GH #23)', () => {
	it( 'a block taller than 7 screens', () => {
		// 9000px on an 800px screen: the old rule could never fire.
		expect( reachable( 500, 9500 ) ).toBe( true );
	} );

	it( 'a footer row in the last 15% of a screen', () => {
		expect( reachable( DOC - 60, DOC - 10 ) ).toBe( true );
	} );

	it( 'a block in the first 15% of a screen of the page', () => {
		expect( inZoneAt( 10, 80, 0 ) ).toBe( true );
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
