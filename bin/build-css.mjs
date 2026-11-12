/**
 * Writes build/animations.css: css/animations.css with its comments
 * and whitespace removed (about a fifth of the download size). The
 * commented file stays the source; the plugin serves the built copy
 * unless SCRIPT_DEBUG is on. Run by `npm run build`.
 */
import { readFile, writeFile } from 'node:fs/promises';
// eslint-disable-next-line import/no-extraneous-dependencies -- installed with @wordpress/scripts, which uses it for the same job
import postcss from 'postcss';
// eslint-disable-next-line import/no-extraneous-dependencies -- installed with @wordpress/scripts, which uses it for the same job
import cssnano from 'cssnano';

const from = new URL( '../css/animations.css', import.meta.url );
const to = new URL( '../build/animations.css', import.meta.url );

const source = await readFile( from, 'utf8' );
// Comments and whitespace are the saving. The passes that rewrite or
// reorder rules and values are off: the stylesheet relies on its
// source order, and nothing here is worth a subtle cascade change.
const preset = [
	'default',
	{
		mergeRules: false,
		mergeLonghand: false,
		cssDeclarationSorter: false,
		reduceInitial: false,
		convertValues: false,
		minifySelectors: false,
		uniqueSelectors: false,
		calc: false,
		colormin: false,
	},
];
const result = await postcss( [ cssnano( { preset } ) ] ).process( source, {
	from: from.pathname,
	to: to.pathname,
} );
await writeFile( to, result.css + '\n' );
