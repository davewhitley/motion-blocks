/**
 * Lets the seconds fields (Duration, Delay, Stagger offset) take a
 * typed unit: "150ms" becomes 0.15, "0.5s" becomes 0.5 (GH #121).
 *
 * Values are still stored and shown in seconds. The fields are
 * NumberControls, which only allow digits while their input is
 * `type="number"`, so they are rendered as text inputs (the +/-
 * buttons and the arrow keys are NumberControl's own and keep
 * working) with a state reducer that swaps a finished "…ms" or "…s"
 * for the plain number of seconds.
 */
import { useRef } from '@wordpress/element';

const WITH_UNIT = /^\s*(\d+\.?\d*|\.\d+)\s*(ms|s)\s*$/i;

/**
 * @param {*} text What was typed.
 * @return {string|null} The seconds as a plain number string when
 *     `text` is a number with an "ms" or "s" unit, else null.
 */
export function secondsFromUnitText( text ) {
	const match = String( text ?? '' ).match( WITH_UNIT );
	if ( ! match ) {
		return null;
	}
	const number = parseFloat( match[ 1 ] );
	if ( match[ 2 ].toLowerCase() === 's' ) {
		return String( number );
	}
	// Whole milliseconds: 150ms is 0.15, never 0.15000000000000002.
	return String( Math.round( number ) / 1000 );
}

/**
 * Props to spread onto a seconds NumberControl.
 *
 * @return {Object} `type` and `__unstableStateReducer`.
 */
export function useSecondsInput() {
	// The text as last typed, for when the field is left half-way
	// through a unit ("150m"): NumberControl can't read that as a
	// number, so the digits typed so far are kept.
	const lastTyped = useRef( '' );
	return {
		type: 'text',
		inputMode: 'decimal',
		__unstableStateReducer: ( state ) => {
			const value = String( state.value ?? '' );
			const seconds = secondsFromUnitText( value );
			if ( seconds !== null ) {
				lastTyped.current = seconds;
				return { ...state, value: seconds };
			}
			// Left half-way through a unit: NumberControl turned the
			// text into "NaN" on blur or Enter.
			if ( value === 'NaN' ) {
				const digits = parseFloat( lastTyped.current );
				return {
					...state,
					value: Number.isFinite( digits )
						? String( Math.round( digits * 100 ) / 100 )
						: '',
				};
			}
			lastTyped.current = value;
			return state;
		},
	};
}
