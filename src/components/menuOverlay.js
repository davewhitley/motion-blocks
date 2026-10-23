/**
 * Motion Blocks — "May break the menu overlay" prediction (editor only)
 *
 * A finished animation keeps its last frame applied unless frontend.js
 * settles it (GH #20). That last frame (a transform, filter, clip-path
 * or Flip's preserve-3d) makes the block a containing block for
 * `position: fixed` descendants, so a Navigation block's full-screen
 * menu overlay opens inside the block instead of over the page.
 *
 * The front end decides what settles from the block's data attributes
 * (src/settle.js). This adapter turns block attributes into the same
 * inputs the PHP render filter (`motion_blocks_render_block`) hands the
 * front end, so the editor can ask settle.js the same question.
 *
 * Pure (no @wordpress imports), and kept out of constants.js so the
 * front-end bundle doesn't pull it in.
 */

import { settleBlockers } from '../settle';
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
 * Why this block's animation will keep its last frame on the front end.
 *
 *   - `animated`: the front end animates the block at all.
 *   - `reasons`: settleBlockers() ids, in display order.
 *   - `staggerActive`: it's a Stagger parent; settleTargets() skips it
 *     when a Stagger child is itself animated.
 *   - `imgTargetActive`: it animates its image; settleTargets() skips it
 *     when that image belongs to a nested animated block.
 *
 * @param {string} blockName  Block type name.
 * @param {Object} attributes Block attributes.
 * @return {{ animated: boolean, reasons: string[], staggerActive: boolean, imgTargetActive: boolean }} Prediction.
 */
export function menuOverlayBlockers( blockName, attributes ) {
	const none = {
		animated: false,
		reasons: [],
		staggerActive: false,
		imgTargetActive: false,
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

	return { animated: true, reasons, staggerActive, imgTargetActive };
}
