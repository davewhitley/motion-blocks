/**
 * Auto-animate's choreography: one motion language, an opening
 * sequence on the first screen, sections that cascade in reading
 * order, and role-specific motion for images and the hero background.
 *
 * Also keeps the older guarantees: Scroll Appear payloads use the slot
 * shape and never the retired keys (GH #25), the values are valid
 * Custom From / To values, and one apply is one action (one undo).
 *
 * Run: npm run test:unit
 */
import {
	STYLE_PRESETS,
	MOTION_EASE,
	attrsForItem,
	attrsForCategory,
	buildAutoAnimateUpdates,
	cascadeStep,
	computeAutoAnimatePlan,
	findHero,
	summarizeChoreography,
} from '../../src/components/AutoAnimate/plan';
import {
	SCHEMA_DEFAULTS,
	STAGGER_PARENT_BLOCKS,
	migrateScrollAppearAttrs,
	isStaggerCompatible,
} from '../../src/components/constants';
import { isValidFromToValue } from '../../src/css-values';

const PRESETS = [ 'subtle', 'smooth', 'bold' ];
const RETIRED = [
	'animationType',
	'animationDirection',
	'animationDuration',
	'animationDelay',
	'animationAcceleration',
	'animationScrollTrigger',
	'animationPlayOnce',
];

let uid = 0;
/** A block object like getBlocks() returns. */
function b( name, inner = [], attributes = {} ) {
	uid += 1;
	return { clientId: `c${ uid }`, name, attributes, innerBlocks: inner };
}
const heading = () => b( 'core/heading' );
const para = () => b( 'core/paragraph' );
const buttons = ( n = 2 ) =>
	b(
		'core/buttons',
		Array.from( { length: n }, () => b( 'core/button' ) )
	);
const image = ( align ) => b( 'core/image', [], align ? { align } : {} );
const section = () => b( 'core/group', [ heading(), para(), buttons() ] );
const plan = ( blocks, firstScreen = [] ) =>
	computeAutoAnimatePlan( blocks, () => 0, {
		isOnFirstScreen: ( id ) => firstScreen.includes( id ),
	} );
/** Planned with no measurement at all (the hero alone decides). */
const planUnmeasured = ( blocks ) =>
	computeAutoAnimatePlan( blocks, () => 0 );
const roleOf = ( p, block ) =>
	p.apply.find( ( i ) => i.clientId === block.clientId )?.role;
const attrsOf = ( p, preset, block ) =>
	buildAutoAnimateUpdates( p.apply, preset ).attributesByClientId[
		block.clientId
	];

/** Every Custom From/To value in a payload is one the plugin accepts. */
function expectValidCustom( attrs ) {
	for ( const [ key, value ] of Object.entries( attrs ) ) {
		const m = key.match(
			/^animation(?:Entry)?(?:From|To)(Opacity|TranslateX|TranslateY|Scale)$/
		);
		if ( m && value !== null ) {
			const id = m[ 1 ][ 0 ].toLowerCase() + m[ 1 ].slice( 1 );
			expect( [ key, isValidFromToValue( id, value ) ] ).toEqual( [
				key,
				true,
			] );
		}
	}
}

describe( 'one motion language', () => {
	it.each( PRESETS )(
		'%s: every block rises on the same curve',
		( preset ) => {
			const blocks = [ section(), image(), b( 'core/quote' ) ];
			const p = plan( blocks );
			const { attributesByClientId } = buildAutoAnimateUpdates(
				p.apply,
				preset
			);
			const all = Object.values( attributesByClientId );
			expect( all.length ).toBe( 3 );
			for ( const attrs of all ) {
				expect( attrs.animationEntryType ).toBe( 'custom' );
				expect( attrs.animationEntryAcceleration ).toBe( 'custom' );
				expect( attrs.animationEntryCustomTimingFunction ).toBe(
					MOTION_EASE
				);
				expect( attrs.animationEntryDuration ).toBe(
					STYLE_PRESETS[ preset ].duration
				);
				expect( attrs.animationEntryFromOpacity ).toBe( 0 );
				expect( attrs.animationEntryToOpacity ).toBe( 1 );
				expectValidCustom( attrs );
			}
		}
	);

	it( 'travels further in bolder styles', () => {
		const block = section();
		const dist = ( preset ) =>
			parseFloat(
				attrsForItem(
					{ role: 'rise', block, trigger: 'scroll' },
					preset
				).animationEntryFromTranslateY
			);
		expect( dist( 'subtle' ) ).toBeLessThan( dist( 'smooth' ) );
		expect( dist( 'smooth' ) ).toBeLessThan( dist( 'bold' ) );
	} );

	it( 'ends every element at rest, so finished animations settle (GH #20)', () => {
		const attrs = attrsForItem( { role: 'media', trigger: 'scroll' } );
		expect( attrs.animationEntryToTranslateY ).toBe( '0px' );
		expect( attrs.animationEntryToScale ).toBe( 1 );
		expect( attrs.animationEntryToOpacity ).toBe( 1 );
	} );
} );

