/**
 * attrsForCategory — Auto-animate writes Scroll Appear blocks in the
 * slot shape, and that shape renders the same Entry slot the old
 * legacy payload did through the migration shim (GH #25).
 *
 * Run: npm run test:unit
 */
import {
	attrsForCategory,
	buildAutoAnimateUpdates,
	STYLE_PRESETS,
} from '../../src/components/AutoAnimate/plan';
import {
	SCHEMA_DEFAULTS,
	migrateScrollAppearAttrs,
} from '../../src/components/constants';

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
const SLOT_FIELDS = [
	'Type',
	'Direction',
	'Duration',
	'Delay',
	'Acceleration',
];

// The pre-fix legacy payloads, copied from plan.js before GH #25.
function legacyPayload( category, preset, align ) {
	const style = STYLE_PRESETS[ preset ];
	const common = {
		animationMode: 'scroll-appear',
		animationDelay: 0,
		animationAcceleration: 'ease',
		animationScrollTrigger: 'enter',
		animationPlayOnce: true,
	};
	switch ( category ) {
		case 'MEDIA':
			return {
				...common,
				animationType: 'slide',
				animationDirection:
					{ left: 'ltr', right: 'rtl' }[ align ] || 'btt',
				animationDuration: style.duration,
			};
		case 'STAGGER_ROW':
			return {
				...common,
				animationType: 'slide',
				animationDirection: 'btt',
				animationDuration: style.duration,
			};
		case 'SECTION':
			return {
				...common,
				animationType: 'fade',
				animationDuration: style.duration,
			};
		case 'CTA':
			return {
				...common,
				animationType: 'scale',
				animationDirection: 'none',
				animationDuration: style.ctaDuration,
			};
	}
	return null;
}

const CASES = [
	[ 'SECTION', undefined ],
	[ 'CTA', undefined ],
	[ 'STAGGER_ROW', undefined ],
	[ 'MEDIA', 'left' ],
	[ 'MEDIA', 'right' ],
	[ 'MEDIA', undefined ],
];

describe( 'attrsForCategory (Scroll Appear categories)', () => {
	for ( const preset of PRESETS ) {
		for ( const [ category, align ] of CASES ) {
			const label = `${ category }${
				align ? ` (${ align })` : ''
			} · ${ preset }`;
			const block = { name: 'core/image', attributes: { align } };

			it( `${ label } writes the slot shape`, () => {
				const out = attrsForCategory( category, preset, block );
				expect( out.animationMode ).toBe( 'scroll-appear' );
				expect( out.animationEntryType ).toBeTruthy();
				expect( out.animationExitType ).toBe( '' );
				expect( out.animationEntryReplay ).toBe( 'once' );
				expect( out.animationEntryDelay ).toBe( 0 );
				for ( const key of RETIRED ) {
					expect( out ).not.toHaveProperty( key );
				}
			} );

			it( `${ label } renders the same Entry slot as the old payload`, () => {
				const fresh = attrsForCategory( category, preset, block );
				const old = migrateScrollAppearAttrs( {
					...SCHEMA_DEFAULTS,
					...legacyPayload( category, preset, align ),
				} );
				const now = migrateScrollAppearAttrs( {
					...SCHEMA_DEFAULTS,
					...fresh,
				} );
				for ( const f of SLOT_FIELDS ) {
					expect( now[ `animationEntry${ f }` ] ).toEqual(
						old[ `animationEntry${ f }` ]
					);
					// No re-derivation: the saved slot values stand.
					expect( now[ `animationEntry${ f }` ] ).toEqual(
						fresh[ `animationEntry${ f }` ]
					);
				}
				expect( now.animationExitType ).toBe( old.animationExitType );
			} );
		}
	}

	it( 'STAGGER_ROW keeps the stagger flag and step', () => {
		const out = attrsForCategory( 'STAGGER_ROW', 'smooth' );
		expect( out.animationStaggerEnabled ).toBe( true );
		expect( out.animationStaggerStep ).toBe(
			STYLE_PRESETS.smooth.sequenceStep
		);
	} );

	it( 'HERO is still Page Load on the shared keys', () => {
		const out = attrsForCategory( 'HERO', 'smooth' );
		expect( out.animationMode ).toBe( 'page-load' );
		expect( out.animationType ).toBe( 'fade' );
		expect( out ).not.toHaveProperty( 'animationEntryType' );
	} );
} );

/**
 * buildAutoAnimateUpdates — the apply goes out as ONE
 * updateBlockAttributes action (one undo step, GH #33 / #56), but each
 * block's payload must stay exactly what attrsForCategory returns.
 */
describe( 'buildAutoAnimateUpdates', () => {
	const block = ( name, attributes = {} ) => ( { name, attributes } );
	const APPLY = [
		{ clientId: 'hero', category: 'HERO', block: block( 'core/cover' ) },
		{
			clientId: 'img-left',
			category: 'MEDIA',
			block: block( 'core/image', { align: 'left' } ),
		},
		{
			clientId: 'img-right',
			category: 'MEDIA',
			block: block( 'core/image', { align: 'right' } ),
		},
		{
			clientId: 'img-unset',
			category: 'MEDIA',
			block: block( 'core/image' ),
		},
		{
			clientId: 'cols',
			category: 'STAGGER_ROW',
			block: block( 'core/columns' ),
		},
		{
			clientId: 'group',
			category: 'SECTION',
			block: block( 'core/group' ),
		},
		{ clientId: 'cta', category: 'CTA', block: block( 'core/buttons' ) },
	];

	for ( const preset of PRESETS ) {
		it( `${ preset }: same payloads as attrsForCategory, in plan order`, () => {
			const { clientIds, attributesByClientId } = buildAutoAnimateUpdates(
				APPLY,
				preset
			);
			expect( clientIds ).toEqual( APPLY.map( ( i ) => i.clientId ) );
			expect( Object.keys( attributesByClientId ) ).toHaveLength(
				APPLY.length
			);
			for ( const item of APPLY ) {
				expect( attributesByClientId[ item.clientId ] ).toEqual(
					attrsForCategory( item.category, preset, item.block )
				);
			}
		} );
	}

	it( 'leaves out items with no payload (unknown category)', () => {
		const { clientIds, attributesByClientId } = buildAutoAnimateUpdates(
			[
				APPLY[ 0 ],
				{ clientId: 'odd', category: 'NOPE', block: block( 'x/y' ) },
				APPLY[ 5 ],
			],
			'smooth'
		);
		expect( clientIds ).toEqual( [ 'hero', 'group' ] );
		expect( attributesByClientId ).not.toHaveProperty( 'odd' );
	} );

	it( 'empty apply gives empty ids and map', () => {
		expect( buildAutoAnimateUpdates( [], 'smooth' ) ).toEqual( {
			clientIds: [],
			attributesByClientId: {},
		} );
	} );

	it( 'keeps direction-from-align for MEDIA', () => {
		const { attributesByClientId } = buildAutoAnimateUpdates(
			APPLY,
			'smooth'
		);
		expect(
			attributesByClientId[ 'img-left' ].animationEntryDirection
		).toBe( 'ltr' );
		expect(
			attributesByClientId[ 'img-right' ].animationEntryDirection
		).toBe( 'rtl' );
		expect(
			attributesByClientId[ 'img-unset' ].animationEntryDirection
		).toBe( 'btt' );
		expect( attributesByClientId.cols.animationStaggerEnabled ).toBe(
			true
		);
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
