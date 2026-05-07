/**
 * ScrollInteractiveControls — "Interactive scroll" animation sub-panel.
 *
 * Start Range and End Range map to the CSS scroll-driven animations spec:
 *   animation-range-start: entry 0%
 *   animation-range-end: exit 100%
 */

import {
	SelectControl,
	RangeControl,
	ToggleControl,
	TextControl,
	__experimentalToggleGroupControl as ToggleGroupControl,
	__experimentalToggleGroupControlOption as ToggleGroupControlOption,
	__experimentalToggleGroupControlOptionIcon as ToggleGroupControlOptionIcon,
	__experimentalHStack as HStack,
	__experimentalNumberControl as NumberControl,
	FlexBlock,
	Button,
	Icon,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import {
	drawerRight,
	seen,
	unseen,
	arrowUp,
	arrowDown,
	arrowLeft,
	arrowRight,
} from '@wordpress/icons';

import {
	ANIMATION_TYPE_OPTIONS,
	DIRECTION_OPTIONS,
	TYPES_WITH_DIRECTION,
	DEFAULT_DIRECTION,
	ACCELERATION_OPTIONS,
	BLUR_SETTINGS,
	CUSTOM_DEFAULT_FROM_TO,
	hasAnyCustomFromToSet,
} from './constants';
import AnimationOptionsMenu from './AnimationOptionsMenu';
import FromToControls from './FromToControls';

const DIRECTION_ICON_MAP = {
	btt: arrowUp,
	ttb: arrowDown,
	ltr: arrowRight,
	rtl: arrowLeft,
};

/**
 * Extract the offset percentage from a range string like "entry 20%".
 */
function parseOffset( value, fallback ) {
	return parseInt( ( value || fallback ).split( ' ' )[ 1 ], 10 ) || 0;
}

export default function ScrollInteractiveControls( {
	attributes,
	setAttributes,
	blockName,
	clientId,
	onRemove,
	onPaste,
	onReset,
} ) {
	const {
		animationType,
		animationDirection,
		animationAcceleration,
		animationCustomTimingFunction,
		animationBlurAmount,
		animationRotateAngle,
		animationRangeStart,
		animationRangeEnd,
		animationPreviewEnabled,
	} = attributes;

	const typeOptions = ANIMATION_TYPE_OPTIONS;

	const previewOn = animationPreviewEnabled !== false;
	const isCustom = animationType === 'custom';
	const hasDirection = TYPES_WITH_DIRECTION.includes( animationType );
	const directionOptions = DIRECTION_OPTIONS[ animationType ] || [];

	const startOffset = parseOffset( animationRangeStart, 'entry 0%' );
	const endOffset = parseOffset( animationRangeEnd, 'exit 100%' );

	/**
	 * When animation type changes, auto-set direction.
	 */
	const handleTypeChange = ( value ) => {
		const newAttrs = { animationType: value };
		if ( TYPES_WITH_DIRECTION.includes( value ) ) {
			newAttrs.animationDirection = DEFAULT_DIRECTION[ value ] || '';
		} else {
			newAttrs.animationDirection = '';
		}
		// Seed the four default From/To rows when picking Custom for
		// the first time. Preserves any existing custom config.
		if ( value === 'custom' && ! hasAnyCustomFromToSet( attributes ) ) {
			Object.assign( newAttrs, CUSTOM_DEFAULT_FROM_TO );
		}
		setAttributes( newAttrs );
	};

	return (
		<div className="mb-sub-panel">
			<div className="mb-sub-panel-header">
				<div className="mb-sub-panel-title-row">
					<Icon icon={ drawerRight } size={ 24 } />
					<span className="mb-sub-panel-title">
						{ __( 'Interactive scroll', 'motion-blocks' ) }
					</span>
					<AnimationOptionsMenu
						attributes={ attributes }
						blockName={ blockName }
						clientId={ clientId }
						onPaste={ onPaste }
						onReset={ onReset }
						onRemove={ onRemove }
					/>
				</div>
				<p className="mb-help-text">
					{ __(
						'Animation is tied to scroll position. Adjust the offsets to control the start (bottom of screen) and the end (top of the screen).',
						'motion-blocks'
					) }
				</p>
			</div>

			<HStack alignment="bottom" spacing={ 3 }>
				<FlexBlock>
					<SelectControl
						label={ __( 'Effect', 'motion-blocks' ) }
						value={ animationType }
						options={ typeOptions }
						onChange={ handleTypeChange }
						__next40pxDefaultSize
						__nextHasNoMarginBottom
					/>
				</FlexBlock>
				<Button
					icon={ previewOn ? seen : unseen }
					label={
						previewOn
							? __( 'Disable preview', 'motion-blocks' )
							: __( 'Enable preview', 'motion-blocks' )
					}
					variant="secondary"
					onClick={ () =>
						setAttributes( {
							animationPreviewEnabled: ! previewOn,
						} )
					}
					__next40pxDefaultSize
				/>
			</HStack>

			{ isCustom && (
				<FromToControls
					attributes={ attributes }
					setAttributes={ setAttributes }
					blockName={ blockName }
				/>
			) }

			{ ! isCustom && animationType === 'scale' && (
				<>
					<ToggleControl
						label={ __( 'Scale with direction', 'motion-blocks' ) }
						checked={ animationDirection !== 'none' && animationDirection !== '' }
						onChange={ ( checked ) =>
							setAttributes( {
								animationDirection: checked ? 'btt' : 'none',
							} )
						}
						__nextHasNoMarginBottom
					/>
					{ animationDirection !== 'none' && animationDirection !== '' && (
						<ToggleGroupControl
							label={ __( 'Direction', 'motion-blocks' ) }
							value={ animationDirection }
							onChange={ ( value ) =>
								setAttributes( { animationDirection: value } )
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
						setAttributes( { animationDirection: value } )
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

			{ ! isCustom && hasDirection && animationType !== 'scale' && animationType !== 'curtain' && (
				<ToggleGroupControl
					label={ __( 'Direction', 'motion-blocks' ) }
					value={ animationDirection }
					onChange={ ( value ) =>
						setAttributes( { animationDirection: value } )
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
						setAttributes( { animationBlurAmount: value } )
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
							animationRotateAngle:
								parseInt( value, 10 ) || 0,
						} )
					}
					__next40pxDefaultSize
				/>
			) }

			<RangeControl
				label={ __( 'Start Offset', 'motion-blocks' ) }
				value={ startOffset }
				onChange={ ( value ) =>
					setAttributes( {
						animationRangeStart: `entry ${ value }%`,
					} )
				}
				min={ 0 }
				max={ 100 }
				beforeIcon={ arrowDown }
				renderTooltipContent={ ( value ) => `${ value }%` }
				__next40pxDefaultSize
				__nextHasNoMarginBottom
			/>

			<RangeControl
				label={ __( 'End Offset', 'motion-blocks' ) }
				value={ endOffset }
				onChange={ ( value ) =>
					setAttributes( {
						animationRangeEnd: `exit ${ value }%`,
					} )
				}
				min={ 0 }
				max={ 100 }
				beforeIcon={ arrowUp }
				renderTooltipContent={ ( value ) => `${ value }%` }
				__next40pxDefaultSize
				__nextHasNoMarginBottom
			/>

			<SelectControl
				label={ __( 'Acceleration', 'motion-blocks' ) }
				value={ animationAcceleration }
				options={ ACCELERATION_OPTIONS }
				onChange={ ( value ) =>
					setAttributes( { animationAcceleration: value } )
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
							animationCustomTimingFunction: v,
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

			<Button
				variant="secondary"
				isDestructive
				className="mb-remove-button"
				onClick={ onRemove }
				__next40pxDefaultSize
			>
				{ __( 'Remove animation', 'motion-blocks' ) }
			</Button>
		</div>
	);
}
