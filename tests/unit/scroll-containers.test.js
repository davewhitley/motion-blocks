/**
 * Blocks inside a box that crops or scrolls (GH #126, GH #4).
 *
 * Both scroll modes assumed the page is what scrolls:
 *
 *   - Scroll Interactive binds view(), which follows the nearest scroll
 *     container. An `overflow: hidden` box counts as one though it never
 *     scrolls, so the effect froze part-way. Such a block is now bound
 *     to the page's scroll, scroll(root), with its range as two scroll
 *     positions (GH #126).
 *   - Scroll Appear compared the block's place in the page with the
 *     window's scroll position, so a block inside a box that scrolls on
 *     its own (a fixed-height panel, a scrolling popup) stayed hidden
 *     when the box scrolled it into view, and could play while still
 *     scrolled out of the box (GH #4).
 *
 * jsdom has no layout, so offsets, sizes and scroll positions are
 * stubbed. window.motionBlocks.refresh() re-measures and re-ticks every
 * block the way a scroll frame does.
 *
 * Run: npm run test:unit
 */
const {
	scrollContainersOf,
	pageScrollRange,
	rangePercent,
} = require( '../../src/scroll-containers' );

class FakeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}
global.IntersectionObserver = FakeObserver;
global.ResizeObserver = FakeObserver;

const VH = 800;

async function wired() {
	await new Promise( ( r ) => setTimeout( r, 0 ) );
	window.motionBlocks.refresh();
}

