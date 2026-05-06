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
};

/**
 * Style presets — drive the timing of all categories.
 */
export const STYLE_PRESETS = {
	subtle: {
		label: 'Subtle',
		duration: 0.5,
		ctaDuration: 0.3,
	},
	smooth: {
		label: 'Smooth',
		duration: 0.7,
		ctaDuration: 0.4,
	},
	bold: {
		label: 'Bold',
		duration: 1.0,
		ctaDuration: 0.5,
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
 * chosen style preset. Each call returns a fresh object so callers
 * can safely mutate (e.g., to add per-block delay).
 *
 * @param {string} category
 * @param {string} stylePreset One of 'subtle' | 'smooth' | 'bold'.
 * @return {Object|null}
 */
export function attrsForCategory( category, stylePreset = 'smooth' ) {
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
		case 'MEDIA':
			return {
				animationMode: 'scroll-appear',
				animationType: 'slide',
				animationDirection: 'btt',
				animationDuration: style.duration,
				animationDelay: 0,
				animationAcceleration: 'ease',
				animationScrollTrigger: 'enter',
				animationPlayOnce: true,
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
	const skipExisting = [];
	let descendantCount = 0;
	let heroSoFar = 0;

	for ( const block of topLevelBlocks || [] ) {
		// Already animated → idempotent skip (re-running doesn't
		// double up).
		if ( block?.attributes?.animationMode ) {
			skipExisting.push( block );
			// If it's a container, its children are still skipped via
			// "container handles it" semantics (we never animate
			// nested blocks). Add its descendant count.
			descendantCount += countDescendants( block.clientId ) || 0;
			continue;
		}

		const category = classifyBlock( block, heroSoFar );

		if ( category === 'BODY' ) {
			skipBody.push( block );
			continue;
		}
		if ( category === 'CHROME' ) {
			skipChrome.push( block );
			continue;
		}

		if ( category === 'HERO' ) {
			heroSoFar += 1;
		}

		apply.push( { clientId: block.clientId, category, block } );
		// Descendants of this animated container are intentionally
		// not animated (parent animates as a unit). Count them so
		// we can show "12 nested blocks (handled by their containers)".
		descendantCount += countDescendants( block.clientId ) || 0;
	}

	return {
		apply,
		skipBody,
		skipChrome,
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
