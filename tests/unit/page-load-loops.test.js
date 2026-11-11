/**
 * Looping Page Load animations (GH #128).
 *
 * 1. Fill mode. A loop used `animation-fill-mode: none`, so through its
 *    delay the block showed at rest (the pre-hide stops matching once
 *    `mb-triggered` is on), then snapped to the keyframe's hidden start
 *    and animated: a flash on every load. Loops now fill `backwards`.
 *
 * 2. Pause off-screen. The IntersectionObserver sees the block where
 *    its animation has moved it. A loop that carries the block off the
 *    screen was paused there and never resumed. The block is now only
 *    paused when its layout box is off the screen too, and is
 *    re-checked on scroll while the observer says "out".
 *
 * jsdom has no layout, so the offsets are stubbed; the observer is a
 * stand-in whose callback the tests call themselves.
 *
 * Run: npm run test:unit
 */
const observers = [];
class FakeObserver {
	constructor( cb ) {
		this.cb = cb;
		this.targets = new Set();
		observers.push( this );
	}
	observe( el ) {
		this.targets.add( el );
	}
	unobserve( el ) {
		this.targets.delete( el );
	}
	disconnect() {
		this.targets.clear();
	}
}
global.IntersectionObserver = FakeObserver;
global.ResizeObserver = FakeObserver;

/** Tell the block's pause observer whether its moved box is on screen. */
function observerSays( el, isIntersecting ) {
	observers
		.filter( ( o ) => o.targets.has( el ) )
		.forEach( ( o ) => o.cb( [ { target: el, isIntersecting } ] ) );
}

// Animation frames are queued here and run by hand, so the tests don't
// depend on jsdom's frame timer.
const frames = [];
function runFrames() {
	while ( frames.length ) {
		frames.shift()();
	}
}

function scrollTo( y ) {
	window.scrollY = y;
	window.dispatchEvent( new window.Event( 'scroll' ) );
	runFrames();
}

function loopBlock( repeat ) {
	const p = document.createElement( 'p' );
	p.className = 'mb-animated mb-mode-page-load mb-enter-slide';
	p.setAttribute( 'data-mb-mode', 'page-load' );
	p.setAttribute( 'data-mb-type', 'slide' );
	p.setAttribute( 'data-mb-repeat', repeat );
	p.setAttribute( 'data-mb-pause-offscreen', 'true' );
	// Layout box: 100px down the page, 48px tall, 300px wide.
	Object.defineProperties( p, {
		offsetTop: { get: () => 100 },
		offsetLeft: { get: () => 0 },
		offsetHeight: { get: () => 48 },
		offsetWidth: { get: () => 300 },
		offsetParent: { get: () => document.body },
	} );
	return p;
}

const playState = ( el ) => el.style.getPropertyValue( '--mb-play-state' );

let loop;
let alternate;
let once;

beforeAll( () => {
	document.documentElement.classList.add( 'mb-js', 'mb-motion' );
	Object.defineProperty( window, 'innerHeight', { value: 800 } );
	Object.defineProperty( window, 'innerWidth', { value: 1280 } );
	Object.defineProperty( window, 'scrollY', { value: 0, writable: true } );
	window.requestAnimationFrame = ( cb ) => frames.push( cb );
	Object.defineProperty( document.body, 'offsetParent', {
		get: () => null,
	} );
	// <html>'s box moves up as the page scrolls, as in a browser.
	document.documentElement.getBoundingClientRect = () => ( {
		top: -window.scrollY,
		left: 0,
	} );
	loop = loopBlock( 'loop' );
	alternate = loopBlock( 'alternate' );
	once = loopBlock( 'once' );
	document.body.append( loop, alternate, once );
	// jsdom's readyState is already 'complete', so this runs init().
	require( '../../src/frontend.js' );
} );

describe( 'fill mode', () => {
	it( 'holds the start state through the delay on a loop', () => {
		expect( loop.style.getPropertyValue( '--mb-fill-mode' ) ).toBe(
			'backwards'
		);
		expect( alternate.style.getPropertyValue( '--mb-fill-mode' ) ).toBe(
			'backwards'
		);
	} );

	it( 'leaves a one-shot on the default (both)', () => {
		expect( once.style.getPropertyValue( '--mb-fill-mode' ) ).toBe( '' );
	} );
} );

describe( 'Pause off-screen', () => {
	it( 'runs while the observer sees the block', () => {
		observerSays( loop, true );
		expect( playState( loop ) ).toBe( 'running' );
	} );

	it( 'keeps running when the animation moves the block off the screen', () => {
		// The moved box left the screen; the layout box is still on it.
		observerSays( loop, false );
		expect( playState( loop ) ).toBe( 'running' );
	} );

	it( 'pauses once the layout box is scrolled off the screen too', () => {
		scrollTo( 2000 );
		expect( playState( loop ) ).toBe( 'paused' );
	} );

	it( 'resumes when the layout box is scrolled back, with no observer call', () => {
		scrollTo( 0 );
		expect( playState( loop ) ).toBe( 'running' );
	} );

	it( 'pauses a block that is off the screen in both senses', () => {
		scrollTo( 2000 );
		observerSays( alternate, false );
		expect( playState( alternate ) ).toBe( 'paused' );
		scrollTo( 0 );
	} );

	it( 'stops re-checking once the observer sees the block again', () => {
		observerSays( loop, true );
		scrollTo( 2000 );
		// The observer is trusted again: it says "in", and will call
		// back when that changes.
		expect( playState( loop ) ).toBe( 'running' );
		scrollTo( 0 );
	} );
} );
