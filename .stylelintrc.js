/**
 * Stylelint config for `npm run lint:css` (wp-scripts lint-style).
 *
 * WordPress's rules, with its SCSS variant for css/editor.scss, minus
 * the rules that fight patterns these stylesheets use on purpose.
 */
module.exports = {
	extends: '@wordpress/stylelint-config',
	rules: {
		// Rules are grouped by effect, not by weight, and the :where()
		// gates keep selectors flat, so source order is deliberate.
		'no-descending-specificity': null,
		// WordPress's own classes are BEM (wp-block-cover__inner-container);
		// wp-scripts' default config turns this off too.
		'selector-class-pattern': null,
		// Scroll-driven animation properties are newer than this stylelint.
		'property-no-unknown': [
			true,
			{
				ignoreProperties: [
					'animation-timeline',
					'animation-range-start',
					'animation-range-end',
				],
			},
		],
		// One-line @keyframes and the Stagger selector tables keep each
		// effect on one line, with columns aligned for scanning.
		'block-opening-brace-newline-after': null,
		'block-opening-brace-space-before': null,
		'block-closing-brace-newline-before': null,
		'block-closing-brace-newline-after': null,
		'declaration-block-semicolon-newline-after': null,
		'selector-combinator-space-before': null,
		'rule-empty-line-before': null,
		'at-rule-empty-line-before': null,
		'max-line-length': null,
		// Long :is( … ) / :where( … ) selector lists are indented inside
		// the parentheses and close on their own line.
		'selector-pseudo-class-parentheses-space-inside': null,
		indentation: [ 'tab', { ignore: [ 'inside-parens' ] } ],
		// A section header is followed straight by the comment on its
		// first rule.
		'comment-empty-line-before': null,
	},
	overrides: [
		{
			files: [ '**/*.scss' ],
			extends: '@wordpress/stylelint-config/scss',
			rules: {
				// @scope is newer than this stylelint.
				'scss/at-rule-no-unknown': [
					true,
					{ ignoreAtRules: [ 'scope' ] },
				],
				// An empty `//` line separates paragraphs of one comment.
				'scss/comment-no-empty': null,
			},
		},
	],
};
