/**
 * A one-shot block wired while motion is off is settled at once
 * (GH #170).
 *
 * With reduced motion, or on a device the page has animations switched
 * off for, nothing plays, so no animation ever ends and the block was
 * never marked finished. When motion came back mid-visit (a resize or
 * rotation into another device's range), every such block hid and
 * played once, in front of a visitor who was already reading it.
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

function pageLoad( attrs = {} ) {
	const p = document.createElement( 'p' );
	p.className = 'mb-animated mb-mode-page-load mb-enter-fade';
	p.setAttribute( 'data-mb-mode', 'page-load' );
	p.setAttribute( 'data-mb-type', 'fade' );
	p.setAttribute( 'data-mb-loop', 'off' );
	Object.keys( attrs ).forEach( ( key ) =>
		p.setAttribute( key, attrs[ key ] )
	);
	return p;
}

let once;
let loop;

beforeAll( () => {
	// Reduced motion is on.
	window.matchMedia = ( query ) => ( {
		matches: /prefers-reduced-motion/.test( query ),
		addEventListener() {},
		removeEventListener() {},
	} );
	once = pageLoad();
	loop = pageLoad( { 'data-mb-loop': 'loop' } );
	document.body.append( once, loop );
	require( '../../src/frontend.js' );
} );

it( 'keeps motion off', () => {
	expect( document.documentElement.classList.contains( 'mb-motion' ) ).toBe(
		false
	);
} );

it( 'settles a one-shot Page Load block straight away', () => {
	expect( once.classList.contains( 'mb-triggered' ) ).toBe( true );
	expect( once.classList.contains( 'mb-settled' ) ).toBe( true );
} );

it( 'leaves a looping block alone: it should play when motion returns', () => {
	expect( loop.classList.contains( 'mb-settled' ) ).toBe( false );
} );
