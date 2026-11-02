/**
 * Stagger position per inner block (GH #53).
 *
 * The stepped Stagger delay in css/animations.css multiplies each
 * child's `--mb-stagger-index` by the step. The index used to be implied
 * by 30 `:nth-child()` rules, so children past the 30th started at once.
 * src/stagger-index.js now writes it on every child, counting exactly
 * the way `:nth-child()` did (0-based, element siblings, through the
 * classic-theme Group wrapper, GH #66). Children hidden at the current
 * screen size (core's "Hide on mobile") are skipped, and frontend.js
 * counts again when the viewport crosses a breakpoint.
 *
 * Run: npm run test:unit
 */
import {
	isStaggerHidden,
	staggerTargets,
	setStaggerIndices,
	STAGGER_INDEX_VAR,
} from '../../src/stagger-index';

const indexOf = ( el ) => el.style.getPropertyValue( STAGGER_INDEX_VAR );

function build( html ) {
	const host = document.createElement( 'div' );
	host.innerHTML = html.trim();
	return host.firstElementChild;
}

function list( count ) {
	let items = '';
	for ( let i = 1; i <= count; i++ ) {
		items += `<li>Item ${ i }</li>`;
	}
	return build( `<ul class="mb-stagger-parent">${ items }</ul>` );
}

describe( 'setStaggerIndices', () => {
	it( 'numbers every child of a long list, past the 30th', () => {
		const ul = list( 35 );
		setStaggerIndices( ul );
		const got = [ ...ul.children ].map( indexOf );
		expect( got ).toEqual(
			Array.from( { length: 35 }, ( _, i ) => String( i ) )
		);
	} );

	it( 'reaches through the classic-theme Group wrapper (GH #66)', () => {
		const group = build( `
			<div class="wp-block-group mb-stagger-parent">
				<div class="wp-block-group__inner-container">
					<p>One</p><p>Two</p><p>Three</p>
				</div>
			</div>` );
		setStaggerIndices( group );
		const wrapper = group.firstElementChild;
		expect( indexOf( wrapper ) ).toBe( '' );
		expect( [ ...wrapper.children ].map( indexOf ) ).toEqual( [
			'0',
			'1',
			'2',
		] );
	} );

	it( 'counts a Gallery caption like :nth-child() does', () => {
		const gallery = build( `
			<figure class="wp-block-gallery mb-stagger-parent">
				<figure class="wp-block-image"></figure>
				<figure class="wp-block-image"></figure>
				<figure class="wp-block-image"></figure>
				<figcaption>Caption</figcaption>
			</figure>` );
		setStaggerIndices( gallery );
		expect( [ ...gallery.children ].map( indexOf ) ).toEqual( [
			'0',
			'1',
			'2',
			'3',
		] );
	} );

	it( 'rewrites the positions after a reorder', () => {
		const ul = list( 3 );
		setStaggerIndices( ul );
		const last = ul.lastElementChild;
		ul.insertBefore( last, ul.firstElementChild );
		setStaggerIndices( ul );
		expect( indexOf( last ) ).toBe( '0' );
		expect( [ ...ul.children ].map( indexOf ) ).toEqual( [
			'0',
			'1',
			'2',
		] );
	} );

	it( 'returns the same targets the CSS selector pair matches', () => {
		const group = build( `
			<div class="mb-stagger-parent">
				<p>A</p>
				<div class="wp-block-group__inner-container"><p>B</p><p>C</p></div>
			</div>` );
		const targets = staggerTargets( group ).map( ( t ) => [
			t.el.textContent,
			t.index,
		] );
		expect( targets ).toEqual( [
			[ 'A', 0 ],
			[ 'B', 0 ],
			[ 'C', 1 ],
		] );
	} );
} );

describe( 'spacers', () => {
	it( 'skips a Spacer without leaving a gap in the sequence', () => {
		const group = build( `
			<div class="wp-block-group mb-stagger-parent">
				<h2>A</h2>
				<div class="wp-block-spacer" aria-hidden="true"></div>
				<p>B</p>
				<p>C</p>
			</div>` );
		setStaggerIndices( group );
		const [ a, spacer, b, c ] = group.children;
		expect( indexOf( spacer ) ).toBe( '' );
		expect( [ a, b, c ].map( indexOf ) ).toEqual( [ '0', '1', '2' ] );
	} );

	it( 'skips a Spacer inside the classic-theme wrapper and in the editor', () => {
		const group = build( `
			<div class="mb-stagger-parent">
				<div class="wp-block-group__inner-container">
					<p>A</p>
					<div data-type="core/spacer"></div>
					<p>B</p>
				</div>
			</div>` );
		expect(
			staggerTargets( group ).map( ( t ) => [
				t.el.textContent,
				t.index,
			] )
		).toEqual( [
			[ 'A', 0 ],
			[ 'B', 1 ],
		] );
	} );
} );

