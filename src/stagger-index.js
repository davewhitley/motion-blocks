/**
 * Motion Blocks — Stagger position per inner block (GH #53)
 *
 * The stepped Stagger delay is pure CSS (animations.css):
 *
 *   animation-delay: calc( var(--mb-delay) +
 *       var(--mb-stagger-index) * var(--mb-stagger-step) );
 *
 * CSS can't yet read an element's position among its siblings as a
 * number (`sibling-index()` isn't in every browser), so this module
 * writes it once, as `--mb-stagger-index`, on each element a stagger
 * parent animates. Shared by the front end (frontend.js init) and the
 * editor preview (withAnimationPreview), so both count the same way.
 *
 * Counting is a 0-based position among element siblings, including
 * ones that aren't blocks (a Gallery caption, the editor's appender).
 * Spacers are skipped and don't use up a position: they're empty, so
 * animating one shows nothing and only puts a pause in the cascade.
 * So is a nested stagger parent, which runs its own cascade and never
 * animates itself (#53). animations.css leaves both out of every
 * stagger rule too. In classic
 * themes a Group's children sit one level down inside
 * `.wp-block-group__inner-container` (GH #66); the wrapper itself
 * isn't animated, and its children count from 0 inside it.
 *
 * A child that isn't shown at the current screen size doesn't use up a
 * position either, or the cascade pauses for a step where it would be.
 * WordPress core's per-block visibility ("Hide on mobile", 7.1) hides
 * one with `display: none` inside a viewport media query on the front
 * end, and with `.is-block-hidden` in the editor (isStaggerHidden). The
 * answer changes with the screen width, so callers count again when
 * the viewport crosses a breakpoint (frontend.js) or a child's classes
 * change (the editor preview).
 *
 * Dependency-free so the front-end bundle stays small.
 */

export const STAGGER_INDEX_VAR = '--mb-stagger-index';

const INNER_CONTAINER_CLASS = 'wp-block-group__inner-container';

/**
 * Whether a stagger parent leaves this child alone: a Spacer, by its
 * front-end class or its editor `data-type`, or a nested stagger
 * parent.
 *
 * @param {Element} el Child element.
 * @return {boolean} True for a Spacer or a nested stagger parent.
 */
export function isStaggerSkipped( el ) {
	return (
		el.classList.contains( 'wp-block-spacer' ) ||
		el.getAttribute( 'data-type' ) === 'core/spacer' ||
		el.classList.contains( 'mb-stagger-parent' )
	);
}

/**
 * Whether a child isn't shown at the current screen size: hidden by
 * core's per-block visibility in the editor (`.is-block-hidden`, which
 * collapses the block but keeps it in the layout), or `display: none`
 * on the front end (core's `.wp-block-hidden-{device}`, or any other
 * rule that hides it).
 *
 * @param {Element} el Child element.
 * @return {boolean} True when the child isn't shown.
 */
export function isStaggerHidden( el ) {
	if ( el.classList.contains( 'is-block-hidden' ) ) {
		return true;
	}
	const view = el.ownerDocument && el.ownerDocument.defaultView;
	return !! view && view.getComputedStyle( el ).display === 'none';
}

/**
 * The elements a stagger parent animates, with their positions.
 *
 * Matches the CSS selector pair used throughout animations.css:
 *   parent > :where(:not(.wp-block-group__inner-container, <skipped>))
 *   parent > :where(.wp-block-group__inner-container) > :where(:not(<skipped>))
 *
 * Hidden children (`isHidden`) are still listed, with `hidden: true`,
 * but don't use up a position: each takes the position of the next
 * shown child, so it falls into place if it shows before the next
 * count.
 *
 * @param {Element}  parent     Stagger parent.
 * @param {Function} [isHidden] `el => boolean`: children that don't use
 *                              up a position (default: isStaggerHidden).
 * @return {Array<{el: Element, index: number, hidden: boolean}>}
 *         Animated children.
 */
export function staggerTargets( parent, isHidden = isStaggerHidden ) {
	const targets = [];
	const add = ( el, index ) => {
		const hidden = isHidden( el );
		targets.push( { el, index, hidden } );
		return hidden ? index : index + 1;
	};
	const children = parent.children;
	let index = 0;
	for ( let i = 0; i < children.length; i++ ) {
		const child = children[ i ];
		if ( child.classList.contains( INNER_CONTAINER_CLASS ) ) {
			const inner = child.children;
			let innerIndex = 0;
			for ( let j = 0; j < inner.length; j++ ) {
				if ( ! isStaggerSkipped( inner[ j ] ) ) {
					innerIndex = add( inner[ j ], innerIndex );
				}
			}
			index++;
		} else if ( ! isStaggerSkipped( child ) ) {
			index = add( child, index );
		}
	}
	return targets;
}

/**
 * Write each animated child's position to `--mb-stagger-index`.
 * Safe to call again after the children change or the viewport
 * crosses a breakpoint; values that are already right are left alone.
 *
 * @param {Element} parent Stagger parent.
 */
export function setStaggerIndices( parent ) {
	staggerTargets( parent ).forEach( ( target ) => {
		const value = String( target.index );
		if ( target.el.style.getPropertyValue( STAGGER_INDEX_VAR ) !== value ) {
			target.el.style.setProperty( STAGGER_INDEX_VAR, value );
		}
	} );
}
