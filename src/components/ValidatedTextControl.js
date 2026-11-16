/**
 * A text field that says when its value will be ignored (GH #59).
 *
 * Clip path and the Custom timing function take free-form CSS. A typo
 * (`ease-in-cubic`, `inset(0 50)`) used to stay in the field while the
 * animation quietly played with the default, with nothing to say why.
 *
 * The message shows once focus leaves the field, so a value isn't
 * called wrong while it is still being typed, and for a saved value
 * that is already wrong.
 */
import { TextControl } from '@wordpress/components';
import { useState } from '@wordpress/element';

/**
 * @param {Object}   props
 * @param {Function} props.validate Returns an error message or null.
 * @param {*}        props.value    Field value.
 * @param {*}        [props.help]   Help shown under the field.
 * @return {Element} A TextControl; takes every TextControl prop.
 */
export default function ValidatedTextControl( {
	validate,
	value,
	help,
	...props
} ) {
	const [ isFocused, setIsFocused ] = useState( false );
	const error = isFocused ? null : validate( value );
	return (
		<TextControl
			{ ...props }
			value={ value }
			className={ error ? 'mb-field-has-error' : undefined }
			aria-invalid={ error ? true : undefined }
			help={
				error ? (
					<>
						<span className="mb-field-error" role="alert">
							{ error }
						</span>
						{ help ? <> { help }</> : null }
					</>
				) : (
					help
				)
			}
			onFocus={ () => setIsFocused( true ) }
			onBlur={ () => setIsFocused( false ) }
		/>
	);
}
