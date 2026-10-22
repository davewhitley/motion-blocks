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
 * Once `sibling-index()` is widely supported, this file can go.
 *
 * Counting mirrors `:nth-child()` exactly, which is what the delay
 * rules used before: a 0-based position among element siblings,
 * including ones that aren't blocks (a Gallery caption, the editor's
 * appender). In classic themes a Group's children sit one level down
 * inside `.wp-block-group__inner-container` (GH #66); the wrapper
 * itself isn't animated, and its children count from 0 inside it.
 *
 * Dependency-free so the front-end bundle stays small.
 */

export const STAGGER_INDEX_VAR = '--mb-stagger-index';

const INNER_CONTAINER_CLASS = 'wp-block-group__inner-container';

/**
 * The elements a stagger parent animates, with their positions.
 *
 * Matches the CSS selector pair used throughout animations.css:
 *   parent > :where(:not(.wp-block-group__inner-container))
 *   parent > :where(.wp-block-group__inner-container) > *
 *
 * @param {Element} parent Stagger parent.
 * @return {Array<{el: Element, index: number}>} Animated children.
 */
export function staggerTargets( parent ) {
	const targets = [];
	const children = parent.children;
	for ( let i = 0; i < children.length; i++ ) {
		const child = children[ i ];
		if ( child.classList.contains( INNER_CONTAINER_CLASS ) ) {
			const inner = child.children;
			for ( let j = 0; j < inner.length; j++ ) {
				targets.push( { el: inner[ j ], index: j } );
			}
		} else {
			targets.push( { el: child, index: i } );
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
