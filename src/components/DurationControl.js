/**
 * Duration field for the Page Load and Scroll Appear panels.
 *
 * The field commits on every keystroke, so emptying it used to save a
 * Duration of 0: the block then appeared with no motion on the page
 * (GH #136). An empty field now means "the default": the default is
 * saved, and the field stays empty, showing the default as a
 * placeholder, until something is typed or focus leaves it.
 */
import { __experimentalNumberControl as NumberControl } from '@wordpress/components';
import { useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { SecondsSuffix } from './UnitSuffix';

/**
 * @param {Object}   props
 * @param {number}   props.value        Stored Duration, in seconds.
 * @param {number}   props.defaultValue Duration to save for an empty field.
 * @param {number}   [props.min]        Smallest Duration allowed.
 * @param {Function} props.onChange     Called with the Duration to save.
 * @return {Element} The field.
 */
export default function DurationControl( {
	value,
	defaultValue,
	min = 0,
	onChange,
} ) {
	const [ isBlank, setIsBlank ] = useState( false );
	return (
		<NumberControl
			label={ __( 'Duration', 'motion-blocks' ) }
			value={ isBlank ? '' : value }
			placeholder={ String( Math.max( defaultValue, min ) ) }
			min={ min }
			step={ 0.01 }
			// Keep two decimals (0.25) when typed; +/- and arrow keys
			// still move by 0.1 (step × spinFactor).
			spinFactor={ 10 }
			spinControls="custom"
			suffix={ <SecondsSuffix /> }
			onChange={ ( next ) => {
				const blank = next === '' || next === undefined;
				setIsBlank( blank );
				onChange(
					Math.max(
						blank ? defaultValue : parseFloat( next ) || 0,
						min
					)
				);
			} }
			onBlur={ () => setIsBlank( false ) }
			__next40pxDefaultSize
		/>
	);
}
