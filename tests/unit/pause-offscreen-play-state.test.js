/**
 * Page Load "Pause when off-screen" must reach whatever actually
 * animates (GH #58).
 *
 * frontend.js pauses a looping block by setting `--mb-play-state` on
 * the wrapper. `animation-play-state` is not inherited, and a Stagger
 * parent or an img-target block animates its children / image rather
 * than itself, so every triggered (Entry) rule that times an animation
 * must read the custom property. This guard fails if a new triggered
 * rule forgets it, or if the runtime goes back to inline
 * `animation-play-state` on the wrapper.
 *
 * Run: npm run test:unit
 */
const fs = require( 'fs' );
const path = require( 'path' );

const root = path.join( __dirname, '..', '..' );
const css = fs
	.readFileSync( path.join( root, 'css', 'animations.css' ), 'utf8' )
	.replace( /\/\*[\s\S]*?\*\//g, '' );
const frontend = fs.readFileSync(
	path.join( root, 'src', 'frontend.js' ),
	'utf8'
);

const PLAY_STATE = 'animation-play-state: var(--mb-play-state, running)';

/**
 * Rules whose selector targets the Entry trigger state (`.mb-triggered`,
 * not `.mb-exit-triggered`) and whose body sets the iteration count —
 * i.e. the rules that time a Page Load / Scroll Appear Entry animation.
 *
 * @return {{selector: string, body: string}[]} Matching rules.
 */
function triggeredTimingRules() {
	const rules = [];
	const re = /([^{}]+)\{([^{}]*)\}/g;
	let m;
	while ( ( m = re.exec( css ) ) ) {
		const selector = m[ 1 ].replace( /\s+/g, ' ' ).trim();
		const body = m[ 2 ];
		if (
			/\.mb-triggered\b/.test( selector ) &&
			/animation-iteration-count:\s*var\(--mb-iteration-count/.test(
				body
			)
		) {
			rules.push( { selector, body: body.replace( /\s+/g, ' ' ) } );
		}
	}
	return rules;
}

describe( 'Pause when off-screen (GH #58)', () => {
	const rules = triggeredTimingRules();

	it( 'finds the wrapper, stagger-child and img-target rules', () => {
		const selectors = rules.map( ( r ) => r.selector ).join( '\n' );
		expect( selectors ).toContain( '.mb-animated.mb-triggered' );
		expect( selectors ).toContain( '.mb-stagger-parent.mb-triggered >' );
		expect( selectors ).toContain(
			'[data-mb-target="img"].mb-animated.mb-triggered > img:first-of-type'
		);
	} );

	it.each( rules.map( ( r ) => [ r.selector, r.body ] ) )(
		'%s reads --mb-play-state',
		( selector, body ) => {
			expect( body ).toContain( PLAY_STATE );
		}
	);

	it( 'pauses via the custom property, not inline animation-play-state', () => {
		const fn = frontend.match(
			/function setupPauseOffscreen\([\s\S]*?\n\t\}/
		);
		expect( fn ).not.toBeNull();
		expect( fn[ 0 ] ).toContain( "'--mb-play-state'" );
		expect( fn[ 0 ] ).not.toMatch( /animationPlayState/ );
	} );

	it( 'the runtime img scoped CSS (Page Load branch) reads it too', () => {
		const fn = frontend.match(
			/function buildImgScopedCSS\([\s\S]*?\n\t\}/
		);
		expect( fn ).not.toBeNull();
		expect( fn[ 0 ] ).toContain( PLAY_STATE );
	} );
} );
