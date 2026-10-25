/**
 * Agent recipes stay in step with the plugin.
 *
 * Every animation attribute the editor registers must be accounted for
 * in the recipe format (tests/recipe/coverage.json): mapped to a recipe
 * field, or listed as deliberately left out. A new attribute, effect,
 * direction or Custom property that isn't wired into recipes fails here
 * with a message saying what to update. See CONTRIBUTING.md.
 *
 * Run: npm run test:unit
 */
const fs = require( 'fs' );
const path = require( 'path' );

const root = path.join( __dirname, '..', '..' );
const SHARED = require( '../../shared-constants.json' );
const COVERAGE = require( '../recipe/coverage.json' );
import { PROPERTY_DEFINITIONS } from '../../src/components/constants';

const HOW =
	'Wire it into agent recipes: map it in tests/recipe/coverage.json, handle it in includes/recipe.php (both directions), add a tests/schema-defaults/cases.php case, then run `wp eval-file tests/recipe/check.php schema`. See CONTRIBUTING.md.';

/** Attribute names registered by addAnimationAttributes in src/index.js. */
function registeredAttributes() {
	const src = fs.readFileSync( path.join( root, 'src', 'index.js' ), 'utf8' );
	const start = src.indexOf( 'function addAnimationAttributes' );
	const end = src.indexOf( '\n}\n', start );
	return [
		...new Set(
			[
				...src
					.slice( start, end )
					.matchAll( /\n\t+(animation[A-Z][A-Za-z]*): \{/g ),
			].map( ( m ) => m[ 1 ] )
		),
	];
}

/** Recipe path for an attribute, or null when it isn't accounted for. */
function recipePath( name ) {
	if ( COVERAGE.fields[ name ] ) {
		return COVERAGE.fields[ name ];
	}
	if ( COVERAGE.notInRecipes[ name ] ) {
		return '(not in recipes)';
	}
	const props = Object.keys( SHARED.propertyDefaultUnits ).map(
		( id ) => id[ 0 ].toUpperCase() + id.slice( 1 )
	);
	const custom = name.match(
		new RegExp(
			`^animation(Entry|Exit)?(From|To)(${ props.join( '|' ) })$`
		)
	);
	if ( custom ) {
		return `${
			custom[ 1 ] ? custom[ 1 ].toLowerCase() : 'effect'
		}.${ custom[ 2 ].toLowerCase() }.${ custom[ 3 ][ 0 ].toLowerCase() }${ custom[ 3 ].slice(
			1
		) }`;
	}
	const field = name.match( /^animation(Entry|Exit)?([A-Z][A-Za-z]*)$/ );
	if ( field && COVERAGE.effectFields[ field[ 2 ] ] ) {
		if ( ! field[ 1 ] && COVERAGE.slotsOnly.includes( field[ 2 ] ) ) {
			return null;
		}
		return `${ field[ 1 ] ? field[ 1 ].toLowerCase() : 'effect' }.${
			COVERAGE.effectFields[ field[ 2 ] ]
		}`;
	}
	return null;
}

describe( 'recipe coverage of block attributes', () => {
	const registered = registeredAttributes();

	it( 'finds the registered attributes', () => {
		expect( registered.length ).toBeGreaterThan( 90 );
	} );

	it( 'accounts for every registered attribute', () => {
		const missing = registered.filter( ( name ) => ! recipePath( name ) );
		if ( missing.length ) {
			throw new Error(
				`Not in agent recipes: ${ missing.join( ', ' ) }. ${ HOW }`
			);
		}
	} );

	it( 'lists no attribute that no longer exists', () => {
		const listed = [
			...Object.keys( COVERAGE.fields ),
			...Object.keys( COVERAGE.notInRecipes ),
		];
		expect( listed.filter( ( n ) => ! registered.includes( n ) ) ).toEqual(
			[]
		);
	} );
} );

describe( 'effect catalog (shared-constants.json effectCatalog)', () => {
	const effects = [
		...new Set( [
			...SHARED.animationTypes,
			...SHARED.entryTypes,
			...SHARED.exitTypes,
		] ),
	];

	it( 'describes every effect, and only those', () => {
		const missing = effects.filter( ( t ) => ! SHARED.effectCatalog[ t ] );
		if ( missing.length ) {
			throw new Error(
				`No effectCatalog entry for: ${ missing.join(
					', '
				) }. Add a label and a plain-language description in shared-constants.json (agents, the panel and schema/README.md read it), then run \`wp eval-file tests/recipe/check.php schema\`.`
			);
		}
		expect(
			Object.keys( SHARED.effectCatalog ).filter(
				( t ) => ! effects.includes( t )
			)
		).toEqual( [] );
	} );

	it( 'gives every entry a label and a description', () => {
		for ( const [ type, entry ] of Object.entries(
			SHARED.effectCatalog
		) ) {
			expect( [
				type,
				typeof entry.label,
				entry.description?.length > 20,
			] ).toEqual( [ type, 'string', true ] );
		}
	} );

	it( 'names a real default direction', () => {
		for ( const [ type, entry ] of Object.entries(
			SHARED.effectCatalog
		) ) {
			if ( ! entry.defaultDirection ) {
				expect( [ type, SHARED.directions[ type ] ] ).toEqual( [
					type,
					undefined,
				] );
				continue;
			}
			const allowed = [
				...( SHARED.directions[ type ] || [] ),
				...( type.startsWith( 'scale' ) ? [ 'none' ] : [] ),
			];
			expect( [
				type,
				allowed.includes( entry.defaultDirection ),
			] ).toEqual( [ type, true ] );
		}
	} );

	it( 'labels every direction', () => {
		const all = new Set( Object.values( SHARED.directions ).flat() );
		for ( const d of all ) {
			expect( [ d, typeof SHARED.directionLabels[ d ] ] ).toEqual( [
				d,
				'string',
			] );
		}
	} );
} );

describe( 'Custom properties (propertyDefaultUnits)', () => {
	it( 'matches the From / To editor (PROPERTY_DEFINITIONS)', () => {
		expect( Object.keys( SHARED.propertyDefaultUnits ).sort() ).toEqual(
			PROPERTY_DEFINITIONS.map( ( d ) => d.id ).sort()
		);
		for ( const def of PROPERTY_DEFINITIONS ) {
			const expected =
				def.unitSuffix || ( def.kind === 'length' ? 'px' : '' );
			expect( [ def.id, SHARED.propertyDefaultUnits[ def.id ] ] ).toEqual(
				[ def.id, expected ]
			);
		}
	} );

	it( 'matches propertyCssVar', () => {
		expect( Object.keys( SHARED.propertyDefaultUnits ).sort() ).toEqual(
			Object.keys( SHARED.propertyCssVar ).sort()
		);
	} );
} );
