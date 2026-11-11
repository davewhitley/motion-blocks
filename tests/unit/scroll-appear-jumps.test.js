/**
 * Scroll Appear blocks a jump, a reload or a fixed container used to
 * leave invisible (GH #124, #125, #4).
 *
 * The trigger only fires when a block's place in the 15%–85% band
 * changes, so anything that put a block on screen without passing it
 * through the band left it at its hidden start state:
 *
 *   - an anchor link, a #hash load or a reload with restored scroll
 *     leaves a never-entered block in the top 15% of the screen;
 *   - a sticky or fixed header on a page loaded mid-way sits there
 *     for good (Auto-animate puts Scroll Appear on header blocks);
 *   - a block in a fixed container (popup, off-canvas panel) was
 *     measured against the page, not the screen;
 *   - an Exit-only block whose Exit played, after a jump back above it;
 *   - a Repeat / Reverse Entry block re-entering "up" after its
 *     off-screen reset.
 *
 * jsdom has no layout, so the offsets the engine reads are stubbed
 * here. Each scroll step sets window.scrollY and calls
 * window.motionBlocks.refresh(), which re-measures and re-ticks every
 * block the way a scroll frame does.
 *
 * Run: npm run test:unit
 */
class FakeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}
global.IntersectionObserver = FakeObserver;
global.ResizeObserver = FakeObserver;

const VH = 800;
/**
 * Wait for an appended block to be wired, then tick it. In a browser
 * the block's IntersectionObserver calls back as soon as it is
 * observed; the stand-in above never does, so refresh() is that first
 * callback.
 */
async function wired() {
	await new Promise( ( r ) => setTimeout( r, 0 ) );
	window.motionBlocks.refresh();
}

function setViewportHeight( h ) {
	Object.defineProperty( window, 'innerHeight', {
		value: h,
		configurable: true,
	} );
}

/** Give an element a layout box: top (number or getter), height, parent. */
function layout( el, top, height, parent = document.body ) {
	Object.defineProperty( el, 'offsetTop', {
		get: typeof top === 'function' ? top : () => top,
		configurable: true,
	} );
	Object.defineProperty( el, 'offsetHeight', {
		get: () => height,
		configurable: true,
	} );
	Object.defineProperty( el, 'offsetParent', {
		get: () => parent,
		configurable: true,
	} );
	return el;
}

/** A Scroll Appear block as the render filter prints it. */
function block( { entry = true, replay = 'once', exit = false } = {} ) {
	const p = document.createElement( 'p' );
	p.className = 'mb-animated mb-mode-scroll-appear';
	p.setAttribute( 'data-mb-mode', 'scroll-appear' );
	if ( entry ) {
		p.classList.add( 'mb-enter-fade', 'mb-has-entry' );
		p.setAttribute( 'data-mb-entry-type', 'fade' );
		p.setAttribute( 'data-mb-entry-replay', replay );
	}
	if ( exit ) {
		p.classList.add( 'mb-exit-fade' );
		p.setAttribute( 'data-mb-exit-type', 'fade' );
		p.setAttribute( 'data-mb-exit-replay', 'reverse' );
	}
	return p;
}

/** A fixed box at `top` px from the top of the screen. */
function fixedBox( top ) {
	const box = document.createElement( 'div' );
	box.style.position = 'fixed';
	return layout( box, top, 100, null );
}

function scrollTo( y ) {
	window.scrollY = y;
	window.motionBlocks.refresh();
}

const shown = ( el ) => el.classList.contains( 'mb-triggered' );
const exited = ( el ) => el.classList.contains( 'mb-exit-triggered' );

const blocks = {};

beforeAll( () => {
	document.documentElement.classList.add( 'mb-js', 'mb-motion' );
	setViewportHeight( VH );
	Object.defineProperty( window, 'scrollY', {
		value: 0,
		writable: true,
		configurable: true,
	} );
	Object.defineProperty( document.documentElement, 'scrollHeight', {
		get: () => 20000,
		configurable: true,
	} );
	// <html>'s box moves up as the page scrolls, as in a browser.
	document.documentElement.getBoundingClientRect = () => ( {
		top: -window.scrollY,
	} );
	layout( document.body, 0, 20000, null );

	blocks.heading = layout( block(), 3000, 48 );
	blocks.above = layout( block(), 2500, 48 );
	blocks.entryExit = layout( block( { exit: true } ), 3010, 48 );
	blocks.exitOnly = layout( block( { entry: false, exit: true } ), 5000, 48 );
	blocks.repeat = layout( block( { replay: 'repeat' } ), 8000, 48 );
	document.body.append( ...Object.values( blocks ) );
	// jsdom's readyState is already 'complete', so this runs init().
	require( '../../src/frontend.js' );
} );

