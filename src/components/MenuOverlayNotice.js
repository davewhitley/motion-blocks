/**
 * MenuOverlayNotice — warns when this block's animation can keep a
 * Navigation menu overlay from opening full screen.
 *
 * Front-end background (GH #20): a finished animation that is never
 * settled keeps its last frame applied. When that frame (or the running
 * animation) sets a transform, filter, clip-path or Flip's preserve-3d,
 * the block becomes a containing block for `position: fixed`
 * descendants, and a Navigation overlay inside opens within the block.
 * Opacity-only effects (Fade, opacity-only Custom) never do, so they
 * get no warning. menuOverlayBlockers() asks src/settle.js, the code
 * the front end uses, whether the block settles, checks whether its
 * effect can trap at all, and lists the fixes.
 *
 * Read-only: it never writes attributes, so it adds no undo steps.
 */

import { Notice } from '@wordpress/components';
import { useSelect } from '@wordpress/data';
import { useMemo, createInterpolateElement } from '@wordpress/element';
import { store as blockEditorStore } from '@wordpress/block-editor';
import { __ } from '@wordpress/i18n';

import { menuOverlayBlockers, isRenderedAnimated } from './menuOverlay';
import { selectMenuOverlayInfo } from './selectStable';

// Shared result for blocks with nothing to warn about, so they do no
// store work and `useSelect` sees the same value every run.
const NONE = { scope: '', targetsSkipped: false };

/**
 * The fix line for each settleBlockers() id. `<strong>` wraps the
 * control and option names the user looks for in the panel.
 *
 * @return {Object<string,string>} Translated lines by id.
 */
function fixLines() {
	return {
		/* translators: Fix for a Scroll Interactive animation. "On page load" and "Appear on scroll" are animation modes in the Motion Effects panel. Keep the <strong> tags. */
		interactive: __(
			'Use <strong>On page load</strong> or <strong>Appear on scroll</strong>.',
			'motion-blocks'
		),
		/* translators: Fix for a looping Page Load animation. "Repeat" is a setting and "Play once" one of its options. Keep the <strong> tags. */
		loop: __(
			'Set <strong>Repeat</strong> to <strong>Play once</strong>.',
			'motion-blocks'
		),
		/* translators: Fix for an Entry that replays. "Replay" is a setting and "Once" one of its options. Keep the <strong> tags. */
		replay: __(
			'Set <strong>Replay</strong> to <strong>Once</strong>.',
			'motion-blocks'
		),
		/* translators: Fix for a Scroll Appear animation with an Exit. "Exit" is a tab in the Motion Effects panel. Keep the <strong> tags. */
		exit: __(
			'Remove the <strong>Exit</strong> animation.',
			'motion-blocks'
		),
		/* translators: Fix for an effect that ends hidden or moved, such as Fade Out. "Fade In" is an effect name. Keep the <strong> tags. */
		'not-at-rest': __(
			'Use an effect that ends visible, like <strong>Fade In</strong>.',
			'motion-blocks'
		),
		/* translators: Fix for a Custom effect whose end values move, scale, rotate, blur, clip or fade the block. "To" is the tab with the end values in the Custom panel. Keep the <strong> tags. */
		'custom-end': __(
			'Set the <strong>To</strong> values back to normal.',
			'motion-blocks'
		),
	};
}

const STRONG_TAGS = /<\/?strong>/g;

export default function MenuOverlayNotice( {
	attributes,
	blockName,
	clientId,
} ) {
	const b = useMemo(
		() => menuOverlayBlockers( blockName, attributes ),
		[ blockName, attributes ]
	);
	const reasonCount = b.reasons.length;
	// An effect that can't trap the overlay (Fade, opacity-only Custom,
	// "Animate image only") needs no warning, settled or not.
	const relevant =
		b.animated &&
		b.traps &&
		( reasonCount > 0 || b.staggerActive || b.imgTargetActive );

	const info = useSelect(
		( select ) =>
			relevant
				? selectMenuOverlayInfo(
						select( blockEditorStore ),
						clientId,
						blockName,
						// settleTargets() only matters when nothing
						// else already keeps the last frame.
						b.staggerActive && reasonCount === 0,
						b.imgTargetActive && reasonCount === 0,
						isRenderedAnimated
				  )
				: NONE,
		[
			relevant,
			clientId,
			blockName,
			reasonCount,
			b.staggerActive,
			b.imgTargetActive,
		]
	);

	if ( ! info.scope || ( reasonCount === 0 && ! info.targetsSkipped ) ) {
		return null;
	}

	const title = __( 'May break the menu overlay', 'motion-blocks' );
	const sentence =
		info.scope === 'self'
			? __(
					'This animation can stop the menu overlay from opening full screen.',
					'motion-blocks'
			  )
			: __(
					'This block has a menu inside. This animation can stop its menu overlay from opening full screen.',
					'motion-blocks'
			  );
	const all = fixLines();
	const lines = b.fixes.map( ( id ) => [ id, all[ id ] ] );
	const spoken = [
		title,
		sentence,
		...lines.map( ( [ , line ] ) => line.replace( STRONG_TAGS, '' ) ),
	].join( ' ' );

	return (
		<div className="mb-panel-notice">
			<Notice
				status="warning"
				isDismissible={ false }
				spokenMessage={ spoken }
			>
				<strong className="mb-panel-notice__title">{ title }</strong>
				<p>{ sentence }</p>
				{ lines.length > 0 && (
					<ul className="mb-panel-notice__list">
						{ lines.map( ( [ id, line ] ) => (
							<li key={ id }>
								{ createInterpolateElement( line, {
									strong: <strong />,
								} ) }
							</li>
						) ) }
					</ul>
				) }
			</Notice>
		</div>
	);
}
