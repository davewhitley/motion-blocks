/**
 * FromToControls — Editor for the `custom` animation type.
 *
 * Single-side-at-a-time UX: a Start / End toggle picks which side
 * the user is editing. Properties are added/removed via WP's
 * standard ToolsPanel kebab dropdown — same component used by
 * Border & Shadow, Typography, Dimensions, etc. — so we get its
 * checkbox-list, "Reset all", focus management, and styling for
 * free.
 *
 * "Not added" is encoded as `null` in the corresponding attribute.
 * Properties not added on a side are omitted from the generated
 * @keyframes, letting CSS interpolate to the element's computed
 * style on that end of the timeline.
 *
 * The ToolsPanel is keyed on `side` so it remounts when the user
 * flips Start↔End, giving each side its own clean panel state.
 */

import {
	__experimentalToggleGroupControl as ToggleGroupControl,
	__experimentalToggleGroupControlOption as ToggleGroupControlOption,
	__experimentalToolsPanel as ToolsPanel,
	__experimentalToolsPanelItem as ToolsPanelItem,
	__experimentalUnitControl as UnitControl,
	__experimentalNumberControl as NumberControl,
	__experimentalHStack as HStack,
	FlexBlock,
	RangeControl,
	TextControl,
	Button,
} from '@wordpress/components';
import { useEffect } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { seen, unseen } from '@wordpress/icons';

import {
	PROPERTY_DEFINITIONS,
	FROM_ATTR,
	TO_ATTR,
	TRANSLATE_UNIT_OPTIONS,
	isPropertyAdded,
} from './constants';

/**
 * Render the input control for a property based on its kind:
 *
 * - `length` → UnitControl with the full unit list (px, %, vh, …).
 * - `text`   → TextControl (free-form CSS, e.g. clip-path values).
 * - number with `unitSuffix` → UnitControl locked to one unit.
 * - plain number → NumberControl with +/- spin buttons.
 *
 * Numbers are stored as numbers; strings as strings. We marshal at
 * the UnitControl boundary since UnitControl works with CSS strings.
 */
function PropertyInput( { def, value, onChange } ) {
	if ( def.kind === 'length' ) {
		return (
			<UnitControl
				label={ __( def.label, 'motion-blocks' ) }
				value={ value ?? '0px' }
				onChange={ ( v ) => onChange( v || def.identity ) }
				units={ TRANSLATE_UNIT_OPTIONS }
				__next40pxDefaultSize
			/>
		);
	}

	if ( def.kind === 'text' ) {
		return (
			<TextControl
				label={ __( def.label, 'motion-blocks' ) }
				value={
					value === null || value === undefined ? '' : String( value )
				}
				placeholder={ def.placeholder }
				onChange={ ( v ) => onChange( v === '' ? def.identity : v ) }
				__nextHasNoMarginBottom
				__next40pxDefaultSize
			/>
		);
	}

	if ( def.unitSuffix ) {
		const stringValue =
			value === null || value === undefined
				? ''
				: `${ value }${ def.unitSuffix }`;
		return (
			<UnitControl
				label={ __( def.label, 'motion-blocks' ) }
				value={ stringValue }
				onChange={ ( v ) => {
					if ( ! v ) {
						onChange( def.identity );
						return;
					}
					const match = String( v ).match( /^(-?\d*\.?\d+)/ );
					onChange( match ? parseFloat( match[ 1 ] ) : def.identity );
				} }
				units={ [
					{
						value: def.unitSuffix,
						label: def.unitSuffix,
						default: 0,
					},
				] }
				__next40pxDefaultSize
			/>
		);
	}

	return (
		<NumberControl
			label={ __( def.label, 'motion-blocks' ) }
			value={ value === null || value === undefined ? '' : value }
			min={ def.min }
			max={ def.max }
			step={ def.step ?? 0.1 }
			spinControls="custom"
			onChange={ ( v ) => {
				if ( v === '' || v === undefined || v === null ) {
					onChange( def.identity );
					return;
				}
				const n = parseFloat( v );
				onChange( Number.isFinite( n ) ? n : def.identity );
			} }
			__next40pxDefaultSize
		/>
	);
}

/**
 * Compose the input + optional inline slider for a property.
 *
 * - `def.withSlider`: renders the input (NumberControl/UnitControl)
 *   on the left half and a `RangeControl` slider on the right half,
 *   sharing the same value. Used for properties with a sensible
 *   numeric range (Opacity 0-1, Scale 0-3, Rotate -180-180).
 * - Otherwise: just renders the input control alone.
 */
function PropertyRow( { def, value, onChange } ) {
	if ( ! def.withSlider ) {
		return (
			<PropertyInput
				def={ def }
				value={ value }
				onChange={ onChange }
			/>
		);
	}

	const numericValue =
		value === null || value === undefined
			? def.identity
			: value;

	return (
		<HStack alignment="bottom" spacing={ 3 }>
			<FlexBlock>
				<PropertyInput
					def={ def }
					value={ value }
					onChange={ onChange }
				/>
			</FlexBlock>
			<FlexBlock>
				<RangeControl
					label={ __( def.label, 'motion-blocks' ) }
					hideLabelFromVision
					value={ numericValue }
					onChange={ ( v ) =>
						onChange( v === undefined ? def.identity : v )
					}
					min={ def.sliderMin ?? def.min }
					max={ def.sliderMax ?? def.max }
					step={ def.step }
					withInputField={ false }
					__nextHasNoMarginBottom
					__next40pxDefaultSize
				/>
			</FlexBlock>
		</HStack>
	);
}

