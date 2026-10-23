/**
 * Motion Blocks — "May break the menu overlay" prediction (editor only)
 *
 * A finished animation keeps its last frame applied unless frontend.js
 * settles it (GH #20). When that frame (or the running animation) sets
 * a transform, filter, clip-path or Flip's preserve-3d on the element
 * around the menu, a Navigation block's full-screen menu overlay opens
 * inside the block instead of over the page. Opacity alone doesn't do
 * that: it makes a stacking context, not a containing block, so Fade
 * In / Fade Out and opacity-only Custom effects never trap the overlay
 * however long they keep their last frame.
 *
 * The front end decides what settles from the block's data attributes
 * (src/settle.js). This adapter turns block attributes into the same
 * inputs the PHP render filter (`motion_blocks_render_block`) hands the
 * front end, so the editor can ask settle.js the same question, and
 * `effectTraps()` then says whether an unsettled effect can trap at all.
 *
 * Pure (no @wordpress imports), and kept out of constants.js so the
 * front-end bundle doesn't pull it in.
 */

import { settleBlockers } from '../settle';
import { isValidFromToValue } from '../css-values';
import { navHasOverlay } from './selectStable';
import {
	PROPERTY_DEFINITIONS,
	SCHEMA_DEFAULTS,
	STAGGER_PARENT_BLOCKS,
	isImageTargetUnavailable,
	isStaggerCompatible,
	migrateScrollAppearAttrs,
} from './constants';

export { navHasOverlay };

const IMAGE_EFFECTS = [ 'image-move', 'image-zoom' ];

// Presets whose keyframes animate opacity and nothing else (mbFadeIn /
// mbFadeOut, for both the Entry and the Exit slot).
const OPACITY_ONLY_EFFECTS = [ 'fade', 'fade-out' ];

function ucfirst( s ) {
	return s.charAt( 0 ).toUpperCase() + s.slice( 1 );
}

function attr( attrs, key ) {
	return attrs[ key ] ?? SCHEMA_DEFAULTS[ key ];
}

/**
 * The Custom To values a block's front-end dataset would carry:
 * `animationTo*` → `mbTo*` (Page Load / Scroll Interactive) and
 * `animationEntryTo*` → `mbEntryTo*` (Scroll Appear Entry), the keys PHP
 * writes as `data-mb-to-*` / `data-mb-entry-to-*`. Values are passed as
 * strings, as PHP writes them; `customEndsAtRest()` re-validates them
 * against the same allowlist, so invalid ones are ignored there too.
 *
 * @param {Object} attrs Block attributes.
 * @return {Object} Dataset-shaped Custom To values.
 */
export function attrsToSettleDataset( attrs ) {
	const out = {};
	if ( ! attrs ) {
		return out;
	}
	for ( const { id } of PROPERTY_DEFINITIONS ) {
		const name = ucfirst( id );
		for ( const [ from, to ] of [
			[ 'animationTo', 'mbTo' ],
			[ 'animationEntryTo', 'mbEntryTo' ],
		] ) {
			const value = attrs[ from + name ];
			if ( value !== undefined && value !== null && value !== '' ) {
				out[ to + name ] = String( value );
			}
		}
	}
	return out;
}

/**
 * Whether a Custom effect's keyframe sets anything besides opacity:
 * a valid From or To value for any other property, which frontend.js
 * `buildSideBody()` turns into `transform`, `filter` or `clip-path`.
 * Both sides count. A transform or filter only on the From side still
 * leaves a resolved identity (`matrix(1, 0, 0, 1, 0, 0)`,
 * `blur(0px)`) in the filled last frame, and every From value applies
 * while the effect plays. A `clip-path: none` value clips nothing.
 *
 * @param {Object} attrs      Block attributes (after migration).
 * @param {string} fromPrefix 'animationFrom', 'animationEntryFrom' or
 *                            'animationExitFrom'.
 * @param {string} toPrefix   The matching To prefix.
 * @return {boolean} True when the keyframe goes beyond opacity.
 */
function customAnimatesBeyondOpacity( attrs, fromPrefix, toPrefix ) {
	return PROPERTY_DEFINITIONS.some( ( { id } ) => {
		if ( id === 'opacity' ) {
			return false;
		}
		return [ fromPrefix, toPrefix ].some( ( prefix ) => {
			const value = attrs[ prefix + ucfirst( id ) ];
			if ( ! isValidFromToValue( id, value ) ) {
				return false;
			}
			return ! (
				id === 'clipPath' &&
				String( value ).trim().toLowerCase() === 'none'
			);
		} );
	} );
}

/**
 * Whether a slot's effect, while it plays or keeps its last frame,
 * makes the block wrapper trap `position: fixed` descendants.
 *
 *   - Flip: its `preserve-3d` comes from the `.mb-enter-flip` /
 *     `.mb-exit-flip` class rules on the wrapper, whatever the target.
 *   - "Animate image only" and Image Move / Zoom: the animation runs on
 *     the Cover's image, and the wrapper's is `none` (animations.css).
 *   - Fade In / Fade Out: opacity only.
 *   - Custom: see customAnimatesBeyondOpacity().
 *   - Every other preset animates a transform, filter or clip-path.
 *
 * @param {string}  type       Effect type ('' for an empty slot).
 * @param {Object}  attrs      Block attributes (after migration).
 * @param {string}  fromPrefix Custom From attribute prefix.
 * @param {string}  toPrefix   Custom To attribute prefix.
 * @param {boolean} imgTarget  Whether the block renders data-mb-target="img".
 * @return {boolean} True when it can trap a menu overlay inside.
 */