describe( 'the opening sequence', () => {
	it( 'plays the first screen on load, one block after another', () => {
		const h = heading();
		const btns = buttons();
		const img = image();
		const below = section();
		const p = plan(
			[ h, btns, img, below ],
			[ h.clientId, btns.clientId, img.clientId ]
		);
		const delays = [ h, btns, img ].map(
			( blk ) => attrsOf( p, 'smooth', blk ).animationDelay
		);
		[ h, btns, img ].forEach( ( blk ) =>
			expect( attrsOf( p, 'smooth', blk ).animationMode ).toBe(
				'page-load'
			)
		);
		expect( delays[ 0 ] ).toBeGreaterThan( 0 );
		expect( delays[ 1 ] ).toBeGreaterThan( delays[ 0 ] );
		expect( delays[ 2 ] ).toBeGreaterThan( delays[ 1 ] );
		// Below the fold: waits for the scroll.
		expect( attrsOf( p, 'smooth', below ).animationMode ).toBe(
			'scroll-appear'
		);
		expect( summarizeChoreography( p.apply ).opening ).toBe( 3 );
	} );

	it( 'never makes the reader wait more than 1.2s', () => {
		const blocks = Array.from( { length: 20 }, () => heading() );
		const p = plan(
			blocks,
			blocks.map( ( x ) => x.clientId )
		);
		const { attributesByClientId } = buildAutoAnimateUpdates(
			p.apply,
			'bold'
		);
		for ( const attrs of Object.values( attributesByClientId ) ) {
			expect( attrs.animationDelay ).toBeLessThanOrEqual( 1.2 );
		}
	} );

	it( 'without a measurement, only a leading Cover opens the page', () => {
		const cover = b( 'core/cover', [ heading() ], { url: 'h.jpg' } );
		const after = section();
		const withCover = computeAutoAnimatePlan( [ cover, after ], () => 0 );
		expect( withCover.apply[ 0 ].trigger ).toBe( 'load' );
		expect(
			withCover.apply.find( ( i ) => i.clientId === after.clientId )
				.trigger
		).toBe( 'scroll' );
		// A page wrapped in one Group must not all play on load: only its
		// first section opens the page.
		const first = section();
		const second = section();
		const wrapped = b( 'core/group', [ first, second ] );
		const p = computeAutoAnimatePlan( [ wrapped ], () => 0 );
		const trig = ( x ) =>
			p.apply.find( ( i ) => i.clientId === x.clientId ).trigger;
		expect( trig( first ) ).toBe( 'load' );
		expect( trig( second ) ).toBe( 'scroll' );
	} );
} );

describe( 'the opening sequence is capped', () => {
	it( 'holds the first four blocks of the first screen; the rest wait for the scroll', () => {
		const blocks = Array.from( { length: 6 }, () => heading() );
		const p = plan( blocks, blocks.map( ( x ) => x.clientId ) );
		const triggers = blocks.map(
			( x ) => p.apply.find( ( i ) => i.clientId === x.clientId ).trigger
		);
		expect( triggers.filter( ( t ) => t === 'load' ) ).toHaveLength( 4 );
		expect( triggers.slice( 4 ) ).toEqual( [ 'scroll', 'scroll' ] );
	} );

	it( 'does not count the hero background against the cap', () => {
		const hero = b( 'core/cover', [ heading(), para(), buttons() ], {
			url: 'h.jpg',
		} );
		const p = planUnmeasured( [ hero ] );
		const roles = p.apply.filter( ( i ) => i.trigger === 'load' );
		expect( roles.some( ( i ) => i.role === 'heroImage' ) ).toBe( true );
		expect( roles.filter( ( i ) => i.role !== 'heroImage' ).length ).toBe(
			3
		);
	} );
} );

