/**
 * InfoPopover — small "i" icon-button that opens a Popover with
 * supplementary help content on click.
 *
 * Pattern: place next to a control's label (typically inside a
 * `BaseControl + BaseControl.VisualLabel + HStack` wrapper) for a
 * subtle "what does this do?" affordance that doesn't add a noisy
 * permanent help-text line under the control.
 *
 *   <BaseControl __nextHasNoMarginBottom>
 *     <HStack alignment="center" spacing={ 1 } justify="flex-start">
 *       <BaseControl.VisualLabel>{ label }</BaseControl.VisualLabel>
 *       <InfoPopover label={ __( 'About thing', 'motion-blocks' ) }>
 *         <p>{ __( 'Explanation…', 'motion-blocks' ) }</p>
 *       </InfoPopover>
 *     </HStack>
 *     <RangeControl ... />
 *   </BaseControl>
 *
 * Built on `Dropdown` (not a raw `Popover` + manual open state) so the
 * dismissal logic is handled for us:
 *   - Escape closes and returns focus to the toggle.
 *   - Click outside closes.
 *   - Click the toggle while open closes (a raw Popover + onFocusOutside
 *     can't do this — the outside-click handler and the toggle's own
 *     onClick fight, reopening it).
 *
 * Accessibility:
 *   - `label` sets the toggle's `aria-label` — required, since this is
 *     an icon-only button with no text.
 *   - `aria-expanded` reflects open/close state (wired from Dropdown's
 *     `isOpen`).
 *   - `showTooltip={ false }` drops the redundant visual hover tooltip
 *     while keeping the aria-label; the info icon already signals the
 *     affordance and clicking reveals the real content.
 */

import { Button, Dropdown } from '@wordpress/components';
import { info } from '@wordpress/icons';
import { __ } from '@wordpress/i18n';

export default function InfoPopover( { children, label } ) {
	return (
		<Dropdown
			className="mb-info-popover-dropdown"
			popoverProps={ {
				className: 'mb-info-popover',
				placement: 'top',
				// `focusOnMount: 'container'` is required for click-outside
				// dismissal to work. WP detects outside interaction by
				// watching for focus *leaving* the popover — but our
				// content is prose with no focusable element, so without
				// this, focus never enters the popover and the "focus
				// left" event never fires, leaving outside clicks
				// undetected. Focusing the container itself arms it.
				// (Matches the Block Visibility plugin's InformationPopover.)
				focusOnMount: 'container',
				// Modern WP `Popover` defaults `noArrow` to true (no
				// caret). Opt back in so the popover has the little
				// pointer aimed at the info icon — the visual tie
				// between trigger and content.
				noArrow: false,
			} }
			renderToggle={ ( { isOpen, onToggle } ) => (
				<Button
					icon={ info }
					size="small"
					label={
						label || __( 'More information', 'motion-blocks' )
					}
					showTooltip={ false }
					className="mb-info-popover-toggle"
					aria-expanded={ isOpen }
					onClick={ onToggle }
				/>
			) }
			renderContent={ () => (
				<div className="mb-info-popover__body">{ children }</div>
			) }
		/>
	);
}
