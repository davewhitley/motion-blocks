/**
 * The editor note for Blur + "Animate image only" on a block with a
 * Duotone (GH #170). The clash itself is left as a known limit.
 *
 * Run: npm run test:unit
 */
import { duotoneBlurText } from '../../src/components/imageTargetText';

const duotone = { style: { color: { duotone: [ '#000', '#fff' ] } } };
const imageOnly = { ...duotone, animationFromToTarget: 'img' };

it( 'shows for Blur In and Blur Out on the image of a Duotone block', () => {
	expect( duotoneBlurText( imageOnly, 'blur' ) ).toMatch( /Duotone/ );
	expect( duotoneBlurText( imageOnly, 'blur-out' ) ).toMatch( /Duotone/ );
} );

it( 'stays away when the whole block animates', () => {
	expect( duotoneBlurText( duotone, 'blur' ) ).toBeNull();
} );

it( 'stays away for other effects', () => {
	expect( duotoneBlurText( imageOnly, 'fade' ) ).toBeNull();
	expect( duotoneBlurText( imageOnly, '' ) ).toBeNull();
} );

it( 'stays away without a Duotone, or with it switched off', () => {
	expect(
		duotoneBlurText( { animationFromToTarget: 'img' }, 'blur' )
	).toBeNull();
	expect(
		duotoneBlurText(
			{
				animationFromToTarget: 'img',
				style: { color: { duotone: 'unset' } },
			},
			'blur'
		)
	).toBeNull();
} );
