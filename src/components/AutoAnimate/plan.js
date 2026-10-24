/**
 * Auto-animate — pure planning logic.
 *
 * No React, no @wordpress/data store calls. Given the top-level blocks,
 * it decides what moves, how, and *when*, so the page reads as one
 * choreographed piece rather than a set of unrelated effects:
 *
 *   - **One motion language.** Everything "rises" into place: a short
 *     upward move with a fade, on one expo-out curve. Distance,
 *     duration and the beat between items come from the style preset.
 *     Media and the hero background get role-specific variants of the
 *     same language (a settle, a side entrance, a slow zoom-out).
 *   - **An opening sequence.** Blocks on the first screen play on page
 *     load, one after another in reading order, instead of waiting for
 *     a scroll.
 *   - **Sections cascade.** A section's heading, text and buttons come
 *     in one after another (the plugin's Stagger cascade), and so do
 *     columns, gallery images and buttons in a row.
 *   - **Restraint.** Long runs of body text, site chrome and anything
 *     already animated stay as they are.
 *
 * Returns
 *
 *   {
 *     apply:         [ { clientId, block, role, trigger, delay, step } ],
 *     skipBody:      [ Block ],
 *     skipChrome:    [ Block ],
 *     skipBroken:    [ Block ],
 *     skipExisting:  [ Block ],
 *     descendantCount: number,
 *   }
 *
 * The modal turns `apply` into per-block payloads with
 * `buildAutoAnimateUpdates` and dispatches them in one
 * `updateBlockAttributes` action, so the whole apply is one undo step.
 */
import {
	isImageTargetUnavailable,
	canAnimateBlock,
	clearAnimationAttributes,
} from '../constants';

/**
 * Block-name → category. Anything not listed is SECTION (a single unit
 * that rises into place), the safe default for third-party blocks.
 */
const CATEGORY_BY_BLOCK_NAME = {
	'core/cover': 'HERO',
	'core/heading': 'SECTION',
	'core/post-featured-image': 'MEDIA',
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
	// Synced pattern reference — animate the reference as one unit.
	'core/block': 'SECTION',
	// Broken-block placeholder for a missing plugin: skipped.
	'core/missing': 'BROKEN',
	// The Classic block is body content, and it can't keep animation
	// settings anyway (no block comment to save them in).
	'core/freeform': 'BODY',
	// No wrapper element of their own (see NON_ANIMATABLE_BLOCKS).
	'core/html': 'BODY',
	'core/shortcode': 'BODY',
};

/**
 * Blocks whose direct children cascade in one after another (the
 * plugin's Stagger feature, which these blocks support).
 */
const CASCADE_CONTAINERS = new Set( [
	'core/columns',
	'core/gallery',
	'core/buttons',
] );

/**
 * Children that are designed units of their own. A Group holding one
 * of these is a page wrapper, not a section, so the planner descends
 * into it instead of cascading it (a cascade would move the unit as
 * one item and lose its own choreography).
 */
const COMPOSITE_BLOCKS = new Set( [
	'core/group',
	'core/columns',
	'core/gallery',
	'core/cover',
	'core/media-text',
	'core/query',
] );

/** A Group with more children than this reads as an article, not a section. */
const MAX_SECTION_CHILDREN = 12;

/** One curve for everything: fast start, long soft landing (expo-out). */
export const MOTION_EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';

/**
 * Style presets. Each is one consistent motion language:
 *
 *   duration     seconds for a single rise
 *   distance     px a block travels as it rises (or slides in)
 *   settleScale  starting scale for images (they settle down to 1)
 *   beat         seconds between items in a cascade
 *   spread       longest a cascade may take to start its last item;
 *                a long list compresses its beat to fit
 *   openingBeat  seconds between items of the first-screen sequence
 *   heroZoom     starting scale of the hero background's zoom-out
 *
 * `ctaDuration` and `sequenceStep` are kept for older callers.
 */
export const STYLE_PRESETS = {
	subtle: {
		label: 'Subtle',
		duration: 0.6,
		ctaDuration: 0.5,
		distance: 12,
		settleScale: 1.02,
		beat: 0.06,
		sequenceStep: 0.06,
		spread: 0.5,
		openingBeat: 0.1,
		heroZoom: 1.04,
	},
	smooth: {
		label: 'Smooth',
		duration: 0.8,
		ctaDuration: 0.6,
		distance: 24,
		settleScale: 1.04,
		beat: 0.09,
		sequenceStep: 0.09,
		spread: 0.7,
		openingBeat: 0.14,
		heroZoom: 1.08,
	},
	bold: {
		label: 'Bold',
		duration: 1.0,
		ctaDuration: 0.7,
		distance: 40,
		settleScale: 1.08,
		beat: 0.12,
		sequenceStep: 0.12,
		spread: 0.9,
		openingBeat: 0.18,
		heroZoom: 1.12,
	},
};

