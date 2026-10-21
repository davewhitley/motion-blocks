/**
 * attrsForCategory — Auto-animate writes Scroll Appear blocks in the
 * slot shape, and that shape renders the same Entry slot the old
 * legacy payload did through the migration shim (GH #25).
 *
 * Run: npm run test:unit
 */
import {
	attrsForCategory,
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
