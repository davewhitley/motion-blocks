/**
 * Stylelint config for `npm run lint:css` (wp-scripts lint-style).
 *
 * WordPress's rules, with its SCSS variant for css/editor.scss.
 */
module.exports = {
	extends: '@wordpress/stylelint-config',
	overrides: [
		{
			files: [ '**/*.scss' ],
			extends: '@wordpress/stylelint-config/scss',
		},
	],
};
