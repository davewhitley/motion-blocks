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
 * animations.css leaves them out of every stagger rule too. In classic
 * themes a Group's children sit one level down inside
 * `.wp-block-group__inner-container` (GH #66); the wrapper itself
 * isn't animated, and its children count from 0 inside it.
 *
 * Dependency-free so the front-end bundle stays small.
 */

export const STAGGER_INDEX_VAR = '--mb-stagger-index';

const INNER_CONTAINER_CLASS = 'wp-block-group__inner-container';

/**
 * Whether a stagger parent leaves this child alone: a Spacer, by its
 * front-end class or its editor `data-type`.
 *
 * @param {Element} el Child element.
 * @return {boolean} True for a Spacer.
 */
export function isStaggerSkipped( el ) {
	return (
		el.classList.contains( 'wp-block-spacer' ) ||
		el.getAttribute( 'data-type' ) === 'core/spacer'
	);
}

/**
 * The elements a stagger parent animates, with their positions.
 *
 * Matches the CSS selector pair used throughout animations.css:
 *   parent > :where(:not(.wp-block-group__inner-container, <spacer>))
 *   parent > :where(.wp-block-group__inner-container) > :where(:not(<spacer>))
 *
 * @param {Element} parent Stagger parent.
 * @return {Array<{el: Element, index: number}>} Animated children.
 */
export function staggerTargets( parent ) {
	const targets = [];
	const children = parent.children;
	let index = 0;
	for ( let i = 0; i < children.length; i++ ) {
		const child = children[ i ];
		if ( child.classList.contains( INNER_CONTAINER_CLASS ) ) {
			const inner = child.children;
			let innerIndex = 0;
			for ( let j = 0; j < inner.length; j++ ) {
				if ( ! isStaggerSkipped( inner[ j ] ) ) {
					targets.push( { el: inner[ j ], index: innerIndex++ } );
				}
			}
			index++;
		} else if ( ! isStaggerSkipped( child ) ) {
			targets.push( { el: child, index: index++ } );
		}
	}
	return targets;
}

/**
 * Write each animated child's position to `--mb-stagger-index`.
 * Safe to call again after the children change; values that are
 * already right are left alone.
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
