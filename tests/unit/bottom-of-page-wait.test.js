/**
 * A block in the bottom of the screen at the end of the page doesn't
 * wait for the window `load` event for ever (GH #170).
 *
 * At the very end of a page there is nothing left to scroll, so the
 * trigger band stretches down to the page's bottom edge. That needs the
 * page's height, which is only trusted once the page has loaded: `load`
 * waits for every image, embed and third-party script, so on a short
 * page the block could stay blank for many seconds. The wait is now
 * capped at two seconds.
 *
 * jsdom has no layout, so offsets are stubbed, as in
 * scroll-appear-jumps.test.js.
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
let block;

beforeAll( () => {
	jest.useFakeTimers();
	document.documentElement.classList.add( 'mb-js', 'mb-motion' );
	// Still loading: a slow image or script is holding `load` back.
	Object.defineProperty( document, 'readyState', {
		get: () => 'interactive',
		configurable: true,
	} );
	Object.defineProperty( window, 'innerHeight', {
		value: VH,
		configurable: true,
	} );
	Object.defineProperty( window, 'scrollY', {
		value: 0,
		writable: true,
		configurable: true,
	} );
	// A page exactly one screen tall: it can't scroll.
	Object.defineProperty( document.documentElement, 'scrollHeight', {
		get: () => VH,
		configurable: true,
	} );
	document.documentElement.getBoundingClientRect = () => ( { top: 0 } );
	const stub = ( el, top, height, parent ) => {
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
	};
	stub( document.body, 0, VH, null );

	// In the bottom 15% of the screen, below the band's usual edge.
	block = document.createElement( 'p' );
	block.className =
		'mb-animated mb-mode-scroll-appear mb-enter-fade mb-has-entry';
	block.setAttribute( 'data-mb-mode', 'scroll-appear' );
	block.setAttribute( 'data-mb-entry-type', 'fade' );
	stub( block, 730, 40, document.body );
	document.body.append( block );
	require( '../../src/frontend.js' );
	window.motionBlocks.refresh();
} );

afterAll( () => jest.useRealTimers() );

const entered = () => block.classList.contains( 'mb-triggered' );

it( 'waits at first: the page may still grow', () => {
	expect( entered() ).toBe( false );
	jest.advanceTimersByTime( 1900 );
	expect( entered() ).toBe( false );
} );

it( 'plays the Entry after two seconds, without the load event', () => {
	jest.advanceTimersByTime( 200 );
	expect( entered() ).toBe( true );
} );