/** Give an element a layout box: top, height, offsetParent. */
function layout( el, top, height, parent = document.body ) {
	Object.defineProperty( el, 'offsetTop', {
		get: () => top,
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

/**
 * A box with `overflow` set, `height` tall, holding `contentHeight` of
 * content. Its scrollTop can be set like a real one.
 */
function box( overflow, top, height, contentHeight, parent = document.body ) {
	const el = document.createElement( 'div' );
	el.style.overflowX = overflow;
	el.style.overflowY = overflow;
	layout( el, top, height, parent );
	Object.defineProperty( el, 'clientHeight', { get: () => height } );
	Object.defineProperty( el, 'clientTop', { get: () => 0 } );
	Object.defineProperty( el, 'scrollHeight', {
		get: () => contentHeight,
	} );
	let scrollTop = 0;
	Object.defineProperty( el, 'scrollTop', {
		get: () => scrollTop,
		set: ( v ) => {
			scrollTop = v;
		},
	} );
	return el;
}

function appearBlock( replay = 'once' ) {
	const p = document.createElement( 'p' );
	p.className =
		'mb-animated mb-mode-scroll-appear mb-enter-fade mb-has-entry';
	p.setAttribute( 'data-mb-mode', 'scroll-appear' );
	p.setAttribute( 'data-mb-entry-type', 'fade' );
	p.setAttribute( 'data-mb-entry-replay', replay );
	return p;
}

function interactiveBlock( start, end ) {
	const p = document.createElement( 'p' );
	p.className = 'mb-animated mb-mode-scroll-interactive mb-enter-fade';
	p.setAttribute( 'data-mb-mode', 'scroll-interactive' );
	p.setAttribute( 'data-mb-type', 'fade' );
	if ( start ) {
		p.setAttribute( 'data-mb-range-start', start );
		p.setAttribute( 'data-mb-range-end', end );
	}
	return p;
}

function scrollPageTo( y ) {
	window.scrollY = y;
	window.motionBlocks.refresh();
}

function scrollBoxTo( el, y ) {
	el.scrollTop = y;
	window.motionBlocks.refresh();
}

const shown = ( el ) => el.classList.contains( 'mb-triggered' );
const timeline = ( el ) => el.style.getPropertyValue( '--mb-timeline' );
const rangeStart = ( el ) => el.style.getPropertyValue( '--mb-range-start' );
const rangeEnd = ( el ) => el.style.getPropertyValue( '--mb-range-end' );

beforeAll( () => {
	document.documentElement.classList.add( 'mb-js', 'mb-motion' );
	Object.defineProperty( window, 'innerHeight', {
		value: VH,
		configurable: true,
	} );
	Object.defineProperty( window, 'scrollY', {
		value: 0,
		writable: true,
		configurable: true,
	} );
	Object.defineProperty( document.documentElement, 'scrollHeight', {
		get: () => 20000,
		configurable: true,
	} );
	document.documentElement.getBoundingClientRect = () => ( {
		top: -window.scrollY,
	} );
	layout( document.body, 0, 20000, null );
	// jsdom's readyState is already 'complete', so this runs init().
	require( '../../src/frontend.js' );
} );

describe( 'scrollContainersOf', () => {
	it( 'finds cropping and scrolling boxes, nearest first', () => {
		const outer = box( 'auto', 0, 400, 3000 );
		const inner = box( 'hidden', 0, 200, 900 );
		const plain = document.createElement( 'div' );
		const el = document.createElement( 'p' );
		plain.append( el );
		inner.append( plain );
		outer.append( inner );
		document.body.append( outer );
		expect( scrollContainersOf( el ) ).toEqual( [
			{ el: inner, live: false },
			{ el: outer, live: true },
		] );
		outer.remove();
	} );

	it( 'calls a box with nothing to scroll not live', () => {
		const fits = box( 'auto', 0, 400, 400 );
		const el = document.createElement( 'p' );
		fits.append( el );
		document.body.append( fits );
		expect( scrollContainersOf( el ) ).toEqual( [
			{ el: fits, live: false },
		] );
		fits.remove();
	} );

	it( 'ignores overflow: clip and a <body> whose overflow passes to the page', () => {
		const clip = box( 'clip', 0, 400, 3000 );
		const el = document.createElement( 'p' );
		clip.append( el );
		document.body.append( clip );
		document.body.style.overflowX = 'hidden';
		expect( scrollContainersOf( el ) ).toEqual( [] );
		// With <html> cropping too, <body> is a container of its own.
		document.documentElement.style.overflowX = 'hidden';
		expect( scrollContainersOf( el ).map( ( c ) => c.el ) ).toEqual( [
			document.body,
		] );
		document.documentElement.style.overflowX = '';
		document.body.style.overflowX = '';
		clip.remove();
	} );
} );

describe( 'pageScrollRange', () => {
	it( 'matches view() for a block shorter than the screen', () => {
		// Top at 3000, 200 tall, 800 screen: enters at 2200, fully in
		// at 2400, starts leaving at 3000, gone at 3200.
		expect( pageScrollRange( 3000, 200, 800, 0, 100 ) ).toEqual( {
			start: 2200,
			end: 3200,
		} );
		expect( pageScrollRange( 3000, 200, 800, 100, 0 ) ).toEqual( {
			start: 2400,
			end: 3000,
		} );
		expect( pageScrollRange( 3000, 200, 800, 50, 50 ) ).toEqual( {
			start: 2300,
			end: 3100,
		} );
	} );

	it( 'matches view() for a block taller than the screen', () => {
		// 1400 tall: entry ends when it fills the screen (top at the
		// top), exit starts when its bottom reaches the bottom.
		expect( pageScrollRange( 3000, 1400, 800, 100, 0 ) ).toEqual( {
			start: 3000,
			end: 3600,
		} );
	} );

	it( 'goes negative for a block at the top of the page', () => {
		expect( pageScrollRange( 0, 200, 800, 0, 100 ).start ).toBe( -800 );
	} );

	it( 'reads the percentage from a range string', () => {
		expect( rangePercent( 'entry 20%', 0 ) ).toBe( 20 );
		expect( rangePercent( 'exit 100%', 0 ) ).toBe( 100 );
		expect( rangePercent( '', 35 ) ).toBe( 35 );
	} );
} );

describe( 'Scroll Interactive inside a cropping box (GH #126)', () => {
	it( 'keeps view() when nothing around the block crops', async () => {
		const el = layout( interactiveBlock(), 3000, 200 );
		document.body.append( el );
		await wired();
		expect( timeline( el ) ).toBe( '' );
		expect( rangeStart( el ) ).toBe( 'entry 0%' );
		expect( rangeEnd( el ) ).toBe( 'exit 100%' );
		el.remove();
	} );

	it( 'follows the page scroll inside an overflow: hidden box', async () => {
		const card = box( 'hidden', 2980, 240, 240 );
		const el = layout( interactiveBlock(), 3000, 200 );
		card.append( el );
		document.body.append( card );
		await wired();
		expect( timeline( el ) ).toBe( 'scroll(root)' );
		expect( rangeStart( el ) ).toBe( '2200px' );
		expect( rangeEnd( el ) ).toBe( '3200px' );
		card.remove();
	} );

	it( 'keeps the block’s own range', async () => {
		const card = box( 'hidden', 2980, 240, 240 );
		const el = layout(
			interactiveBlock( 'entry 50%', 'exit 50%' ),
			3000,
			200
		);
		card.append( el );
		document.body.append( card );
		await wired();
		expect( rangeStart( el ) ).toBe( '2300px' );
		expect( rangeEnd( el ) ).toBe( '3100px' );
		card.remove();
	} );

	it( 'works the range out again when the layout changes', async () => {
		const card = box( 'hidden', 2980, 240, 240 );
		const el = layout( interactiveBlock(), 3000, 200 );
		card.append( el );
		document.body.append( card );
		await wired();
		layout( el, 5000, 200 );
		window.motionBlocks.refresh();
		expect( rangeStart( el ) ).toBe( '4200px' );
		// The box stops cropping (a theme rule inside a media query).
		card.style.overflowX = 'visible';
		card.style.overflowY = 'visible';
		window.motionBlocks.refresh();
		expect( timeline( el ) ).toBe( '' );
		expect( rangeStart( el ) ).toBe( 'entry 0%' );
		card.remove();
	} );

	it( 'keeps view() inside a box that really scrolls', async () => {
		const panel = box( 'auto', 2980, 400, 3000 );
		const el = layout( interactiveBlock(), 3000, 200 );
		panel.append( el );
		document.body.append( panel );
		await wired();
		expect( timeline( el ) ).toBe( '' );
		expect( rangeStart( el ) ).toBe( 'entry 0%' );
		panel.remove();
	} );
} );

describe( 'Scroll Appear inside a box that scrolls (GH #4)', () => {
	// A 400px panel at 1000 in the page, holding 3000px of content.
	// With the page at 700 it sits at 300–700 on the screen, inside the
	// 120–680 band.
	let panel;
	let first;
	let second;
	let repeat;

	beforeAll( async () => {
		window.scrollY = 0;
		panel = box( 'auto', 1000, 400, 3000 );
		first = layout( appearBlock(), 1020, 48 );
		second = layout( appearBlock(), 1920, 48 );
		repeat = layout( appearBlock( 'repeat' ), 2520, 48 );
		panel.append( first, second, repeat );
		document.body.append( panel );
		await wired();
	} );

	it( 'plays a block at the top of the box when the page brings the box in', () => {
		expect( shown( first ) ).toBe( false );
		scrollPageTo( 700 );
		expect( shown( first ) ).toBe( true );
	} );

	it( 'does not play a block still scrolled out of the box', () => {
		expect( shown( second ) ).toBe( false );
		// The page scrolls on. By page position alone the block would
		// now be at 220 on the screen, but the box still hides it.
		scrollPageTo( 1700 );
		expect( shown( second ) ).toBe( false );
		scrollPageTo( 700 );
		expect( shown( second ) ).toBe( false );
	} );

	it( 'plays it when the box scrolls it into view', () => {
		scrollBoxTo( panel, 900 );
		expect( shown( second ) ).toBe( true );
	} );

	it( 'resets a Repeat block scrolled back out, and plays it again', () => {
		scrollBoxTo( panel, 1500 );
		expect( shown( repeat ) ).toBe( true );
		scrollBoxTo( panel, 0 );
		expect( shown( repeat ) ).toBe( false );
		scrollBoxTo( panel, 1500 );
		expect( shown( repeat ) ).toBe( true );
	} );

	it( 'plays a block in a scrolling popup when the popup scrolls to it', async () => {
		const popup = box( 'auto', 100, 300, 2000, null );
		popup.style.position = 'fixed';
		const top = layout( appearBlock(), 20, 48, popup );
		const low = layout( appearBlock(), 1000, 48, popup );
		popup.append( top, low );
		document.body.append( popup );
		await wired();
		expect( shown( top ) ).toBe( true );
		expect( shown( low ) ).toBe( false );
		scrollPageTo( 2500 );
		expect( shown( low ) ).toBe( false );
		scrollBoxTo( popup, 900 );
		expect( shown( low ) ).toBe( true );
		popup.remove();
	} );
} );
