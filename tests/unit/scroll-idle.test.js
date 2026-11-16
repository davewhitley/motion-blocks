/**
 * Once every Scroll Appear block has played for good, scrolling costs
 * nothing (GH #6).
 *
 * The scroll listener re-reads the page's height on every frame, which
 * makes the browser work out the layout. That is needed while a block
 * can still trigger, and wasted afterwards.
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
let heightReads = 0;

function scrollTo( y ) {
	window.scrollY = y;
	document.dispatchEvent( new Event( 'scroll' ) );
	jest.advanceTimersByTime( 50 );
}

beforeAll( () => {
	jest.useFakeTimers();
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
		get: () => {
			heightReads++;
			return 4000;
		},
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
	stub( document.body, 0, 4000, null );

	// Well below the first screen; plays once, no Exit.
	block = document.createElement( 'p' );
	block.className =
		'mb-animated mb-mode-scroll-appear mb-enter-fade mb-has-entry';
	block.setAttribute( 'data-mb-mode', 'scroll-appear' );
	block.setAttribute( 'data-mb-entry-type', 'fade' );
	stub( block, 2000, 100, document.body );
	document.body.append( block );
	require( '../../src/frontend.js' );
	window.motionBlocks.refresh();
} );

afterAll( () => jest.useRealTimers() );

it( 'watches the page while the block can still trigger', () => {
	heightReads = 0;
	scrollTo( 100 );
	expect( block.classList.contains( 'mb-triggered' ) ).toBe( false );
	expect( heightReads ).toBeGreaterThan( 0 );
} );

it( 'plays the block when it scrolls into view', () => {
	scrollTo( 1700 );
	expect( block.classList.contains( 'mb-triggered' ) ).toBe( true );
} );

it( 'does no more work on scroll once the block has played', () => {
	heightReads = 0;
	scrollTo( 1800 );
	scrollTo( 2400 );
	scrollTo( 300 );
	expect( heightReads ).toBe( 0 );
	expect( block.classList.contains( 'mb-triggered' ) ).toBe( true );
} );
