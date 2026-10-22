/**
 * Unit suffixes for the bare NumberControls in the mode panels (GH #65).
 *
 * Duration, Delay and Stagger offset are seconds; the preset Rotate
 * Angle is degrees (shown as "deg", like the Custom rotate fields). NumberControl renders a caller's `suffix` ahead of
 * its own +/- spin buttons, the same way core's AnglePickerControl
 * shows its "°".
 */
import { __experimentalInputControlSuffixWrapper as InputControlSuffixWrapper } from '@wordpress/components';
import { _x } from '@wordpress/i18n';

/**
 * Wraps a unit label in core's suffix wrapper. Falls back to a plain
 * span if a future core drops the experimental export, so the panel
 * never renders `undefined`.
 *
 * The `control` variant trims the end padding by 4px. Duration and
 * Delay sit side by side in the sidebar, and with the default padding
 * a value like "0.25" no longer fits beside the unit and spin buttons.
 *
 * @param {Object}  props
 * @param {Element} props.children Unit label.
 */
export function UnitSuffix( { children } ) {
	if ( ! InputControlSuffixWrapper ) {
		return <span className="mb-unit-suffix">{ children }</span>;
	}
	return (
		<InputControlSuffixWrapper variant="control">
			{ children }
		</InputControlSuffixWrapper>
	);
}

export function SecondsSuffix() {
	return (
		<UnitSuffix>
			{ _x( 's', 'abbreviation for seconds', 'motion-blocks' ) }
		</UnitSuffix>
	);
}

export function DegreesSuffix() {
	// "deg", matching the Custom From/To rotate fields (the CSS unit).
	return <UnitSuffix>deg</UnitSuffix>;
}
