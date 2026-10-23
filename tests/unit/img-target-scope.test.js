/**
 * "Animate image only" targets the Cover's background image and
 * nothing else (2026-10-20 review, #58).
 *
 * Every img-target rule used a descendant `img:first-of-type`, which
 * matches the first image of EVERY sibling group under the Cover, so an
 * Image block (a logo, say) in the Cover's inner content animated with
 * the background and was clipped by its own figure. The background
 * image is always a direct child of the Cover wrapper (core's own
 * Cover duotone selector is `> .wp-block-cover__image-background`), so
 * the rules now use `> img:first-of-type`.
 *
 * Run: npm run test:unit
 */
const fs = require( 'fs' );
const path = require( 'path' );
import { settleTargets } from '../../src/settle';

const root = path.join( __dirname, '..', '..' );
const read = ( f ) => fs.readFileSync( path.join( root, f ), 'utf8' );
const css = read( 'css/animations.css' ).replace( /\/\*[\s\S]*?\*\//g, '' );

/**
 * Split a selector list on its top-level commas only, so a list inside
 * `:where( … )` / `:is( … )` stays one selector.
 *
 * @param {string} list Selector list.
 * @return {string[]} Selectors.
 */
function splitTopLevel( list ) {
	const parts = [];
	let depth = 0;
	let start = 0;
	for ( let i = 0; i < list.length; i++ ) {
		const c = list[ i ];
		if ( c === '(' ) {
			depth++;
		} else if ( c === ')' ) {
			depth--;
		} else if ( c === ',' && depth === 0 ) {
			parts.push( list.slice( start, i ) );
			start = i + 1;
		}
	}
	parts.push( list.slice( start ) );
	return parts;
}

/** Every selector in animations.css that reaches an image. */
function imgSelectors() {
	const out = [];
	const re = /([^{}]+)\{/g;
	let m;
	while ( ( m = re.exec( css ) ) ) {
		splitTopLevel( m[ 1 ] )
			.map( ( s ) => s.replace( /\s+/g, ' ' ).trim() )
			.filter( ( s ) => s.includes( 'img:first-of-type' ) )
			.forEach( ( s ) => out.push( s ) );
	}
	return out;
}

function cover() {
	document.body.innerHTML = `
		<div class="wp-block-cover mb-animated mb-mode-page-load mb-enter-slide mb-triggered mb-settled mb-exit-triggered mb-enter-flip mb-exit-flip mb-enter-fade mb-has-entry mb-mode-scroll-appear mb-mode-scroll-interactive" data-mb-target="img">
			<span class="wp-block-cover__background has-background-dim"></span>
			<img class="wp-block-cover__image-background" id="bg" alt="" />
			<div class="wp-block-cover__inner-container">
				<figure class="wp-block-image"><img id="logo" alt="" /></figure>
				<p>Text</p>
			</div>
		</div>`;
	return document.querySelector( '.wp-block-cover' );
}

describe( 'img-target selectors', () => {
	it( 'all use the child combinator', () => {
		const selectors = imgSelectors();
		expect( selectors.length ).toBeGreaterThan( 40 );
		selectors.forEach( ( s ) => {
			expect( [ s, /> img:first-of-type(\s*\))*$/.test( s ) ] ).toEqual( [
				s,
				true,
			] );
		} );
	} );

	it( 'match the background image, never an image inside the Cover', () => {
		cover();
		// jsdom's selector engine can't parse combinators inside
		// `:is( … )`, so test each item of such a list on its own.
		const expand = ( s ) => {
			const m = s.match( /^(.*?):is\((.*)\)$/ );
			if ( ! m ) {
				return [ s ];
			}
			return splitTopLevel( m[ 2 ] ).map(
				( item ) => m[ 1 ] + item.trim()
			);
		};
		let checked = 0;
		imgSelectors()
			.flatMap( expand )
			.filter( ( s ) => s.includes( 'img:first-of-type' ) )
			.forEach( ( s ) => {
				const ids = [ ...document.querySelectorAll( s ) ].map(
					( el ) => el.id
				);
				checked++;
				expect( [ s, ids.includes( 'logo' ) ] ).toEqual( [ s, false ] );
			} );
		expect( checked ).toBeGreaterThan( 40 );
	} );

	it( 'the runtime and editor scoped CSS use the child combinator too', () => {
		const frontend = read( 'src/frontend.js' );
		const editor = read( 'src/index.js' );
		expect( frontend ).not.toMatch( /scope \+ ' img:first-of-type'/ );
		expect( frontend ).not.toMatch( /' :has\(> img/ );
		expect( editor ).not.toMatch( /\$\{ scope \} img:first-of-type/ );
		expect( editor ).not.toMatch( /\$\{ scope \} :has\(> img/ );
	} );
} );

describe( 'settleTargets', () => {
	it( "doesn't treat an inner Image block as the Cover's image", () => {
		const el = cover();
		const targets = settleTargets( el ) || [];
		const ids = targets.map( ( t ) => t.id );
		expect( ids ).toContain( 'bg' );
		expect( ids ).not.toContain( 'logo' );
	} );
} );

/*
 * Image optimisers can wrap the Cover's background image in <picture>
 * (WebP / AVIF), making it a grandchild. Those must still animate.
 */
describe( 'background image wrapped in <picture>', () => {
	const {
		imgTargetSelector,
		imgFrameSelector,
		imgTargetsOf,
	} = require( '../../src/img-target' );

	function pictureCover() {
		document.body.innerHTML = `
			<div class="wp-block-cover mb-animated mb-mode-page-load mb-enter-fade mb-triggered" data-mb-target="img" data-mb-type="fade">
				<picture><source srcset="bg.webp" type="image/webp" /><img class="wp-block-cover__image-background" id="bg" alt="" /></picture>
				<div class="wp-block-cover__inner-container">
					<figure class="wp-block-image"><picture><img id="logo" alt="" /></picture></figure>
				</div>
			</div>`;
		return document.querySelector( '.wp-block-cover' );
	}

	it( 'every child-path rule has a <picture> twin in animations.css', () => {
		// Expand `:is( … )` lists so each item counts on its own.
		const all = imgSelectors().flatMap( ( s ) => {
			const m = s.match( /^(.*?):is\((.*)\)$/ );
			return m
				? splitTopLevel( m[ 2 ] ).map(
						( item ) => m[ 1 ] + item.trim()
				  )
				: [ s ];
		} );
		const items = all.filter( ( s ) => s.includes( 'img:first-of-type' ) );
		const plain = items.filter( ( s ) => ! s.includes( '> picture >' ) );
		const twins = new Set(
			items.filter( ( s ) => s.includes( '> picture >' ) )
		);
		expect( plain.length ).toBeGreaterThan( 40 );
		plain.forEach( ( s ) => {
			const twin = s.replace(
				'> img:first-of-type',
				'> picture > img:first-of-type'
			);
			expect( [ s, twins.has( twin ) ] ).toEqual( [ s, true ] );
		} );
	} );

	it( 'the helpers find the background image only', () => {
		const el = pictureCover();
		expect( imgTargetsOf( el ).map( ( i ) => i.id ) ).toEqual( [ 'bg' ] );
		expect(
			[
				...document.querySelectorAll(
					imgTargetSelector( '.wp-block-cover' )
				),
			].map( ( i ) => i.id )
		).toEqual( [ 'bg' ] );
		expect( imgFrameSelector( '[data-mb-uid="x"]' ) ).toBe(
			'[data-mb-uid="x"]:has(> img:first-of-type, > picture > img:first-of-type)'
		);
	} );

	it( 'settleTargets includes the wrapped background image', () => {
		const el = pictureCover();
		const ids = ( settleTargets( el ) || [] ).map( ( t ) => t.id );
		expect( ids ).toContain( 'bg' );
		expect( ids ).not.toContain( 'logo' );
	} );
} );
