/**
 * ESLint config for `npm run lint:js` (wp-scripts lint-js).
 *
 * WordPress's recommended rules, as wp-scripts uses when a project has
 * no config of its own, plus the environment each kind of file runs in.
 */
module.exports = {
	root: true,
	extends: [ 'plugin:@wordpress/eslint-plugin/recommended' ],
	// No Babel config in this project: parse with WordPress's preset.
	parserOptions: {
		requireConfigFile: false,
		babelOptions: {
			presets: [ require.resolve( '@wordpress/babel-preset-default' ) ],
		},
	},
	overrides: [
		{
			// Plain scripts that run on the site's front end.
			files: [ 'src/frontend.js', 'src/self-check.js' ],
			env: { browser: true },
		},
		{
			// Test helpers and the page-check runner run in Node.
			files: [ 'tests/**/*.js', '**/*.mjs' ],
			env: { node: true },
		},
		{
			// Pasted into the browser console in the editor.
			files: [ 'tests/editor/**/*.js' ],
			env: { browser: true },
		},
		{
			files: [ '**/?(*.)test.js' ],
			extends: [ 'plugin:@wordpress/eslint-plugin/test-unit' ],
		},
	],
};