/** The opening sequence starts this long after load, and ends by `MAX_OPENING_DELAY`. */
const OPENING_START = 0.1;
const MAX_OPENING_DELAY = 1.2;

/**
 * Pick a category for a block: 'HERO' | 'MEDIA' | 'SECTION' | 'CTA' |
 * 'BODY' | 'CHROME' | 'BROKEN'.
 *
 * @param {Object} block Block object.
 * @return {string} Category.
 */
export function classifyBlock( block ) {
	return CATEGORY_BY_BLOCK_NAME[ block?.name ] || 'SECTION';
}

/**
 * Round to 2 decimals (the panel's Duration / Delay precision), so the
 * planner never writes 0.30000000000000004.
 *
 * @param {number} n Seconds.
 * @return {number} Rounded seconds.
 */
function round2( n ) {
	return Math.round( n * 100 ) / 100;
}

/**
 * Beat for a cascade of `count` items: the preset's beat, compressed so
 * the last item starts within the preset's spread.
 *
 * @param {number} count Items in the cascade.
 * @param {Object} style Preset.
 * @return {number} Seconds between items.
 */
export function cascadeStep( count, style ) {
	if ( count <= 1 ) {
		return style.beat;
	}
	// Never below 10ms, or a very long gallery would play all at once.
	return Math.max(
		0.01,
		round2( Math.min( style.beat, style.spread / ( count - 1 ) ) )
	);
}

/**
 * The From / To values of each role, as Custom properties
 * ({ opacity, translateX, translateY, scale }).
 *
 * @param {string} role  'rise' | 'cascade' | 'media' | 'heroImage'.
 * @param {Object} style Preset.
 * @param {Object} [block] Block, for media alignment.
 * @return {{from: Object, to: Object}} Sides.
 */
export function motionFor( role, style, block = null ) {
	const d = style.distance;
	if ( role === 'heroImage' ) {
		// The background fades in as it settles from a slight zoom,
		// while the content rises over it. (It can't simply stay
		// visible: the plugin hides an image-only Cover's image, or a
		// Page Load block, until its animation starts.)
		return {
			from: { opacity: 0, scale: style.heroZoom },
			to: { opacity: 1, scale: 1 },
		};
	}
	if ( role === 'media' ) {
		const align = block?.attributes?.align;
		if ( align === 'left' || align === 'right' ) {
			// Enter from the side the image is anchored to.
			return {
				from: {
					opacity: 0,
					translateX: `${ align === 'left' ? -d : d }px`,
				},
				to: { opacity: 1, translateX: '0px' },
			};
		}
		return {
			from: {
				opacity: 0,
				translateY: `${ d }px`,
				scale: style.settleScale,
			},
			to: { opacity: 1, translateY: '0px', scale: 1 },
		};
	}
	// 'rise' and 'cascade' (each child of a cascade rises).
	return {
		from: { opacity: 0, translateY: `${ d }px` },
		to: { opacity: 1, translateY: '0px' },
	};
}

const PROP_KEYS = {
	opacity: 'Opacity',
	translateX: 'TranslateX',
	translateY: 'TranslateY',
	scale: 'Scale',
};

/**
 * Write a role's sides as Custom From / To attributes.
 *
 * @param {string} prefix 'animation' (shared) or 'animationEntry'.
 * @param {Object} sides  From motionFor().
 * @return {Object} Attributes.
 */
function customAttrs( prefix, sides ) {
	const out = {};
	for ( const [ id, key ] of Object.entries( PROP_KEYS ) ) {
		out[ `${ prefix }From${ key }` ] =
			id in sides.from ? sides.from[ id ] : null;
		out[ `${ prefix }To${ key }` ] = id in sides.to ? sides.to[ id ] : null;
	}
	return out;
}

/**
 * The attribute payload for one planned item.
 *
 * @param {Object} item        Plan item ({ role, trigger, delay, step, block }).
 * @param {string} stylePreset Key of STYLE_PRESETS.
 * @return {Object|null} Attributes, or null for an unknown role.
 */
