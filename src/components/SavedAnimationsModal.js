/**
 * Small Modal that prompts for a saved-animation name.
 *
 * Stateless — the parent owns the open/closed state and the submitted
 * value. Closes via Cancel button, ESC (Modal default), and the
 * submit handler.
 */
import {
	Modal,
	TextControl,
	Button,
	__experimentalHStack as HStack,
	__experimentalVStack as VStack,
} from '@wordpress/components';
import { useState, useRef, useEffect } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

export default function SavedAnimationsModal( {
	isOpen,
	defaultName = '',
	onSubmit,
	onCancel,
} ) {
	const [ name, setName ] = useState( defaultName );
	const inputRef = useRef( null );

	// Reset to the default name whenever the modal reopens — avoids
	// the previous save's value sticking around between opens.
	useEffect( () => {
		if ( isOpen ) {
			setName( defaultName );
		}
	}, [ isOpen, defaultName ] );

	if ( ! isOpen ) {
		return null;
	}

	const trimmed = name.trim();
	const canSubmit = trimmed.length > 0;

	const handleSubmit = ( e ) => {
		e.preventDefault();
		if ( ! canSubmit ) {
			return;
		}
		onSubmit( trimmed );
	};

	return (
		<Modal
			title={ __( 'Save animation', 'motion-blocks' ) }
			onRequestClose={ onCancel }
			className="mb-saved-animations-modal"
		>
			<form onSubmit={ handleSubmit }>
				<VStack spacing={ 4 }>
					<TextControl
						ref={ inputRef }
						label={ __( 'Name', 'motion-blocks' ) }
						value={ name }
						onChange={ setName }
						help={ __(
							'A short label so you can recognize this animation later.',
							'motion-blocks'
						) }
						__next40pxDefaultSize
						__nextHasNoMarginBottom
						autoFocus
					/>
					<HStack justify="flex-end" spacing={ 3 }>
						<Button
							variant="tertiary"
							onClick={ onCancel }
							__next40pxDefaultSize
						>
							{ __( 'Cancel', 'motion-blocks' ) }
						</Button>
						<Button
							variant="primary"
							type="submit"
							disabled={ ! canSubmit }
							__next40pxDefaultSize
						>
							{ __( 'Save', 'motion-blocks' ) }
						</Button>
					</HStack>
				</VStack>
			</form>
		</Modal>
	);
}
