/**
 * The motion-off rest state in css/animations.css (Reduced Motion and
 * the three per-device disable blocks) must also drop Flip's 3D context.
 *
 * Flip sets `transform-style: preserve-3d` + `backface-visibility:
 * hidden` in plain class rules, not in its keyframes, so `animation:
 * none` leaves them in place. `preserve-3d` alone makes the block a
 * containing block for `position: fixed` descendants (GH #20 / #33),
 * so a Flip block kept trapping e.g. a Navigation overlay even though
 * nothing animated. This guard fails if the reset loses either
 * property, if the four lists drift apart (GH #26 / #44), or if a new
 * effect adds a 3D context the reset doesn't know about.
 *
 * Run: npm run test:unit
 */
const fs = require( 'fs' );
const path = require( 'path' );

const css = fs
	.readFileSync(
		path.join( __dirname, '..', '..', 'css', 'animations.css' ),
		'utf8'
	)
	.replace( /\/\*[\s\S]*?\*\//g, '' );

const collapse = ( text ) => text.replace( /\s+/g, ' ' ).trim();

/**
 * Every plain style rule in the file (at-rule preludes skipped, so
 * rules nested in @media / @supports come through as their own rule).
 *
 * @return {{selector: string, body: string}[]} Rules.
 */
function rules() {
	const found = [];
	const re = /([^{}]+)\{([^{}]*)\}/g;
	let match;
	while ( ( match = re.exec( css ) ) ) {
		const selector = collapse( match[ 1 ] );
		if ( ! selector.startsWith( '@' ) ) {
			found.push( { selector, body: collapse( match[ 2 ] ) } );
		}
	}
	return found;
}

/**
 * The four rest-state rules: the first `:is( … )` rule in the Reduced
 * Motion block and in each `body.mb-disabled-*` block (the one that
 * pins `animation: none`, not the separate `filter` rule).
 *
 * @return {Object<string, {list: string, body: string}>} By block.
 */
function restRules() {
	const byKey = {};
	rules().forEach( ( { selector, body } ) => {
		const isList = selector.match( /^(.*?):is\((.*)\)$/ );
		if ( ! isList || ! body.includes( 'animation: none !important' ) ) {
			return;
		}
		const scope = isList[ 1 ].trim();
		let key = null;
		if ( scope === '' ) {
			key = 'reduced-motion';
		} else {
			const device = scope.match( /^body\.mb-disabled-(\w+)$/ );
			key = device ? device[ 1 ] : null;
		}
		if ( key && ! byKey[ key ] ) {
			byKey[ key ] = { list: collapse( isList[ 2 ] ), body };
		}
	} );
	return byKey;
}

describe( 'motion-off rest state resets Flip 3D context (GH #33)', () => {
	const rest = restRules();

	it( 'finds the Reduced Motion and three per-device rules', () => {
		expect( Object.keys( rest ).sort() ).toEqual( [
			'desktop',
			'mobile',
			'reduced-motion',
			'tablet',
		] );
	} );

	it( 'keeps the four selector lists identical', () => {
		const lists = new Set( Object.values( rest ).map( ( r ) => r.list ) );
		expect( lists.size ).toBe( 1 );
	} );

	it( 'keeps the four rule bodies identical', () => {
		const bodies = new Set( Object.values( rest ).map( ( r ) => r.body ) );
		expect( bodies.size ).toBe( 1 );
	} );

	it.each( [ 'reduced-motion', 'desktop', 'tablet', 'mobile' ] )(
		'%s flattens the 3D context',
		( key ) => {
			expect( rest[ key ].body ).toContain(
				'transform-style: flat !important'
			);
			expect( rest[ key ].body ).toContain(
				'backface-visibility: visible !important'
			);
		}
	);

	it( 'only sets preserve-3d on Flip rules', () => {
		const stray = rules()
			.filter( ( { body } ) =>
				/transform-style:\s*preserve-3d/.test( body )
			)
			.map( ( { selector } ) => selector )
			.filter(
				( selector ) =>
					! /\.mb-(enter|exit)-flip\b/.test( selector )
			);
		expect( stray ).toEqual( [] );
	} );
} );
