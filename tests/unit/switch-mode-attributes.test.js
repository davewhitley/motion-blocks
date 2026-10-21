/**
 * switchModeAttributes — Custom From/To values carry over when the
 * mode picker switches into or out of Scroll Appear (GH #7, #30).
 *
 * Run: npm run test:unit
 */
import {
	DEFAULT_ATTRIBUTES,
	switchModeAttributes,
} from '../../src/components/constants';

const PROPS = [
	'Opacity',
	'TranslateX',
	'TranslateY',
	'Scale',
	'Rotate',
	'RotateX',
	'RotateY',
	'Blur',
	'ClipPath',
];
const keysFor = ( prefix ) =>
	PROPS.flatMap( ( p ) => [
		`${ prefix }From${ p }`,
		`${ prefix }To${ p }`,
	] );
const SHARED_KEYS = keysFor( 'animation' );
const ENTRY_KEYS = keysFor( 'animationEntry' );
const FROM_TO_RE = /^animation(Entry|Exit)?(From|To)[A-Z]/;

const block = ( attrs ) => ( { ...DEFAULT_ATTRIBUTES, ...attrs } );
const fromToKeysIn = ( out ) =>
	Object.keys( out ).filter( ( k ) => FROM_TO_RE.test( k ) );

describe( 'switchModeAttributes Custom From/To bridge', () => {
	it( 'copies the shared bag onto the Entry slot when switching into Scroll Appear', () => {
		const attrs = block( {
			animationMode: 'page-load',
			animationType: 'custom',
			animationFromOpacity: 0,
			animationToOpacity: 1,
			animationFromRotate: '0deg',
			animationToRotate: '360deg',
		} );
		const out = switchModeAttributes( attrs, 'scroll-appear' );
		expect( out.animationEntryType ).toBe( 'custom' );
		expect( out.animationEntryFromOpacity ).toBe( 0 );
		expect( out.animationEntryToOpacity ).toBe( 1 );
		expect( out.animationEntryFromRotate ).toBe( '0deg' );
		expect( out.animationEntryToRotate ).toBe( '360deg' );
		const unset = ENTRY_KEYS.filter(
			( k ) => ! /(Opacity|Rotate)$/.test( k )
		);
		expect( unset ).toHaveLength( 14 );
		for ( const k of unset ) {
			expect( out ).toHaveProperty( k, null );
		}
	} );

	it.each( [ 'page-load', 'scroll-interactive' ] )(
		'copies the Entry bag back onto the shared keys when switching to %s',
		( mode ) => {
			const attrs = block( {
				animationMode: 'scroll-appear',
				animationEntryType: 'custom',
				animationEntryFromTranslateY: '40px',
				animationEntryToTranslateY: '0px',
				animationEntryFromClipPath: 'inset(0 50% 0 50%)',
				animationEntryToClipPath: 'inset(0)',
				animationEntryFromScale: 0.8,
				animationEntryToScale: 1,
			} );
			const out = switchModeAttributes( attrs, mode );
			expect( out.animationType ).toBe( 'custom' );
			expect( out.animationFromTranslateY ).toBe( '40px' );
			expect( out.animationToTranslateY ).toBe( '0px' );
			expect( out.animationFromClipPath ).toBe( 'inset(0 50% 0 50%)' );
			expect( out.animationToClipPath ).toBe( 'inset(0)' );
			expect( out.animationFromScale ).toBe( 0.8 );
			expect( out.animationToScale ).toBe( 1 );
		}
	);

	it( 'round-trips page-load -> scroll-appear -> page-load without loss', () => {
		const bag = {
			animationFromOpacity: 0,
			animationToOpacity: 1,
			animationFromTranslateX: '-40px',
			animationToTranslateX: '0px',
			animationFromTranslateY: '20px',
			animationToTranslateY: '0px',
			animationFromScale: 0.5,
			animationToScale: 1,
			animationFromRotate: '0deg',
			animationToRotate: '360deg',
			animationFromRotateX: '30deg',
			animationToRotateX: '0deg',
			animationFromRotateY: '-15deg',
			animationToRotateY: '0deg',
			animationFromBlur: '8px',
			animationToBlur: '0px',
			animationFromClipPath: 'inset(0 100% 0 0)',
			animationToClipPath: 'inset(0)',
		};
		let attrs = block( {
			animationMode: 'page-load',
			animationType: 'custom',
			...bag,
		} );
		attrs = { ...attrs, ...switchModeAttributes( attrs, 'scroll-appear' ) };
		// Clobber the shared bag to prove the way back reads the slot.
		for ( const k of SHARED_KEYS ) {
			attrs[ k ] = null;
		}
		attrs = { ...attrs, ...switchModeAttributes( attrs, 'page-load' ) };
		for ( const k of SHARED_KEYS ) {
			expect( attrs[ k ] ).toEqual( bag[ k ] );
		}
	} );

	it( 'coerces legacy bare numbers to the canonical unit shape', () => {
		const attrs = block( {
			animationMode: 'page-load',
			animationType: 'custom',
			animationFromRotate: 45,
			animationFromBlur: 8,
			animationFromRotateX: '30',
			animationFromOpacity: 0,
			animationFromTranslateX: '40px',
		} );
		const out = switchModeAttributes( attrs, 'scroll-appear' );
		expect( out.animationEntryFromRotate ).toBe( '45deg' );
		expect( out.animationEntryFromBlur ).toBe( '8px' );
		expect( out.animationEntryFromRotateX ).toBe( '30deg' );
		expect( out.animationEntryFromOpacity ).toBe( 0 );
		expect( out.animationEntryFromTranslateX ).toBe( '40px' );
	} );

	it( 'clears stale destination values when the source is unset', () => {
		const attrs = block( {
			animationMode: 'page-load',
			animationType: 'custom',
			animationFromOpacity: 0,
			animationEntryFromRotate: '90deg',
		} );
		const out = switchModeAttributes( attrs, 'scroll-appear' );
		expect( out.animationEntryFromRotate ).toBeNull();
	} );

	it( 'emits no From/To keys when the bridge does not apply', () => {
		const pl = block( {
			animationMode: 'page-load',
			animationType: 'custom',
			animationFromOpacity: 0,
		} );
		expect(
			fromToKeysIn( switchModeAttributes( pl, 'scroll-interactive' ) )
		).toEqual( [] );
		const si = block( {
			animationMode: 'scroll-interactive',
			animationType: 'custom',
			animationFromOpacity: 0,
		} );
		expect(
			fromToKeysIn( switchModeAttributes( si, 'page-load' ) )
		).toEqual( [] );
		expect(
			fromToKeysIn(
				switchModeAttributes(
					block( { animationMode: 'page-load', animationType: '' } ),
					'scroll-appear'
				)
			)
		).toEqual( [] );
		expect(
			fromToKeysIn(
				switchModeAttributes(
					block( {
						animationMode: 'scroll-appear',
						animationEntryType: '',
					} ),
					'page-load'
				)
			)
		).toEqual( [] );
	} );

	it( 'writes exactly 18 known From/To keys and never touches the Exit slot', () => {
		const cases = [
			switchModeAttributes(
				block( { animationMode: 'page-load', animationType: 'fade' } ),
				'scroll-appear'
			),
			switchModeAttributes(
				block( {
					animationMode: 'scroll-appear',
					animationEntryType: 'fade',
					animationExitType: 'custom',
					animationExitFromOpacity: 1,
				} ),
				'page-load'
			),
		];
		for ( const out of cases ) {
			const keys = fromToKeysIn( out );
			expect( keys ).toHaveLength( 18 );
			for ( const k of keys ) {
				expect( DEFAULT_ATTRIBUTES ).toHaveProperty( k );
				expect( k ).not.toMatch( /^animationExit/ );
			}
		}
	} );

	it( 'keeps the existing timing bridge and the Scroll Interactive stagger clear', () => {
		const pl = block( {
			animationMode: 'page-load',
			animationType: 'fade',
			animationDuration: 1.2,
		} );
		const into = switchModeAttributes( pl, 'scroll-appear' );
		expect( into.animationEntryDuration ).toBe( 1.2 );
		const sa = { ...pl, ...into };
		expect(
			switchModeAttributes( sa, 'page-load' ).animationDuration
		).toBe( 1.2 );
		const staggered = block( {
			animationMode: 'page-load',
			animationType: 'fade',
			animationStaggerEnabled: true,
		} );
		expect(
			switchModeAttributes( staggered, 'scroll-interactive' )
				.animationStaggerEnabled
		).toBe( false );
	} );
} );