export function attrsForItem( item, stylePreset = 'smooth' ) {
	const style = STYLE_PRESETS[ stylePreset ] || STYLE_PRESETS.smooth;
	const { role, block } = item;
	if ( ! [ 'rise', 'cascade', 'media', 'heroImage' ].includes( role ) ) {
		return null;
	}
	const sides = motionFor( role, style, block );
	const duration = round2(
		role === 'heroImage' ? style.duration * 2 : style.duration
	);
	const delay = round2( item.delay || 0 );
	const extra = {};
	if ( role === 'heroImage' ) {
		extra.animationFromToTarget = 'img';
	}
	if ( role === 'cascade' ) {
		extra.animationStaggerEnabled = true;
		extra.animationStaggerStep = item.step ?? style.beat;
	}

	// Start from a cleared block, so settings left over from an earlier
	// animation (Stagger, image-only, other Custom properties) can't
	// leak into this one.
	const base = clearAnimationAttributes();
	if ( item.trigger === 'load' ) {
		return {
			...base,
			animationMode: 'page-load',
			animationType: 'custom',
			animationDirection: '',
			animationDuration: duration,
			animationDelay: delay,
			animationAcceleration: 'custom',
			animationCustomTimingFunction: MOTION_EASE,
			animationRepeat: 'once',
			...customAttrs( 'animation', sides ),
			...extra,
		};
	}
	return {
		...base,
		animationMode: 'scroll-appear',
		animationEntryType: 'custom',
		animationEntryDirection: '',
		animationEntryDuration: duration,
		animationEntryDelay: delay,
		animationEntryAcceleration: 'custom',
		animationEntryCustomTimingFunction: MOTION_EASE,
		animationEntryReplay: 'once',
		animationExitType: '',
		...customAttrs( 'animationEntry', sides ),
		...extra,
	};
}

/**
 * Older callers' API: the payload for a category, as a block below the
 * first screen with no delay. HERO maps to the hero background zoom,
 * STAGGER_ROW / CTA to a cascade, MEDIA to an image entrance and
 * SECTION to a rise.
 *
 * @param {string} category    Category.
 * @param {string} stylePreset Key of STYLE_PRESETS.
 * @param {Object} [block]     Block (for media alignment).
 * @return {Object|null} Attributes.
 */
export function attrsForCategory(
	category,
	stylePreset = 'smooth',
	block = null
) {
	const role = {
		HERO: 'heroImage',
		MEDIA: 'media',
		STAGGER_ROW: 'cascade',
		CTA: 'cascade',
		SECTION: 'rise',
	}[ category ];
	if ( ! role ) {
		return null;
	}
	return attrsForItem(
		{ role, block, trigger: 'scroll', delay: 0 },
		stylePreset
	);
}

/**
 * Turn the plan's `apply` list into the arguments for a single
 * `updateBlockAttributes( clientIds, attributesByClientId, true )`
 * call, so the whole apply is one undo step.
 *
 * @param {Array}  apply       `computeAutoAnimatePlan().apply`.
 * @param {string} stylePreset Key of STYLE_PRESETS.
 * @return {{clientIds: string[], attributesByClientId: Object}} Payloads.
 */
export function buildAutoAnimateUpdates( apply, stylePreset ) {
	const style = STYLE_PRESETS[ stylePreset ] || STYLE_PRESETS.smooth;
	const clientIds = [];
	const attributesByClientId = {};
	for ( const item of apply ) {
		// Timing that depends on the preset is resolved here, so the
		// plan itself doesn't need recomputing when the style changes.
		const resolved = { ...item };
		if ( item.trigger === 'load' && item.role === 'heroImage' ) {
			// The hero background starts the sequence.
			resolved.delay = 0;
		} else if ( item.trigger === 'load' ) {
			resolved.delay = Math.min(
				OPENING_START + item.openingIndex * style.openingBeat,
				MAX_OPENING_DELAY
			);
		} else {
			resolved.delay = ( item.sequenceIndex || 0 ) * style.beat * 1.5;
		}
		if ( item.role === 'cascade' ) {
			resolved.step = cascadeStep( item.count || 1, style );
		}
		const attrs = attrsForItem( resolved, stylePreset );
		if ( ! attrs ) {
			continue;
		}
		clientIds.push( item.clientId );
		attributesByClientId[ item.clientId ] = attrs;
	}
	return { clientIds, attributesByClientId };
}

