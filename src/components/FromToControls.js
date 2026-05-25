/**
 * FromToControls — Editor for the `custom` animation type.
 *
 * Single-side-at-a-time UX: a From / To segmented toggle picks
 * which side the user is editing. Labels intentionally match the
 * CSS `@keyframes { from {...} to {...} }` vocabulary that the
 * underlying machinery emits, so anyone inspecting the generated
 * CSS sees the same terminology they clicked.
 *
 * (Internal attribute value still uses 'start'/'end' for
 * `animationFromToActiveSide` to avoid a data migration; the UI
 * label is the only thing that changed.)
 *
 * Properties are added/removed via WP's standard ToolsPanel kebab
 * dropdown — same component used by Border & Shadow, Typography,
 * Dimensions, etc. — so we get its checkbox-list, "Reset all",
 * focus management, and styling for free.
 *
 * "Not added" is encoded as `null` in the corresponding attribute.
 * Properties not added on a side are omitted from the generated
 * @keyframes, letting CSS interpolate to the element's computed
 * style on that end of the timeline.
 *
 * The ToolsPanel is keyed on `side` so it remounts when the user
 * flips Start↔End, giving each side its own clean panel state.
 *
 * **Slot support.** When the `slot` prop is set ('entry' or 'exit'),
 * this component reads/writes the per-slot keyframe attributes
 * (`animationEntryFromX`, `animationExitToX`, etc.) instead of the
 * shared `animationFromX` / `animationToX` pair. Callers that don't
 * pass a slot prop (Page Load Custom) fall back to the shared attrs —
 * unchanged behavior.
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
	ExternalLink,
} from '@wordpress/components';
import { createInterpolateElement, useEffect } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { seen, unseen } from '@wordpress/icons';

import {
	PROPERTY_DEFINITIONS,
	FROM_ATTR,
	TO_ATTR,
	TRANSLATE_UNIT_OPTIONS,
	IMAGE_TARGETABLE_BLOCKS,
	isPropertyAdded,
} from './constants';

/**
 * Compute the attribute-name maps for a slot.
 *
 * When `slot` is undefined or null, returns the shared attribute
 * maps (animationFromOpacity, animationToOpacity, …). When `slot`
 * is 'entry' or 'exit', returns slot-prefixed maps
 * (animationEntryFromOpacity, animationExitToOpacity, …).
 *
 * @param {?('entry'|'exit')} slot
 * @return {{ from: Object, to: Object }}
 */
