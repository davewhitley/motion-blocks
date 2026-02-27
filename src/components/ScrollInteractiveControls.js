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
	__experimentalToggleGroupControl as ToggleGroupControl,
	__experimentalToggleGroupControlOption as ToggleGroupControlOption,
	__experimentalToggleGroupControlOptionIcon as ToggleGroupControlOptionIcon,
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
} from './constants';
import AnimationOptionsMenu from './AnimationOptionsMenu';

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
	onRemove,
	onPaste,
	onReset,
} ) {
	const {
		animationType,
		animationDirection,
		animationAcceleration,
		animationBlurAmount,
		animationRangeStart,
		animationRangeEnd,
		animationPreviewEnabled,
	} = attributes;

	const typeOptions = ANIMATION_TYPE_OPTIONS;

	const previewOn = animationPreviewEnabled !== false;
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

			<div className="mb-select-row">
				<SelectControl
					label={ __( 'Animation', 'motion-blocks' ) }
					value={ animationType }
					options={ typeOptions }
					onChange={ handleTypeChange }
					size="__unstable-large"
					__nextHasNoMarginBottom
				/>
				<Button
					icon={ previewOn ? seen : unseen }
					label={
						previewOn
							? __( 'Disable preview', 'motion-blocks' )
							: __( 'Enable preview', 'motion-blocks' )
					}
					variant="secondary"
					size="default"
					className="mb-preview-button"
					onClick={ () =>
						setAttributes( {
							animationPreviewEnabled: ! previewOn,
						} )
					}
					__next40pxDefaultSize
				/>
			</div>

			{ animationType === 'scale' && (
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

			{ hasDirection && animationType === 'curtain' && (
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

			{ hasDirection && animationType !== 'scale' && animationType !== 'curtain' && (
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

			{ animationType === 'blur' && (
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

			<RangeControl
				label={ __( 'Animation Start Offset', 'motion-blocks' ) }
				value={ startOffset }
				onChange={ ( value ) =>
					setAttributes( {
						animationRangeStart: `entry ${ value }%`,
					} )
				}
				min={ 0 }
				max={ 100 }
				renderTooltipContent={ ( value ) => `${ value }%` }
				__next40pxDefaultSize
				__nextHasNoMarginBottom
			/>

			<RangeControl
				label={ __( 'Animation End Offset', 'motion-blocks' ) }
				value={ endOffset }
				onChange={ ( value ) =>
					setAttributes( {
						animationRangeEnd: `exit ${ value }%`,
					} )
				}
				min={ 0 }
				max={ 100 }
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
				size="__unstable-large"
				__nextHasNoMarginBottom
			/>

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
