/**
 * Blocks added after the page loads must be wired too (GH #50).
 *
 * frontend.js used to scan for animated blocks once, on
 * DOMContentLoaded. Markup added later (Query Loop pagination without a
 * full reload, infinite scroll, AJAX, popups) kept the initial-hide
 * styles and never animated in. It now wires blocks one at a time,
 * watches the document for new ones, re-wires a block whose class
 * attribute was reset to fresh server markup, and exposes
 * `window.motionBlocks.refresh()`.
 *
 * Run: npm run test:unit
 */

// jsdom has no IntersectionObserver / ResizeObserver. Record what's
// observed so the tests can check teardown.
const observers = [];
class FakeObserver {
	constructor( cb ) {
		this.cb = cb;
		this.targets = new Set();
		this.disconnected = false;
		observers.push( this );
	}
	observe( el ) {
		this.targets.add( el );
	}
	unobserve( el ) {
		this.targets.delete( el );
	}
	disconnect() {
		this.disconnected = true;
		this.targets.clear();
	}
}
global.IntersectionObserver = FakeObserver;
global.ResizeObserver = FakeObserver;

const flush = () => new Promise( ( r ) => setTimeout( r, 0 ) );

function block( mode, text = '' ) {
	const p = document.createElement( 'p' );
	p.className = `mb-animated mb-mode-${ mode } mb-enter-fade${
		mode === 'scroll-appear' ? ' mb-has-entry' : ''
	}`;
	p.setAttribute( 'data-mb-mode', mode );
	p.setAttribute(
		mode === 'scroll-appear' ? 'data-mb-entry-type' : 'data-mb-type',
		'fade'
	);
	p.textContent = text;
	return p;
}

/** Observers currently watching `el`. */
function watching( el ) {
	return observers.filter( ( o ) => o.targets.has( el ) );
}

let initial;

beforeAll( () => {
	document.documentElement.classList.add( 'mb-js' );
	document.body.innerHTML = '';
	initial = {
		pageLoad: block( 'page-load', 'initial page load' ),
		scrollAppear: block( 'scroll-appear', 'initial scroll appear' ),
	};
	document.body.append( initial.pageLoad, initial.scrollAppear );
	// jsdom's readyState is already 'complete', so this runs init().
	require( '../../src/frontend.js' );
} );

describe( 'blocks present at load', () => {
	it( 'are wired and marked', () => {
		expect( initial.pageLoad.classList.contains( 'mb-wired' ) ).toBe(
			true
		);
		expect( initial.pageLoad.classList.contains( 'mb-triggered' ) ).toBe(
			true
		);
		expect( initial.scrollAppear.classList.contains( 'mb-wired' ) ).toBe(
			true
		);
		expect( watching( initial.scrollAppear ).length ).toBe( 2 );
	} );

	it( 'expose the public refresh hook', () => {
		expect( typeof window.motionBlocks.refresh ).toBe( 'function' );
	} );
} );

describe( 'blocks added after load', () => {
	it( 'wires an added Page Load block before it is painted', async () => {
		const el = block( 'page-load', 'added' );
		document.body.append( el );
		await flush();
		expect( el.classList.contains( 'mb-wired' ) ).toBe( true );
		expect( el.classList.contains( 'mb-triggered' ) ).toBe( true );
	} );

	it( 'wires an added Scroll Appear block', async () => {
		const el = block( 'scroll-appear', 'added' );
		document.body.append( el );
		await flush();
		expect( el.classList.contains( 'mb-wired' ) ).toBe( true );
		// Its IntersectionObserver and ResizeObserver.
		expect( watching( el ).length ).toBe( 2 );
	} );

	it( 'wires blocks nested inside added markup (a swapped region)', async () => {
		const region = document.createElement( 'div' );
		region.innerHTML =
			'<div class="wp-block-group"><p class="mb-animated mb-mode-scroll-appear mb-enter-fade mb-has-entry" data-mb-mode="scroll-appear" data-mb-entry-type="fade">deep</p></div>';
		document.body.append( region );
		await flush();
		const el = region.querySelector( 'p' );
		expect( el.classList.contains( 'mb-wired' ) ).toBe( true );
	} );

	it( 'wires each block once', async () => {
		const el = block( 'scroll-appear', 'once' );
		document.body.append( el );
		await flush();
		const before = observers.length;
		// Moving it, or calling refresh(), must not wire it again.
		document.body.prepend( el );
		window.motionBlocks.refresh();
		await flush();
		expect( observers.length ).toBe( before );
		expect( watching( el ).length ).toBe( 2 );
	} );
} );

describe( 'class attribute reset to server markup', () => {
	it( 're-wires the block and replaces its old observers', async () => {
		const el = block( 'scroll-appear', 'reset' );
		const server = el.className;
		document.body.append( el );
		await flush();
		const old = watching( el );
		expect( old.length ).toBe( 2 );
		// What the Interactivity API router does when it reuses an
		// element whose class string differs between pages.
		el.setAttribute( 'class', server );
		await flush();
		expect( el.classList.contains( 'mb-wired' ) ).toBe( true );
		expect( old.every( ( o ) => o.disconnected ) ).toBe( true );
		expect( watching( el ).length ).toBe( 2 );
	} );

	it( 're-triggers a Page Load block', async () => {
		const el = block( 'page-load', 'reset' );
		const server = el.className;
		document.body.append( el );
		await flush();
		el.setAttribute( 'class', server );
		await flush();
		expect( el.classList.contains( 'mb-triggered' ) ).toBe( true );
	} );
} );

describe( 'removed blocks', () => {
	it( 'stop being observed', async () => {
		const el = block( 'scroll-appear', 'removed' );
		document.body.append( el );
		await flush();
		const mine = watching( el );
		el.remove();
		await flush();
		expect( mine.every( ( o ) => o.disconnected ) ).toBe( true );
	} );
} );

describe( 'blocks removed and put back later', () => {
	it( 'are wired again (a modal re-attaching its content)', async () => {
		const el = block( 'scroll-appear', 'modal' );
		document.body.append( el );
		await flush();
		el.remove();
		await flush();
		expect( watching( el ).length ).toBe( 0 );
		document.body.append( el );
		await flush();
		expect( el.classList.contains( 'mb-wired' ) ).toBe( true );
		expect( watching( el ).length ).toBe( 2 );
	} );
} );

describe( 'stagger parents', () => {
	it( 'number children added after load', async () => {
		const list = document.createElement( 'ul' );
		list.className =
			'wp-block-list mb-animated mb-mode-page-load mb-enter-fade mb-stagger-parent';
		list.setAttribute( 'data-mb-mode', 'page-load' );
		list.setAttribute( 'data-mb-type', 'fade' );
		list.innerHTML = '<li>1</li><li>2</li>';
		document.body.append( list );
		await flush();
		const li = document.createElement( 'li' );
		list.append( li );
		await flush();
		expect( li.style.getPropertyValue( '--mb-stagger-index' ) ).toBe( '2' );
	} );
} );
