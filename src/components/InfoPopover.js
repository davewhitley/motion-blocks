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
 * Hover on the icon shows a native one-line tooltip (Button's `label`
 * prop). Click opens the Popover with the richer content.
 *
 * Accessibility:
 *   - `aria-expanded` on the trigger reflects open/close state.
 *   - `focusOnMount="firstElement"` moves focus inside the popover so
 *     Escape (handled by WP's Popover) returns focus to the trigger.
 */

import { Button, Popover } from '@wordpress/components';
import { useState, useRef } from '@wordpress/element';
import { info } from '@wordpress/icons';
import { __ } from '@wordpress/i18n';

export default function InfoPopover( { children, label } ) {
	const [ open, setOpen ] = useState( false );
	const buttonRef = useRef( null );

	return (
		<>
			<Button
				ref={ buttonRef }
				icon={ info }
				size="small"
				label={ label || __( 'More information', 'motion-blocks' ) }
				className="mb-info-popover-toggle"
				aria-expanded={ open }
				onClick={ () => setOpen( ( v ) => ! v ) }
			/>
			{ open && buttonRef.current && (
				<Popover
					anchor={ buttonRef.current }
					placement="top"
					onClose={ () => setOpen( false ) }
					focusOnMount="firstElement"
					className="mb-info-popover"
				>
					<div className="mb-info-popover__body">
						{ children }
					</div>
				</Popover>
			) }
		</>
	);
}
