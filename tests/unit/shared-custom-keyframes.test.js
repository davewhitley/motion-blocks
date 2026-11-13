/**
 * Blocks with the same Custom From/To share one keyframe rule
 * (GH #178).
 *
 * Every Custom block used to write its own `@keyframes` rule to the
 * page, and each write made the browser re-work the page's styles.
 * Auto-animate gives every block below the fold the same From/To, so
 * a long page paid that cost once per block.
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

function custom( fromOpacity, extra = {} ) {
	const p = document.createElement( 'p' );
	p.className =
		'mb-animated mb-mode-scroll-appear mb-enter-custom mb-has-entry';
	p.setAttribute( 'data-mb-mode', 'scroll-appear' );
	p.setAttribute( 'data-mb-entry-type', 'custom' );
	p.setAttribute( 'data-mb-entry-from-opacity', fromOpacity );
	p.setAttribute( 'data-mb-entry-to-opacity', '1' );
	Object.keys( extra ).forEach( ( key ) =>
		p.setAttribute( key, extra[ key ] )
	);
	return p;
}

const nameOf = ( el ) => el.style.getPropertyValue( '--mb-entry-anim-name' );

let a;
let b;
let different;
let imgOne;
let imgTwo;

beforeAll( () => {
	window.matchMedia = () => ( {
		matches: false,
		addEventListener() {},
		removeEventListener() {},
	} );
	a = custom( '0' );
	b = custom( '0' );
	different = custom( '0.5' );
	imgOne = custom( '0', { 'data-mb-target': 'img' } );
	imgTwo = custom( '0', { 'data-mb-target': 'img' } );
	document.body.append( a, b, different, imgOne, imgTwo );
	require( '../../src/frontend.js' );
} );

it( 'gives blocks with the same From/To the same keyframe', () => {
	expect( nameOf( a ) ).toMatch( /^mb-custom-runtime-\d+$/ );
	expect( nameOf( b ) ).toBe( nameOf( a ) );
} );

it( 'gives a different From/To its own keyframe', () => {
	expect( nameOf( different ) ).toMatch( /^mb-custom-runtime-\d+$/ );
	expect( nameOf( different ) ).not.toBe( nameOf( a ) );
} );

it( 'writes each distinct keyframe once', () => {
	const css = document.querySelector( 'style[data-mb-custom]' ).textContent;
	expect( css.match( /@keyframes /g ) ).toHaveLength( 2 );
} );

it( 'still gives each "Animate image only" block its own id', () => {
	const one = imgOne.getAttribute( 'data-mb-uid' );
	const two = imgTwo.getAttribute( 'data-mb-uid' );
	expect( one ).toBeTruthy();
	expect( two ).toBeTruthy();
	expect( one ).not.toBe( two );
} );
