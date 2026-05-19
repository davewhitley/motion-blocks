/**
 * Auto-animate — pure planning logic.
 *
 * No React, no @wordpress/data store calls. Given a list of top-level
 * blocks and a chosen style preset, returns:
 *
 *   {
 *     apply:         [ { clientId, category } ],       // will be animated
 *     skipBody:      [ Block ],                         // body content
 *     skipChrome:    [ Block ],                         // site chrome
 *     skipExisting:  [ Block ],                         // already animated
 *     descendantCount: number,                          // skipped because parent is animating
 *   }
 *
 * The dispatcher in `index.js` calls this and turns `apply` into a
 * batched `updateBlockAttributes` per category.
 */

/**
 * Block-name → category map. Anything not listed defaults to SECTION
 * (safe default for third-party blocks: scroll-appear fade).
 */
const CATEGORY_BY_BLOCK_NAME = {
	'core/cover': 'HERO',
	'core/heading': 'SECTION',
	'core/post-featured-image': 'HERO',
	'core/image': 'MEDIA',
	'core/gallery': 'MEDIA',
	'core/video': 'MEDIA',
	'core/embed': 'MEDIA',
	'core/group': 'SECTION',
	'core/columns': 'SECTION',
	'core/quote': 'SECTION',
	'core/pullquote': 'SECTION',
	'core/buttons': 'CTA',
	'core/paragraph': 'BODY',
	'core/list': 'BODY',
	'core/code': 'BODY',
	'core/table': 'BODY',
	'core/spacer': 'CHROME',
	'core/separator': 'CHROME',
	'core/site-logo': 'CHROME',
	'core/navigation': 'CHROME',
	// Synced pattern reference — animate the reference, not its inner
	// blocks. Treated as opaque section content.
	'core/block': 'SECTION',
	// Broken-block placeholder for third-party blocks whose plugin is
	// missing. Animating these is pointless (they render as a "this
	// block contains unexpected content" warning, not the actual
	// thing). Skipped from auto-animate.
	'core/missing': 'BROKEN',
};

/**
 * Container blocks the planner treats as transparent wrappers — it
 * descends through them looking for "interesting" leaves (HERO/MEDIA
 * /CTA). The container itself animates only when its subtree has no
 * interesting leaves (e.g. a Group that's just paragraphs becomes a
 * SECTION fade).
 *
 * Conceptually these are layout-only wrappers, not designed units.
 *
 * `core/columns` is deliberately NOT in this set — it's handled by
 * its own STAGGER_ROW branch in `recurse()` (animates the Columns
 * block as one unit with stagger enabled, leveraging the plugin's
 * existing stagger cascade instead of hand-rolling per-child
 * delays). See the special-case in `recurse()`.
 */
const TRANSPARENT_CONTAINERS = new Set( [
	'core/group',
	'core/column',
] );

/**
 * Container blocks the planner treats as opaque — animate them as
 * a single unit, never descend. These represent semantic groupings
 * the user designed as one thing: a hero scene (Cover), a button
 * row (Buttons), a gallery grid (Gallery).
 */
const OPAQUE_CONTAINERS = new Set( [
	'core/cover',
	'core/buttons',
	'core/gallery',
] );

/**
 * Walk a block's subtree and return true if any descendant (or the
 * block itself, if it's a non-container leaf) is in HERO / MEDIA /
 * CTA. Used by `computeAutoAnimatePlan` to decide whether a
 * transparent container should be descended into (interesting child
 * exists) or animated as a whole SECTION (text-only group).
 *
 * Opaque containers count as their own category — they don't expose
 * their inner content for recursion.
 *
 * @param {Object} block
 * @return {boolean}
 */
function subtreeHasInterestingLeaf( block ) {
	if ( ! block ) {
		return false;
	}
	const name = block.name;
	if ( OPAQUE_CONTAINERS.has( name ) ) {
		const cat = classifyBlock( block );
		return cat === 'HERO' || cat === 'MEDIA' || cat === 'CTA';
	}
	// Transparent containers + `core/columns` (which is its own
	// special category but still has children worth inspecting):
	// recurse to find any interesting descendant.
	if ( TRANSPARENT_CONTAINERS.has( name ) || name === 'core/columns' ) {
		return ( block.innerBlocks || [] ).some( subtreeHasInterestingLeaf );
	}
	// Leaf block — classify it directly.
	const cat = classifyBlock( block );
	return cat === 'HERO' || cat === 'MEDIA' || cat === 'CTA';
}

