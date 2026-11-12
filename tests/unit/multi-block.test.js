/**
 * Putting one animation on several blocks (GH #132): the scope of
 * "Apply to other blocks", the mixed-selection check, and keeping an
 * animation across a block transform.
 */
import { selectSameTypeInfo } from '../../src/components/selectStable';
import {
	selectionHasMixedAnimations,
	keepAnimationOnTransform,
} from '../../src/components/savedAnimations';

/**
 * A fake block-editor selector over a flat list of
 * `{ id, name, parents, attrs }`.
 *
 * @param {Object[]} blocks Blocks.
 * @return {Object} Selector.
 */
function fakeSel( blocks ) {
	const byName = {};
	return {
		getBlocksByName( name ) {
			byName[ name ] =
				byName[ name ] ||
				blocks.filter( ( b ) => b.name === name ).map( ( b ) => b.id );
			return byName[ name ];
		},
		getBlockParents: ( id ) =>
			blocks.find( ( b ) => b.id === id )?.parents || [],
		getBlockName: ( id ) => blocks.find( ( b ) => b.id === id )?.name,
		getBlockAttributes: ( id ) =>
			blocks.find( ( b ) => b.id === id )?.attrs || {},
	};
}

describe( 'selectSameTypeInfo scope', () => {
	// A page shown inside its template: header part, Post Content,
	// footer part, plus a paragraph directly in the template.
	const blocks = [
		{ id: 'header', name: 'core/template-part', parents: [] },
		{ id: 'h-p', name: 'core/paragraph', parents: [ 'header' ] },
		{ id: 'content', name: 'core/post-content', parents: [] },
		{ id: 'p1', name: 'core/paragraph', parents: [ 'content' ] },
		{ id: 'group', name: 'core/group', parents: [ 'content' ] },
		{
			id: 'p2',
			name: 'core/paragraph',
			parents: [ 'content', 'group' ],
			attrs: { animationMode: 'page-load' },
		},
		{ id: 'pattern', name: 'core/block', parents: [ 'content' ] },
		{
			id: 'pat-p',
			name: 'core/paragraph',
			parents: [ 'content', 'pattern' ],
		},
		{ id: 't-p', name: 'core/paragraph', parents: [] },
		{ id: 'footer', name: 'core/template-part', parents: [] },
		{
			id: 'f-p',
			name: 'core/paragraph',
			parents: [ 'footer' ],
			attrs: { animationMode: 'page-load' },
		},
	];

	it( 'keeps a page block to the page content', () => {
		const info = selectSameTypeInfo(
			fakeSel( blocks ),
			'core/paragraph',
			'p1',
			false
		);
		expect( info.sameTypeIds ).toEqual( [ 'p1', 'p2' ] );
		// The animated footer paragraph isn't counted.
		expect( info.existingCount ).toBe( 1 );
	} );

	it( 'keeps a header block to its header', () => {
		expect(
			selectSameTypeInfo(
				fakeSel( blocks ),
				'core/paragraph',
				'h-p',
				false
			).sameTypeIds
		).toEqual( [ 'h-p' ] );
	} );

	it( 'keeps a template block out of parts and the page content', () => {
		expect(
			selectSameTypeInfo(
				fakeSel( blocks ),
				'core/paragraph',
				't-p',
				false
			).sameTypeIds
		).toEqual( [ 't-p' ] );
	} );

	it( 'reaches every block when nothing is shared', () => {
		const plain = [
			{ id: 'a', name: 'core/paragraph', parents: [] },
			{ id: 'g', name: 'core/group', parents: [] },
			{ id: 'b', name: 'core/paragraph', parents: [ 'g' ] },
		];
		expect(
			selectSameTypeInfo( fakeSel( plain ), 'core/paragraph', 'a', false )
				.sameTypeIds
		).toEqual( [ 'a', 'b' ] );
	} );

	it( 'returns the same array on every run', () => {
		const sel = fakeSel( blocks );
		const first = selectSameTypeInfo( sel, 'core/paragraph', 'p1', false );
		const second = selectSameTypeInfo( sel, 'core/paragraph', 'p1', false );
		expect( second.sameTypeIds ).toBe( first.sameTypeIds );
	} );
} );

describe( 'selectionHasMixedAnimations', () => {
	const fade = { animationMode: 'page-load', animationType: 'fade' };

	it( 'is false when every block has the same animation', () => {
		expect( selectionHasMixedAnimations( [ fade, { ...fade } ] ) ).toBe(
			false
		);
	} );

	it( 'is false when no block is animated', () => {
		expect(
			selectionHasMixedAnimations( [ {}, { animationType: 'slide' } ] )
		).toBe( false );
	} );

	it( 'is true when one block is animated and another is not', () => {
		expect( selectionHasMixedAnimations( [ {}, fade ] ) ).toBe( true );
	} );

	it( 'is true when a setting differs', () => {
		expect(
			selectionHasMixedAnimations( [
				fade,
				{ ...fade, animationType: 'slide' },
			] )
		).toBe( true );
	} );

	it( 'ignores preview state', () => {
		expect(
			selectionHasMixedAnimations( [
				fade,
				{ ...fade, animationPreviewPlaying: true },
			] )
		).toBe( false );
	} );
} );

describe( 'keepAnimationOnTransform', () => {
	const canAnimate = ( name ) => name !== 'core/html';
	const adapt = ( attrs ) => attrs;
	const source = {
		name: 'core/paragraph',
		attributes: {
			content: 'Hi',
			animationMode: 'page-load',
			animationType: 'slide',
		},
	};
	const heading = { name: 'core/heading', attributes: { content: 'Hi' } };

	it( 'copies the animation onto a one-to-one transform', () => {
		const out = keepAnimationOnTransform(
			heading,
			[ source ],
			1,
			canAnimate,
			adapt
		);
		expect( out.attributes ).toEqual( {
			content: 'Hi',
			animationMode: 'page-load',
			animationType: 'slide',
		} );
	} );

	it( 'accepts a single source block as well as an array', () => {
		const out = keepAnimationOnTransform(
			heading,
			source,
			1,
			canAnimate,
			adapt
		);
		expect( out.attributes.animationMode ).toBe( 'page-load' );
	} );

	it( 'leaves a transform that already kept it alone', () => {
		const kept = {
			name: 'core/code',
			attributes: { animationMode: 'scroll-appear' },
		};
		expect(
			keepAnimationOnTransform( kept, [ source ], 1, canAnimate, adapt )
		).toBe( kept );
	} );

	it( 'does not animate a wrapper around the animated block', () => {
		const group = {
			name: 'core/group',
			attributes: {},
			innerBlocks: [ source ],
		};
		expect(
			keepAnimationOnTransform( group, [ source ], 1, canAnimate, adapt )
		).toBe( group );
	} );

	it( 'skips many-to-one, one-to-many and un-animatable results', () => {
		expect(
			keepAnimationOnTransform(
				heading,
				[ source, source ],
				1,
				canAnimate,
				adapt
			)
		).toBe( heading );
		expect(
			keepAnimationOnTransform(
				heading,
				[ source ],
				2,
				canAnimate,
				adapt
			)
		).toBe( heading );
		const html = { name: 'core/html', attributes: {} };
		expect(
			keepAnimationOnTransform( html, [ source ], 1, canAnimate, adapt )
		).toBe( html );
	} );

	it( 'does nothing for an un-animated source', () => {
		const plain = { name: 'core/paragraph', attributes: { content: 'Hi' } };
		expect(
			keepAnimationOnTransform( heading, [ plain ], 1, canAnimate, adapt )
		).toBe( heading );
	} );
} );
