/**
 * selectStable — the editor's tree-wide `useSelect` bodies return
 * results that stay shallow-equal across runs against the same state,
 * so the components using them don't re-render on every store change
 * (GH #27).
 *
 * Run: npm run test:unit
 */
import {
	EMPTY_IDS,
	selectSameTypeInfo,
	selectAnimatedAncestor,
	selectMenuOverlayInfo,
	countDescendantsIn,
} from '../../src/components/selectStable';

function shallowEqual( a, b ) {
	const ka = Object.keys( a );
	const kb = Object.keys( b );
	return ka.length === kb.length && ka.every( ( k ) => a[ k ] === b[ k ] );
}

// Fake block-editor selectors over a fixed tree. `byName` returns the
// same array reference each call, as the memoized store selector does.
function makeSel( { blocks, parents = {}, publicName = true } ) {
	const byNameCache = {};
	const byName = ( name ) => {
		if ( ! byNameCache[ name ] ) {
			byNameCache[ name ] = Object.keys( blocks ).filter(
				( id ) => blocks[ id ].name === name
			);
		}
		return byNameCache[ name ];
	};
	const sel = {
		getBlockAttributes: jest.fn( ( id ) => blocks[ id ]?.attributes ),
		getBlockName: ( id ) => blocks[ id ]?.name ?? null,
		getBlockParents: ( id ) => parents[ id ] || [],
		getBlockOrder: ( id ) =>
			Object.keys( blocks ).filter( ( child ) => {
				const p = parents[ child ] || [];
				return p[ p.length - 1 ] === id;
			} ),
		getClientIdsOfDescendants: ( ids ) =>
			Object.keys( blocks ).filter( ( child ) =>
				( parents[ child ] || [] ).includes( ids[ 0 ] )
			),
	};
	if ( publicName ) {
		sel.getBlocksByName = jest.fn( byName );
	} else {
		sel.__experimentalGetGlobalBlocksByName = jest.fn( byName );
	}
	return sel;
}

const BLOCKS = {
	img1: { name: 'core/image', attributes: { animationMode: 'page-load' } },
	img2: { name: 'core/image', attributes: { animationMode: 'page-load' } },
	img3: { name: 'core/image', attributes: { animationMode: '' } },
	grp: { name: 'core/group', attributes: { animationMode: 'page-load' } },
	inner: { name: 'core/image', attributes: {} },
	cols: { name: 'core/columns', attributes: { animationMode: 'page-load' } },
	col: { name: 'core/column', attributes: {} },
	deep: { name: 'my/unregistered', attributes: { animationMode: 'x' } },
	leaf: { name: 'core/paragraph', attributes: {} },
	para: { name: 'core/paragraph', attributes: {} },
};
const PARENTS = {
	inner: [ 'grp' ],
	col: [ 'cols' ],
	leaf: [ 'cols', 'col', 'deep' ],
};
const blocksSel = {
	getBlockType: ( name ) =>
		( {
			'core/group': { title: 'Group' },
			'core/columns': { title: 'Columns' },
		} )[ name ],
};