/**
 * Style presets — drive the timing of all categories.
 *
 * `sequenceStep` is the stagger step (in seconds) written into
 * `animationStaggerStep` on every Columns block we animate. The
 * plugin's own stagger CSS cascade then produces the per-column
 * delay via `:nth-child()`. So picking a preset effectively picks
 * the cascade speed too — column 0 starts at 0s, column 1 at
 * `1 × step`, column 2 at `2 × step`, etc.
 *
 * Set `sequenceStep: 0` on a preset to disable column cascade.
 * (The block still gets `animationStaggerEnabled: true` and an
 * effective 0-step, so all columns animate simultaneously.)
 */
export const STYLE_PRESETS = {
	subtle: {
		label: 'Subtle',
		duration: 0.5,
		ctaDuration: 0.3,
		sequenceStep: 0.06,
	},
	smooth: {
		label: 'Smooth',
		duration: 0.7,
		ctaDuration: 0.4,
		sequenceStep: 0.08,
	},
	bold: {
		label: 'Bold',
		duration: 1.0,
		ctaDuration: 0.5,
		sequenceStep: 0.12,
	},
};

/**
 * Pick a category for a block. Returns one of:
 *   'HERO' | 'MEDIA' | 'SECTION' | 'CTA' | 'BODY' | 'CHROME'
 *
 * `getMappedCategory` lookup with one tweak: a HERO-eligible block
 * past the first 2 occurrences gets demoted so we don't have a
 * page full of page-load animations.
 *
 * @param {Object} block
 * @param {number} heroSoFar  How many HERO blocks have already been counted on this page.
 * @return {string}
 */
export function classifyBlock( block, heroSoFar = 0 ) {
	const name = block?.name;
	const mapped = CATEGORY_BY_BLOCK_NAME[ name ];
	// Unknown block type → safe default: SECTION (scroll-appear fade).
	const base = mapped || 'SECTION';
	if ( base === 'HERO' && heroSoFar >= 2 ) {
		// Demote: a third Cover or Featured Image just becomes MEDIA.
		return 'MEDIA';
	}
	return base;
}

/**
 * Get the attribute payload for a category, parameterized by the
 * chosen style preset and (optionally) the block itself. Each call
 * returns a fresh object so callers can safely mutate (e.g., to add
 * per-block delay for sibling sequencing).
 *
 * The `block` arg lets categories infer per-block details from the
 * block's own attributes — currently used by MEDIA to pick the slide
 * direction from `block.attributes.align` (left/right). Other
 * categories ignore it for now.
 *
 * @param {string} category
 * @param {string} stylePreset One of 'subtle' | 'smooth' | 'bold'.
 * @param {Object} [block]     Optional Gutenberg block object.
 * @return {Object|null}
 */
