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
	summarizeChoreography,
} from '../../src/components/AutoAnimate/plan';
import {
	SCHEMA_DEFAULTS,
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
		// A page wrapped in one Group must not all play on load.
		const wrapped = b( 'core/group', [ section(), section() ] );
		const p = computeAutoAnimatePlan( [ wrapped ], () => 0 );
		expect( p.apply.every( ( i ) => i.trigger === 'scroll' ) ).toBe( true );
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
		const p = plan( [ cols, gallery, row ] );
		expect( [ cols, gallery, row ].map( ( x ) => roleOf( p, x ) ) ).toEqual(
			[ 'cascade', 'cascade', 'cascade' ]
		);
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
		expect(
			attrsOf( p, 'smooth', left ).animationEntryFromTranslateX
		).toBe( '-24px' );
		expect(
			attrsOf( p, 'smooth', right ).animationEntryFromTranslateX
		).toBe( '24px' );
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