describe( 'selectSameTypeInfo', () => {
	test( 'two runs against the same state are shallow-equal', () => {
		const sel = makeSel( { blocks: BLOCKS } );
		const a = selectSameTypeInfo( sel, 'core/image', 'img1', false );
		const b = selectSameTypeInfo( sel, 'core/image', 'img1', false );
		expect( shallowEqual( a, b ) ).toBe( true );
		expect( a.sameTypeIds ).toBe( b.sameTypeIds );
	} );

	test( 'counts animated blocks of the type, excluding the current one', () => {
		const sel = makeSel( { blocks: BLOCKS } );
		const r = selectSameTypeInfo( sel, 'core/image', 'img1', false );
		expect( r.sameTypeIds ).toEqual( [ 'img1', 'img2', 'img3', 'inner' ] );
		// img2 only: img1 is self, img3 has an empty mode, inner none.
		expect( r.existingCount ).toBe( 1 );
	} );

	test( 'paste-only or missing input returns the shared empty ids', () => {
		const sel = makeSel( { blocks: BLOCKS } );
		for ( const args of [
			[ 'core/image', 'img1', true ],
			[ undefined, 'img1', false ],
			[ 'core/image', undefined, false ],
		] ) {
			const r = selectSameTypeInfo( sel, ...args );
			expect( r.sameTypeIds ).toBe( EMPTY_IDS );
			expect( r.existingCount ).toBe( 0 );
		}
		expect( sel.getBlocksByName ).not.toHaveBeenCalled();
		expect( sel.getBlockAttributes ).not.toHaveBeenCalled();
	} );

	test( 'falls back to the experimental selector before WP 6.5', () => {
		const sel = makeSel( { blocks: BLOCKS, publicName: false } );
		const r = selectSameTypeInfo( sel, 'core/image', 'img3', false );
		expect( sel.__experimentalGetGlobalBlocksByName ).toHaveBeenCalledWith(
			'core/image'
		);
		expect( r.existingCount ).toBe( 2 );
	} );
} );

describe( 'selectAnimatedAncestor', () => {
	test( 'no animated parent: fixed shape of nulls, shallow-equal', () => {
		const sel = makeSel( { blocks: BLOCKS, parents: PARENTS } );
		const a = selectAnimatedAncestor( sel, blocksSel, 'para' );
		const b = selectAnimatedAncestor( sel, blocksSel, 'para' );
		expect( a ).toEqual( { clientId: null, title: null } );
		expect( shallowEqual( a, b ) ).toBe( true );
		expect( selectAnimatedAncestor( sel, blocksSel, undefined ) ).toEqual( {
			clientId: null,
			title: null,
		} );
	} );

	test( 'returns the animated parent with its type title', () => {
		const sel = makeSel( { blocks: BLOCKS, parents: PARENTS } );
		const a = selectAnimatedAncestor( sel, blocksSel, 'inner' );
		const b = selectAnimatedAncestor( sel, blocksSel, 'inner' );
		expect( a ).toEqual( { clientId: 'grp', title: 'Group' } );
		expect( shallowEqual( a, b ) ).toBe( true );
	} );

	test( 'nearest animated ancestor wins; unregistered falls back to name', () => {
		const sel = makeSel( { blocks: BLOCKS, parents: PARENTS } );
		expect( selectAnimatedAncestor( sel, blocksSel, 'leaf' ) ).toEqual( {
			clientId: 'deep',
			title: 'my/unregistered',
		} );
		expect( selectAnimatedAncestor( sel, blocksSel, 'col' ) ).toEqual( {
			clientId: 'cols',
			title: 'Columns',
		} );
	} );
} );

describe( 'countDescendantsIn', () => {
	test( 'uses getClientIdsOfDescendants when available', () => {
		const sel = {
			getClientIdsOfDescendants: ( ids ) =>
				ids[ 0 ] === 'cols' ? [ 'col', 'deep', 'leaf' ] : [],
		};
		expect( countDescendantsIn( sel, 'cols' ) ).toBe( 3 );
		expect( countDescendantsIn( sel, 'para' ) ).toBe( 0 );
	} );

	test( 'falls back to walking root ids', () => {
		const roots = { col: 'cols', deep: 'col', leaf: 'deep' };
		const sel = {
			getClientIdsWithDescendants: () => [
				'cols',
				'col',
				'deep',
				'leaf',
				'para',
			],
			getBlockRootClientId: ( id ) => roots[ id ] || '',
		};
		expect( countDescendantsIn( sel, 'cols' ) ).toBe( 3 );
		expect( countDescendantsIn( sel, 'deep' ) ).toBe( 1 );
	} );
} );

