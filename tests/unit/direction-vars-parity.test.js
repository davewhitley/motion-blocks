/**
 * The front end (src/frontend.js, DIRECTION_VARS) and the editor
 * (src/components/constants.js, DIRECTION_CSS_VARS) each keep a table of
 * the CSS variables a type + direction sets. They have to match, or an
 * effect plays one way in the editor preview and another way on the
 * published page: Curtain Close was missing from the front-end table,
 * so Vertical always played Horizontal (GH #129).
 *
 * Run: npm run test:unit
 */
import fs from 'fs';
import path from 'path';

import { DIRECTION_CSS_VARS } from '../../src/components/constants';

const source = fs.readFileSync(
	path.resolve( __dirname, '../../src/frontend.js' ),
	'utf8'
);

// frontend.js is an IIFE with no exports, so read the object literal
// out of the source and evaluate just that.
function readFrontendDirectionVars() {
	const start = source.indexOf( 'var DIRECTION_VARS = {' );
	expect( start ).toBeGreaterThan( -1 );
	const open = source.indexOf( '{', start );
	let depth = 0;
	let end = -1;
	for ( let i = open; i < source.length; i++ ) {
		if ( source[ i ] === '{' ) {
			depth++;
		} else if ( source[ i ] === '}' ) {
			depth--;
			if ( depth === 0 ) {
				end = i;
				break;
			}
		}
	}
	expect( end ).toBeGreaterThan( open );
	// eslint-disable-next-line no-new-func -- runs the plugin's own source text
	return new Function( 'return ' + source.slice( open, end + 1 ) + ';' )();
}

describe( 'direction variables', () => {
	const frontend = readFrontendDirectionVars();

	it( 'cover the same effects on the front end and in the editor', () => {
		expect( Object.keys( frontend ).sort() ).toEqual(
			Object.keys( DIRECTION_CSS_VARS ).sort()
		);
	} );

	it.each( Object.keys( DIRECTION_CSS_VARS ) )(
		'%s sets the same variables for every direction',
		( type ) => {
			expect( frontend[ type ] ).toEqual( DIRECTION_CSS_VARS[ type ] );
		}
	);

	it( 'Curtain Close has a Vertical direction on the front end', () => {
		expect( frontend[ 'curtain-out' ].vertical ).toEqual( {
			'--mb-curtain-from': 'inset(50% 0 50% 0)',
		} );
	} );
} );
