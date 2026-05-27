/**
 * SlotControls — Per-slot configuration for the Scroll Appear panel.
 *
 * Renders the Effect dropdown, optional direction / blur / rotate
 * sub-controls, and per-slot timing (Duration / Delay / Acceleration)
 * for ONE slot: either Entry or Exit. The parent `ScrollAppearControls`
 * mounts two of these inside its Tabs, one per slot.
 *
 * Data model: reads/writes `animationEntry*` attributes when
 * `slot === 'entry'`, `animationExit*` when `slot === 'exit'`. The
 * slot prop is used to construct attribute names on the fly via
 * `attrName(key)` — no per-slot duplication of the control tree.
 *
 * Effect == '' means the slot is empty (no animation for that phase).
 * The first dropdown entry, "None", writes empty and clears the
 * other slot attrs so the saved data stays tidy.
 */

import {
	BaseControl,
	SelectControl,
	RangeControl,
	TextControl,
	__experimentalToggleGroupControl as ToggleGroupControl,
	__experimentalToggleGroupControlOption as ToggleGroupControlOption,
	__experimentalToggleGroupControlOptionIcon as ToggleGroupControlOptionIcon,
	__experimentalHStack as HStack,
	__experimentalNumberControl as NumberControl,
	__experimentalToolsPanel as ToolsPanel,
	__experimentalToolsPanelItem as ToolsPanelItem,
	ToggleControl,
	FlexBlock,
	Button,
	Notice,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import {
	arrowUp,
	arrowDown,
	arrowLeft,
	arrowRight,
} from '@wordpress/icons';
import { SVG, Path } from '@wordpress/primitives';

import {
	ENTRY_TYPE_OPTIONS,
	EXIT_TYPE_OPTIONS,
	DIRECTION_OPTIONS,
	TYPES_WITH_DIRECTION,
	DEFAULT_DIRECTION,
	ACCELERATION_OPTIONS,
	REPLAY_OPTIONS,
	BLUR_SETTINGS,
	IMAGE_EFFECT_TYPES,
	IMAGE_EFFECT_BLOCKS,
	IMAGE_TARGETABLE_BLOCKS,
	isImageTargetUnavailable,
	customDefaultFromToForSlot,
	hasAnyCustomFromToSet,
	presetToSlotFromToAttributes,
} from './constants';
import FromToControls from './FromToControls';

const playIcon = (
	<SVG xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
		<Path d="M8 5.14v13.72l11-6.86L8 5.14z" />
	</SVG>
);

const DIRECTION_ICON_MAP = {
	btt: arrowUp,
	ttb: arrowDown,
	ltr: arrowRight,
	rtl: arrowLeft,
};

/**
 * Capitalize-first helper for building attribute names like
 * `animationEntryType` from a slot id.
 */
function pascal( slot ) {
	return slot === 'entry' ? 'Entry' : 'Exit';
}

export default function SlotControls( {
	attributes,
	setAttributes,
	blockName,
	slot, // 'entry' | 'exit'
	onPreview,
	isPlayPending,
} ) {
	const P = pascal( slot );
	const attrName = ( key ) => `animation${ P }${ key }`;

	const animationType = attributes[ attrName( 'Type' ) ] || '';
	const animationDirection = attributes[ attrName( 'Direction' ) ] || '';
	const animationDuration = attributes[ attrName( 'Duration' ) ];
	const animationDelay = attributes[ attrName( 'Delay' ) ];
	const animationAcceleration =
		attributes[ attrName( 'Acceleration' ) ] || 'ease';
	const animationCustomTimingFunction =
		attributes[ attrName( 'CustomTimingFunction' ) ] || '';
	const animationBlurAmount = attributes[ attrName( 'BlurAmount' ) ];
	const animationRotateAngle = attributes[ attrName( 'RotateAngle' ) ];
	const animationReplay =
		attributes[ attrName( 'Replay' ) ] ||
		( slot === 'entry' ? 'repeat' : 'reverse' );
	// Slot-specific default for the Replay attr when filling the slot
	// for the first time. Matches today's runtime behavior: Entry
	// replays each scroll-in, Exit reverse-plays on scroll-back.
	const slotReplayDefault = slot === 'entry' ? 'repeat' : 'reverse';

	const isCustom = animationType === 'custom';
	const isEmpty = animationType === '';
	const hasDirection = TYPES_WITH_DIRECTION.includes( animationType );
	const directionOptions = DIRECTION_OPTIONS[ animationType ] || [];

	// Build the dropdown options for this slot. Prepend a "None"
	// entry so the user can clear the slot from the dropdown without
	// hunting for a separate clear button.
	//
	// Image effects appear in the slot dropdown only on supported
	// block types. On Cover with Fixed/Repeated bg, keep them visible
	// but disabled so the user understands the constraint instead of
	// wondering why an option disappeared.
	const slotOptions =
		slot === 'entry' ? ENTRY_TYPE_OPTIONS : EXIT_TYPE_OPTIONS;
	const blockSupportsImageEffects = IMAGE_EFFECT_BLOCKS.includes( blockName );
	const imageEffectsBlocked = isImageTargetUnavailable( blockName, attributes );
	const typeOptions = [
		{ label: __( 'None', 'motion-blocks' ), value: '' },
		...slotOptions
			.filter( ( opt ) => {
				if (
					! blockSupportsImageEffects &&
					IMAGE_EFFECT_TYPES.includes( opt.value )
				) {
					return false;
				}
				return true;
			} )
			.map( ( opt ) =>
				imageEffectsBlocked &&
				IMAGE_EFFECT_TYPES.includes( opt.value )
					? { ...opt, disabled: true }
					: opt
			),
	];

	/**
	 * Effect picker handler. Several side effects layered on top of
	 * a simple value write:
	 *
	 *   - Setting an Effect for a directional type auto-fills the
	 *     slot's default direction.
	 *   - Setting Custom for the first time seeds a default From/To
	 *     keyframe (slot-specific seed — Entry uses fade-up, Exit
	 *     uses fade-down).
	 */
	const handleTypeChange = ( value ) => {
		const newAttrs = { [ attrName( 'Type' ) ]: value };
		if ( TYPES_WITH_DIRECTION.includes( value ) ) {
			newAttrs[ attrName( 'Direction' ) ] = DEFAULT_DIRECTION[ value ] || '';
		} else {
			newAttrs[ attrName( 'Direction' ) ] = '';
		}
		if (
			value === 'custom' &&
			! hasAnyCustomFromToSet( attributes, slot )
		) {
			Object.assign( newAttrs, customDefaultFromToForSlot( slot ) );
		}
		// First-time fill: seed the Replay default for this slot if it
		// hasn't been set yet. Preserves today's behavior on filling a
		// new slot (Entry → 'repeat', Exit → 'reverse').
		if (
			value !== '' &&
			attributes[ attrName( 'Replay' ) ] === undefined
		) {
			newAttrs[ attrName( 'Replay' ) ] = slotReplayDefault;
		}
		setAttributes( newAttrs );
	};

	/**
	 * "Edit" — convert the current preset into Custom mode with its
	 * From/To values pre-filled. Slot-aware (writes the slot's
	 * keyframe attrs, not the shared ones). When converting from an
	 * image effect (image-move / image-zoom), also set
	 * `animationFromToTarget: 'img'` so the converted Custom keeps
	 * targeting the inner img — matches the original visual.
	 */
	const handleEditPreset = () => {
		const seed = presetToSlotFromToAttributes(
			animationType,
			animationDirection,
			{
				rotateAngle: animationRotateAngle,
				blurAmount: animationBlurAmount,
			},
			slot
		);
		if ( ! seed ) {
			return;
		}
		const fromImageEffect =
			animationType === 'image-move' ||
			animationType === 'image-zoom';
		const newAttrs = {
			[ attrName( 'Type' ) ]: 'custom',
			[ attrName( 'Direction' ) ]: '',
			...seed,
		};
		if ( fromImageEffect ) {
			newAttrs.animationFromToTarget = 'img';
		}
		setAttributes( newAttrs );
	};

	const canEditPreset =
		!! animationType &&
		animationType !== 'custom' &&
		!! presetToSlotFromToAttributes(
			animationType,
			animationDirection,
			{
				rotateAngle: animationRotateAngle,
				blurAmount: animationBlurAmount,
			},
			slot
		);

	// If the slot is empty, render only the Effect dropdown. Nothing
	// else makes sense without a chosen type.
	if ( isEmpty ) {
		return (
			<div className="mb-slot-controls mb-slot-controls--empty">
				<SelectControl
					label={ __( 'Effect', 'motion-blocks' ) }
					value={ animationType }
					options={ typeOptions }
					onChange={ handleTypeChange }
					help={
						slot === 'entry'
							? __(
									'Pick an effect to animate the element into view.',
									'motion-blocks'
							  )
							: __(
									'Pick an effect to animate the element out of view.',
									'motion-blocks'
							  )
					}
					__next40pxDefaultSize
					__nextHasNoMarginBottom
				/>
			</div>
		);
	}

	return (
		<div className="mb-slot-controls">
			<HStack alignment="bottom" spacing={ 3 }>
				<FlexBlock>
					<div className="mb-effect-field">
						<HStack
							className="mb-effect-field__label-row"
							justify="flex-start"
							spacing={ 2 }
						>
							<BaseControl.VisualLabel>
								{ __( 'Effect', 'motion-blocks' ) }
							</BaseControl.VisualLabel>
							{ canEditPreset && (
								<Button
									variant="link"
									size="small"
									onClick={ handleEditPreset }
								>
									{ __( 'Edit', 'motion-blocks' ) }
								</Button>
							) }
						</HStack>
						<SelectControl
							label={ __( 'Effect', 'motion-blocks' ) }
							hideLabelFromVision
							value={ animationType }
							options={ typeOptions }
							onChange={ handleTypeChange }
							__next40pxDefaultSize
							__nextHasNoMarginBottom
						/>
					</div>
				</FlexBlock>
				{ /* Each slot has its own Preview button — clicking it
				   tells AnimationPanel (via the slot arg) which side
				   to fire. The HOC reads `animationPreviewSlot` to
				   decide whether to apply `mb-triggered` (Entry phase,
				   uses mb-enter-{type} classes) or `mb-exit-triggered`
				   (Exit phase, uses mb-exit-{type} classes). */ }
				<Button
					icon={ playIcon }
					label={ __( 'Preview animation', 'motion-blocks' ) }
					variant="secondary"
					onClick={ () => onPreview && onPreview( slot ) }
					disabled={ isPlayPending }
					__next40pxDefaultSize
				/>
			</HStack>

			{ IMAGE_EFFECT_BLOCKS.includes( blockName ) &&
				isImageTargetUnavailable( blockName, attributes ) && (
					<Notice
						status="warning"
						isDismissible={ false }
						className="mb-image-effect-unavailable-notice"
					>
						{ __(
							'Some effects are not compatible with “Fixed background” and “Repeated background”. Turn off these settings under Cover block settings to use them.',
							'motion-blocks'
						) }
					</Notice>
				) }

			{ IMAGE_TARGETABLE_BLOCKS.includes( blockName ) &&
				animationType &&
				! IMAGE_EFFECT_TYPES.includes( animationType ) && (
					<ToggleControl
						label={ __( 'Animate image only', 'motion-blocks' ) }
						checked={
							( attributes.animationFromToTarget ||
								'block' ) === 'img'
						}
						disabled={ isImageTargetUnavailable(
							blockName,
							attributes
						) }
						onChange={ ( on ) =>
							setAttributes( {
								animationFromToTarget: on ? 'img' : 'block',
							} )
						}
						help={
							isImageTargetUnavailable( blockName, attributes )
								? __(
										'Unavailable while Fixed background or Repeated background is on — see the notice above.',
										'motion-blocks'
								  )
								: __(
										'Animate the background only. Text and other inner blocks are excluded.',
										'motion-blocks'
								  )
						}
						__nextHasNoMarginBottom
					/>
				) }

			{ isCustom && (
				<FromToControls
					attributes={ attributes }
					setAttributes={ setAttributes }
					blockName={ blockName }
					slot={ slot }
				/>
			) }

			{ ! isCustom && animationType === 'scale' && (
				<>
					<ToggleControl
						label={ __( 'Scale with direction', 'motion-blocks' ) }
						checked={
							animationDirection !== 'none' &&
							animationDirection !== ''
						}
						onChange={ ( checked ) =>
							setAttributes( {
								[ attrName( 'Direction' ) ]: checked
									? 'btt'
									: 'none',
							} )
						}
						__nextHasNoMarginBottom
					/>
					{ animationDirection !== 'none' &&
						animationDirection !== '' && (
							<ToggleGroupControl
								label={ __( 'Direction', 'motion-blocks' ) }
								value={ animationDirection }
								onChange={ ( value ) =>
									setAttributes( {
										[ attrName( 'Direction' ) ]: value,
									} )
								}
								isBlock
								__nextHasNoMarginBottom
							>
								{ directionOptions.map( ( opt ) => (
									<ToggleGroupControlOptionIcon
										key={ opt.value }
										value={ opt.value }
										icon={ DIRECTION_ICON_MAP[ opt.value ] }
										label={ opt.label }
									/>
								) ) }
							</ToggleGroupControl>
						) }
				</>
			) }

			{ ! isCustom && hasDirection && animationType === 'curtain' && (
				<ToggleGroupControl
					label={ __( 'Direction', 'motion-blocks' ) }
					value={ animationDirection }
					onChange={ ( value ) =>
						setAttributes( {
							[ attrName( 'Direction' ) ]: value,
						} )
					}
					isBlock
					__nextHasNoMarginBottom
				>
					{ directionOptions.map( ( opt ) => (
						<ToggleGroupControlOption
							key={ opt.value }
							value={ opt.value }
							label={ opt.label }
						/>
					) ) }
				</ToggleGroupControl>
			) }

			{ ! isCustom &&
				hasDirection &&
				animationType !== 'scale' &&
				animationType !== 'curtain' && (
					<ToggleGroupControl
						label={ __( 'Direction', 'motion-blocks' ) }
						value={ animationDirection }
						onChange={ ( value ) =>
							setAttributes( {
								[ attrName( 'Direction' ) ]: value,
							} )
						}
						isBlock
						__nextHasNoMarginBottom
					>
						{ directionOptions.map( ( opt ) => (
							<ToggleGroupControlOptionIcon
								key={ opt.value }
								value={ opt.value }
								icon={ DIRECTION_ICON_MAP[ opt.value ] }
								label={ opt.label }
							/>
						) ) }
					</ToggleGroupControl>
				) }

			{ ! isCustom && animationType === 'blur' && (
				<RangeControl
					label={ __( 'Blur', 'motion-blocks' ) }
					value={ animationBlurAmount }
					onChange={ ( value ) =>
						setAttributes( {
							[ attrName( 'BlurAmount' ) ]: value,
						} )
					}
					min={ BLUR_SETTINGS.min }
					max={ BLUR_SETTINGS.max }
					step={ BLUR_SETTINGS.step }
					renderTooltipContent={ ( value ) => `${ value }px` }
					__next40pxDefaultSize
					__nextHasNoMarginBottom
				/>
			) }

			{ ! isCustom && animationType === 'rotate' && (
				<NumberControl
					label={ __( 'Angle', 'motion-blocks' ) }
					value={ animationRotateAngle ?? 90 }
					step={ 1 }
					spinControls="custom"
					onChange={ ( value ) =>
						setAttributes( {
							[ attrName( 'RotateAngle' ) ]:
								parseInt( value, 10 ) || 0,
						} )
					}
					__next40pxDefaultSize
				/>
			) }

			<HStack spacing={ 3 }>
				<FlexBlock>
					<NumberControl
						label={ __( 'Duration', 'motion-blocks' ) }
						value={ animationDuration }
						min={ 0 }
						step={ 0.1 }
						spinControls="custom"
						onChange={ ( value ) =>
							setAttributes( {
								[ attrName( 'Duration' ) ]:
									parseFloat( value ) || 0,
							} )
						}
						__next40pxDefaultSize
					/>
				</FlexBlock>
				<FlexBlock>
					<NumberControl
						label={ __( 'Delay', 'motion-blocks' ) }
						value={ animationDelay }
						min={ 0 }
						step={ 0.1 }
						spinControls="custom"
						onChange={ ( value ) =>
							setAttributes( {
								[ attrName( 'Delay' ) ]:
									parseFloat( value ) || 0,
							} )
						}
						__next40pxDefaultSize
					/>
				</FlexBlock>
			</HStack>

			<SelectControl
				label={ __( 'Acceleration', 'motion-blocks' ) }
				value={ animationAcceleration }
				options={ ACCELERATION_OPTIONS }
				onChange={ ( value ) =>
					setAttributes( {
						[ attrName( 'Acceleration' ) ]: value,
					} )
				}
				__next40pxDefaultSize
				__nextHasNoMarginBottom
			/>
			{ animationAcceleration === 'custom' && (
				<TextControl
					label={ __( 'Custom timing function', 'motion-blocks' ) }
					value={ animationCustomTimingFunction }
					onChange={ ( v ) =>
						setAttributes( {
							[ attrName( 'CustomTimingFunction' ) ]: v,
						} )
					}
					help={ __(
						'Any valid CSS timing function, e.g. cubic-bezier(0.4, 0, 0.2, 1).',
						'motion-blocks'
					) }
					__nextHasNoMarginBottom
					__next40pxDefaultSize
				/>
			) }

			{ /* Replay control.
			     Slot-isolated spatial model: Entry owns the BOTTOM edge
			     of the trigger zone; Exit owns the TOP edge. Each slot's
			     Replay option configures the back-direction crossing at
			     its own edge — no cross-slot reach. See REPLAY_OPTIONS
			     in constants.js for the full mapping. */ }
			<SelectControl
				label={ __( 'Replay', 'motion-blocks' ) }
				value={ animationReplay }
				options={ REPLAY_OPTIONS }
				onChange={ ( value ) =>
					setAttributes( {
						[ attrName( 'Replay' ) ]: value,
					} )
				}
				help={
					slot === 'entry'
						? animationReplay === 'once'
							? __(
									'Entry animation plays once on first appearance, then stays.',
									'motion-blocks'
							  )
							: animationReplay === 'repeat'
							? __(
									'Entry animation plays each time the element scrolls into view.',
									'motion-blocks'
							  )
							: __(
									'Entry animation plays in reverse when the element leaves the bottom of the viewport.',
									'motion-blocks'
							  )
						: animationReplay === 'once'
						? __(
								'Exit animation plays once, then stays exited.',
								'motion-blocks'
						  )
						: animationReplay === 'repeat'
						? __(
								'Exit animation plays each time the element scrolls out at the top.',
								'motion-blocks'
						  )
						: __(
								'Exit animation plays in reverse when the user scrolls back to the element.',
								'motion-blocks'
						  )
				}
				__next40pxDefaultSize
				__nextHasNoMarginBottom
			/>
		</div>
	);
}