describe( 'a block that lands above the band', () => {
	it( 'starts hidden below the fold', () => {
		expect( shown( blocks.heading ) ).toBe( false );
	} );

	it( 'plays its Entry when a jump puts it at the top of the screen', () => {
		// An anchor link to the heading: its top edge is the screen's.
		scrollTo( 3000 );
		expect( shown( blocks.heading ) ).toBe( true );
	} );

	it( 'stays hidden with an Exit slot: above the band it is exited', () => {
		// 10px down the screen, wholly above the 15% line.
		expect( shown( blocks.entryExit ) ).toBe( false );
	} );

	it( 'leaves a block above the screen for its first sighting', () => {
		expect( shown( blocks.above ) ).toBe( false );
	} );

	it( 'does not fire while the block is scrolled up towards the band', () => {
		// 2500 is now 40px down the screen: on screen, above the band,
		// and about to cross into it.
		scrollTo( 2460 );
		expect( shown( blocks.above ) ).toBe( false );
		// In the band: the Entry plays there, as before.
		scrollTo( 2300 );
		expect( shown( blocks.above ) ).toBe( true );
	} );
} );

describe( 'a block in a sticky or fixed container on a page loaded mid-way', () => {
	beforeAll( () => {
		// Scrolling down, part-way down the page.
		scrollTo( 3000 );
	} );

	it( 'shows a sticky header block', async () => {
		// A stuck sticky box reports its stuck position.
		const header = layout(
			document.createElement( 'header' ),
			() => Math.max( 0, window.scrollY ),
			80
		);
		const el = layout( block(), 10, 40, header );
		header.append( el );
		document.body.append( header );
		await wired();
		expect( shown( el ) ).toBe( true );
	} );

	it( 'shows a fixed header block', async () => {
		const header = fixedBox( 0 );
		const el = layout( block(), 10, 40, header );
		header.append( el );
		document.body.append( header );
		await wired();
		expect( shown( el ) ).toBe( true );
	} );

	it( 'shows a fixed header block that has an Exit too', async () => {
		const header = fixedBox( 0 );
		const el = layout( block( { exit: true } ), 10, 40, header );
		header.append( el );
		document.body.append( header );
		await wired();
		expect( shown( el ) ).toBe( true );
		expect( exited( el ) ).toBe( false );
	} );

	it( 'plays the Entry of a block in a popup opened mid-screen', async () => {
		const popup = fixedBox( 300 );
		const el = layout( block(), 20, 48, popup );
		popup.append( el );
		document.body.append( popup );
		await wired();
		expect( shown( el ) ).toBe( true );
	} );

	it( 'keeps a fixed block in place as the page scrolls', async () => {
		const popup = fixedBox( 300 );
		const el = layout( block( { replay: 'repeat' } ), 20, 48, popup );
		popup.append( el );
		document.body.append( popup );
		await wired();
		scrollTo( 6000 );
		scrollTo( 3000 );
		expect( shown( el ) ).toBe( true );
	} );
} );

describe( 'an Exit-only block after a jump back above it', () => {
	it( 'is back at rest, not left hidden by its Exit', () => {
		scrollTo( 4700 );
		expect( exited( blocks.exitOnly ) ).toBe( false );
		// Scrolled past: the Exit plays.
		scrollTo( 7000 );
		expect( exited( blocks.exitOnly ) ).toBe( true );
		expect(
			blocks.exitOnly.style.getPropertyValue( '--mb-direction' )
		).toBe( 'normal' );
		// "Back to top": the block is never in the band on the way.
		scrollTo( 0 );
		expect( exited( blocks.exitOnly ) ).toBe( false );
		expect(
			blocks.exitOnly.style.getPropertyValue( '--mb-direction' )
		).toBe( '' );
		// And it plays its Exit again on the next pass.
		scrollTo( 4700 );
		scrollTo( 7000 );
		expect( exited( blocks.exitOnly ) ).toBe( true );
	} );
} );

describe( 'a Repeat Entry block that re-enters going up', () => {
	afterAll( () => setViewportHeight( VH ) );

	it( 'plays again after its off-screen reset when the window grows', () => {
		scrollTo( 7700 );
		expect( shown( blocks.repeat ) ).toBe( true );
		// Scroll up until it is below the screen: the reset.
		scrollTo( 7100 );
		expect( shown( blocks.repeat ) ).toBe( false );
		// A taller window brings it into the band; the last scroll
		// direction is still "up".
		setViewportHeight( 1200 );
		window.motionBlocks.refresh();
		expect( shown( blocks.repeat ) ).toBe( true );
	} );
} );
