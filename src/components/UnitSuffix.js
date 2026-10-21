/**
 * Unit suffixes for the bare NumberControls in the mode panels (GH #65).
 *
 * Duration, Delay and Stagger offset are seconds; the preset Rotate
 * Angle is degrees. NumberControl renders a caller's `suffix` ahead of
 * its own +/- spin buttons, the same way core's AnglePickerControl
 * shows its "°".
 */
import { __experimentalInputControlSuffixWrapper as InputControlSuffixWrapper } from '@wordpress/components';
import { __, _x, sprintf } from '@wordpress/i18n';

import { TIMING_SOFT_MAX_SECONDS, isLongTiming } from './constants';

/**
 * Wraps a unit label in core's suffix wrapper. Falls back to a plain
 * span on older cores (plugin floor is WP 6.2) where the experimental
 * export may be missing, so the panel never renders `undefined`.
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
	// Untranslated, like core's AnglePickerControl.
	return <UnitSuffix>°</UnitSuffix>;
}

/**
 * Help text for a Duration / Delay field: a soft warning when the
 * value looks like milliseconds, otherwise nothing.
 *
 * @param {*} value Current field value.
 * @return {string|undefined} Warning text, or undefined for no help.
 */
export function longTimingHelp( value ) {
	if ( ! isLongTiming( value ) ) {
		return undefined;
	}
	return sprintf(
		/* translators: %d: number of seconds */
		__(
			'That is longer than %d seconds. Times are in seconds, not milliseconds.',
			'motion-blocks'
		),
		TIMING_SOFT_MAX_SECONDS
	);
}
