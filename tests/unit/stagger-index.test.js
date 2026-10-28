/**
 * Stagger position per inner block (GH #53).
 *
 * The stepped Stagger delay in css/animations.css multiplies each
 * child's `--mb-stagger-index` by the step. The index used to be implied
 * by 30 `:nth-child()` rules, so children past the 30th started at once.
 * src/stagger-index.js now writes it on every child, counting exactly
 * the way `:nth-child()` did (0-based, element siblings, through the
 * classic-theme Group wrapper, GH #66).
 *
 * Run: npm run test:unit
 */
import {
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
} );
