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
 *     skipInvalid:   [ Block ],
 *     skipExisting:  [ Block ],
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
	SYNCED_PATTERN_BLOCK,
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
	// Synced pattern reference: can't be animated as one unit (it has
	// no wrapper element on the front end, GH #41), so it is skipped.
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

/**
 * A Columns block taller than this many screens of the editor canvas is
 * the page, not a row. The canvas is narrower and shorter than a visitor's
 * window, so a one-screen hero can read as ~1.75 there; real wrappers
 * measure 3 to 10.
 */
const PAGE_SIZED_SCREENS = 2;

/**
 * A Columns block holding more designed units than this (Groups, Covers,
 * Queries…, at any depth), or any Query Loop, is the page too, whatever
 * its measured height: a measurement taken while images are still loading
 * reads short, and structure doesn't change between runs.
 */
const MAX_ROW_COMPOSITES = 8;

/** How many designed units (and Query Loops) sit anywhere inside `block`. */
function holdsPage( block ) {
	let composites = 0;
	let query = false;
	const walk = ( blocks ) => {
		for ( const child of blocks || [] ) {
			if ( COMPOSITE_BLOCKS.has( child.name ) ) {
				composites += 1;
			}
			query = query || child.name === 'core/query';
			walk( child.innerBlocks );
		}
	};
	walk( block.innerBlocks );
	return query || composites > MAX_ROW_COMPOSITES;
}

/**
 * One curve for everything: fast start, long soft landing (expo-out).
 * The same value as the Easing menu's "Smooth Out" option
 * (easingPresets in shared-constants.json), so an auto-animated
 * block's panel shows that name, not a line of CSS (GH #138).
 */
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
 *   stagger      whether a cascade staggers its children; when false
 *                the section rises as one block
 */
export const STYLE_PRESETS = {
	subtle: {
		label: 'Subtle',
		duration: 0.8,
		distance: 24,
		settleScale: 1.04,
		// No stagger: a cascade's section rises as one block.
		stagger: false,
		beat: 0.08,
		spread: 0.6,
		openingBeat: 0.12,
		heroZoom: 1.06,
	},
	balanced: {
		label: 'Balanced',
		duration: 1.0,
		distance: 48,
		settleScale: 1.08,
		stagger: true,
		beat: 0.12,
		spread: 0.9,
		openingBeat: 0.18,
		heroZoom: 1.12,
	},
	bold: {
		label: 'Bold',
		duration: 1.3,
		distance: 80,
		settleScale: 1.14,
		stagger: true,
		beat: 0.16,
		spread: 1.2,
		openingBeat: 0.24,
		heroZoom: 1.2,
	},
};

/** The opening sequence starts this long after load, and ends by `MAX_OPENING_DELAY`. */
const OPENING_START = 0.1;
const MAX_OPENING_DELAY = 1.2;

/**
 * Most blocks the opening sequence holds (the hero background doesn't
 * count). It is for the hero's headline, text and buttons; anything else
 * that happens to be on the first screen waits for the scroll, which fires
 * as soon as the page loads for a block already in view.
 */
const MAX_OPENING_ITEMS = 4;

/**
 * Most steps of delay a scroll sequence (a Cover's content) builds up.
 * Later items share the last step.
 */
