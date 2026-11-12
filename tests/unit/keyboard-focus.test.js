/**
 * Keyboard focus inside hidden or looping blocks (GH #134).
 *
 * Blocks waiting for their Entry, or that have played their Exit, are
 * hidden with `opacity: 0` only, so a link or button inside can still
 * take focus. When focus moves into an animated block it is shown at
 * rest straight away. A looping Page Load block holds still while
 * keyboard focus is inside it, and a loop never plays faster than
 * LOOP_MIN_DURATION.
 *
 * jsdom has no layout, so the offsets the engine reads are stubbed.
 * It has no `:focus-visible` either, which frontend.js treats as "every
 * focus is from the keyboard".
 *
 * Run: npm run test:unit
 */
import {
	LOOP_MIN_DURATION,
	repeatChangeAttributes,
} from '../../src/components/constants';

class FakeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}
global.IntersectionObserver = FakeObserver;
global.ResizeObserver = FakeObserver;

function layout( el, top, height, parent = document.body ) {
	Object.defineProperties( el, {
		offsetTop: { get: () => top, configurable: true },
		offsetLeft: { get: () => 0, configurable: true },
		offsetHeight: { get: () => height, configurable: true },
		offsetWidth: { get: () => 300, configurable: true },
		offsetParent: { get: () => parent, configurable: true },
	} );
	return el;
}

/** A block with a link inside it. */
function withLink( className, attrs ) {
	const div = document.createElement( 'div' );
	div.className = 'mb-animated ' + className;
	Object.keys( attrs ).forEach( ( k ) => div.setAttribute( k, attrs[ k ] ) );
	const a = document.createElement( 'a' );
	a.href = '#';
	a.textContent = 'Link';
	div.append( a );
	return div;
}

function scrollAppear( { entry = true, exit = '', entryReplay = 'once' } ) {
	const attrs = { 'data-mb-mode': 'scroll-appear' };
	let cls = 'mb-mode-scroll-appear';
	if ( entry ) {
		cls += ' mb-enter-fade mb-has-entry';
		attrs[ 'data-mb-entry-type' ] = 'fade';
		attrs[ 'data-mb-entry-replay' ] = entryReplay;
	}
	if ( exit ) {
		cls += ' mb-exit-fade';
		attrs[ 'data-mb-exit-type' ] = 'fade';
		attrs[ 'data-mb-exit-replay' ] = exit;
	}
	return withLink( cls, attrs );
}

function pageLoad( repeat, duration, pauseOffscreen ) {
	const attrs = {
		'data-mb-mode': 'page-load',
		'data-mb-type': 'fade',
		'data-mb-repeat': repeat,
		'data-mb-duration': String( duration ),
	};
	if ( pauseOffscreen ) {
		attrs[ 'data-mb-pause-offscreen' ] = 'true';
	}
	return withLink( 'mb-mode-page-load mb-enter-fade', attrs );
}

function scrollTo( y ) {
	window.scrollY = y;
	window.motionBlocks.refresh();
}

const link = ( el ) => el.querySelector( 'a' );
const shown = ( el ) => el.classList.contains( 'mb-triggered' );
const exited = ( el ) => el.classList.contains( 'mb-exit-triggered' );
const playState = ( el ) => el.style.getPropertyValue( '--mb-play-state' );
const duration = ( el ) => el.style.getPropertyValue( '--mb-duration' );

const b = {};

beforeAll( () => {
	document.documentElement.classList.add( 'mb-js', 'mb-motion' );
	Object.defineProperty( window, 'innerHeight', { value: 800 } );
	Object.defineProperty( window, 'innerWidth', { value: 1280 } );
	Object.defineProperty( window, 'scrollY', { value: 0, writable: true } );
	Object.defineProperty( document.documentElement, 'scrollHeight', {
		get: () => 20000,
	} );
	document.documentElement.getBoundingClientRect = () => ( {
		top: -window.scrollY,
		left: 0,
	} );
	layout( document.body, 0, 20000, null );

	b.waiting = layout( scrollAppear( {} ), 3000, 48 );
	b.nestedOuter = layout( scrollAppear( {} ), 4000, 200 );
	b.nestedInner = layout( scrollAppear( {} ), 4050, 48 );
	b.nestedOuter.append( b.nestedInner );
	b.exitOnce = layout( scrollAppear( { exit: 'once' } ), 6000, 48 );
	b.exitOnly = layout(
		scrollAppear( { entry: false, exit: 'reverse' } ),
		6200,
		48
	);
	b.atRest = layout(
		scrollAppear( { entry: false, exit: 'reverse' } ),
		15000,
		48
	);
	b.loop = layout( pageLoad( 'loop', 0.1 ), 100, 48 );
	b.alternate = layout( pageLoad( 'alternate', 2, true ), 200, 48 );
	b.once = layout( pageLoad( 'once', 0.1 ), 300, 48 );
	b.outside = document.createElement( 'button' );
	document.body.append(
		b.waiting,
		b.nestedOuter,
		b.exitOnce,
		b.exitOnly,
		b.atRest,
		b.loop,
		b.alternate,
		b.once,
		b.outside
	);
	// jsdom's readyState is already 'complete', so this runs init().
	require( '../../src/frontend.js' );
	window.motionBlocks.refresh();
} );