describe( 'finding the hero', () => {
	const header = () => b( 'core/template-part', [ b( 'core/site-title' ) ] );
	const cover = () => b( 'core/cover', [ heading(), para(), buttons() ] );
	const heroOf = ( blocks ) => findHero( blocks )?.blocks;

	it( 'skips the header and takes a Cover', () => {
		const c = cover();
		expect( heroOf( [ header(), c ] ) ).toEqual( [ c ] );
	} );

	it( 'skips an announcement bar and header held in one Group', () => {
		const bar = b( 'core/group', [
			b( 'core/group', [ para() ] ),
			header(),
		] );
		const c = cover();
		expect( heroOf( [ bar, b( 'core/group', [ para() ] ), c ] ) ).toEqual( [
			c,
		] );
	} );

	it( 'steps into a wrapper Group to its first section', () => {
		const hero = section();
		const wrapper = b( 'core/group', [ hero, section(), section() ] );
		expect( heroOf( [ wrapper ] ) ).toEqual( [ hero ] );
	} );

	it( 'steps into a Columns block that holds the page, past its header', () => {
		const masthead = b( 'core/group', [ heading(), para(), buttons() ] );
		const query = b( 'core/query', [ b( 'core/post-template', [ section() ] ) ] );
		const headerGroup = b( 'core/group', [ header() ] );
		const cols = b( 'core/columns', [
			b( 'core/column', [ headerGroup, masthead, section(), query ] ),
			b( 'core/column', [ para() ] ),
		] );
		expect( heroOf( [ cols ] ) ).toEqual( [ masthead ] );
	} );

	it( 'walks into a hero built as columns, so its text and image open one after another', () => {
		const h = heading();
		const t = para();
		const btns = buttons();
		const textCol = b( 'core/column', [ h, t, btns ] );
		const img = image();
		const hero = b( 'core/columns', [ textCol, b( 'core/column', [ img ] ) ] );
		const p = planUnmeasured( [ hero ] );
		expect( roleOf( p, hero ) ).toBeUndefined();
		// The text column's pieces cascade in; the image rises with them.
		expect( roleOf( p, textCol ) ).toBe( 'cascade' );
		expect( roleOf( p, img ) ).toBe( 'media' );
		const load = ( x ) =>
			p.apply.find( ( i ) => i.clientId === x.clientId ).trigger;
		expect( [ load( textCol ), load( img ) ] ).toEqual( [ 'load', 'load' ] );
	} );

	it( 'still cascades an ordinary row of columns that is not the hero', () => {
		const hero = section();
		const row = b( 'core/columns', [
			b( 'core/column', [ heading(), para() ] ),
			b( 'core/column', [ heading(), para() ] ),
			b( 'core/column', [ heading(), para() ] ),
		] );
		const p = planUnmeasured( [ b( 'core/group', [ hero, row, section() ] ) ] );
		expect( roleOf( p, row ) ).toBe( 'cascade' );
	} );

	it( 'takes a split hero whose title is the site title', () => {
		const split = b( 'core/columns', [
			b( 'core/column', [ b( 'core/site-title' ) ] ),
			b( 'core/column', [ b( 'core/cover' ) ] ),
		] );
		expect( heroOf( [ b( 'core/group', [ split ] ) ] ) ).toEqual( [ split ] );
	} );

	it( 'takes the loose blocks that open a page, up to the first section', () => {
		const h = heading();
		const t = para();
		const btns = buttons();
		const sec = section();
		expect( heroOf( [ h, t, btns, sec ] ) ).toEqual( [ h, t, btns ] );
	} );

	it( 'finds no hero in a post list or a magazine grid', () => {
		const list = b( 'core/group', [
			b( 'core/site-title' ),
			b( 'core/query', [ b( 'core/post-template', [ section() ] ) ] ),
		] );
		expect( findHero( [ header(), list ] ) ).toBeNull();
		expect( findHero( [ b( 'core/group', [ para() ] ) ] ) ).toBeNull();
	} );

	it( 'opens the page with the hero only, and with nothing when there is none', () => {
		const hero = section();
		const next = section();
		const p = planUnmeasured( [ b( 'core/group', [ hero, next, section() ] ) ] );
		const trig = ( x ) =>
			p.apply.find( ( i ) => i.clientId === x.clientId ).trigger;
		expect( trig( hero ) ).toBe( 'load' );
		expect( trig( next ) ).toBe( 'scroll' );
		const noHero = b( 'core/group', [ para(), para(), para(), para() ] );
		const q = planUnmeasured( [ b( 'core/group', [ noHero, section() ] ) ] );
		expect( q.apply.every( ( i ) => i.trigger === 'scroll' ) ).toBe( true );
	} );

	it( 'lets a measurement take a block out of the opening, never put one in', () => {
		const hero = section();
		const other = section();
		const wrapper = b( 'core/group', [ hero, other, section() ] );
		const measured = computeAutoAnimatePlan( [ wrapper ], () => 0, {
			isOnFirstScreen: ( id ) => id === other.clientId,
		} );
		const trig = ( x ) =>
			measured.apply.find( ( i ) => i.clientId === x.clientId ).trigger;
		expect( trig( hero ) ).toBe( 'scroll' ); // measured below the fold
		expect( trig( other ) ).toBe( 'scroll' ); // measured on it, but not the hero
	} );
} );

