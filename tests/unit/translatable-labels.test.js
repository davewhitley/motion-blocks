/**
 * The panel's translatable effect and direction names
 * (src/components/labels.js) match the shared catalog that agents and
 * schema/README.md read (shared-constants.json). They're written twice
 * because `wp i18n make-pot` only finds string literals; this keeps the
 * copies in step (GH #54, #89).
 *
 * Run: npm run test:unit
 */
import {
	EFFECT_LABELS,
	EXIT_EFFECT_LABELS,
	DIRECTION_LABELS,
} from '../../src/components/labels';

const SHARED = require( '../../shared-constants.json' );

const HOW =
	'Keep src/components/labels.js and effectCatalog / directionLabels in shared-constants.json in step.';

const catalog = Object.entries( SHARED.effectCatalog );

describe( 'translatable effect and direction names', () => {
	it( 'names every effect in the catalog, with the same wording', () => {
		expect( { EFFECT_LABELS, HOW } ).toEqual( {
			EFFECT_LABELS: Object.fromEntries(
				catalog.map( ( [ value, entry ] ) => [ value, entry.label ] )
			),
			HOW,
		} );
	} );

	it( 'names every Exit wording in the catalog', () => {
		expect( { EXIT_EFFECT_LABELS, HOW } ).toEqual( {
			EXIT_EFFECT_LABELS: Object.fromEntries(
				catalog
					.filter( ( [ , entry ] ) => entry.exitLabel )
					.map( ( [ value, entry ] ) => [ value, entry.exitLabel ] )
			),
			HOW,
		} );
	} );

	it( 'names every direction, with the same wording', () => {
		expect( { DIRECTION_LABELS, HOW } ).toEqual( {
			DIRECTION_LABELS: SHARED.directionLabels,
			HOW,
		} );
	} );
} );
