/**
 * SubPanelModeHeader — sub-panel header with an in-place mode
 * picker.
 *
 * Replaces the static `[Icon] [Title]` markup that lived
 * separately in each of the three mode sub-panels (PageLoad,
 * ScrollAppear, ScrollInteractive). The title is now a click-to-
 * open DropdownMenu listing all three modes; picking a different
 * mode dispatches `switchModeAttributes()` from constants.js so
 * the user keeps their effect, direction, duration, From/To
 * values, etc. across the switch.
 *
 * The kebab `<AnimationOptionsMenu>` (Copy / Paste / Apply to all
 * / Save / Reset / Remove) stays where it was, right of the
 * title row.
 */

import {
	Icon,
	Button,
	Dropdown,
	MenuGroup,
	MenuItem,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { desktop, seen, chevronDown } from '@wordpress/icons';

import AnimationOptionsMenu from './AnimationOptionsMenu';
import {
	MODE_META,
	MODE_ORDER,
	switchModeAttributes,
} from './constants';
import { scrollInteractiveIcon } from './icons';

// Resolve the icon name carried in MODE_META to a real icon. Kept
// outside constants.js so that file stays React-free (no JSX
// imports).
const ICON_BY_NAME = {
	desktop,
	seen,
	scrollInteractive: scrollInteractiveIcon,
};

function getIcon( mode ) {
	const name = MODE_META[ mode ]?.iconName;
	return ICON_BY_NAME[ name ];
}

function getLabel( mode ) {
	// Wrap in __() so the translation pipeline picks up the strings.
	// The dictionary keys are static so the labels themselves are
	// translatable in plain (non-dynamic) lookups.
	switch ( mode ) {
		case 'page-load':
			return __( 'On page load', 'motion-blocks' );
		case 'scroll-appear':
			return __( 'Appear on scroll', 'motion-blocks' );
		case 'scroll-interactive':
			return __( 'Interactive scroll', 'motion-blocks' );
		default:
			return '';
	}
}

export default function SubPanelModeHeader( {
	mode,
	attributes,
	setAttributes,
	helpText,
	blockName,
	clientId,
	onPaste,
	onReset,
	onRemove,
} ) {
	return (
		<div className="mb-sub-panel-header">
			<div className="mb-sub-panel-title-row">
				<Dropdown
					className="mb-mode-picker"
					popoverProps={ { placement: 'bottom-start' } }
					renderToggle={ ( { isOpen, onToggle } ) => (
						<Button
							type="button"
							className="mb-mode-picker__toggle"
							aria-expanded={ isOpen }
							aria-label={ __(
								'Change animation mode',
								'motion-blocks'
							) }
							onClick={ onToggle }
						>
							<Icon icon={ getIcon( mode ) } size={ 24 } />
							<span className="mb-sub-panel-title">
								{ getLabel( mode ) }
							</span>
							<Icon icon={ chevronDown } size={ 18 } />
						</Button>
					) }
					renderContent={ ( { onClose } ) => (
						<MenuGroup>
							{ MODE_ORDER.map( ( m ) => (
								<MenuItem
									key={ m }
									icon={ getIcon( m ) }
									disabled={ m === mode }
									onClick={ () => {
										setAttributes(
											switchModeAttributes(
												attributes,
												m
											)
										);
										onClose();
									} }
								>
									{ getLabel( m ) }
								</MenuItem>
							) ) }
						</MenuGroup>
					) }
				/>
				<AnimationOptionsMenu
					attributes={ attributes }
					blockName={ blockName }
					clientId={ clientId }
					onPaste={ onPaste }
					onReset={ onReset }
					onRemove={ onRemove }
				/>
			</div>
			{ helpText && (
				<p className="mb-help-text">{ helpText }</p>
			) }
		</div>
	);
}