describe( 'nested stagger parents (#53)', () => {
	it( 'skips a nested stagger parent, which runs its own cascade', () => {
		const outer = build( `
			<div class="wp-block-group mb-stagger-parent">
				<h2>A</h2>
				<div class="wp-block-group mb-stagger-parent"><p>X</p></div>
				<p>B</p>
			</div>` );
		expect(
			staggerTargets( outer ).map( ( t ) => [
				t.el.textContent.trim(),
				t.index,
			] )
		).toEqual( [
			[ 'A', 0 ],
			[ 'B', 1 ],
		] );
	} );
} );

describe( 'hidden children (core per-block visibility)', () => {
	afterEach( () => {
		document.body.innerHTML = '';
		document.head.innerHTML = '';
	} );

	function items( group ) {
		return [ ...group.children ].map( ( el ) => [
			el.textContent.trim(),
			indexOf( el ),
		] );
	}

	it( 'skips a child hidden with display: none, without a gap', () => {
		// The fixture block-visibility-mobile at 400px: item 2 is hidden.
		document.head.innerHTML =
			'<style>.wp-block-hidden-mobile{display:none !important}</style>';
		document.body.innerHTML = `
			<div class="wp-block-group mb-stagger-parent">
				<p>1</p>
				<p class="wp-block-hidden-mobile">2</p>
				<p>3</p>
				<p>4</p>
			</div>`;
		const group = document.body.firstElementChild;
		setStaggerIndices( group );
		// Item 2 takes item 3's position, so it falls into place if it
		// shows before the next count.
		expect( items( group ) ).toEqual( [
			[ '1', '0' ],
			[ '2', '1' ],
			[ '3', '1' ],
			[ '4', '2' ],
		] );
		expect( staggerTargets( group ).map( ( t ) => t.hidden ) ).toEqual( [
			false,
			true,
			false,
			false,
		] );
	} );

	it( 'skips a child the editor hides with .is-block-hidden', () => {
		const group = build( `
			<div class="mb-stagger-parent">
				<div class="wp-block-group__inner-container">
					<p>1</p>
					<p class="block-editor-block-list__block is-block-hidden">2</p>
					<p>3</p>
				</div>
			</div>` );
		expect(
			staggerTargets( group ).map( ( t ) => [
				t.el.textContent,
				t.index,
				t.hidden,
			] )
		).toEqual( [
			[ '1', 0, false ],
			[ '2', 1, true ],
			[ '3', 1, false ],
		] );
	} );

	it( 'gives a child its position back once it shows again', () => {
		const group = build( `
			<div class="mb-stagger-parent">
				<p>1</p><p style="display: none">2</p><p>3</p>
			</div>` );
		document.body.appendChild( group );
		setStaggerIndices( group );
		expect( items( group ).map( ( i ) => i[ 1 ] ) ).toEqual( [
			'0',
			'1',
			'1',
		] );
		group.children[ 1 ].style.display = '';
		setStaggerIndices( group );
		expect( items( group ).map( ( i ) => i[ 1 ] ) ).toEqual( [
			'0',
			'1',
			'2',
		] );
	} );

	it( 'counts every child with a custom isHidden', () => {
		const group = build( `
			<div class="mb-stagger-parent">
				<p>1</p><p class="is-block-hidden">2</p><p>3</p>
			</div>` );
		expect(
			staggerTargets( group, () => false ).map( ( t ) => t.index )
		).toEqual( [ 0, 1, 2 ] );
	} );

	it( 'isStaggerHidden reads display, not visibility', () => {
		const el = document.createElement( 'p' );
		document.body.appendChild( el );
		expect( isStaggerHidden( el ) ).toBe( false );
		el.style.visibility = 'hidden';
		expect( isStaggerHidden( el ) ).toBe( false );
		el.style.display = 'none';
		expect( isStaggerHidden( el ) ).toBe( true );
	} );
} );

