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
	rules: {
		// Doc comments here explain parameters and return values in
		// prose, wrapped with a short hanging indent, rather than one
		// aligned tag per parameter.
		'jsdoc/require-param': 'off',
		'jsdoc/require-returns-description': 'off',
		'jsdoc/check-line-alignment': 'off',
		// Short chained ternaries are this codebase's way of picking a
		// value (a label, a CSS value); if/else would be longer, not
		// clearer.
		'no-nested-ternary': 'off',
		// The experimental components the panel deliberately uses. Any
		// other __experimental / __unstable API is still an error.
		'@wordpress/no-unsafe-wp-apis': [
			'error',
			{
				'@wordpress/components': [
					'__experimentalConfirmDialog',
					'__experimentalHStack',
					'__experimentalInputControlSuffixWrapper',
					'__experimentalNumberControl',
					'__experimentalToggleGroupControl',
					'__experimentalToggleGroupControlOption',
					'__experimentalToggleGroupControlOptionIcon',
					'__experimentalToolsPanel',
					'__experimentalToolsPanelItem',
					'__experimentalUnitControl',
					'__experimentalVStack',
				],
			},
		],
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
