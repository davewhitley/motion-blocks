/**
 * Scroll Interactive Image Move, Image Zoom and Custom default to Linear
 * Acceleration, so they follow the scroll evenly; every other effect and
 * mode defaults to Ease (GH #109). The stored default is '' ("this
 * effect's default"), resolved the same way in JS and PHP.
 *
 * Run: npm run test:unit
 */
import fs from 'fs';
import path from 'path';

import SHARED from '../../shared-constants.json';
import {
	DEFAULT_ATTRIBUTES,
	SCHEMA_DEFAULTS,
	SCROLL_LINEAR_TYPES,
	defaultAcceleration,
	switchModeAttributes,
} from '../../src/components/constants';

const ROOT = path.resolve( __dirname, '../..' );
const read = ( file ) => fs.readFileSync( path.join( ROOT, file ), 'utf8' );

describe( 'defaultAcceleration', () => {
	it.each( [ 'image-move', 'image-zoom', 'custom' ] )(
		'Scroll Interactive %s is linear',
		( type ) => {
			expect( defaultAcceleration( 'scroll-interactive', type ) ).toBe(
				'linear'
			);
		}
	);

	it.each( [ 'fade', 'fade-out', 'slide', 'scale', 'blur', 'rotate' ] )(
		'Scroll Interactive %s stays ease',
		( type ) => {
			expect( defaultAcceleration( 'scroll-interactive', type ) ).toBe(
				'ease'
			);
		}
	);

	it.each( [ 'image-move', 'image-zoom', 'custom', 'fade' ] )(
		'Page Load %s stays ease',
		( type ) => {
			expect( defaultAcceleration( 'page-load', type ) ).toBe( 'ease' );
		}
	);

	it( 'reads its list from shared-constants.json', () => {
		expect( SCROLL_LINEAR_TYPES ).toBe( SHARED.scrollLinearTypes );
	} );
} );

describe( 'stored default', () => {
	it( 'is blank, meaning "this effect\'s default"', () => {
		expect( SCHEMA_DEFAULTS.animationAcceleration ).toBe( '' );
		expect( DEFAULT_ATTRIBUTES.animationAcceleration ).toBe( '' );
	} );

	it( 'Scroll Appear slots keep their own Ease default', () => {
		expect( SCHEMA_DEFAULTS.animationEntryAcceleration ).toBe( 'ease' );
		expect( SCHEMA_DEFAULTS.animationExitAcceleration ).toBe( 'ease' );
	} );
} );

describe( 'switching out of Scroll Appear', () => {
	const fromScrollAppear = ( entryAcceleration ) => ( {
		...DEFAULT_ATTRIBUTES,
		animationMode: 'scroll-appear',
		animationEntryType: 'fade',
		animationEntryAcceleration: entryAcceleration,
	} );

	it( 'an Entry left on Ease comes back as the effect default', () => {
		const out = switchModeAttributes(
			fromScrollAppear( 'ease' ),
			'scroll-interactive'
		);
		expect( out.animationAcceleration ).toBe( '' );
	} );

	it( 'any other Entry acceleration carries over', () => {
		const out = switchModeAttributes(
			fromScrollAppear( 'ease-out' ),
			'scroll-interactive'
		);
		expect( out.animationAcceleration ).toBe( 'ease-out' );
	} );
} );

describe( 'PHP mirrors the same rule', () => {
	const php = read( 'animation-plugin.php' );

	it( 'motion_blocks_default_acceleration reads scrollLinearTypes', () => {
		const fn = php.match(
			/function motion_blocks_default_acceleration\([\s\S]*?\n\}/
		);
		expect( fn ).not.toBeNull();
		expect( fn[ 0 ] ).toContain( "['scrollLinearTypes']" );
		expect( fn[ 0 ] ).toContain( "'scroll-interactive' === $mode" );
	} );

	it( 'the Page Load / Scroll Interactive render resolves a blank value with it', () => {
		expect( php ).toMatch(
			/\$acceleration = \$attrs\['animationAcceleration'\] \?\? '';\s*if \( ! is_string\( \$acceleration \) \|\| '' === \$acceleration \) \{\s*\$acceleration = motion_blocks_default_acceleration\( \$mode, \(string\) \$type \);/
		);
	} );

	it( 'recipe seeds start from the blank default', () => {
		expect( php ).toMatch( /'animationAcceleration'\s*=> '',/ );
	} );
} );

describe( 'Scroll Interactive CSS', () => {
	it( 'has no unreachable linear fallback left', () => {
		for ( const file of [
			'css/animations.css',
			'src/frontend.js',
			'src/index.js',
		] ) {
			expect( read( file ) ).not.toContain( 'var(--mb-timing, linear)' );
		}
	} );
} );
