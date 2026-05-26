/**
 * ScrollAppearControls — "Appear on scroll" animation sub-panel.
 *
 * Slot model (v3): the panel has independent **Entry** and **Exit**
 * slots. Each slot holds an effect + timing + (optional) Custom
 * From/To keyframe. Slot filled = "the animation plays at that
 * phase." Slot empty = "no animation for that phase."
 *
 * - Filling only Entry      → element animates in on view (old "Enter trigger")
 * - Filling only Exit       → element animates out on view exit (old "Exit trigger")
 * - Filling both            → round-trip enter then exit (old "Mirror trigger")
 *
 * The legacy `animationScrollTrigger` attribute is migrated to slot
 * config at read-time by `migrateScrollAppearAttrs()` in
 * constants.js. The migration is idempotent and runs every render;
 * the next user edit writes the canonical slot attrs back to storage.
 *
 * Cross-cutting controls (Stagger, Play once, Remove) render below
 * the slot tabs, always visible regardless of which tab is active.
 */

import { useState } from '@wordpress/element';
import {
	TabPanel,
	ToggleControl,
	Button,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';

import {
	migrateScrollAppearAttrs,
	isStaggerCompatible,
} from './constants';
import SlotControls from './SlotControls';
import StaggerControls from './StaggerControls';
import SubPanelModeHeader from './SubPanelModeHeader';

export default function ScrollAppearControls( props ) {
	const {
		setAttributes,
		blockName,
		clientId,
		onRemove,
		onPreview,
		isPlayPending,
		onPaste,
		onReset,
	} = props;

	// Normalize legacy `animationScrollTrigger` + `animationType` into
	// the slot model on read. Idempotent — no-op when the block already
	// has Entry/Exit slot attrs set.
	const attributes = migrateScrollAppearAttrs( props.attributes );

	const entryType = attributes.animationEntryType || '';
	const exitType = attributes.animationExitType || '';
	const hasEntry = entryType !== '';

	// Active slot lives in component state, not in saved attributes.
	// Default to whichever slot is filled (Exit-only blocks open on
	// the Exit tab so the user lands on the relevant config).
	const [ activeSlot, setActiveSlot ] = useState(
		hasEntry || ! exitType ? 'entry' : 'exit'
	);

	// Stagger should be hidden whenever EITHER slot uses an
	// incompatible type (currently 'image-move' / 'image-zoom').
	// Stagger's CSS rules apply to the parent's class set; if any
	// slot can't compose with the cascade, the whole stagger feature
	// should be off. `isStaggerCompatible` checks both slots — see
	// constants.js for the canonical predicate.
	const staggerIncompatible = ! isStaggerCompatible( attributes );

	return (
		<div className="mb-sub-panel">
			<SubPanelModeHeader
				mode="scroll-appear"
				attributes={ attributes }
				setAttributes={ setAttributes }
				blockName={ blockName }
				clientId={ clientId }
				onPaste={ onPaste }
				onReset={ onReset }
				onRemove={ onRemove }
				helpText={ __(
					'Trigger animations when the element enters or exits the screen.',
					'motion-blocks'
				) }
			/>

			{ /* Entry / Exit slot tabs. The selected tab drives which
			   SlotControls renders below. Cross-cutting controls (Play
			   once, Stagger, Remove) sit outside the tabs so they're
			   always visible. */ }
			<TabPanel
				className="mb-slot-tabs"
				initialTabName={ activeSlot }
				onSelect={ ( name ) => name && setActiveSlot( name ) }
				tabs={ [
					{
						name: 'entry',
						title: __( 'Entry', 'motion-blocks' ),
					},
					{
						name: 'exit',
						title: __( 'Exit', 'motion-blocks' ),
					},
				] }
			>
				{ ( tab ) => (
					<SlotControls
						attributes={ attributes }
						setAttributes={ setAttributes }
						blockName={ blockName }
						slot={ tab.name }
						onPreview={ onPreview }
						isPlayPending={ isPlayPending }
					/>
				) }
			</TabPanel>

			{ /* Stagger — gated on parent block types + animation type.
			   Reads from the Entry slot's type since Stagger's CSS
			   bindings key on `mb-enter-{type}`. If only the Exit slot
			   is filled, stagger doesn't apply (the inner blocks have
			   no enter animation to cascade). */ }
			{ ! staggerIncompatible && (
				<StaggerControls
					attributes={ {
						...attributes,
						animationType: entryType || exitType,
					} }
					setAttributes={ setAttributes }
					blockName={ blockName }
					clientId={ clientId }
				/>
			) }

			{ /* Play once — only meaningful when Entry is the ONLY
			   filled slot. With Entry alone, the toggle gates whether
			   the entry animation replays on every scroll-past (off)
			   or fires exactly once and unobserves (on). With both
			   slots filled, the block naturally round-trips (Entry on
			   scroll-in, Exit on scroll-out, every time) and the
			   playOnce attribute is ignored by frontend.js — the
			   unobserve conditions require one slot empty. With only
			   Exit filled, the exit reverse-plays on scroll-back-up
			   for a smooth round-trip. In both two-state cases the
			   toggle is disabled and shown unchecked to match what
			   actually happens. */ }
			<ToggleControl
				label={ __( 'Play once', 'motion-blocks' ) }
				checked={
					hasEntry &&
					! hasExit &&
					!! attributes.animationPlayOnce
				}
				disabled={ ! ( hasEntry && ! hasExit ) }
				onChange={ ( value ) =>
					setAttributes( { animationPlayOnce: value } )
				}
				help={
					hasEntry && ! hasExit
						? __(
								'Animate the element only once when scrolling for the first time.',
								'motion-blocks'
						  )
						: hasEntry && hasExit
						? __(
								'Entry plays as you scroll in, Exit plays as you scroll out. Repeats each time.',
								'motion-blocks'
						  )
						: __(
								'Exit animations reverse-play when you scroll back up.',
								'motion-blocks'
						  )
				}
				__nextHasNoMarginBottom
			/>

			<Button
				variant="secondary"
				isDestructive
				className="mb-remove-button"
				onClick={ onRemove }
				__next40pxDefaultSize
			>
				{ __( 'Remove animation', 'motion-blocks' ) }
			</Button>
		</div>
	);
}
