/**
 * When a finished animation may be dropped (GH #20).
 *
 * frontend.js adds `.mb-settled` to a finished one-shot block, which
 * drops its filled last frame so it stops trapping `position: fixed`
 * descendants. That's only safe when the last frame is the block's
 * natural look (or the block snaps back) and when settling can't reach
 * a nested animated block. src/settle.js decides both.
 *
 * Run: npm run test:unit
 */
import {
	REST_END_TYPES,
	customEndsAtRest,
	endsAtRest,
	settleTargets,
} from '../../src/settle';

function build( html ) {
	const host = document.createElement( 'div' );
	host.innerHTML = html.trim();
	return host.firstElementChild;
}

describe( 'REST_END_TYPES', () => {
	it( 'lists the entry presets that end at rest', () => {
		expect( [ ...REST_END_TYPES ].sort() ).toEqual( [
			'blur',
			'curtain',
			'fade',
			'flip',
			'rotate',
			'scale',
			'slide',
			'wipe',
		] );
	} );

	it.each( [
		'fade-out',
		'slide-out',
		'scale-out',
		'blur-out',
		'rotate-out',
		'curtain-out',
		'image-move',
		'image-zoom',
		'custom',
		'',
		undefined,
	] )( 'leaves out %s', ( type ) => {
		expect( REST_END_TYPES ).not.toContain( type );
	} );
} );

describe( 'customEndsAtRest', () => {
	const to = ( id, value ) => ( { [ `mbTo${ id }` ]: value } );

	it( 'is true with no To values at all', () => {
		expect( customEndsAtRest( {}, 'mbTo' ) ).toBe( true );
	} );

	it.each( [ 1, '1', '1.5' ] )( 'opacity %p is at rest', ( v ) => {
		expect( customEndsAtRest( to( 'Opacity', v ), 'mbTo' ) ).toBe( true );
	} );

	it.each( [ '0.5', '0', 0.03 ] )( 'opacity %p is not', ( v ) => {
		expect( customEndsAtRest( to( 'Opacity', v ), 'mbTo' ) ).toBe( false );
	} );

	it.each( [ '0', '0px', '0%', '-0', '0.0em' ] )(
		'translate %p is at rest',
		( v ) => {
			expect( customEndsAtRest( to( 'TranslateX', v ), 'mbTo' ) ).toBe(
				true
			);
			expect( customEndsAtRest( to( 'TranslateY', v ), 'mbTo' ) ).toBe(
				true
			);
		}
	);

	it.each( [ '20px', '-1px', '0.5%' ] )( 'translate %p is not', ( v ) => {
		expect( customEndsAtRest( to( 'TranslateY', v ), 'mbTo' ) ).toBe(
			false
		);
	} );

	it( 'scale 1 is at rest, 1.2 and 0 are not', () => {
		expect( customEndsAtRest( to( 'Scale', '1' ), 'mbTo' ) ).toBe( true );
		expect( customEndsAtRest( to( 'Scale', 1 ), 'mbTo' ) ).toBe( true );
		expect( customEndsAtRest( to( 'Scale', '1.2' ), 'mbTo' ) ).toBe(
			false
		);
		expect( customEndsAtRest( to( 'Scale', '0' ), 'mbTo' ) ).toBe( false );
	} );

	it.each( [ 'Rotate', 'RotateX', 'RotateY' ] )(
		'%s at 0deg / 0turn is at rest, 45deg is not',
		( id ) => {
			expect( customEndsAtRest( to( id, '0deg' ), 'mbTo' ) ).toBe( true );
			expect( customEndsAtRest( to( id, '0turn' ), 'mbTo' ) ).toBe(
				true
			);
			expect( customEndsAtRest( to( id, '45deg' ), 'mbTo' ) ).toBe(
				false
			);
		}
	);

	it( 'blur 0px is at rest, 4px is not', () => {
		expect( customEndsAtRest( to( 'Blur', '0px' ), 'mbTo' ) ).toBe( true );
		expect( customEndsAtRest( to( 'Blur', '4px' ), 'mbTo' ) ).toBe( false );
	} );

	it.each( [
		'none',
		'inset(0)',
		'inset(0 0 0 0)',
		'inset(0px 0% 0 0)',
		'INSET( 0 0 )',
	] )( 'clip-path %p is at rest', ( v ) => {
		expect( customEndsAtRest( to( 'ClipPath', v ), 'mbTo' ) ).toBe( true );
	} );

	it.each( [
		'circle(50%)',
		'inset(0 round 4px)',
		'inset(10px)',
		'inset(0 0 0 0 0)',
		'polygon(0 0, 100% 0, 100% 100%, 0 100%)',
	] )( 'clip-path %p is not', ( v ) => {
		expect( customEndsAtRest( to( 'ClipPath', v ), 'mbTo' ) ).toBe( false );
	} );

	it( 'ignores values the keyframe would drop as invalid', () => {
		expect(
			customEndsAtRest(
				{
					mbToOpacity: 'banana',
					mbToTranslateX: '20px;color:red',
					mbToClipPath: 'url(#x)',
				},
				'mbTo'
			)
		).toBe( true );
	} );

	it( 'needs every valid value to be neutral', () => {
		expect(
			customEndsAtRest(
				{ mbToOpacity: '1', mbToTranslateY: '0px', mbToScale: '1.1' },
				'mbTo'
			)
		).toBe( false );
	} );

	it( 'reads the Scroll Appear Entry prefix', () => {
		const dataset = { mbEntryToOpacity: '0.5', mbToOpacity: '1' };
		expect( customEndsAtRest( dataset, 'mbEntryTo' ) ).toBe( false );
		expect( customEndsAtRest( dataset, 'mbTo' ) ).toBe( true );
	} );
} );