/**
 * Direct children of a block that take part in a cascade or sequence
 * (everything but site chrome such as spacers).
 *
 * @param {Object} block Block.
 * @return {Object[]} Children.
 */
function meaningfulChildren( block ) {
	return ( block.innerBlocks || [] ).filter(
		( child ) => ! [ 'CHROME', 'BROKEN' ].includes( classifyBlock( child ) )
	);
}

/**
 * Is this Group a designed section (heading, text, buttons…) that
 * should cascade, rather than a page wrapper or a long article?
 *
 * @param {Object} block A core/group block.
 * @return {boolean} True to cascade it.
 */
/**
 * Does any direct child already carry an animation? A cascade would
 * take over that child's animation (the parent's Stagger rules win),
 * so such a block is walked into instead, leaving the child alone.
 *
 * @param {Object} block Block.
 * @return {boolean} True when a child is animated.
 */
function hasAnimatedChild( block ) {
	return ( block.innerBlocks || [] ).some(
		( child ) => !! child.attributes?.animationMode
	);
}

function isSection( block ) {
	const children = meaningfulChildren( block );
	if (
		children.length < 2 ||
		children.length > MAX_SECTION_CHILDREN ||
		hasAnimatedChild( block )
	) {
		return false;
	}
	return ! children.some(
		( child ) =>
			COMPOSITE_BLOCKS.has( child.name ) &&
			( child.innerBlocks || [] ).length > 1
	);
}

/**
 * Walk the blocks and decide what to animate, how, and in what order.
 *
 * @param {Array}    topLevelBlocks   `getBlocks()` (top level only).
 * @param {Function} countDescendants `(clientId) → number`, for the
 *   modal's "nested blocks" line (passed in: pure logic doesn't read
 *   the store).
 * @param {Object}   [options]
 * @param {Function} [options.isOnFirstScreen] `(clientId) → boolean|null`:
 *   whether the block starts on the first screen. The modal measures it
 *   in the editor canvas; `null` (or no function) means unknown, and
 *   the first top-level block is then taken as the first screen.
 * @return {Object} Plan.
 */