describe( 'sections cascade in reading order', () => {
	it( 'a heading + text + buttons Group cascades as one section', () => {
		const s = section();
		const p = plan( [ s ] );
		expect( roleOf( p, s ) ).toBe( 'cascade' );
		const attrs = attrsOf( p, 'smooth', s );
		expect( attrs.animationStaggerEnabled ).toBe( true );
		expect( attrs.animationStaggerStep ).toBeGreaterThan( 0 );
		expect( isStaggerCompatible( attrs ) ).toBe( true );
		// Its paragraph rides along in the cascade, not skipped.
		expect( p.skipBody ).toHaveLength( 0 );
	} );

	it( 'Subtle rises a section as one block, without stagger', () => {
		const s = section();
		const p = plan( [ s ] );
		const subtle = attrsOf( p, 'subtle', s );
		expect( subtle.animationStaggerEnabled ).toBeFalsy();
		expect( subtle.animationEntryFromTranslateY ).toBe(
			`${ STYLE_PRESETS.subtle.distance }px`
		);
		for ( const preset of [ 'smooth', 'bold' ] ) {
			expect( attrsOf( p, preset, s ).animationStaggerEnabled ).toBe(
				true
			);
		}
	} );

	it( 'each level moves further and longer than the one below', () => {
		const { subtle, smooth, bold } = STYLE_PRESETS;
		for ( const key of [
			'duration',
			'distance',
			'settleScale',
			'heroZoom',
			'openingBeat',
		] ) {
			expect( [ key, subtle[ key ] < smooth[ key ] ] ).toEqual( [
				key,
				true,
			] );
			expect( [ key, smooth[ key ] < bold[ key ] ] ).toEqual( [
				key,
				true,
			] );
		}
	} );

	it( 'compresses the beat so long cascades still feel quick', () => {
		const style = STYLE_PRESETS.smooth;
		expect( cascadeStep( 3, style ) ).toBe( style.beat );
		expect( cascadeStep( 30, style ) * 29 ).toBeLessThanOrEqual(
			style.spread + 0.01
		);
	} );

	it( 'columns, galleries and button rows cascade their items', () => {
		const cols = b( 'core/columns', [
			b( 'core/column', [ heading() ] ),
			b( 'core/column', [ heading() ] ),
			b( 'core/column', [ heading() ] ),
		] );
		const gallery = b( 'core/gallery', [ image(), image(), image() ] );
		const row = buttons( 3 );
		// A section first, so the row isn't the page's hero.
		const p = plan( [ section(), cols, gallery, row ] );
		expect( [ cols, gallery, row ].map( ( x ) => roleOf( p, x ) ) ).toEqual(
			[ 'cascade', 'cascade', 'cascade' ]
		);
	} );

	it( 'only cascades blocks that can stagger, or the cascade silently becomes one rise', () => {
		const textColumn = b( 'core/column', [ heading(), para(), buttons() ] );
		const cols = b( 'core/columns', [ textColumn, b( 'core/column', [ image() ] ) ] );
		const list = b( 'core/post-template', [ section(), section() ], {
			layout: { type: 'grid', columnCount: 2 },
		} );
		// The first block is the hero, so its text column is walked into and
		// cascades; the rows below it cascade as rows.
		const tree = [
			cols,
			b( 'core/columns', [
				b( 'core/column', [ heading(), para() ] ),
				b( 'core/column', [ heading(), para() ] ),
			] ),
			b( 'core/gallery', [ image(), image(), image() ] ),
			buttons( 3 ),
			b( 'core/query', [ list ], { query: { perPage: 2 } } ),
		];
		const p = planUnmeasured( tree );
		const cascades = p.apply.filter( ( i ) => i.role === 'cascade' );
		expect( cascades.length ).toBeGreaterThan( 3 );
		for ( const item of cascades ) {
			expect( STAGGER_PARENT_BLOCKS ).toContain( item.block.name );
		}
		expect( roleOf( p, textColumn ) ).toBe( 'cascade' );
	} );

	it( 'walks into a page wrapper instead of moving it as one block', () => {
		const inner1 = section();
		const inner2 = section();
		const wrapper = b( 'core/group', [ inner1, inner2 ] );
		const p = plan( [ wrapper ] );
		expect( roleOf( p, wrapper ) ).toBeUndefined();
		expect( roleOf( p, inner1 ) ).toBe( 'cascade' );
		expect( roleOf( p, inner2 ) ).toBe( 'cascade' );
	} );

	describe( 'a Columns block that wraps the page', () => {
		/** A theme's layout wrapper: two columns holding a whole page. */
		const pageColumns = () => {
			const sections = Array.from( { length: 5 }, () => section() );
			return {
				sections,
				cols: b( 'core/columns', [
					b( 'core/column', sections.slice( 0, 3 ) ),
					b( 'core/column', sections.slice( 3 ) ),
				] ),
			};
		};
		const screens = ( n ) => ( {
			isOnFirstScreen: () => false,
			screensTall: () => n,
		} );

		it( 'is walked into when it is taller than two screens', () => {
			const { sections, cols } = pageColumns();
			const p = computeAutoAnimatePlan( [ cols ], () => 0, screens( 4 ) );
			expect( roleOf( p, cols ) ).toBeUndefined();
			for ( const s of sections ) {
				expect( roleOf( p, s ) ).toBe( 'cascade' );
			}
		} );

		it( 'cascades as a row when it is short, however much it holds', () => {
			const { cols } = pageColumns();
			const p = computeAutoAnimatePlan( [ section(), cols ], () => 0, screens( 0.8 ) );
			expect( roleOf( p, cols ) ).toBe( 'cascade' );
		} );

		it( 'is walked into by what it holds when it can not be measured', () => {
			const sections = Array.from( { length: 12 }, () => section() );
			const cols = b( 'core/columns', [
				b( 'core/column', sections.slice( 0, 6 ) ),
				b( 'core/column', sections.slice( 6 ) ),
			] );
			const p = plan( [ cols ] );
			expect( roleOf( p, cols ) ).toBeUndefined();
			expect( roleOf( p, sections[ 0 ] ) ).toBe( 'cascade' );
		} );

		it( 'is not walked into on a height between one and two screens', () => {
			const { cols } = pageColumns();
			const p = computeAutoAnimatePlan( [ section(), cols ], () => 0, screens( 1.75 ) );
			expect( roleOf( p, cols ) ).toBe( 'cascade' );
		} );

		it( 'is walked into by structure even when it measures short', () => {
			const query = b( 'core/query', [ b( 'core/post-template', [ section() ] ) ], {
				query: { perPage: 6 },
			} );
			const cols = b( 'core/columns', [
				b( 'core/column', [ query ] ),
				b( 'core/column', [ para() ] ),
			] );
			const p = computeAutoAnimatePlan( [ cols ], () => 0, screens( 0.6 ) );
			expect( roleOf( p, cols ) ).toBeUndefined();
		} );

		it( 'is walked into when it holds a Query Loop', () => {
			const query = b( 'core/query', [ b( 'core/post-template', [ section() ] ) ], {
				query: { perPage: 6 },
			} );
			const cols = b( 'core/columns', [
				b( 'core/column', [ query ] ),
				b( 'core/column', [ para() ] ),
			] );
			expect( roleOf( plan( [ cols ] ), cols ) ).toBeUndefined();
		} );

		it( 'leaves an ordinary row of cards alone', () => {
			const card = () => b( 'core/group', [ heading(), para() ] );
			const cols = b( 'core/columns', [
				b( 'core/column', [ card() ] ),
				b( 'core/column', [ card() ] ),
				b( 'core/column', [ card() ] ),
			] );
			expect( roleOf( plan( [ section(), cols ] ), cols ) ).toBe( 'cascade' );
		} );
	} );

	it( 'leaves long-form text still and animates only its headings and images', () => {
		const article = b( 'core/group', [
			heading(),
			...Array.from( { length: 14 }, () => para() ),
			image(),
		] );
		const p = plan( [ article ] );
		expect( roleOf( p, article ) ).toBeUndefined();
		expect( p.skipBody ).toHaveLength( 14 );
		expect( summarizeChoreography( p.apply ).media ).toBe( 1 );
	} );
} );

