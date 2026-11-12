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

const ALREADY_ANIMATED = {
	page: __(
		'Every block Auto-animate would animate on this page already has an animation. To try another style, undo the last Auto-animate, or use “Remove all animations” and run it again.',
		'motion-blocks'
	),
	post: __(
		'Every block Auto-animate would animate on this post already has an animation. To try another style, undo the last Auto-animate, or use “Remove all animations” and run it again.',
		'motion-blocks'
	),
	wp_block: __(
		'Every block Auto-animate would animate on this pattern already has an animation. To try another style, undo the last Auto-animate, or use “Remove all animations” and run it again.',
		'motion-blocks'
	),
	wp_template: __(
		'Every block Auto-animate would animate on this template already has an animation. To try another style, undo the last Auto-animate, or use “Remove all animations” and run it again.',
		'motion-blocks'
	),
	wp_template_part: __(
		'Every block Auto-animate would animate on this template part already has an animation. To try another style, undo the last Auto-animate, or use “Remove all animations” and run it again.',
		'motion-blocks'
	),
	fallback: __(
		'Every block Auto-animate would animate on this content already has an animation. To try another style, undo the last Auto-animate, or use “Remove all animations” and run it again.',
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
		nothingToAnimate: pick( NOTHING_TO_ANIMATE, postType ),
		alreadyAnimated: pick( ALREADY_ANIMATED, postType ),
		removeAllConfirm: ( count ) =>
			sprintf( pick( REMOVE_ALL, postType )( count ), count ),
	};
}