export function attrsForCategory( category, stylePreset = 'smooth', block = null ) {
	const style = STYLE_PRESETS[ stylePreset ] || STYLE_PRESETS.smooth;
	switch ( category ) {
		case 'HERO':
			return {
				animationMode: 'page-load',
				animationType: 'fade',
				animationDuration: style.duration,
				animationDelay: 0,
				animationAcceleration: 'ease',
				animationRepeat: 'once',
				animationPauseOffscreen: true,
			};
		case 'MEDIA': {
			// Direction-from-align: images placed with the toolbar's
			// "Align left" / "Align right" affordance get a horizontal
			// slide that matches their layout anchor — feels intentional
			// instead of every image rising from the bottom. Wide /
			// full / center / unset fall back to the original `btt`
			// default.
			const align = block?.attributes?.align;
			const direction =
				align === 'left'
					? 'ltr'
					: align === 'right'
					? 'rtl'
					: 'btt';
			return {
				animationMode: 'scroll-appear',
				animationType: 'slide',
				animationDirection: direction,
				animationDuration: style.duration,
				animationDelay: 0,
				animationAcceleration: 'ease',
				animationScrollTrigger: 'enter',
				animationPlayOnce: true,
			};
		}
		case 'STAGGER_ROW':
			// Columns block animates as one unit with the plugin's
			// stagger feature enabled — each child column cascades
			// in via the CSS `:nth-child()` rules in animations.css.
			// `animationStaggerStep` is in seconds (post-cedf2ed unit
			// change); preset.sequenceStep is already in seconds.
			return {
				animationMode: 'scroll-appear',
				animationType: 'slide',
				animationDirection: 'btt',
				animationDuration: style.duration,
				animationDelay: 0,
				animationAcceleration: 'ease',
				animationScrollTrigger: 'enter',
				animationPlayOnce: true,
				animationStaggerEnabled: true,
				animationStaggerStep: style.sequenceStep,
			};
		case 'SECTION':
			return {
				animationMode: 'scroll-appear',
				animationType: 'fade',
				animationDuration: style.duration,
				animationDelay: 0,
				animationAcceleration: 'ease',
				animationScrollTrigger: 'enter',
				animationPlayOnce: true,
			};
		case 'CTA':
			return {
				animationMode: 'scroll-appear',
				animationType: 'scale',
				animationDirection: 'none',
				animationDuration: style.ctaDuration,
				animationDelay: 0,
				animationAcceleration: 'ease',
				animationScrollTrigger: 'enter',
				animationPlayOnce: true,
			};
		default:
			return null;
	}
}

/**
 * Walk top-level blocks and decide what to animate. Body / chrome
 * blocks and already-animated blocks are skipped. We don't recurse
 * into containers — Group/Columns/Cover animate as a unit; their
 * descendants come along for the ride.
 *
 * @param {Array} topLevelBlocks `getBlocks()` (top level only).
 * @param {Function} countDescendants Function `(clientId) → number` —
 *   passed in by the caller because pure logic shouldn't read the
 *   store. Used only to compute `descendantCount` for the diff
 *   modal's "skipped (handled by container)" line.
 * @return {Object}
 */