function slotAttrMaps( slot ) {
	if ( ! slot ) {
		return { from: FROM_ATTR, to: TO_ATTR };
	}
	const prefix = slot === 'entry' ? 'animationEntry' : 'animationExit';
	const from = {};
	const to = {};
	for ( const prop of Object.keys( FROM_ATTR ) ) {
		// FROM_ATTR[prop] is 'animationFromOpacity' etc. Replace the
		// leading 'animationFrom' / 'animationTo' with the slot prefix.
		from[ prop ] = FROM_ATTR[ prop ].replace(
			/^animationFrom/,
			`${ prefix }From`
		);
		to[ prop ] = TO_ATTR[ prop ].replace(
			/^animationTo/,
			`${ prefix }To`
		);
	}
	return { from, to };
}

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
		// Clip path takes a free-form CSS value (`inset(...)`, `circle(...)`,
		// `polygon(...)`, etc.) that few users will know by heart. Surface
		// a one-line explanation + a link to the MDN reference so they
		// can copy a known-good string. Other text-kind properties (none
		// today, but room for future ones) get no help by default.
		const help =
			def.id === 'clipPath'
				? createInterpolateElement(
						__(
							'A CSS expression that masks the visible area of the element. <a>Learn about clip-path</a>.',
							'motion-blocks'
						),
						{
							a: (
								<ExternalLink
									href="https://developer.mozilla.org/en-US/docs/Web/CSS/clip-path"
								/>
							),
						}
				  )
				: undefined;
		return (
			<TextControl
				label={ __( def.label, 'motion-blocks' ) }
				value={
					value === null || value === undefined ? '' : String( value )
				}
				placeholder={ def.placeholder }
				help={ help }
				onChange={ ( v ) => onChange( v === '' ? def.identity : v ) }
				__nextHasNoMarginBottom
				__next40pxDefaultSize
			/>
		);
	}

	if ( def.unitSuffix ) {
		// Storage shape is the unit-bearing CSS string (`"45deg"`,
		// `"8px"`). Display: if the stored value already has the
		// unit (canonical), pass it through; if it's still a bare
		// number from legacy data, format it for display. onChange:
		// strip the unit, re-append it from `def.unitSuffix` so the
		// stored value is always normalized to the canonical unit
		// (even if someone typed `45rad` somehow — UnitControl's
		// `units` list locks it to one option).
		const stringValue = ( () => {
			if ( value === null || value === undefined ) {
				return '';
			}
			const s = String( value );
			// Already unit-bearing (canonical or any other unit) —
			// use as-is. UnitControl handles parsing.
			if ( /[a-z%]/i.test( s ) ) {
				return s;
			}
			// Bare number (legacy) — format for display.
			return `${ s }${ def.unitSuffix }`;
		} )();
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
					if ( ! match ) {
						onChange( def.identity );
						return;
					}
					const n = parseFloat( match[ 1 ] );
					onChange(
						Number.isFinite( n )
							? `${ n }${ def.unitSuffix }`
							: def.identity
					);
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

	// RangeControl needs a plain number. For unit-bearing properties
	// (rotate, blur — both can have withSlider) the stored value is
	// a string like `"45deg"`; parse it back to a number for display
	// and re-append the unit on dispatch so storage stays canonical.
	const stripUnit = ( v ) => {
		if ( v === null || v === undefined ) {
			return null;
		}
		const m = String( v ).match( /^(-?\d*\.?\d+)/ );
		return m ? parseFloat( m[ 1 ] ) : null;
	};
	const numericValue = def.unitSuffix
		? stripUnit( value ) ?? stripUnit( def.identity ) ?? 0
		: value === null || value === undefined
		? def.identity
		: value;
	const handleSliderChange = ( v ) => {
		if ( v === undefined ) {
			onChange( def.identity );
			return;
		}
		onChange( def.unitSuffix ? `${ v }${ def.unitSuffix }` : v );
	};

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
					onChange={ handleSliderChange }
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

export default function FromToControls( {
	attributes,
	setAttributes,
	blockName,
	slot,
} ) {
	// `side` lives in an attribute so it survives remounts of this
	// component (e.g. when the Play-preview hack clears animationType
	// briefly to retrigger CSS animation).
	const side = attributes.animationFromToActiveSide || 'start';
	const setSide = ( newSide ) =>
		setAttributes( { animationFromToActiveSide: newSide } );

	const { from: fromMap, to: toMap } = slotAttrMaps( slot );
	const attrMap = side === 'start' ? fromMap : toMap;
	const panelId = `mb-from-to-${ slot || 'shared' }-${ side }`;
	const previewSide = attributes.animationFromToPreviewSide || 'off';
	const isPreviewing = previewSide !== 'off';
	const target = attributes.animationFromToTarget || 'block';

	// Show the Target toggle only on blocks where "Image only" is
	// meaningful — single-image blocks where we know which img to
	// animate. For other blocks ("the image inside" is ambiguous),
	// users should drop down to the inner Image block instead.
	const supportsImgTarget =
		blockName && IMAGE_TARGETABLE_BLOCKS.includes( blockName );

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


	// Help text rendered via the ToggleGroupControl's native `help`
	// prop. The trickiest part of the From/To model is that omitted
	// properties don't mean "identity" — they fall through to whatever
	// the element looks like naturally on that end of the timeline.
	// The second sentence surfaces that, framed as "properties you
	// don't add" to match the ToolsPanel kebab UX (add a row to track
	// a property; don't add it = leave it alone).
	const sideHelp =
		side === 'start'
			? __(
					"Adjust how the block looks at the start of the animation. Properties you don't add use the block's normal styling.",
					'motion-blocks'
			  )
			: __(
					"Adjust how the block looks at the end of the animation. Properties you don't add use the block's normal styling.",
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
			{ supportsImgTarget && (
				<ToggleGroupControl
					value={ target }
					onChange={ ( v ) =>
						setAttributes( { animationFromToTarget: v } )
					}
					isBlock
					label={ __( 'Target', 'motion-blocks' ) }
					help={
						target === 'img'
							? __(
									'Animates only the image. The wrapper acts as a clipping frame so transforms stay inside its natural area.',
									'motion-blocks'
							  )
							: __(
									'Animates the whole block, including any caption or surrounding markup.',
									'motion-blocks'
							  )
					}
					__nextHasNoMarginBottom
				>
					<ToggleGroupControlOption
						value="block"
						label={ __( 'Entire block', 'motion-blocks' ) }
					/>
					<ToggleGroupControlOption
						value="img"
						label={ __( 'Image only', 'motion-blocks' ) }
					/>
				</ToggleGroupControl>
			) }

			{ /* Segmented toggle for the Start/End side picker. Earlier
			   versions used a styled TabPanel here; in the slot model
			   the panel already has Entry/Exit tabs at the top level,
			   so a second row of tabs would create visual nested-tabs
			   confusion. ToggleGroupControl distinguishes the inner
			   side-picker from the outer slot tabs by metaphor. */ }
			<ToggleGroupControl
				label={ __( 'Edit side', 'motion-blocks' ) }
				value={ side }
				onChange={ ( newSide ) => newSide && setSide( newSide ) }
				isBlock
				help={ sideHelp }
				__nextHasNoMarginBottom
			>
				{ /* Values stay 'start'/'end' for backward compat with
				   the `animationFromToActiveSide` attribute; only the
				   labels switched to From/To to match the underlying
				   CSS @keyframes vocabulary. */ }
				<ToggleGroupControlOption
					value="start"
					label={ __( 'From', 'motion-blocks' ) }
				/>
				<ToggleGroupControlOption
					value="end"
					label={ __( 'To', 'motion-blocks' ) }
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
							? __( 'Preview from state', 'motion-blocks' )
							: __( 'Preview to state', 'motion-blocks' )
					}
					onClick={ togglePreview }
				/>
			<ToolsPanel
				key={ `${ slot || 'shared' }-${ side }` }
				label={
					side === 'start'
						? __( 'From Properties', 'motion-blocks' )
						: __( 'To Properties', 'motion-blocks' )
				}
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
							isShownByDefault={ !! def.isShownByDefault }
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

			{ /*
			 * Clip-parent-overflow used to be rendered here, but the
			 * setting applies to any animation that paints past the
			 * block's natural bounds (Slide In with big offsets,
			 * Custom translate, etc.) — not just Custom From/To. It
			 * now lives on the parent mode panel (PageLoadControls /
			 * ScrollAppearControls) so it's available for all
			 * presets, not gated behind Custom mode.
			 */ }
		</div>
	);
}
