/**
 * AnimationOptionsMenu — dropdown menu for the moreVertical button
 * in each animation sub-panel header.
 *
 * Provides Copy / Paste animation actions using a module-level
 * variable that persists across block selections within the session.
 */

import { DropdownMenu, MenuGroup, MenuItem } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { moreVertical, copy, reset, trash } from '@wordpress/icons';

import { DEFAULT_ATTRIBUTES } from './constants';

const ANIMATION_KEYS = Object.keys( DEFAULT_ATTRIBUTES );

/**
 * Module-level clipboard — persists across block selections
 * within the current editor session.
 */
let copiedAnimation = null;

/**
 * Extract only animation attributes from a full attributes object.
 */
function pickAnimationAttributes( attributes ) {
	const picked = {};
	ANIMATION_KEYS.forEach( ( key ) => {
		if ( attributes[ key ] !== undefined ) {
			picked[ key ] = attributes[ key ];
		}
	} );
	return picked;
}

export default function AnimationOptionsMenu( { attributes, onPaste, onReset, onRemove, pasteOnly } ) {
	const handleCopy = ( onClose ) => {
		copiedAnimation = pickAnimationAttributes( attributes );
		onClose();
	};

	const handlePaste = ( onClose ) => {
		if ( copiedAnimation ) {
			onPaste( { ...copiedAnimation } );
		}
		onClose();
	};

	return (
		<DropdownMenu
			icon={ moreVertical }
			label={ __( 'Options', 'motion-blocks' ) }
			className="mb-options-button"
			toggleProps={ { size: 'small' } }
		>
			{ ( { onClose } ) => (
				<>
					<MenuGroup>
						{ ! pasteOnly && (
							<MenuItem
								icon={ copy }
								onClick={ () => handleCopy( onClose ) }
							>
								{ __( 'Copy animation', 'motion-blocks' ) }
							</MenuItem>
						) }
						<MenuItem
							disabled={ ! copiedAnimation }
							onClick={ () => handlePaste( onClose ) }
						>
							{ __( 'Paste animation', 'motion-blocks' ) }
						</MenuItem>
					</MenuGroup>
					{ ! pasteOnly && (
						<MenuGroup>
							<MenuItem
								icon={ reset }
								onClick={ () => {
									onReset();
									onClose();
								} }
							>
								{ __( 'Reset settings', 'motion-blocks' ) }
							</MenuItem>
							<MenuItem
								icon={ trash }
								isDestructive
								onClick={ () => {
									onRemove();
									onClose();
								} }
							>
								{ __( 'Remove animation', 'motion-blocks' ) }
							</MenuItem>
						</MenuGroup>
					) }
				</>
			) }
		</DropdownMenu>
	);
}