const MAX_SEQUENCE_STEPS = 4;

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
export function attrsForItem( item, stylePreset = 'balanced' ) {
	const style = STYLE_PRESETS[ stylePreset ] || STYLE_PRESETS.balanced;
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
	if ( role === 'cascade' && style.stagger !== false ) {
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
			animationEasing: MOTION_EASE,
			animationLoop: 'off',
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
		animationEntryEasing: MOTION_EASE,
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
	stylePreset = 'balanced',
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
	const style = STYLE_PRESETS[ stylePreset ] || STYLE_PRESETS.balanced;
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
			// Capped: each block waits for its own scroll position, so
			// a long sequence left later blocks on screen but invisible
			// for seconds (GH #140).
			resolved.delay =
				Math.min( item.sequenceIndex || 0, MAX_SEQUENCE_STEPS ) *
				style.beat *
				1.5;
			if ( item.afterOpening ) {
				// On the first screen, past the opening's last slot: start
				// after the opening, not ahead of it.
				resolved.delay = Math.max(
					resolved.delay,
					Math.min(
						OPENING_START + MAX_OPENING_ITEMS * style.openingBeat,
						MAX_OPENING_DELAY
					)
				);
			}
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
 * Like `buildAutoAnimateUpdates`, but replacing existing animations:
 * every block in `clearIds` is reset (as "Remove all animations" does),
 * and planned blocks get the reset plus their new animation, so no old
 * setting survives underneath. Still one `updateBlockAttributes` call,
 * so the whole replace is one undo step. With no `clearIds` it is the
 * same as `buildAutoAnimateUpdates`.
 *
 * @param {Array}    apply       `computeAutoAnimatePlan().apply`.
 * @param {string}   stylePreset Key of STYLE_PRESETS.
 * @param {string[]} clearIds    Animated blocks to reset first.
 * @return {{clientIds: string[], attributesByClientId: Object}} Payloads.
 */
export function buildReplaceUpdates( apply, stylePreset, clearIds = [] ) {
	const planned = buildAutoAnimateUpdates( apply, stylePreset );
	if ( ! clearIds.length ) {
		return planned;
	}
	const clear = clearAnimationAttributes();
	const attributesByClientId = {};
	clearIds.forEach( ( id ) => {
		attributesByClientId[ id ] = { ...clear };
	} );
	planned.clientIds.forEach( ( id ) => {
		attributesByClientId[ id ] = {
			...clear,
			...planned.attributesByClientId[ id ],
		};
	} );
	return {
		clientIds: Object.keys( attributesByClientId ),
		attributesByClientId,
	};
}

/**
 * What replacing does to the blocks that are already animated: how many
 * the new plan animates again, and how many it leaves still, so they
 * just lose their animation. The style doesn't change the plan, so
 * neither does it change these counts.
 *
 * @param {Array}    apply       The new plan's `apply` items.
 * @param {string[]} animatedIds Blocks animated now (withoutExistingAnimations).
 * @return {{renewed: number, removed: number}} Counts.
 */
export function summarizeReplace( apply, animatedIds ) {
	const planned = new Set( apply.map( ( item ) => item.clientId ) );
	const renewed = animatedIds.filter( ( id ) => planned.has( id ) ).length;
	return { renewed, removed: animatedIds.length - renewed };
}

/**
 * Animated blocks in a tree (every depth), and a copy of the tree with
 * those animations marked as gone. Planning the copy gives the plan
 * Auto-animate would make on the page without its current animations,
 * which is what "Replace existing animations" applies. Client ids are
 * kept, so the plan's ids point at the real blocks.
 *
 * Stops at a synced pattern: its blocks belong to the pattern, shared by
 * every page that uses it, and Auto-animate doesn't touch synced
 * patterns (GH #41). The planner skips them too, so they stay as is.
 *
 * @param {Object[]} blocks Blocks to scan (may include filled template parts).
 * @return {{animatedIds: string[], stripped: Object[]}} Ids and stripped copy.
 */
export function withoutExistingAnimations( blocks ) {
	const animatedIds = [];
	const strip = ( list ) =>
		( list || [] ).map( ( block ) => {
			const animated = !! block.attributes?.animationMode;
			if ( animated ) {
				animatedIds.push( block.clientId );
			}
			return {
				...block,
				attributes: animated
					? { ...block.attributes, animationMode: '' }
					: block.attributes,
				innerBlocks:
					block.name === SYNCED_PATTERN_BLOCK
						? block.innerBlocks
						: strip( block.innerBlocks ),
			};
		} );
	const stripped = strip( blocks );
	return { animatedIds, stripped };
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

/** Blocks that read as a heading: the opening line of a hero. */
const HEADING_LIKE = new Set( [
	'core/heading',
	'core/site-title',
	'core/post-title',
	'core/query-title',
] );

/**
 * Does `block` hold a block matching `test`? A template part's own
 * contents don't count (they are the site header, not the section), and
 * neither does a Query Loop's: its cards repeat, and aren't the opening.
 *
 * @param {Object}   block Block.
 * @param {Function} test  `(block) → boolean`.
 * @param {number}   depth How many levels down to look.
 * @return {boolean} True when one matches.
 */
function holds( block, test, depth = 4 ) {
	for ( const child of block.innerBlocks || [] ) {
		if ( test( child ) ) {
			return true;
		}
		if (
			child.name !== 'core/template-part' &&
			child.name !== 'core/query' &&
			depth > 1 &&
			holds( child, test, depth - 1 )
		) {
			return true;
		}
	}
	return false;
}

/**
 * Is this template part the site footer? By its area, its slug, or its
 * tag, so it works whatever the theme calls it.
 *
 * @param {Object} block Block.
 * @return {boolean} True for a footer template part.
 */
function isFooterPart( block ) {
	const a = block.attributes || {};
	return (
		block.name === 'core/template-part' &&
		( a.area === 'footer' ||
			a.tagName === 'footer' ||
			/^footer/.test( a.slug || '' ) )
	);
}

/**
 * The hero inside a header template part, when the theme builds it there
 * (a full-bleed Cover under the site title and menu): a Cover, or a
 * designed section with a heading and something under it. The bar with
 * the menu is stepped into, not taken: it holds a heading-like site
 * title, not a hero.
 *
 * @param {Object} block Template part, with its contents loaded.
 * @param {number} depth How many levels down to look.
 * @return {Object|null} The hero block, or null.
 */
function heroInPart( block, depth = 6 ) {
	for ( const child of block.innerBlocks || [] ) {
		if ( child.name === 'core/cover' ) {
			return child;
		}
		if (
			child.name === 'core/query' ||
			child.name === 'core/template-part'
		) {
			continue;
		}
		if (
			COMPOSITE_BLOCKS.has( child.name ) &&
			! holds( child, ( b ) => b.name === 'core/navigation' ) &&
			holds( child, ( b ) => b.name === 'core/heading' ) &&
			holds( child, ( b ) =>
				[ 'core/paragraph', 'core/buttons', 'core/image' ].includes(
					b.name
				)
			)
		) {
			return child;
		}
		const found = depth > 1 ? heroInPart( child, depth - 1 ) : null;
		if ( found ) {
			return found;
		}
	}
	return null;
}

/**
 * Fill in the contents of each template part. In the Site Editor a
 * template's `getBlocks()` shows a header or footer as an empty block:
 * its blocks belong to the part's own document, and are read with
 * `getBlocks( partClientId )`, which this always uses for a part, whatever
 * the template's tree holds. Blocks with no part inside are returned as
 * they are.
 *
 * @param {Array}    blocks         `getBlocks()`.
 * @param {Function} getInnerBlocks `(clientId) → Block[]`.
 * @param {number}   depth          Parts nested this deep are left empty.
 * @return {Array} Blocks, with each part's contents as its inner blocks.
 */
export function withTemplatePartContents( blocks, getInnerBlocks, depth = 4 ) {
	return ( blocks || [] ).map( ( block ) => {
		let inner = block.innerBlocks || [];
		// A part's own document is the only source for its blocks. The copy
		// in the template's tree is normally empty, but after an Undo it can
		// keep blocks the part has since replaced, which no longer exist: a
		// change sent to them makes the editor throw and drops the whole
		// Auto-animate apply.
		if ( block.name === 'core/template-part' ) {
			inner = depth > 0 ? getInnerBlocks( block.clientId ) || [] : [];
		}
		const filled = withTemplatePartContents(
			inner,
			getInnerBlocks,
			block.name === 'core/template-part' ? depth - 1 : depth
		);
		const same =
			filled.length === ( block.innerBlocks || [] ).length &&
			filled.every( ( b, i ) => b === block.innerBlocks[ i ] );
		return same ? block : { ...block, innerBlocks: filled };
	} );
}

/**
 * Template parts that have blocks inside them, at any depth.
 *
 * @param {Array} blocks Blocks (from withTemplatePartContents).
 * @return {Object[]} The parts.
 */
export function templatePartsWithContents( blocks ) {
	const out = [];
	const walk = ( list ) => {
		for ( const block of list || [] ) {
			if (
				block.name === 'core/template-part' &&
				( block.innerBlocks || [] ).length
			) {
				out.push( block );
			}
			walk( block.innerBlocks );
		}
	};
	walk( blocks );
	return out;
}

/** A template part, or a one-line strip: the pieces of a bar above the content. */
function isBar( block ) {
	if (
		block.name === 'core/template-part' ||
		block.name === 'core/paragraph'
	) {
		return true;
	}
	const kids = meaningfulChildren( block );
	return (
		block.name === 'core/group' && kids.length <= 3 && kids.every( isBar )
	);
}

/**
 * A Group that is a bar above the content, not a section: the header
 * (with an announcement strip), or a one-line strip on its own. It holds
 * nothing but template parts and short text, however deep.
 *
 * @param {Object} block Block.
 * @return {boolean} True when it is site chrome.
 */
function isChromeWrapper( block ) {
	return block.name === 'core/group' && isBar( block );
}

/**
 * Does this section read as a hero? A Cover (or a section holding one),
 * or a section that opens with a heading or a button row. Only a
 * heading block counts, not the site title (a sidebar has that), and a
 * Query Loop's contents never do, so a post list or a sidebar gets no
 * opening, and everything waits for the scroll.
 *
 * @param {Object} block Section.
 * @return {boolean} True for a hero.
 */
function isHeroLike( block ) {
	if ( block.name === 'core/cover' ) {
		return true;
	}
	return holds(
		block,
		( b ) =>
			b.name === 'core/cover' ||
			b.name === 'core/heading' ||
			b.name === 'core/buttons'
	);
}

/**
 * Find the hero: the first real section of the page. This decides what
 * plays on load, instead of guessing from pixel positions in the editor
 * (whose canvas is narrower and shorter than a visitor's window, and
 * measures before images load).
 *
 *  1. Template parts (header, footer) and header-like bars are skipped.
 *  2. A page's loose leading blocks (heading, text, buttons… before the
 *     first section) are the hero run.
 *  3. Otherwise the first section, stepping into a wrapper (a Group of
 *     sections, or a Columns that holds the page) to the first real one.
 *  4. It only counts if it reads as a hero (see isHeroLike). If not there
 *     is no opening, and everything waits for the scroll, which fires at
 *     once for blocks already in view.
 *
 * With `includeParts`, a hero in a header template part above the content
 * comes first (see heroInPart).
 *
 * @param {Array}   topLevelBlocks         `getBlocks()` (top level only).
 * @param {Object}  [options]
 * @param {boolean} [options.includeParts] Look inside header parts too.
 * @return {{blocks: Object[]}|null} The hero's blocks, or null.
 */
export function findHero( topLevelBlocks, { includeParts = false } = {} ) {
	if ( includeParts ) {
		for ( const block of topLevelBlocks || [] ) {
			if ( block.name !== 'core/template-part' ) {
				if ( isChromeWrapper( block ) ) {
					continue;
				}
				break;
			}
			const hero = isFooterPart( block ) ? null : heroInPart( block );
			if ( hero ) {
				return { blocks: [ hero ] };
			}
		}
	}
	const content = ( topLevelBlocks || [] ).filter(
		( b ) => b.name !== 'core/template-part'
	);
	let i = 0;
	while ( i < content.length && isChromeWrapper( content[ i ] ) ) {
		i += 1;
	}
	const first = content[ i ];
	if ( ! first ) {
		return null;
	}
	if ( ! COMPOSITE_BLOCKS.has( first.name ) ) {
		const run = [];
		for (
			let j = i;
			j < content.length && ! COMPOSITE_BLOCKS.has( content[ j ].name );
			j += 1
		) {
			run.push( content[ j ] );
		}
		const opens = run.some( ( b ) =>
			[
				...HEADING_LIKE,
				'core/image',
				'core/buttons',
				'core/cover',
			].includes( b.name )
		);
		// `loose`: a run of loose blocks can be a whole article, so the
		// planner holds it to the stricter first-screen cutoff (GH #140).
		return opens ? { blocks: run, loose: true } : null;
	}
	let block = first;
	for ( let depth = 0; depth < 8; depth += 1 ) {
		const kids = meaningfulChildren( block );
		const sections = kids.filter( ( k ) => COMPOSITE_BLOCKS.has( k.name ) );
		const wrapper =
			( block.name === 'core/group' &&
				sections.length > 0 &&
				( sections.length >= 2 || kids.length === 1 ) ) ||
			( ( block.name === 'core/columns' ||
				block.name === 'core/column' ) &&
				holdsPage( block ) );
		if ( ! wrapper ) {
			break;
		}
		const next = ( sections.length ? sections : kids ).find(
			( k ) => ! isChromeWrapper( k )
		);
		if ( ! next ) {
			break;
		}
		block = next;
	}
	return isHeroLike( block ) ? { blocks: [ block ] } : null;
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
	// A Query Loop is always a block of its own to walk into, even with
	// just a Post Template inside: its posts are what should animate.
	// That holds for one nested in a wrapper Group too (GH #140).
	if ( holds( block, ( b ) => b.name === 'core/query' ) ) {
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
 * @param {Object}   [options]
 * @param {Function} [options.isOnFirstScreen] `(clientId, strict?) → boolean|null`:
 *   whether the block starts on the first screen. The modal measures it
 *   in the editor canvas. With a hero found, only a `false` counts: it
 *   takes a block out of the opening sequence (the hero decides what is in
 *   it), and `null` leaves the hero as found. With no hero, `true` (asked
 *   with `strict`, the stricter cutoff) puts a block in the opening, up to
 *   the cap; `null` or no function means no opening.
 * @param {Function} [options.screensTall] `(clientId) → number|null`:
 *   how tall the block is, in screens of the editor canvas. A Columns
 *   block taller than 2 screens, or holding a Query Loop or many designed
 *   units, is a page wrapper and is walked into.
 * @param {Function} [options.partHasAnimation] `(clientId) → boolean`: does this
 *   template part hold an animation? Such a part is not animated whole.
 * @param {boolean}  [options.includeParts] Animate what's inside template
 *   parts (header, footer), loaded with withTemplatePartContents, instead
 *   of the header as one block and the footer not at all. A hero in the
 *   header opens the page; everything else in a part waits for the scroll.
 * @return {Object} Plan.
 */
export function computeAutoAnimatePlan( topLevelBlocks, options = {} ) {
	const apply = [];
	const skipBody = [];
	const skipChrome = [];
	const skipBroken = [];
	// Invalid blocks (the editor flags `isValid: false` when a block's saved
	// HTML doesn't match what it would generate, so it offers "Attempt
	// Block Recovery"). An invalid block is saved as its original HTML, so a
	// change to it or anything inside it is silently dropped on save. They
	// are skipped, with their contents, and the modal says so.
	const skipInvalid = [];
	const skipExisting = [];
	let openingIndex = 0;

	// What plays on load is the hero (see findHero), not whatever a
	// measurement puts above the fold. With a hero, the measurement can only
	// take a block out of the opening (one that starts well below the first
	// screen), never add one; if it puts the whole hero below the first
	// screen, there is no hero. With no hero it is the fallback.
	const measure = options.isOnFirstScreen;
	const heroIds = new Set();
	const heroRootIds = new Set();
	const markHero = ( block ) => {
		heroIds.add( block.clientId );
		( block.innerBlocks || [] ).forEach( markHero );
	};
	const includeParts = !! options.includeParts;
	const hero = findHero( topLevelBlocks, { includeParts } );
	const found = hero?.blocks || [];
	const looseHero = !! hero?.loose;
	// Blocks inside a template part. Unless they are the hero, they never
	// join the opening: a header animating on load is a flash, and a
	// footer is far below the first screen.
	const partContentIds = new Set();
	if ( includeParts ) {
		const markInside = ( blocks ) =>
			( blocks || [] ).forEach( ( block ) => {
				partContentIds.add( block.clientId );
				markInside( block.innerBlocks );
			} );
		templatePartsWithContents( topLevelBlocks ).forEach( ( part ) =>
			markInside( part.innerBlocks )
		);
	}
	// A hero the measurement puts below the first screen isn't opening the
	// page (the real hero was one the structure missed): count it as no
	// hero, so the fallback below takes over. An unmeasured hero stands.
	const heroOnScreen =
		! measure ||
		found.some( ( block ) => measure( block.clientId ) !== false );
	// Blocks that contain the hero. They are always walked into: a Group the
	// planner would otherwise cascade as one section (a hero with its header
	// and more around it) would swallow the hero, which would never be seen.
	const heroAncestorIds = new Set();
	if ( heroOnScreen ) {
		found.forEach( ( block ) => {
			heroRootIds.add( block.clientId );
			markHero( block );
		} );
		const markAncestors = ( blocks, trail ) => {
			for ( const block of blocks || [] ) {
				if ( heroRootIds.has( block.clientId ) ) {
					trail.forEach( ( id ) => heroAncestorIds.add( id ) );
				} else {
					markAncestors( block.innerBlocks, [
						...trail,
						block.clientId,
					] );
				}
			}
		};
		markAncestors( topLevelBlocks, [] );
	}
	const onFirstScreen = ( block ) => {
		if (
			partContentIds.has( block.clientId ) &&
			! heroIds.has( block.clientId )
		) {
			return false;
		}
		if ( heroIds.size ) {
			if ( ! heroIds.has( block.clientId ) ) {
				return false;
			}
			return (
				( measure ? measure( block.clientId, looseHero ) : null ) !==
				false
			);
		}
		// No hero was found (a post list, a sidebar, a hero made of plain
		// text, a hero inside the header): fall back to the measured first
		// screen, with its stricter cutoff, because here the measurement
		// is all there is. Only a block it actually found counts, and the
		// header and other template parts are left out: a header animating
		// on load is a flash, not an opening.
		if ( ! measure || block.name === 'core/template-part' ) {
			return false;
		}
		return measure( block.clientId, true ) === true;
	};

	// Intro paragraphs of walked-into sections, by client id.
	const introIds = new Set();

	// Posts a Query Loop shows per page, while walking inside one.
	let queryPerPage = null;
	const DEFAULT_QUERY_COUNT = 10;

	/**
	 * Queue one item. On the first screen it joins the opening sequence
	 * (page load, next slot in reading order); below it, it waits for
	 * the scroll, offset by `sequenceIndex` within its group (a Cover's
	 * content). A `repeated` block (a Post Template's card, one design
	 * rendered once per post) is only ever measured at its first copy, so
	 * the answer can't stand for the others: it always waits for the scroll
	 * and takes no slot in the opening sequence.
	 */
	function push( block, role, extra = {}, { repeated = false } = {} ) {
		const first =
			! repeated &&
			( role === 'heroImage' || openingIndex < MAX_OPENING_ITEMS ) &&
			onFirstScreen( block );
		const item = {
			clientId: block.clientId,
			block,
			role,
			trigger: first ? 'load' : 'scroll',
			...extra,
		};
		// A fifth or later block on the first screen waits for the scroll,
		// which fires at once for a block in view. Marked so its delay
		// puts it after the opening (GH #140).
		if (
			! first &&
			! repeated &&
			openingIndex >= MAX_OPENING_ITEMS &&
			onFirstScreen( block )
		) {
			item.afterOpening = true;
		}
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

	function skipIfInvalid( block ) {
		if ( block.isValid !== false ) {
			return false;
		}
		skipInvalid.push( block );
		return true;
	}

	function recurse( block, sequence = null ) {
		if ( ! block || skipIfInvalid( block ) ) {
			return;
		}
		// Already animated: that animation owns the subtree.
		if ( block.attributes?.animationMode ) {
			skipExisting.push( block );
			return;
		}
		const name = block.name;
		const category = classifyBlock( block );
		// Blocks that can't keep animation settings (Classic, Custom
		// HTML, Shortcode, Spacer, synced patterns): the front end would
		// ignore them,
		// leaving a gap in a sequence. A Spacer still counts as chrome
		// in the summary.
		if ( ! canAnimateBlock( name ) ) {
			( category === 'CHROME' ? skipChrome : skipBody ).push( block );
			return;
		}
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

		// Query Loop: the posts are the cascade, not the loop as one
		// slab. The Query block only wraps a Post Template (the block
		// whose children render once per post), so walk into the Query
		// and let the Post Template take the cascade below. The post
		// count isn't known while editing, so use the query's per-page
		// setting (the site default, 10, when it inherits).
		if ( name === 'core/query' ) {
			const outerPerPage = queryPerPage;
			// WordPress ignores perPage on an inheriting query and shows
			// the site's posts per page.
			const query = block.attributes?.query;
			queryPerPage = query?.inherit
				? DEFAULT_QUERY_COUNT
				: query?.perPage || DEFAULT_QUERY_COUNT;
			for ( const child of block.innerBlocks || [] ) {
				recurse( child, sequence );
			}
			queryPerPage = outerPerPage;
			return;
		}
		if ( name === 'core/post-template' ) {
			const posts = queryPerPage || DEFAULT_QUERY_COUNT;
			const layout = block.attributes?.layout;
			const columns =
				layout?.type === 'grid' ? layout.columnCount || 0 : 1;
			// Posts that fit on one row arrive together, so they cascade.
			// Posts that wrap onto more rows arrive as you scroll, so each
			// post (the card it's built from) rises when it comes into view.
			// A card that already has an animation keeps it, and the Post
			// Template is then not cascaded over it (GH #140).
			if ( columns && posts <= columns && ! hasAnimatedChild( block ) ) {
				push( block, 'cascade', { ...seq(), count: posts } );
				return;
			}
			for ( const child of block.innerBlocks || [] ) {
				if ( skipIfInvalid( child ) ) {
					continue;
				}
				if ( child.attributes?.animationMode ) {
					skipExisting.push( child );
					continue;
				}
				// Spacers, Separators and blocks that can't keep an
				// animation are left alone, as everywhere else.
				const childCategory = classifyBlock( child );
				if ( ! canAnimateBlock( child.name ) ) {
					( childCategory === 'CHROME' ? skipChrome : skipBody ).push(
						child
					);
					continue;
				}
				if (
					childCategory === 'CHROME' ||
					childCategory === 'BROKEN'
				) {
					skipLeaf( child, childCategory );
					continue;
				}
				push( child, 'rise', seq(), { repeated: true } );
			}
			return;
		}

		// With `includeParts`, a header or footer is walked into like a
		// wrapper, and its blocks animate one by one (GH #101).
		if (
			includeParts &&
			name === 'core/template-part' &&
			( block.innerBlocks || [] ).length
		) {
			for ( const child of block.innerBlocks ) {
				recurse( child, sequence );
			}
			return;
		}

		// Not walked into, but something inside it is animated already
		// (an earlier run that included parts, or by hand): leave it, or
		// the header would move twice (GH #140).
		if (
			name === 'core/template-part' &&
			options.partHasAnimation &&
			options.partHasAnimation( block.clientId )
		) {
			skipExisting.push( block );
			return;
		}

		// Otherwise the footer is left still. Animated whole it would fade
		// in as one tall slab. It is listed with the site chrome that is
		// skipped. Headers are not skipped: they are short, and animating
		// one whole is harmless.
		if ( isFooterPart( block ) ) {
			skipChrome.push( block );
			return;
		}

		// Rows: columns, gallery images and buttons cascade in.
		if ( CASCADE_CONTAINERS.has( name ) ) {
			const children = meaningfulChildren( block );
			// A Columns block that holds the whole page (a theme's layout
			// wrapper) would cascade as one row and skip everything in it.
			let pageSized = false;
			if ( name === 'core/columns' ) {
				const tall = options.screensTall
					? options.screensTall( block.clientId )
					: null;
				pageSized =
					holdsPage( block ) ||
					( typeof tall === 'number' && tall > PAGE_SIZED_SCREENS );
			}
			// A hero built as columns (copy on one side, an image on the
			// other) is walked into too: cascading the columns would lift
			// the whole text column as one block, where the opening should
			// bring its heading, text and buttons in one after another.
			const heroColumns =
				name === 'core/columns' && heroRootIds.has( block.clientId );
			if (
				pageSized ||
				heroColumns ||
				heroAncestorIds.has( block.clientId ) ||
				hasAnimatedChild( block )
			) {
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
			return;
		}

		// Groups: a designed section cascades its heading, text and
		// buttons; a wrapper is walked into; a long article group only
		// animates what's worth animating inside it.
		if ( name === 'core/group' || name === 'core/column' ) {
			if (
				isSection( block ) &&
				! heroAncestorIds.has( block.clientId )
			) {
				push( block, 'cascade', {
					...seq(),
					count: meaningfulChildren( block ).length,
				} );
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
			// A short section walked into (it holds a row of columns, say):
			// one paragraph between a heading and something that isn't
			// body text is the section's intro, and rises with them. The
			// same text animates when the section cascades whole, so it
			// would otherwise sit still between two moving blocks
			// (GH #140). Runs of body text are still skipped.
			const kids = meaningfulChildren( block );
			if ( kids.length <= MAX_SECTION_CHILDREN ) {
				kids.forEach( ( kid, i ) => {
					const before = kids[ i - 1 ];
					const after = kids[ i + 1 ];
					if (
						kid.name === 'core/paragraph' &&
						before &&
						HEADING_LIKE.has( before.name ) &&
						after &&
						classifyBlock( after ) !== 'BODY'
					) {
						introIds.add( kid.clientId );
					}
				} );
			}
			for ( const child of children ) {
				recurse( child, sequence );
			}
			return;
		}

		// Inside a Cover's sequence, text belongs to the hero, so it
		// rises with the rest instead of being skipped as body copy. So
		// does a section's intro paragraph (see above).
		if (
			( sequence || introIds.has( block.clientId ) ) &&
			category === 'BODY'
		) {
			push( block, 'rise', seq() );
			return;
		}

		if ( skipLeaf( block, category ) ) {
			return;
		}
		push( block, category === 'MEDIA' ? 'media' : 'rise', seq() );
	}

	for ( const block of topLevelBlocks || [] ) {
		recurse( block );
	}

	return {
		apply,
		skipBody,
		skipChrome,
		skipBroken,
		skipInvalid,
		skipExisting,
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
