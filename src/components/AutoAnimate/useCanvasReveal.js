/**
 * Reveal blocks during the Auto-animate preview (prototype).
 *
 * Page Load blocks reveal (play) right away. Scroll Appear blocks
 * reveal when they scroll into the middle of the editor canvas, using
 * the same 15%-inset zone and 10% threshold as the front end. Re-runs
 * on Replay / style change (`runId`), which clears the played flags.
 */
import { useSelect, useDispatch } from '@wordpress/data';
import { useEffect } from '@wordpress/element';

import { store as autoPreviewStore } from './autoPreviewStore';

function findBlockEl( clientId ) {
	const selector = `[data-block="${ clientId }"][data-type]`;
	const iframe = document.querySelector( 'iframe[name="editor-canvas"]' );
	const doc = iframe?.contentDocument;
	return (
		( doc && doc.querySelector( selector ) ) ||
		document.querySelector( selector )
	);
}

export default function useCanvasReveal() {
	const { active, overlays, runId } = useSelect( ( select ) => {
		const s = select( autoPreviewStore );
		return {
			active: s.isAutoPreviewActive(),
			overlays: s.getAutoPreviewOverlays(),
			runId: s.getAutoPreviewRunId(),
		};
	}, [] );
	const { markAutoPreviewPlayed } = useDispatch( autoPreviewStore );

	useEffect( () => {
		if ( ! active ) {
			return;
		}
		const ids = Object.keys( overlays );
		let observer = null;
		let cancelled = false;

		// Let React commit the overlay (and the restart effect see the
		// played flag as false) before revealing anything.
		const timer = setTimeout( () => {
			if ( cancelled ) {
				return;
			}
			const scrollIds = [];
			ids.forEach( ( id ) => {
				if ( overlays[ id ].animationMode === 'scroll-appear' ) {
					scrollIds.push( id );
				} else {
					markAutoPreviewPlayed( id );
				}
			} );
			if ( ! scrollIds.length ) {
				return;
			}
			const els = scrollIds
				.map( ( id ) => [ id, findBlockEl( id ) ] )
				.filter( ( [ , el ] ) => el );
			if ( ! els.length ) {
				return;
			}
			// Root = the canvas document, so the zone is measured against
			// the canvas (iframe) viewport, not the admin page's.
			const doc = els[ 0 ][ 1 ].ownerDocument;
			const view = doc.defaultView;
			const byEl = new Map( els.map( ( [ id, el ] ) => [ el, id ] ) );
			observer = new view.IntersectionObserver(
				( entries ) => {
					entries.forEach( ( entry ) => {
						if ( entry.isIntersecting ) {
							markAutoPreviewPlayed( byEl.get( entry.target ) );
							observer.unobserve( entry.target );
						}
					} );
				},
				{ root: doc, threshold: 0.1, rootMargin: '-15% 0px -15% 0px' }
			);
			els.forEach( ( [ , el ] ) => observer.observe( el ) );
		}, 50 );

		return () => {
			cancelled = true;
			clearTimeout( timer );
			if ( observer ) {
				observer.disconnect();
			}
		};
	}, [ active, overlays, runId, markAutoPreviewPlayed ] );
}