export function effectTraps( type, attrs, fromPrefix, toPrefix, imgTarget ) {
	if ( ! type ) {
		return false;
	}
	if ( type === 'flip' ) {
		return true;
	}
	if (
		imgTarget ||
		IMAGE_EFFECTS.includes( type ) ||
		OPACITY_ONLY_EFFECTS.includes( type )
	) {
		return false;
	}
	if ( type === 'custom' ) {
		return customAnimatesBeyondOpacity( attrs, fromPrefix, toPrefix );
	}
	return true;
}

/**
 * Whether the render filter would mark this block `.mb-animated`:
 * a mode, plus a filled Scroll Appear slot or (other modes) an effect.
 * Mirrors the early return in `motion_blocks_render_block`.
 *
 * @param {Object} migrated Attributes after migrateScrollAppearAttrs().
 * @return {boolean} True when the front end animates the block.
 */
function rendersAnimated( migrated ) {
	const mode = migrated?.animationMode;
	if ( ! mode ) {
		return false;
	}
	if ( mode === 'scroll-appear' ) {
		return !! (
			attr( migrated, 'animationEntryType' ) ||
			attr( migrated, 'animationExitType' )
		);
	}
	return !! attr( migrated, 'animationType' );
}

/**
 * Whether a block's own animation renders on the front end. Used for
 * the nested blocks `settleTargets()` refuses to touch.
 *
 * @param {Object} attrs Raw block attributes.
 * @return {boolean} True when it renders `.mb-animated`.
 */
export function isRenderedAnimated( attrs ) {
	return (
		!! attrs?.animationMode &&
		rendersAnimated( migrateScrollAppearAttrs( attrs ) )
	);
}

/**
 * Why this block's animation will keep its last frame on the front end,
 * and whether that can trap a menu overlay.
 *
 *   - `animated`: the front end animates the block at all.
 *   - `reasons`: settleBlockers() ids, in display order. Empty exactly
 *     when frontend.js settles the block (unless settleTargets() skips
 *     it), whatever the effect.
 *   - `staggerActive`: it's a Stagger parent; settleTargets() skips it
 *     when a Stagger child is itself animated.
 *   - `imgTargetActive`: it animates its image; settleTargets() skips it
 *     when that image belongs to a nested animated block.
 *   - `traps`: a slot's effect can trap `position: fixed` descendants
 *     (effectTraps()) while it plays or keeps its last frame.
 *   - `fixes`: the `reasons` that keep a trapping effect's frame, i.e.
 *     the changes that stop the trap. All of them when the Page Load /
 *     Scroll Interactive effect or the Scroll Appear Entry traps; only
 *     'exit' when just the Exit does (without it, the Entry can't trap).
 *
 * @param {string} blockName  Block type name.
 * @param {Object} attributes Block attributes.
 * @return {{ animated: boolean, reasons: string[], staggerActive: boolean, imgTargetActive: boolean, traps: boolean, fixes: string[] }} Prediction.
 */
export function menuOverlayBlockers( blockName, attributes ) {
	const none = {
		animated: false,
		reasons: [],
		staggerActive: false,
		imgTargetActive: false,
		traps: false,
		fixes: [],
	};
	if ( ! attributes?.animationMode ) {
		return none;
	}
	const a = migrateScrollAppearAttrs( attributes );
	if ( ! rendersAnimated( a ) ) {
		return none;
	}
	const mode = a.animationMode;
	const type = attr( a, 'animationType' );
	const entryType = attr( a, 'animationEntryType' );
	const exitType = attr( a, 'animationExitType' );

	const reasons = settleBlockers(
		{
			mode,
			type,
			// frontend.js reads `dataset.mbRepeat || 'once'` and
			// `dataset.mbEntryReplay || 'once'`.
			repeat: attr( a, 'animationRepeat' ) || 'once',
			entryType,
			entryReplay: attr( a, 'animationEntryReplay' ) || 'once',
			exitType,
		},
		attrsToSettleDataset( a )
	);

	const staggerActive =
		!! a.animationStaggerEnabled &&
		STAGGER_PARENT_BLOCKS.includes( blockName ) &&
		isStaggerCompatible( a );

	// Same as the data-mb-target="img" emission in the render filter.
	const imgTarget = attr( a, 'animationFromToTarget' ) === 'img';
	let imgTargetActive = false;
	if ( ! isImageTargetUnavailable( blockName, a ) ) {
		if ( mode === 'scroll-appear' ) {
			imgTargetActive =
				IMAGE_EFFECTS.includes( entryType ) ||
				IMAGE_EFFECTS.includes( exitType ) ||
				( imgTarget && !! ( entryType || exitType ) );
		} else {
			imgTargetActive =
				IMAGE_EFFECTS.includes( type ) || ( imgTarget && !! type );
		}
	}

	let traps;
	let fixes;
	if ( mode === 'scroll-appear' ) {
		const entryTraps = effectTraps(
			entryType,
			a,
			'animationEntryFrom',
			'animationEntryTo',
			imgTargetActive
		);
		const exitTraps = effectTraps(
			exitType,
			a,
			'animationExitFrom',
			'animationExitTo',
			imgTargetActive
		);
		traps = entryTraps || exitTraps;
		if ( entryTraps ) {
			fixes = reasons;
		} else {
			fixes = exitTraps ? reasons.filter( ( id ) => id === 'exit' ) : [];
		}
	} else {
		traps = effectTraps(
			type,
			a,
			'animationFrom',
			'animationTo',
			imgTargetActive
		);
		fixes = traps ? reasons : [];
	}

	return {
		animated: true,
		reasons,
		staggerActive,
		imgTargetActive,
		traps,
		fixes,
	};
}