describe( 'role-specific motion', () => {
	it( 'aligned images enter from their own side', () => {
		const left = image( 'left' );
		const right = image( 'right' );
		const p = plan( [ left, right ] );
		const d = STYLE_PRESETS.smooth.distance;
		expect(
			attrsOf( p, 'smooth', left ).animationEntryFromTranslateX
		).toBe( `-${ d }px` );
		expect(
			attrsOf( p, 'smooth', right ).animationEntryFromTranslateX
		).toBe( `${ d }px` );
	} );

	it( 'other images rise and settle from a slight scale', () => {
		const img = image();
		const attrs = attrsOf( plan( [ img ] ), 'smooth', img );
		expect( attrs.animationEntryFromScale ).toBeGreaterThan( 1 );
		expect( attrs.animationEntryToScale ).toBe( 1 );
	} );

	describe( 'a Cover hero', () => {
		const h = heading();
		const p1 = para();
		const btns = buttons();
		const cover = b( 'core/cover', [ h, p1, btns ], { url: 'hero.jpg' } );
		const p = plan(
			[ cover ],
			[ cover.clientId, h.clientId, p1.clientId, btns.clientId ]
		);
		const coverAttrs = attrsOf( p, 'smooth', cover );

		it( 'fades its background in as it settles from a slight zoom', () => {
			expect( coverAttrs.animationFromToTarget ).toBe( 'img' );
			expect( coverAttrs.animationFromOpacity ).toBe( 0 );
			expect( coverAttrs.animationToOpacity ).toBe( 1 );
			expect( coverAttrs.animationFromScale ).toBeGreaterThan( 1 );
			expect( coverAttrs.animationToScale ).toBe( 1 );
			expect( coverAttrs.animationDelay ).toBe( 0 );
		} );

		it( 'brings its content in over it, one block after another', () => {
			const d = [ h, p1, btns ].map(
				( blk ) => attrsOf( p, 'smooth', blk ).animationDelay
			);
			expect( d[ 1 ] ).toBeGreaterThan( d[ 0 ] );
			expect( d[ 2 ] ).toBeGreaterThan( d[ 1 ] );
			// The hero's paragraph is part of the hero, not skipped copy.
			expect( roleOf( p, p1 ) ).toBe( 'rise' );
		} );

		it( 'leaves a video or fixed background alone', () => {
			const video = b( 'core/cover', [ heading() ], {
				url: 'v.mp4',
				backgroundType: 'video',
			} );
			const fixed = b( 'core/cover', [ heading() ], {
				url: 'x.jpg',
				hasParallax: true,
			} );
			const q = plan( [ video, fixed ] );
			expect( roleOf( q, video ) ).toBeUndefined();
			expect( roleOf( q, fixed ) ).toBeUndefined();
		} );
	} );
} );