describe( 'frontend.js', () => {
	afterEach( () => {
		document.body.innerHTML = '';
	} );

	it( 'numbers stagger children before Page Load triggers them', () => {
		let items = '';
		for ( let i = 1; i <= 35; i++ ) {
			items += `<li>Item ${ i }</li>`;
		}
		document.body.innerHTML = `<ul class="wp-block-list mb-animated mb-mode-page-load mb-enter-fade mb-stagger-parent" data-mb-mode="page-load" data-mb-type="fade" data-mb-duration="0.6" data-mb-delay="0">${ items }</ul>`;
		const ul = document.body.firstElementChild;

		// What child 35 carried at the moment the parent got its
		// trigger class: its delay is fixed when its animation starts.
		let indexAtTrigger = null;
		const { DOMTokenList } = window;
		const add = DOMTokenList.prototype.add;
		const spy = jest
			.spyOn( DOMTokenList.prototype, 'add' )
			.mockImplementation( function ( ...names ) {
				if (
					this === ul.classList &&
					names.includes( 'mb-triggered' ) &&
					indexAtTrigger === null
				) {
					indexAtTrigger = indexOf( ul.children[ 34 ] );
				}
				return add.apply( this, names );
			} );
		try {
			// jsdom has finished loading, so frontend.js runs init()
			// as soon as it is required.
			jest.isolateModules( () => {
				require( '../../src/frontend.js' );
			} );
		} finally {
			spy.mockRestore();
		}

		expect( ul.classList.contains( 'mb-triggered' ) ).toBe( true );
		expect( indexAtTrigger ).toBe( '34' );
		expect( indexOf( ul.children[ 0 ] ) ).toBe( '0' );
		expect( indexOf( ul.children[ 30 ] ) ).toBe( '30' );
	} );

	describe( 'hidden children', () => {
		// jsdom ignores @media rules, so `html.is-mobile` stands in for
		// "the viewport is in core's mobile range".
		const MOBILE = '(width <= 480px)';
		let listeners;
		let originalMatchMedia;

		beforeEach( () => {
			listeners = [];
			originalMatchMedia = window.matchMedia;
			window.matchMedia = ( query ) => ( {
				media: query,
				matches:
					query === MOBILE &&
					document.documentElement.classList.contains( 'is-mobile' ),
				addEventListener: ( type, cb ) =>
					listeners.push( { query, cb } ),
			} );
			window.motionBlocksDeviceQueries = {
				mobile: MOBILE,
				tablet: '(480px < width <= 782px)',
				desktop: '(width > 782px)',
			};
			document.head.innerHTML =
				'<style>.is-mobile .wp-block-hidden-mobile{display:none !important}</style>';
			document.documentElement.classList.add( 'is-mobile' );
			document.body.innerHTML = `
				<div class="wp-block-group mb-animated mb-mode-page-load mb-enter-fade mb-stagger-parent" data-mb-mode="page-load" data-mb-type="fade" data-mb-duration="0.6" data-mb-delay="0">
					<p>1</p>
					<p class="wp-block-hidden-mobile">2</p>
					<p>3</p>
					<p>4</p>
				</div>`;
			jest.isolateModules( () => {
				require( '../../src/frontend.js' );
			} );
		} );

		afterEach( () => {
			window.matchMedia = originalMatchMedia;
			delete window.motionBlocksDeviceQueries;
			document.head.innerHTML = '';
			document.documentElement.className = '';
		} );

		const positions = () =>
			[ ...document.body.firstElementChild.children ].map( indexOf );

		it( 'skips a child hidden at the current size', () => {
			expect( positions() ).toEqual( [ '0', '1', '1', '2' ] );
		} );

		it( 'counts again when the viewport crosses a breakpoint', () => {
			expect(
				listeners.filter( ( l ) => l.query === MOBILE ).length
			).toBeGreaterThan( 0 );
			document.documentElement.classList.remove( 'is-mobile' );
			listeners.forEach( ( l ) => l.cb() );
			expect( positions() ).toEqual( [ '0', '1', '2', '3' ] );
			document.documentElement.classList.add( 'is-mobile' );
			listeners.forEach( ( l ) => l.cb() );
			expect( positions() ).toEqual( [ '0', '1', '1', '2' ] );
		} );

		it( 'counts again when a child is hidden later', async () => {
			document.body.firstElementChild.children[ 2 ].classList.add(
				'wp-block-hidden-mobile'
			);
			await new Promise( ( r ) => setTimeout( r, 0 ) );
			expect( positions() ).toEqual( [ '0', '1', '1', '1' ] );
		} );
	} );
} );
