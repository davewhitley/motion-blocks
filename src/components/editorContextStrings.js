/**
 * Sentences that name what is being edited: a page, a post, a pattern,
 * a template, or a template part.
 *
 * Each is a whole sentence per post type. Inserting a translated noun
 * into "this %s" can't be made grammatical in languages where "this"
 * agrees with the noun (French: cette page, cet article, ce modèle),
 * so translators get every sentence in full (GH #136). Unknown post
 * types use the neutral `fallback`.
 */
import { __, _n, sprintf } from '@wordpress/i18n';

const AUTO_ANIMATE_TITLE = {
	page: __( 'Auto-animate this page', 'motion-blocks' ),
	post: __( 'Auto-animate this post', 'motion-blocks' ),
	wp_block: __( 'Auto-animate this pattern', 'motion-blocks' ),
	wp_template: __( 'Auto-animate this template', 'motion-blocks' ),
	wp_template_part: __( 'Auto-animate this template part', 'motion-blocks' ),
	fallback: __( 'Auto-animate this content', 'motion-blocks' ),
};

// One line under the Auto-animate button, saying what it does.
const AUTO_ANIMATE_HELP = {
	page: __(
		'Animate this whole page at once, in the style you choose.',
		'motion-blocks'
	),
	post: __(
		'Animate this whole post at once, in the style you choose.',
		'motion-blocks'
	),
	wp_block: __(
		'Animate this whole pattern at once, in the style you choose.',
		'motion-blocks'
	),
	wp_template: __(
		'Animate this whole template at once, in the style you choose.',
		'motion-blocks'
	),
	wp_template_part: __(
		'Animate this whole template part at once, in the style you choose.',
		'motion-blocks'
	),
	fallback: __(
		'Animate all of this content at once, in the style you choose.',
		'motion-blocks'
	),
};

const NOTHING_TO_ANIMATE = {
	page: __( 'Nothing to animate on this page.', 'motion-blocks' ),
	post: __( 'Nothing to animate on this post.', 'motion-blocks' ),
	wp_block: __( 'Nothing to animate on this pattern.', 'motion-blocks' ),
	wp_template: __( 'Nothing to animate on this template.', 'motion-blocks' ),
	wp_template_part: __(
		'Nothing to animate on this template part.',
		'motion-blocks'
	),
	fallback: __( 'Nothing to animate on this content.', 'motion-blocks' ),
};

// Auto-animate replaces the animations already there (it redoes the
// whole page, one undo step); this opens the dialog's notice.
const REPLACES_ANIMATIONS = {
	page: __(
		'This replaces the animations already on this page.',
		'motion-blocks'
	),
	post: __(
		'This replaces the animations already on this post.',
		'motion-blocks'
	),
	wp_block: __(
		'This replaces the animations already on this pattern.',
		'motion-blocks'
	),
	wp_template: __(
		'This replaces the animations already on this template.',
		'motion-blocks'
	),
	wp_template_part: __(
		'This replaces the animations already on this template part.',
		'motion-blocks'
	),
	fallback: __(
		'This replaces the animations already on this content.',
		'motion-blocks'
	),
};
const REMOVE_ALL = {
	page: ( count ) =>
		/* translators: %d: number of animated blocks */
		_n(
			'Remove all animations on this page (%d block)? This can be reversed using the Undo button.',
			'Remove all animations on this page (%d blocks)? This can be reversed using the Undo button.',
			count,
			'motion-blocks'
		),
	post: ( count ) =>
		/* translators: %d: number of animated blocks */
		_n(
			'Remove all animations on this post (%d block)? This can be reversed using the Undo button.',
			'Remove all animations on this post (%d blocks)? This can be reversed using the Undo button.',
			count,
			'motion-blocks'
		),
	wp_block: ( count ) =>
		/* translators: %d: number of animated blocks */
		_n(
			'Remove all animations on this pattern (%d block)? This can be reversed using the Undo button.',
			'Remove all animations on this pattern (%d blocks)? This can be reversed using the Undo button.',
			count,
			'motion-blocks'
		),
	wp_template: ( count ) =>
		/* translators: %d: number of animated blocks */
		_n(
			'Remove all animations on this template (%d block)? This can be reversed using the Undo button.',
			'Remove all animations on this template (%d blocks)? This can be reversed using the Undo button.',
			count,
			'motion-blocks'
		),
	wp_template_part: ( count ) =>
		/* translators: %d: number of animated blocks */
		_n(
			'Remove all animations on this template part (%d block)? This can be reversed using the Undo button.',
			'Remove all animations on this template part (%d blocks)? This can be reversed using the Undo button.',
			count,
			'motion-blocks'
		),
	fallback: ( count ) =>
		/* translators: %d: number of animated blocks */
		_n(
			'Remove all animations on this content (%d block)? This can be reversed using the Undo button.',
			'Remove all animations on this content (%d blocks)? This can be reversed using the Undo button.',
			count,
			'motion-blocks'
		),
};

const pick = ( map, postType ) =>
	Object.prototype.hasOwnProperty.call( map, postType )
		? map[ postType ]
		: map.fallback;

/**
 * @param {string} postType Post type being edited.
 * @return {Object} The sentences for that post type.
 */
export function editorContextStrings( postType ) {
	return {
		autoAnimateTitle: pick( AUTO_ANIMATE_TITLE, postType ),
		autoAnimateHelp: pick( AUTO_ANIMATE_HELP, postType ),
		nothingToAnimate: pick( NOTHING_TO_ANIMATE, postType ),
		replacesAnimations: pick( REPLACES_ANIMATIONS, postType ),
		removeAllConfirm: ( count ) =>
			sprintf( pick( REMOVE_ALL, postType )( count ), count ),
	};
}