describe( 'selectMenuOverlayInfo', () => {
	const NAV_BLOCKS = {
		nav: { name: 'core/navigation', attributes: { animationMode: 'x' } },
		off: {
			name: 'core/navigation',
			attributes: { overlayMenu: 'never', animationMode: 'x' },
		},
		grp: { name: 'core/group', attributes: { animationMode: 'x' } },
		gnav: {
			name: 'core/navigation',
			attributes: { overlayMenu: 'always' },
		},
		grpOff: { name: 'core/group', attributes: { animationMode: 'x' } },
		gnavOff: {
			name: 'core/navigation',
			attributes: { overlayMenu: 'never' },
		},
		stg: { name: 'core/group', attributes: { animationMode: 'x' } },
		stgPara: { name: 'core/paragraph', attributes: { animationMode: 'x' } },
		stgCol: { name: 'core/column', attributes: {} },
		stgNav: { name: 'core/navigation', attributes: {} },
		deepPara: {
			name: 'core/paragraph',
			attributes: { animationMode: 'x' },
		},
	};
	const NAV_PARENTS = {
		gnav: [ 'grp' ],
		gnavOff: [ 'grpOff' ],
		stgPara: [ 'stg' ],
		stgCol: [ 'stg' ],
		stgNav: [ 'stg', 'stgCol' ],
		deepPara: [ 'stg', 'stgCol' ],
	};
	const sel = () => makeSel( { blocks: NAV_BLOCKS, parents: NAV_PARENTS } );

	test( 'a Navigation with an overlay is self; Overlay Menu Off is not', () => {
		const s = sel();
		expect(
			selectMenuOverlayInfo( s, 'nav', 'core/navigation', false, false )
		).toEqual( { scope: 'self', targetsSkipped: false } );
		expect(
			selectMenuOverlayInfo( s, 'off', 'core/navigation', false, false )
		).toEqual( { scope: '', targetsSkipped: false } );
		// The self path never looks the navs up.
		expect( s.getBlocksByName ).not.toHaveBeenCalled();
	} );

	test( 'a block containing a Navigation with an overlay is inside', () => {
		const s = sel();
		expect(
			selectMenuOverlayInfo( s, 'grp', 'core/group', false, false ).scope
		).toBe( 'inside' );
		expect(
			selectMenuOverlayInfo( s, 'grpOff', 'core/group', false, false )
				.scope
		).toBe( '' );
		expect(
			selectMenuOverlayInfo( s, 'nav', 'core/group', false, false ).scope
		).toBe( '' );
	} );

	test( 'falls back to the experimental selector before WP 6.5', () => {
		const s = makeSel( {
			blocks: NAV_BLOCKS,
			parents: NAV_PARENTS,
			publicName: false,
		} );
		expect(
			selectMenuOverlayInfo( s, 'grp', 'core/group', false, false ).scope
		).toBe( 'inside' );
		expect( s.__experimentalGetGlobalBlocksByName ).toHaveBeenCalledWith(
			'core/navigation'
		);
	} );

	test( 'two runs against the same state are shallow-equal', () => {
		const s = sel();
		const a = selectMenuOverlayInfo( s, 'stg', 'core/group', true, true );
		const b = selectMenuOverlayInfo( s, 'stg', 'core/group', true, true );
		expect( shallowEqual( a, b ) ).toBe( true );
	} );

	test( 'targetsSkipped: animated Stagger child or animated descendant', () => {
		const s = sel();
		expect(
			selectMenuOverlayInfo( s, 'stg', 'core/group', true, false )
		).toEqual( { scope: 'inside', targetsSkipped: true } );
		expect(
			selectMenuOverlayInfo( s, 'stg', 'core/group', false, true )
		).toEqual( { scope: 'inside', targetsSkipped: true } );
		expect(
			selectMenuOverlayInfo( s, 'stg', 'core/group', false, false )
		).toEqual( { scope: 'inside', targetsSkipped: false } );
		// The isAnimated predicate decides what counts.
		expect(
			selectMenuOverlayInfo(
				s,
				'stg',
				'core/group',
				true,
				true,
				() => false
			).targetsSkipped
		).toBe( false );
		// No menu: nothing else is looked at.
		expect(
			selectMenuOverlayInfo( s, 'grpOff', 'core/group', true, true )
		).toEqual( { scope: '', targetsSkipped: false } );
	} );
} );