describe( 'restraint and safety', () => {
	it( 'skips chrome, broken blocks and anything already animated', () => {
		const animated = b( 'core/group', [ heading(), para() ], {
			animationMode: 'page-load',
		} );
		const p = plan( [ b( 'core/spacer' ), b( 'core/missing' ), animated ] );
		expect( p.apply ).toHaveLength( 0 );
		expect( p.skipChrome ).toHaveLength( 1 );
		expect( p.skipBroken ).toHaveLength( 1 );
		expect( p.skipExisting ).toHaveLength( 1 );
	} );

	it.each( PRESETS )(
		'%s: Scroll Appear payloads use the slot shape only (GH #25)',
		( preset ) => {
			const blocks = [ section(), image(), heading(), buttons( 3 ) ];
			const { attributesByClientId } = buildAutoAnimateUpdates(
				plan( blocks ).apply,
				preset
			);
			for ( const attrs of Object.values( attributesByClientId ) ) {
				expect( attrs.animationMode ).toBe( 'scroll-appear' );
				expect( attrs.animationExitType ).toBe( '' );
				expect( attrs.animationEntryReplay ).toBe( 'once' );
				// Legacy keys only ever at their registered default, so
				// WordPress leaves them out of the saved block.
				for ( const key of RETIRED ) {
					if ( key in attrs ) {
						expect( [ key, attrs[ key ] ] ).toEqual( [
							key,
							SCHEMA_DEFAULTS[ key ],
						] );
					}
				}
				// The migration shim leaves the saved slot alone.
				const view = migrateScrollAppearAttrs( {
					...SCHEMA_DEFAULTS,
					...attrs,
				} );
				expect( view.animationEntryType ).toBe( 'custom' );
				expect( view.animationEntryDuration ).toBe(
					attrs.animationEntryDuration
				);
			}
		}
	);

	it( 'walks into a section or row with an animated item, leaving that item alone', () => {
		const animatedImg = b( 'core/image', [], {
			animationMode: 'scroll-appear',
			animationEntryType: 'fade',
		} );
		const h = heading();
		const group = b( 'core/group', [ h, para(), animatedImg ] );
		const gallery = b( 'core/gallery', [
			image(),
			b( 'core/image', [], { animationMode: 'page-load' } ),
		] );
		const p = plan( [ group, gallery ] );
		expect( roleOf( p, group ) ).toBeUndefined();
		expect( roleOf( p, gallery ) ).toBeUndefined();
		expect( roleOf( p, h ) ).toBe( 'rise' );
		expect( p.skipExisting ).toHaveLength( 2 );
	} );

	it( 'skips Custom HTML and Shortcode blocks, even inside a Cover sequence', () => {
		const html = b( 'core/html' );
		const h = heading();
		const cover = b( 'core/cover', [ html, h ], { url: 'h.jpg' } );
		const p = plan(
			[ cover ],
			[ cover.clientId, html.clientId, h.clientId ]
		);
		expect( roleOf( p, html ) ).toBeUndefined();
		// The heading takes the first slot, with no gap before it.
		expect(
			p.apply.find( ( i ) => i.clientId === h.clientId ).openingIndex
		).toBe( 0 );
	} );

	it( 'keeps a cascade even in a very long gallery', () => {
		expect( cascadeStep( 500, STYLE_PRESETS.smooth ) ).toBeGreaterThan( 0 );
	} );

	it( 'starts from a cleared block, so leftover settings never leak in', () => {
		const attrs = attrsForItem( {
			role: 'rise',
			block: heading(),
			trigger: 'scroll',
		} );
		expect( attrs.animationStaggerEnabled ).toBe( false );
		expect( attrs.animationFromToTarget ).toBe( 'block' );
		expect( attrs.animationEntryFromRotate ).toBeNull();
		expect( attrs.animationEntryFromBlur ).toBeNull();
		expect( attrs.animationEntryFromClipPath ).toBeNull();
	} );

	it( 'one apply is one action: ids in plan order, one payload each', () => {
		const blocks = [ section(), image() ];
		const p = plan( blocks );
		const { clientIds, attributesByClientId } = buildAutoAnimateUpdates(
			p.apply,
			'smooth'
		);
		expect( clientIds ).toEqual( p.apply.map( ( i ) => i.clientId ) );
		expect( Object.keys( attributesByClientId ) ).toEqual( clientIds );
	} );

	it( 'keeps attrsForCategory for older callers', () => {
		expect( attrsForCategory( 'SECTION', 'smooth' ).animationMode ).toBe(
			'scroll-appear'
		);
		expect(
			attrsForCategory( 'STAGGER_ROW', 'smooth' ).animationStaggerEnabled
		).toBe( true );
		expect( attrsForCategory( 'NOPE' ) ).toBeNull();
	} );
} );

