/**
 * Motion Blocks — which image "Animate image only" animates.
 *
 * Image-targeted effects (Image Move, Image Zoom, or any effect with
 * "Animate image only") animate the Cover's background image, never an
 * image inside the Cover's content. That image is a direct child of the
 * Cover wrapper, in the editor and on the front end (core's own Cover
 * duotone selector is `> .wp-block-cover__image-background`), so the
 * match is a child path, not a descendant one (2026-10-20 review, #58).
 *
 * Image-optimiser plugins that serve WebP / AVIF can wrap that image in
 * a `<picture>`, which makes it a grandchild, so that path is matched
 * too. Keep css/animations.css in step: every `> img:first-of-type`
 * rule there has a `> picture > img:first-of-type` twin.
 *
 * Shared by the front end, the editor preview, settle and the
 * self-check. Dependency-free.
 */

export const IMG_TARGET_PATHS = [
	'> img:first-of-type',
	'> picture > img:first-of-type',
];

/**
 * Selector list for the target image under `scope`.
 *
 * @param {string} scope Selector for the block wrapper (`:scope` in
 *                       querySelectorAll).
 * @return {string} Comma-separated selector list.
 */
export function imgTargetSelector( scope ) {
	return IMG_TARGET_PATHS.map( ( path ) => scope + ' ' + path ).join( ', ' );
}

/**
 * Selector for the wrapper acting as the target image's clipping frame.
 *
 * @param {string} scope Selector for the block wrapper.
 * @return {string} Selector.
 */
export function imgFrameSelector( scope ) {
	return scope + ':has(' + IMG_TARGET_PATHS.join( ', ' ) + ')';
}

/**
 * The target image elements of a block wrapper.
 *
 * @param {Element} el Block wrapper.
 * @return {Element[]} Images (usually zero or one).
 */
export function imgTargetsOf( el ) {
	return Array.prototype.slice.call(
		el.querySelectorAll( imgTargetSelector( ':scope' ) )
	);
}