export default function FromToControls( { attributes, setAttributes } ) {
	// `side` lives in an attribute so it survives remounts of this
	// component (e.g. when the Play-preview hack clears animationType
	// briefly to retrigger CSS animation).
	const side = attributes.animationFromToActiveSide || 'start';
	const setSide = ( newSide ) =>
		setAttributes( { animationFromToActiveSide: newSide } );
	const attrMap = side === 'start' ? FROM_ATTR : TO_ATTR;
	const panelId = `mb-from-to-${ side }`;
	const previewSide = attributes.animationFromToPreviewSide || 'off';
	const isPreviewing = previewSide !== 'off';

	/**
	 * Toggle the static-state preview for the active side.
	 * - Off → preview the current side
	 * - Previewing the current side → off
	 * - Previewing the other side → switch to the current side
	 *   (handled implicitly by the side-sync effect below)
	 */
	const togglePreview = () => {
		setAttributes( {
			animationFromToPreviewSide: isPreviewing ? 'off' : side,
		} );
	};

	/**
	 * Keep the preview synced to whichever side the user is editing.
	 * If they flip the Start/End toggle while preview is on, follow.
	 */
	useEffect( () => {
		if ( isPreviewing && previewSide !== side ) {
			setAttributes( { animationFromToPreviewSide: side } );
		}
	}, [ side, isPreviewing, previewSide, setAttributes ] );


	const sideHelp =
		side === 'start'
			? __(
					'Edit the properties of the animation’s start state.',
					'motion-blocks'
			  )
			: __(
					'Edit the properties of the animation’s end state.',
					'motion-blocks'
			  );

	/**
	 * ToolsPanel's "Reset all" — collects each item's resetAllFilter
	 * into a single setAttributes call.
	 */
	const resetAll = ( filters ) => {
		let updates = {};
		filters.forEach( ( filter ) => {
			updates = filter( updates );
		} );
		setAttributes( updates );
	};

	return (
		<div className="mb-from-to">
			<ToggleGroupControl
				value={ side }
				onChange={ setSide }
				isBlock
				label={ __( 'Start and end', 'motion-blocks' ) }
				help={ sideHelp }
				__nextHasNoMarginBottom
			>
				<ToggleGroupControlOption
					value="start"
					label={ __( 'Start', 'motion-blocks' ) }
				/>
				<ToggleGroupControlOption
					value="end"
					label={ __( 'End', 'motion-blocks' ) }
				/>
			</ToggleGroupControl>

			{ /*
			 * `key={side}` forces ToolsPanel to remount when the user
			 * flips Start↔End so each side keeps its own panel state
			 * (which items are visible / "manually shown"). Without
			 * this, ToolsPanel's internal state would leak across
			 * sides because the same items are rendered for both.
			 *
			 * The wrapper div is `position: relative` so the eye-icon
			 * preview button (rendered after the panel) can sit
			 * absolutely-positioned over the panel header next to
			 * the kebab.
			 */ }
			<div className="mb-from-to__panel-wrapper">
				<Button
					className="mb-from-to__preview-toggle"
					icon={ isPreviewing ? seen : unseen }
					isPressed={ isPreviewing }
					size="small"
					label={
						isPreviewing
							? __( 'Stop previewing', 'motion-blocks' )
							: side === 'start'
							? __( 'Preview start state', 'motion-blocks' )
							: __( 'Preview end state', 'motion-blocks' )
					}
					onClick={ togglePreview }
				/>
			<ToolsPanel
				key={ side }
				label={ __( 'Properties', 'motion-blocks' ) }
				resetAll={ resetAll }
				panelId={ panelId }
			>
				{ PROPERTY_DEFINITIONS.map( ( def ) => {
					const attrName = attrMap[ def.id ];
					const value = attributes[ attrName ];
					return (
						<ToolsPanelItem
							key={ def.id }
							panelId={ panelId }
							label={ __( def.label, 'motion-blocks' ) }
							hasValue={ () => isPropertyAdded( value ) }
							onSelect={ () =>
								setAttributes( {
									[ attrName ]: def.identity,
								} )
							}
							onDeselect={ () =>
								setAttributes( { [ attrName ]: null } )
							}
							resetAllFilter={ ( updates ) => ( {
								...updates,
								[ attrName ]: null,
							} ) }
							isShownByDefault={ false }
							className={
								def.halfWidth ? 'single-column' : undefined
							}
						>
							<PropertyRow
								def={ def }
								value={ value }
								onChange={ ( v ) =>
									setAttributes( { [ attrName ]: v } )
								}
							/>
						</ToolsPanelItem>
					);
				} ) }
			</ToolsPanel>
			</div>
		</div>
	);
}