/*
 * The Classic block can't keep animation settings (2026-10-20 review,
 * #56): no panel, and Auto-animate skips it.
 */
describe( 'Query Loop', () => {
	/** A Query Loop: `perPage` posts in a grid of `columns` (0 = a plain list). */
	const card = () => b( 'core/group', [ heading(), para() ] );
	const queryLoop = ( columns, perPage ) => {
		const list = b( 'core/post-template', [ card() ], {
			layout: columns
				? { type: 'grid', columnCount: columns }
				: { type: 'default' },
		} );
		return {
			list,
			query: b( 'core/query', [ list ], { query: { perPage } } ),
		};
	};

	it( 'cascades posts that fit on one row, as one list', () => {
		const { list, query } = queryLoop( 3, 3 );
		const p = plan( [ query ] );
		expect( roleOf( p, query ) ).toBeUndefined();
		expect( roleOf( p, list ) ).toBe( 'cascade' );
		expect(
			p.apply.find( ( i ) => i.clientId === list.clientId ).count
		).toBe( 3 );
		expect( roleOf( p, list.innerBlocks[ 0 ] ) ).toBeUndefined();
		expect( attrsOf( p, 'smooth', list ).animationStaggerEnabled ).toBe(
			true
		);
	} );

	it( 'makes each post rise by itself when the posts wrap onto more rows', () => {
		const { list, query } = queryLoop( 2, 18 );
		const p = plan( [ query ] );
		expect( roleOf( p, query ) ).toBeUndefined();
		expect( roleOf( p, list ) ).toBeUndefined();
		expect( roleOf( p, list.innerBlocks[ 0 ] ) ).toBe( 'rise' );
	} );

	it( 'never opens the page with a post card, even when the first post is on the first screen', () => {
		const { list, query } = queryLoop( 0, 8 );
		const lead = heading();
		const p = plan( [ lead, query ], [ lead.clientId, list.innerBlocks[ 0 ].clientId ] );
		const itemFor = ( x ) => p.apply.find( ( i ) => i.clientId === x.clientId );
		expect( itemFor( list.innerBlocks[ 0 ] ).trigger ).toBe( 'scroll' );
		expect( itemFor( lead ).trigger ).toBe( 'load' );
		expect( itemFor( lead ).openingIndex ).toBe( 0 );
	} );

	it( 'treats a plain list layout as one post per row', () => {
		const { list, query } = queryLoop( 0, 5 );
		const p = plan( [ query ] );
		expect( roleOf( p, list ) ).toBeUndefined();
		expect( roleOf( p, list.innerBlocks[ 0 ] ) ).toBe( 'rise' );
	} );

	it( 'walks into a Query Loop even when a group wraps it with a heading', () => {
		const { list, query } = queryLoop( 3, 3 );
		const wrapper = b( 'core/group', [ heading(), query ] );
		const p = plan( [ wrapper ] );
		expect( roleOf( p, wrapper ) ).toBeUndefined();
		expect( roleOf( p, list ) ).toBe( 'cascade' );
	} );
} );