export function computeAutoAnimatePlan( topLevelBlocks, countDescendants ) {
	const apply = [];
	const skipBody = [];
	const skipChrome = [];
	const skipBroken = [];
	const skipExisting = [];
	let descendantCount = 0;
	// `heroSoFar` lives outside the recursion so the count threads
	// through the whole walk — a third HERO anywhere on the page
	// (top-level OR nested inside a container we descended into)
	// still gets cap-demoted by `classifyBlock`.
	let heroSoFar = 0;

	/**
	 * Walk a block and apply the auto-animate decision rules.
	 *  - Skip subtree if the block already has an animation set.
	 *  - `core/columns`: animate the Columns block as a single
	 *    STAGGER_ROW unit if its subtree has any interesting leaf.
	 *    The plugin's existing stagger feature handles the
	 *    column-by-column cascade via CSS; no per-child delay
	 *    plumbing needed. Empty / text-only Columns fall through
	 *    to SECTION.
	 *  - Other opaque containers (Cover, Buttons, Gallery): animate
	 *    as their category; inner blocks ride along.
	 *  - Transparent containers (Group, Column):
	 *      • If their subtree has any HERO/MEDIA/CTA leaf, descend
	 *        without animating the container itself.
	 *      • Otherwise animate the container as SECTION.
	 *  - Leaf blocks: classify by their category and either skip
	 *    (BODY/CHROME/BROKEN) or animate.
	 */
	function recurse( block ) {
		if ( ! block ) {
			return;
		}

		// Already animated → idempotent skip. The whole subtree is
		// owned by that animation; don't recurse below it.
		if ( block.attributes?.animationMode ) {
			skipExisting.push( block );
			descendantCount += countDescendants( block.clientId ) || 0;
			return;
		}

		const name = block.name;

		// core/columns — special case. The plugin's stagger feature
		// already produces a cascade across direct children when
		// enabled, so we animate the Columns block as a unit with
		// stagger turned on rather than recursing and hand-rolling
		// per-child delays. The output matches what a user would
		// create by selecting the Columns block manually and
		// flipping the Stagger toggle — round-trippable and
		// editable from the same UI later.
		if ( name === 'core/columns' ) {
			if ( subtreeHasInterestingLeaf( block ) ) {
				apply.push( {
					clientId: block.clientId,
					category: 'STAGGER_ROW',
					block,
				} );
			} else {
				// Text-only / empty Columns: fade in as one section.
				apply.push( {
					clientId: block.clientId,
					category: 'SECTION',
					block,
				} );
			}
			descendantCount += countDescendants( block.clientId ) || 0;
			return;
		}

		// Opaque container: animate as one unit.
		if ( OPAQUE_CONTAINERS.has( name ) ) {
			const category = classifyBlock( block, heroSoFar );
			if ( category === 'BODY' ) {
				skipBody.push( block );
				return;
			}
			if ( category === 'CHROME' ) {
				skipChrome.push( block );
				return;
			}
			if ( category === 'BROKEN' ) {
				skipBroken.push( block );
				return;
			}
			if ( category === 'HERO' ) {
				heroSoFar += 1;
			}
			apply.push( {
				clientId: block.clientId,
				category,
				block,
			} );
			// Subtree rides along with the container's animation.
			descendantCount += countDescendants( block.clientId ) || 0;
			return;
		}

		// Transparent container: descend if it has any interesting
		// leaf in its subtree; otherwise animate it as SECTION.
		if ( TRANSPARENT_CONTAINERS.has( name ) ) {
			if ( subtreeHasInterestingLeaf( block ) ) {
				for ( const child of block.innerBlocks || [] ) {
					recurse( child );
				}
				return;
			}
			// Text-only Group / empty Column → animate as SECTION.
			apply.push( {
				clientId: block.clientId,
				category: 'SECTION',
				block,
			} );
			descendantCount += countDescendants( block.clientId ) || 0;
			return;
		}

		// Leaf block — classify and route.
		const category = classifyBlock( block, heroSoFar );
		if ( category === 'BODY' ) {
			skipBody.push( block );
			return;
		}
		if ( category === 'CHROME' ) {
			skipChrome.push( block );
			return;
		}
		if ( category === 'BROKEN' ) {
			skipBroken.push( block );
			return;
		}
		if ( category === 'HERO' ) {
			heroSoFar += 1;
		}
		apply.push( {
			clientId: block.clientId,
			category,
			block,
		} );
	}

	for ( const block of topLevelBlocks || [] ) {
		recurse( block );
	}

	return {
		apply,
		skipBody,
		skipChrome,
		skipBroken,
		skipExisting,
		descendantCount,
	};
}

/**
 * Group `apply` items by category for the per-category batched
 * dispatch. Returns a Map preserving insertion order.
 *
 * @param {Array} applyItems
 * @return {Map<string, Array>}
 */
export function groupApplyByCategory( applyItems ) {
	const grouped = new Map();
	for ( const item of applyItems ) {
		if ( ! grouped.has( item.category ) ) {
			grouped.set( item.category, [] );
		}
		grouped.get( item.category ).push( item );
	}
	return grouped;
}

/**
 * Block-name → human label lookup for the diff modal. Falls back to
 * the raw block name if the type isn't registered (unlikely for
 * core blocks).
 *
 * @param {Array} items Array of `{ block }` items.
 * @param {Function} getBlockTypeTitle Function `(name) → string|undefined`.
 * @return {Array<{ name: string, count: number }>} Sorted descending by count.
 */
export function summarizeByBlockType( items, getBlockTypeTitle ) {
	const counts = {};
	for ( const item of items ) {
		const name = item?.block?.name || item?.name;
		if ( ! name ) {
			continue;
		}
		const label = getBlockTypeTitle( name ) || name;
		counts[ label ] = ( counts[ label ] || 0 ) + 1;
	}
	return Object.entries( counts )
		.map( ( [ name, count ] ) => ( { name, count } ) )
		.sort( ( a, b ) => b.count - a.count );
}
