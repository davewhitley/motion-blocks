/**
 * Scroll Appear Exit Delay must hold the forward Exit (GH #33).
 *
 * frontend.js handleSlotExit writes the Exit slot's Delay to
 * `--mb-delay` (applySlotVars). The wrapper and Stagger exit rules used
 * to hard-code `animation-delay: 0s`, so only img-target Covers waited.
 * Every exit rule that sets a delay must read the custom property, and
 * the Exit Replay = 'reverse' round trip zeroes it so content comes
 * back promptly.
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

/**
 * Rules whose selector targets the Exit trigger state and whose body
 * sets `animation-delay`.
 *
 * @return {{selector: string, body: string}[]} Matching rules.
 */
function exitDelayRules() {
	const rules = [];
	const re = /([^{}]+)\{([^{}]*)\}/g;
	let m;
	while ( ( m = re.exec( css ) ) ) {
		const selector = m[ 1 ].replace( /\s+/g, ' ' ).trim();
		const body = m[ 2 ];
		if (
			/\.mb-exit-triggered\b/.test( selector ) &&
			/animation-delay\s*:/.test( body )
		) {
			rules.push( { selector, body: body.replace( /\s+/g, ' ' ) } );
		}
	}
	return rules;
}

describe( 'Exit Delay (GH #33)', () => {
	const rules = exitDelayRules();

	it( 'finds the wrapper, stagger-child and img-target exit rules', () => {
		const selectors = rules.map( ( r ) => r.selector ).join( '\n' );
		expect( selectors ).toContain( '.mb-animated.mb-exit-triggered' );
		expect( selectors ).toContain(
			'.mb-stagger-parent.mb-exit-triggered >'
		);
		expect( selectors ).toContain(
			'[data-mb-target="img"].mb-animated.mb-exit-triggered img:first-of-type'
		);
	} );

	it.each( rules.map( ( r ) => [ r.selector, r.body ] ) )(
		'%s reads --mb-delay',
		( selector, body ) => {
			expect( body ).toMatch( /animation-delay:\s*var\(--mb-delay/ );
			expect( body ).not.toMatch( /animation-delay:\s*0s/ );
		}
	);

	it( 'the runtime img scoped CSS (Scroll Appear) reads --mb-delay', () => {
		const fn = frontend.match(
			/function buildScrollAppearImgScopedCSS\([\s\S]*?\n\t\}/
		);
		expect( fn ).not.toBeNull();
		expect( fn[ 0 ] ).toContain( 'animation-delay: var(--mb-delay, 0s)' );
	} );

	it( 'the reverse round trip zeroes --mb-delay before restarting', () => {
		const fn = frontend.match(
			/function handleSlotEnterBack\([\s\S]*?\n\t\}/
		);
		expect( fn ).not.toBeNull();
		const zero = fn[ 0 ].indexOf( "setProperty( '--mb-delay', '0s' )" );
		const restart = fn[ 0 ].indexOf(
			"restartAnimation( el, 'mb-exit-triggered' )"
		);
		expect( zero ).toBeGreaterThan( -1 );
		expect( restart ).toBeGreaterThan( zero );
	} );

	it( 'a forward Exit records when its Delay ends', () => {
		const fn = frontend.match( /function handleSlotExit\([\s\S]*?\n\t\}/ );
		expect( fn ).not.toBeNull();
		expect( fn[ 0 ] ).toMatch( /state\.exitPendingUntil\s*=/ );
	} );
} );