describe( 'focus in a Scroll Appear block', () => {
	it( 'shows a block that is still waiting for its Entry', () => {
		expect( shown( b.waiting ) ).toBe( false );
		link( b.waiting ).focus();
		expect( shown( b.waiting ) ).toBe( true );
	} );

	it( 'shows every animated block around the focused element', () => {
		link( b.nestedInner ).focus();
		expect( shown( b.nestedInner ) ).toBe( true );
		expect( shown( b.nestedOuter ) ).toBe( true );
	} );

	it( 'brings back a block whose Exit played, Replay once included', () => {
		// Scroll both blocks through the band and out of its top.
		scrollTo( 5800 );
		scrollTo( 6400 );
		expect( exited( b.exitOnce ) ).toBe( true );
		expect( exited( b.exitOnly ) ).toBe( true );

		link( b.exitOnce ).focus();
		expect( exited( b.exitOnce ) ).toBe( false );
		expect( shown( b.exitOnce ) ).toBe( true );

		link( b.exitOnly ).focus();
		expect( exited( b.exitOnly ) ).toBe( false );
		expect( b.exitOnly.style.getPropertyValue( '--mb-direction' ) ).toBe(
			''
		);
	} );

	it( 'keeps a Replay once block shown as the page scrolls on', () => {
		scrollTo( 7000 );
		scrollTo( 5800 );
		expect( exited( b.exitOnce ) ).toBe( false );
		expect( shown( b.exitOnce ) ).toBe( true );
	} );

	it( 'leaves an Exit-only block at rest alone', () => {
		link( b.atRest ).focus();
		expect( b.atRest.className ).not.toMatch( /triggered/ );
	} );
} );

describe( 'focus in a looping Page Load block', () => {
	it( 'holds the loop still, and starts it again when focus leaves', () => {
		link( b.loop ).focus();
		expect( playState( b.loop ) ).toBe( 'paused' );
		b.outside.focus();
		expect( playState( b.loop ) ).toBe( '' );
	} );

	it( 'starts again when focus leaves the page', () => {
		link( b.loop ).focus();
		expect( playState( b.loop ) ).toBe( 'paused' );
		link( b.loop ).blur();
		expect( playState( b.loop ) ).toBe( '' );
	} );

	it( 'hands back to Pause off-screen afterwards', () => {
		link( b.alternate ).focus();
		expect( playState( b.alternate ) ).toBe( 'paused' );
		b.outside.focus();
		// Its layout box is 200px down a page scrolled to 5800: off-screen.
		expect( playState( b.alternate ) ).toBe( 'paused' );
		scrollTo( 0 );
		link( b.alternate ).focus();
		b.outside.focus();
		expect( playState( b.alternate ) ).toBe( 'running' );
	} );

	it( 'does not pause a one-shot', () => {
		link( b.once ).focus();
		expect( playState( b.once ) ).toBe( '' );
	} );
} );

describe( 'loop minimum Duration', () => {
	it( 'raises a shorter stored Duration on the front end', () => {
		expect( duration( b.loop ) ).toBe( LOOP_MIN_DURATION + 's' );
	} );

	it( 'leaves longer loops and one-shots as stored', () => {
		expect( duration( b.alternate ) ).toBe( '2s' );
		expect( duration( b.once ) ).toBe( '0.1s' );
	} );

	it( 'raises Duration in the editor when Repeat changes to a loop', () => {
		expect( repeatChangeAttributes( 'loop', 0.1 ) ).toEqual( {
			animationRepeat: 'loop',
			animationDuration: LOOP_MIN_DURATION,
		} );
		expect( repeatChangeAttributes( 'alternate', 0.6 ) ).toEqual( {
			animationRepeat: 'alternate',
		} );
		expect( repeatChangeAttributes( 'once', 0.1 ) ).toEqual( {
			animationRepeat: 'once',
		} );
	} );
} );