export function computeAutoAnimatePlan(
	topLevelBlocks,
	countDescendants,
	options = {}
) {
	const apply = [];
	const skipBody = [];
	const skipChrome = [];
	const skipBroken = [];
	const skipExisting = [];
	let descendantCount = 0;
	let openingIndex = 0;

	const measure = options.isOnFirstScreen;
	// Without a measurement, only a leading Cover counts as the first
	// screen: guessing more could play a whole page (one wrapper Group)
	// on load.
	const firstBlock = ( topLevelBlocks || [] )[ 0 ];
	const firstTop =
		firstBlock?.name === 'core/cover' ? firstBlock.clientId : null;
	let topLevelId = null;
	const onFirstScreen = ( block ) => {
		const measured = measure ? measure( block.clientId ) : null;
		if ( measured === true || measured === false ) {
			return measured;
		}
		return topLevelId === firstTop;
	};

	const count = ( block ) => countDescendants( block.clientId ) || 0;

	/**
	 * Queue one item. On the first screen it joins the opening sequence
	 * (page load, next slot in reading order); below it, it waits for
	 * the scroll, offset by `sequenceIndex` within its group (a Cover's
	 * content).
	 */
	function push( block, role, extra = {} ) {
		const first = onFirstScreen( block );
		const item = {
			clientId: block.clientId,
			block,
			role,
			trigger: first ? 'load' : 'scroll',
			...extra,
		};
		if ( first ) {
			item.openingIndex = openingIndex;
			// The hero background starts with the sequence, without
			// taking a slot: the content rises over it.
			if ( role !== 'heroImage' ) {
				openingIndex += 1;
			}
		}
		apply.push( item );
	}

	function skipLeaf( block, category ) {
		if ( category === 'BODY' ) {
			skipBody.push( block );
			return true;
		}
		if ( category === 'CHROME' ) {
			skipChrome.push( block );
			return true;
		}
		if ( category === 'BROKEN' ) {
			skipBroken.push( block );
			return true;
		}
		return false;
	}

	function recurse( block, sequence = null ) {
		if ( ! block ) {
			return;
		}
		// Already animated: that animation owns the subtree.
		if ( block.attributes?.animationMode ) {
			skipExisting.push( block );
			descendantCount += count( block );
			return;
		}
		const name = block.name;
		// Blocks that can't keep animation settings (Classic, Custom
		// HTML, Shortcode): the front end would ignore them, leaving a
		// gap in a sequence.
		if ( ! canAnimateBlock( name ) ) {
			skipBody.push( block );
			return;
		}
		const category = classifyBlock( block );
		// A slot in the enclosing sequence (a Cover's content), taken
		// only when something is actually queued, so skipped blocks
		// leave no gap in the timing.
		const seq = () =>
			sequence ? { sequenceIndex: sequence.next() } : {};

		// Cover: the background settles from a slight zoom while its
		// content rises over it, one block after another.
		if ( name === 'core/cover' ) {
			if (
				( block.attributes?.url ||
					block.attributes?.useFeaturedImage ) &&
				! isImageTargetUnavailable( name, block.attributes ) &&
				( ! block.attributes.backgroundType ||
					block.attributes.backgroundType === 'image' )
			) {
				push( block, 'heroImage', seq() );
			}
			let i = 0;
			const inner = { next: () => i++ };
			for ( const child of block.innerBlocks || [] ) {
				recurse( child, inner );
			}
			return;
		}

		// Rows: columns, gallery images and buttons cascade in.
		if ( CASCADE_CONTAINERS.has( name ) ) {
			const children = meaningfulChildren( block );
			if ( hasAnimatedChild( block ) ) {
				// Walk in: animate the rest one by one.
				for ( const child of block.innerBlocks || [] ) {
					recurse( child, sequence );
				}
				return;
			}
			if ( children.length >= 2 ) {
				push( block, 'cascade', { ...seq(), count: children.length } );
			} else {
				push(
					block,
					name === 'core/gallery' ? 'media' : 'rise',
					seq()
				);
			}
			descendantCount += count( block );
			return;
		}

		// Groups: a designed section cascades its heading, text and
		// buttons; a wrapper is walked into; a long article group only
		// animates what's worth animating inside it.
		if ( name === 'core/group' || name === 'core/column' ) {
			if ( isSection( block ) ) {
				push( block, 'cascade', {
					...seq(),
					count: meaningfulChildren( block ).length,
				} );
				descendantCount += count( block );
				return;
			}
			const children = block.innerBlocks || [];
			if ( children.length === 1 && ! sequence ) {
				recurse( children[ 0 ] );
				return;
			}
			if ( children.length === 0 ) {
				return;
			}
			for ( const child of children ) {
				recurse( child, sequence );
			}
			return;
		}

		// Inside a Cover's sequence, text belongs to the hero, so it
		// rises with the rest instead of being skipped as body copy.
		if ( sequence && category === 'BODY' ) {
			push( block, 'rise', seq() );
			descendantCount += count( block );
			return;
		}

		if ( skipLeaf( block, category ) ) {
			return;
		}
		push( block, category === 'MEDIA' ? 'media' : 'rise', seq() );
		descendantCount += count( block );
	}

	for ( const block of topLevelBlocks || [] ) {
		topLevelId = block.clientId;
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
 * How the plan reads, for the modal: how many blocks open the page,
 * how many sections cascade, and so on.
 *
 * @param {Array} apply `computeAutoAnimatePlan().apply`.
 * @return {{opening: number, cascades: number, media: number, hero: number, rises: number}} Counts.
 */
export function summarizeChoreography( apply ) {
	const out = { opening: 0, cascades: 0, media: 0, hero: 0, rises: 0 };
	for ( const item of apply ) {
		if ( item.trigger === 'load' && item.role !== 'heroImage' ) {
			out.opening += 1;
		}
		if ( item.role === 'cascade' ) {
			out.cascades += 1;
		} else if ( item.role === 'media' ) {
			out.media += 1;
		} else if ( item.role === 'heroImage' ) {
			out.hero += 1;
		} else {
			out.rises += 1;
		}
	}
	return out;
}

/**
 * Group `apply` items by role. Returns a Map preserving insertion order.
 *
 * @param {Array} applyItems Plan items.
 * @return {Map<string, Array>} Items by role.
 */
export function groupApplyByCategory( applyItems ) {
	const grouped = new Map();
	for ( const item of applyItems ) {
		const key = item.role || item.category;
		if ( ! grouped.has( key ) ) {
			grouped.set( key, [] );
		}
		grouped.get( key ).push( item );
	}
	return grouped;
}

/**
 * Block-name → human label lookup for the modal. Falls back to the raw
 * block name if the type isn't registered.
 *
 * @param {Array}    items             Array of `{ block }` items.
 * @param {Function} getBlockTypeTitle `(name) → string|undefined`.
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