describe( 'invalid blocks', () => {
	/** A block the editor flags invalid (it offers "Attempt Block Recovery"). */
	const invalid = ( blk ) => {
		blk.isValid = false;
		return blk;
	};
	const unmeasured = ( blocks ) => computeAutoAnimatePlan( blocks, () => 0 );
	const clientIdsOf = ( p ) => p.apply.map( ( i ) => i.clientId );

	it( 'skips an invalid block and everything inside it, and says so', () => {
		const inside = heading();
		const cover = invalid(
			b( 'core/cover', [ b( 'core/group', [ inside, para() ] ) ] )
		);
		const ok = section();
		const p = unmeasured( [ cover, ok ] );
		expect( p.skipInvalid ).toEqual( [ cover ] );
		expect( roleOf( p, cover ) ).toBeUndefined();
		expect( roleOf( p, inside ) ).toBeUndefined();
		expect( clientIdsOf( p ) ).toEqual( [ ok.clientId ] );
	} );

	it( 'counts what is inside the invalid block', () => {
		const cover = invalid( b( 'core/cover', [ heading(), para() ] ) );
		const p = computeAutoAnimatePlan( [ cover ], () => 7, {} );
		expect( p.skipInvalid ).toHaveLength( 1 );
		expect( p.invalidInnerCount ).toBe( 7 );
	} );

	it( 'treats a block with no validity flag as valid', () => {
		const p = unmeasured( [ section() ] );
		expect( p.skipInvalid ).toEqual( [] );
		expect( p.apply.length ).toBeGreaterThan( 0 );
	} );

	it( 'does not open the page with an invalid hero, and the next section waits for the scroll', () => {
		const hero = invalid( b( 'core/cover', [ heading(), buttons() ] ) );
		const next = section();
		const p = planUnmeasured( [ hero, next ] );
		expect( roleOf( p, hero ) ).toBeUndefined();
		expect( p.apply.length ).toBeGreaterThan( 0 );
		expect( p.apply.every( ( i ) => i.trigger === 'scroll' ) ).toBe( true );
	} );

	it( 'skips an invalid card in a Post Template without losing the others', () => {
		const bad = invalid( b( 'core/group', [ heading(), para() ] ) );
		const good = b( 'core/group', [ heading(), para() ] );
		const list = b( 'core/post-template', [ bad, good ], {
			layout: { type: 'default' },
		} );
		const query = b( 'core/query', [ list ], { query: { perPage: 5 } } );
		const p = unmeasured( [ query ] );
		expect( p.skipInvalid ).toEqual( [ bad ] );
		expect( roleOf( p, bad ) ).toBeUndefined();
		expect( roleOf( p, good ) ).toBe( 'rise' );
	} );
} );

describe( 'Classic block', () => {
	const { canAnimateBlock } = require( '../../src/components/constants' );
	const {
		classifyBlock,
	} = require( '../../src/components/AutoAnimate/plan' );

	it( 'is not animatable', () => {
		expect( canAnimateBlock( 'core/freeform' ) ).toBe( false );
		expect( canAnimateBlock( 'core/html' ) ).toBe( false );
		expect( canAnimateBlock( 'core/shortcode' ) ).toBe( false );
		expect( canAnimateBlock( 'core/paragraph' ) ).toBe( true );
		expect( canAnimateBlock( 'acme/custom' ) ).toBe( true );
	} );

	it( 'is skipped by Auto-animate', () => {
		expect( classifyBlock( { name: 'core/freeform' } ) ).toBe( 'BODY' );
		expect( classifyBlock( { name: 'core/html' } ) ).toBe( 'BODY' );
		expect( classifyBlock( { name: 'core/shortcode' } ) ).toBe( 'BODY' );
	} );

	it( 'gets no Motion panel', () => {
		const src = require( 'fs' ).readFileSync(
			require( 'path' ).join( __dirname, '..', '..', 'src', 'index.js' ),
			'utf8'
		);
		expect( src ).toMatch(
			/\{ shouldRenderPanel && canAnimateBlock\( name \) && \(/
		);
	} );
} );
