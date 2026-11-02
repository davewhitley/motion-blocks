/**
 * Per-device disable buckets (GH #33, #53).
 *
 * The buckets are WordPress core's viewport breakpoints (theme.json
 * `settings.viewport`), built in PHP by motion_blocks_device_media_queries()
 * and handed to the head script, frontend.js, the self-check and the
 * editor. These guards check, for core's default breakpoints, a theme's
 * custom ones, a theme that sets only one, and the pre-7.1 fallback:
 *
 *   - every width, fractional included (767.5px under browser zoom), lands
 *     in at most one bucket, and in exactly one of the buckets the set
 *     defines (the old integer bounds left 1px holes, GH #33);
 *   - the fallback keeps its min-/max-width form for engines without
 *     range syntax;
 *   - nothing keeps its own copy of the queries.
 *
 * Run: npm run test:unit
 */
const fs = require( 'fs' );
const path = require( 'path' );
const { matches, QUERY_SETS } = require( './helpers/motion-gate' );

const root = path.join( __dirname, '..', '..' );
const read = ( file ) => fs.readFileSync( path.join( root, file ), 'utf8' );

const WIDTHS = [
	0, 320, 479.5, 480, 480.5, 481, 600, 600.5, 767, 767.5, 767.99, 768, 782,
	782.5, 783, 800, 900, 900.5, 1000, 1000.5, 1023, 1023.5, 1024, 1920,
];

const bucketsAt = ( queries, width ) =>
	Object.keys( queries ).filter( ( d ) =>
		matches( queries[ d ], { width, reduced: false } )
	);

describe( 'per-device disable buckets', () => {
	it.each( Object.keys( QUERY_SETS ) )(
		'%s: every width is in exactly one bucket',
		( set ) => {
			WIDTHS.forEach( ( width ) => {
				expect( {
					width,
					hit: bucketsAt( QUERY_SETS[ set ], width ),
				} ).toEqual( { width, hit: [ expect.any( String ) ] } );
			} );
		}
	);

	it( 'keeps the pre-7.1 whole-pixel mapping in the fallback', () => {
		const at = ( w ) => bucketsAt( QUERY_SETS.legacy, w );
		expect( at( 767 ) ).toEqual( [ 'mobile' ] );
		expect( at( 768 ) ).toEqual( [ 'tablet' ] );
		expect( at( 1023 ) ).toEqual( [ 'tablet' ] );
		expect( at( 1024 ) ).toEqual( [ 'desktop' ] );
	} );

	it( 'follows core: mobile ≤ 480px < tablet ≤ 782px < desktop', () => {
		const at = ( w ) => bucketsAt( QUERY_SETS.core, w );
		expect( at( 480 ) ).toEqual( [ 'mobile' ] );
		expect( at( 481 ) ).toEqual( [ 'tablet' ] );
		expect( at( 782 ) ).toEqual( [ 'tablet' ] );
		expect( at( 783 ) ).toEqual( [ 'desktop' ] );
	} );
} );

describe( 'one source for the device queries', () => {
	const php = read( 'animation-plugin.php' );

	it( 'builds them from core, with the fallback in one PHP function', () => {
		expect( php ).toContain(
			"method_exists( 'WP_Theme_JSON', 'get_viewport_media_queries' )"
		);
		const fallback = php.match(
			/function motion_blocks_device_media_queries_from\([\s\S]*?\n\}/
		);
		expect( fallback ).not.toBeNull();
		Object.values( QUERY_SETS.legacy ).forEach( ( q ) =>
			expect( fallback[ 0 ] ).toContain( `'${ q }'` )
		);
		// Nowhere else in the PHP code (comments may cite them).
		const rest = php
			.replace( fallback[ 0 ], '' )
			.replace( /\/\*[\s\S]*?\*\//g, '' )
			.replace( /\/\/.*$/gm, '' );
		expect( rest ).not.toMatch(
			/width\s*[<>]=?\s*\d|(min|max)-width:\s*\d/
		);
	} );

	it( 'hands the same queries to the head script, frontend.js and the editor', () => {
		expect( php ).toMatch(
			/motion_blocks_motion_gate_script\(\) \. '\)\(document\.documentElement,'\s*\.\s*wp_json_encode\( \(object\) motion_blocks_device_media_queries\(\) \)/
		);
		[ "'motion-blocks-frontend',", "'motion-blocks-editor'," ].forEach(
			( handle ) => {
				expect( php ).toMatch(
					new RegExp(
						`wp_add_inline_script\\(\\s*${ handle.replace(
							/[-]/g,
							'\\-'
						) }\\s*motion_blocks_device_queries_script\\(\\),\\s*'before'`
					)
				);
			}
		);
	} );

	it( 'keeps no copy anywhere else', () => {
		expect(
			JSON.parse( read( 'shared-constants.json' ) )
		).not.toHaveProperty( 'deviceQueries' );
		[
			'css/animations.css',
			'src/motion-gate.js',
			'src/self-check.js',
			'src/frontend.js',
			'src/components/PageSettingsPanel.js',
			'src/components/deviceRanges.js',
		].forEach( ( file ) => {
			const code = read( file ).replace( /\/\*[\s\S]*?\*\//g, '' );
			expect( {
				file,
				copy: /\(\s*\d+px\s*<|width\s*[<>]=?\s*\d+px|(min|max)-width:\s*\d/.test(
					code
				),
			} ).toEqual( { file, copy: false } );
		} );
	} );
} );