describe( 'endsAtRest', () => {
	it( 'is true for the rest presets', () => {
		REST_END_TYPES.forEach( ( type ) => {
			expect( endsAtRest( type, {}, 'mbTo' ) ).toBe( true );
		} );
	} );

	it( 'is false for Out presets and image effects', () => {
		[ 'fade-out', 'slide-out', 'image-zoom', 'image-move' ].forEach(
			( type ) => {
				expect( endsAtRest( type, {}, 'mbTo' ) ).toBe( false );
			}
		);
	} );

	it( 'asks customEndsAtRest for Custom', () => {
		expect( endsAtRest( 'custom', { mbToOpacity: '1' }, 'mbTo' ) ).toBe(
			true
		);
		expect( endsAtRest( 'custom', { mbToOpacity: '0' }, 'mbTo' ) ).toBe(
			false
		);
	} );
} );

describe( 'settleTargets', () => {
	it( 'is just the wrapper for a plain block', () => {
		const el = build( '<div class="mb-animated"><p>Hi</p></div>' );
		expect( settleTargets( el ) ).toEqual( [ el ] );
	} );

	it( 'adds Stagger children', () => {
		const el = build(
			'<ul class="mb-animated mb-stagger-parent"><li>1</li><li>2</li></ul>'
		);
		expect( settleTargets( el ) ).toEqual( [ el, ...el.children ] );
	} );

	it( 'reaches through the classic-theme inner container (GH #66)', () => {
		const el = build(
			'<div class="mb-animated mb-stagger-parent"><div class="wp-block-group__inner-container"><p>1</p><p>2</p></div></div>'
		);
		const inner = el.firstElementChild;
		expect( settleTargets( el ) ).toEqual( [ el, ...inner.children ] );
	} );

	it( 'skips a Stagger parent with an animated child', () => {
		const el = build(
			'<div class="mb-animated mb-stagger-parent"><p>1</p><p class="mb-animated">2</p></div>'
		);
		expect( settleTargets( el ) ).toBeNull();
	} );

	it( 'adds the img-target image', () => {
		const el = build(
			'<div class="mb-animated" data-mb-target="img"><img alt=""><div><p>Text</p></div></div>'
		);
		expect( settleTargets( el ) ).toEqual( [
			el,
			el.querySelector( 'img' ),
		] );
	} );

	it( 'skips an img-target block whose image match is in a nested animated block', () => {
		const el = build(
			'<div class="mb-animated" data-mb-target="img"><img alt=""><div class="mb-animated"><img alt=""></div></div>'
		);
		expect( settleTargets( el ) ).toBeNull();
	} );
} );
