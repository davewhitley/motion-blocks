/**
 * ViewportGuides — overlay lines on the editor canvas that show
 * where the selected scroll-interactive block's animation will start
 * and end as the user scrolls.
 *
 * Mounted as a sibling of BlockListBlock from `withAnimationPreview`,
 * but only renders when the block is selected AND in scroll-interactive
 * mode. The lines are `position: fixed` inside the iframe document, so
 * they pin to the viewport while the user scrolls.
 *
 * The lines reflect the user's `animationRangeStart` /
 * `animationRangeEnd` values per the CSS scroll-driven animations
 * `view()` spec. Position is computed from the block's height + the
 * range percentage. We measure the block once on mount and re-measure
 * on resize via ResizeObserver.
 */
import { useEffect, useRef, useState, createPortal } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

/**
 * Parse a range string like 'entry 25%' / 'exit 100%' / 'cover 50%'
 * into a `{ phase, percent }` object. Falls back to (`phase`, 0) if
 * the percent isn't parseable.
 *
 * @param {string} range
 * @return {{ phase: string, percent: number }}
 */
function parseRange( range ) {
	if ( ! range || typeof range !== 'string' ) {
		return { phase: 'entry', percent: 0 };
	}
	const parts = range.trim().split( /\s+/ );
	const phase = parts[ 0 ] || 'entry';
	const percent = parseInt( parts[ 1 ], 10 );
	return {
		phase,
		percent: Number.isFinite( percent ) ? percent : 0,
	};
}

/**
 * Compute the line's `top` (in px from the top of the viewport)
 * for a given range, block height, and viewport height.
 *
 * The line marks the position of the block's TOP EDGE at the moment
 * the trigger fires. CSS view() phases:
 *
 *   entry 0%   → element top at viewport bottom            (top = vh)
 *   entry 100% → element bottom at viewport bottom         (top = vh - h)
 *   exit 0%    → element top at viewport top               (top = 0)
 *   exit 100%  → element bottom at viewport top            (top = -h)
 *   cover 0%   → element top at viewport bottom            (top = vh)
 *   cover 100% → element bottom at viewport top            (top = -h)
 *   contain 0% → element top reaches "fully contained"     (top = vh - h)
 *   contain 100% → element bottom reaches "fully contained" (top = 0)
 *
 * @param {{phase: string, percent: number}} range
 * @param {number} blockHeight
 * @param {number} viewportHeight
 * @return {number}
 */
function computeLineTop( range, blockHeight, viewportHeight ) {
	const h = Math.max( 0, blockHeight );
	const vh = Math.max( 0, viewportHeight );
	const p = Math.max( 0, Math.min( 100, range.percent ) ) / 100;

	switch ( range.phase ) {
		case 'entry':
			return vh - p * h;
		case 'exit':
			return -p * h;
		case 'cover':
			return vh - p * ( vh + h );
		case 'contain':
			return ( vh - h ) * ( 1 - p );
		default:
			return vh - p * h;
	}
}

/**
 * Find the iframe document if the editor is rendering in iframed mode
 * (Site Editor, modern post editor). Falls back to the parent document
 * for older non-iframe contexts.
 *
 * @param {string} clientId Used to locate the block element so we can
 *                          determine which document it lives in.
 * @return {Document|null}
 */
function findEditorDocument( clientId ) {
	if ( ! clientId ) {
		return null;
	}
	// First, try iframes — that's where blocks render in modern WP.
	const iframes = document.querySelectorAll( 'iframe' );
	for ( const iframe of iframes ) {
		try {
			const doc = iframe.contentDocument;
			if (
				doc &&
				doc.querySelector( `[data-block="${ clientId }"]` )
			) {
				return doc;
			}
		} catch ( e ) {
			// Cross-origin iframe — skip silently.
		}
	}
	// Fallback: the parent document (some older contexts).
	if ( document.querySelector( `[data-block="${ clientId }"]` ) ) {
		return document;
	}
	return null;
}

export default function ViewportGuides( {
	clientId,
	rangeStart,
	rangeEnd,
} ) {
	const [ blockHeight, setBlockHeight ] = useState( 0 );
	const [ viewportHeight, setViewportHeight ] = useState( 0 );
	const [ ready, setReady ] = useState( false );
	const docRef = useRef( null );

	// Locate the iframe document and the block element. Re-runs if
	// clientId changes (new block selected). Sets up ResizeObserver
	// for the block's own height and a window resize listener for
	// the iframe viewport.
	useEffect( () => {
		const doc = findEditorDocument( clientId );
		if ( ! doc ) {
			setReady( false );
			return;
		}
		docRef.current = doc;
		const win = doc.defaultView;
		const blockEl = doc.querySelector( `[data-block="${ clientId }"]` );

		if ( ! win || ! blockEl ) {
			setReady( false );
			return;
		}

		setBlockHeight( blockEl.offsetHeight );
		setViewportHeight( win.innerHeight );
		setReady( true );

		// Track block height (image loads, content edits, etc.)
		let ro = null;
		if ( typeof win.ResizeObserver === 'function' ) {
			ro = new win.ResizeObserver( () => {
				setBlockHeight( blockEl.offsetHeight );
			} );
			ro.observe( blockEl );
		}

		const onResize = () => setViewportHeight( win.innerHeight );
		win.addEventListener( 'resize', onResize );

		return () => {
			if ( ro ) {
				ro.disconnect();
			}
			win.removeEventListener( 'resize', onResize );
		};
	}, [ clientId ] );

	if ( ! ready || viewportHeight === 0 ) {
		return null;
	}

	const startRange = parseRange( rangeStart || 'entry 0%' );
	const endRange = parseRange( rangeEnd || 'exit 100%' );

	const startTop = computeLineTop(
		startRange,
		blockHeight,
		viewportHeight
	);
	const endTop = computeLineTop( endRange, blockHeight, viewportHeight );

	// Clamp out-of-viewport lines to the nearest edge so the user
	// always has SOMETHING visible. Below-viewport lines are rare
	// (entry at >100% isn't valid) but exit ranges can go above the
	// viewport when the block is taller than the viewport.
	const clampTop = ( v ) =>
		Math.max( 0, Math.min( viewportHeight - 1, v ) );

	const startVisible = startTop >= 0 && startTop <= viewportHeight;
	const endVisible = endTop >= 0 && endTop <= viewportHeight;

	// Build the rendered lines. We want to use a portal so the lines
	// live in the iframe's body — that way `position: fixed` is
	// relative to the iframe viewport. React's createPortal lets us
	// target any DOM node.
	const doc = docRef.current;
	if ( ! doc ) {
		return null;
	}

	return createPortal(
		<>
			<div
				className={ `mb-viewport-guide mb-viewport-guide--start${
					startVisible ? '' : ' is-clamped'
				}` }
				style={ { top: clampTop( startTop ) } }
				aria-hidden="true"
			>
				<span className="mb-viewport-guide__label">
					{ __( 'Animation start', 'motion-blocks' ) }
				</span>
			</div>
			<div
				className={ `mb-viewport-guide mb-viewport-guide--end${
					endVisible ? '' : ' is-clamped'
				}` }
				style={ { top: clampTop( endTop ) } }
				aria-hidden="true"
			>
				<span className="mb-viewport-guide__label">
					{ __( 'Animation end', 'motion-blocks' ) }
				</span>
			</div>
		</>,
		doc.body
	);
}
