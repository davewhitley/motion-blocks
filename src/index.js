/**
 * Motion Blocks - Block Editor Extension
 *
 * Adds animation controls to all blocks via the InspectorControls panel.
 * Supports three animation modes: page-load, scroll-appear, scroll-interactive.
 */

import { createHigherOrderComponent } from '@wordpress/compose';
import { InspectorControls } from '@wordpress/block-editor';
import { addFilter } from '@wordpress/hooks';

import AnimationPanel from './components/AnimationPanel';
import {
	DEFAULT_ATTRIBUTES,
	ENTER_KEYFRAME_MAP,
	EXIT_KEYFRAME_MAP,
	DIRECTION_CSS_VARS,
	TYPES_WITH_DIRECTION,
	DEFAULT_DIRECTION,
} from './components/constants';

import '../css/editor.scss';

/**
 * Get the entrance keyframe name for a given animation type.
 */
function getEnterKeyframe( type ) {
	return ENTER_KEYFRAME_MAP[ type ] || '';
}

/**
 * Get the exit keyframe name for a given animation type.
 */
function getExitKeyframe( type ) {
	return EXIT_KEYFRAME_MAP[ type ] || '';
}

/**
 * Get CSS custom properties for a given type + direction.
 */
function getDirectionStyles( type, direction ) {
	const vars = DIRECTION_CSS_VARS[ type ]?.[ direction ];
	return vars || {};
}

/**
 * Add animation attributes to all blocks.
 */
function addAnimationAttributes( settings ) {
	if ( settings.attributes?.animationMode ) {
		return settings;
	}

	return {
		...settings,
		attributes: {
			...settings.attributes,
			animationMode: {
				type: 'string',
				default: '',
			},
			animationType: {
				type: 'string',
				default: '',
			},
			animationDirection: {
				type: 'string',
				default: '',
			},
			animationDuration: {
				type: 'number',
				default: 0.6,
			},
			animationDelay: {
				type: 'number',
				default: 0.4,
			},
			animationRepeat: {
				type: 'string',
				default: 'once',
			},
			animationPauseOffscreen: {
				type: 'boolean',
				default: true,
			},
			animationPlayOnce: {
				type: 'boolean',
				default: true,
			},
			animationScrollTrigger: {
				type: 'string',
				default: 'enter',
			},
			animationExitMode: {
				type: 'string',
				default: 'mirror',
			},
			animationExitType: {
				type: 'string',
				default: 'fade',
			},
			animationExitDirection: {
				type: 'string',
				default: '',
			},
			animationExitDuration: {
				type: 'number',
				default: 0.6,
			},
			animationAcceleration: {
				type: 'string',
				default: 'ease',
			},
			animationExitDelay: {
				type: 'number',
				default: 0,
			},
			animationExitAcceleration: {
				type: 'string',
				default: 'ease',
			},
			animationBlurAmount: {
				type: 'number',
				default: 8,
			},
			animationRangeStart: {
				type: 'string',
				default: 'entry 0%',
			},
			animationRangeEnd: {
				type: 'string',
				default: 'exit 100%',
			},
			animationPreviewEnabled: {
				type: 'boolean',
				default: true,
			},
			animationPreviewPlaying: {
				type: 'boolean',
				default: false,
			},
		},
	};
}

addFilter(
	'blocks.registerBlockType',
	'motion-blocks/add-attributes',
	addAnimationAttributes
);

/**
 * Add animation controls to the block inspector.
 */
const withAnimationControls = createHigherOrderComponent( ( BlockEdit ) => {
	return ( props ) => {
		const { attributes, setAttributes, isSelected, name } = props;

		return (
			<>
				<BlockEdit { ...props } />
				{ isSelected && (
					<InspectorControls>
						<AnimationPanel
							attributes={ attributes }
							setAttributes={ setAttributes }
							blockName={ name }
						/>
					</InspectorControls>
				) }
			</>
		);
	};
}, 'withAnimationControls' );

addFilter(
	'editor.BlockEdit',
	'motion-blocks/with-animation-controls',
	withAnimationControls
);

/**
 * Apply animation preview via BlockListBlock className.
 *
 * The toolbar lives in the parent document while blocks render inside
 * an iframe, so className-based animation on the block element does
 * NOT affect the toolbar.
 */
const withAnimationPreview = createHigherOrderComponent(
	( BlockListBlock ) => {
		return ( props ) => {
			const { attributes, wrapperProps = {} } = props;
			const {
				animationMode,
				animationType,
				animationDirection,
				animationDuration,
				animationDelay,
				animationAcceleration,
				animationBlurAmount,
				animationRepeat,
				animationRangeStart,
				animationRangeEnd,
				animationPreviewEnabled,
				animationPreviewPlaying,
			} = attributes;

			// Scroll-interactive: persistent scroll-driven animation.
			if (
				animationMode === 'scroll-interactive' &&
				animationType &&
				animationPreviewEnabled !== false
			) {
				const dirStyles = getDirectionStyles(
					animationType,
					animationDirection
				);

				const rangeStartVal =
					animationRangeStart || 'entry 0%';
				const rangeEndVal =
					animationRangeEnd || 'exit 100%';
				const scrollInteractiveStyles = {
					...( wrapperProps.style || {} ),
					...dirStyles,
					// DEBUG: mbDebugScroll adds green/red border.
					// Remove the second values when done testing.
					animationName: `${ getEnterKeyframe( animationType ) }, mbDebugScroll`,
					animationTimeline: 'view(), view()',
					animationRangeStart: `${ rangeStartVal }, ${ rangeStartVal }`,
					animationRangeEnd: `${ rangeEndVal }, ${ rangeEndVal }`,
					animationDuration: '1ms, 1ms',
					animationTimingFunction: `${ animationAcceleration || 'ease' }, linear`,
					animationFillMode: 'both, forwards',
				};
				if ( animationType === 'blur' ) {
					scrollInteractiveStyles[ '--mb-blur-amount' ] =
						( animationBlurAmount ?? 8 ) + 'px';
				}
				const newWrapperProps = {
					...wrapperProps,
					style: scrollInteractiveStyles,
				};

				return (
					<BlockListBlock
						{ ...props }
						wrapperProps={ newWrapperProps }
					/>
				);
			}

			// Page-load / Scroll-appear: class-based preview.
			const repeat = animationRepeat || 'once';
			const isLooping = repeat === 'loop' || repeat === 'alternate';

			// One-shot: always preview when animation is configured.
			// Looping: gate on animationPreviewPlaying (user-controlled).
			const isPageLoadOrScrollAppear =
				animationMode === 'page-load' ||
				animationMode === 'scroll-appear';
			const shouldAnimate =
				isPageLoadOrScrollAppear && animationType
					? isLooping
						? animationPreviewPlaying
						: true
					: false;

			if ( ! shouldAnimate ) {
				return <BlockListBlock { ...props } />;
			}

			const className = [
				props.className || '',
				'mb-preview',
				`mb-animate-enter-${ animationType }`,
			]
				.filter( Boolean )
				.join( ' ' );

			const duration = animationDuration || 0.6;
			const delay = animationDelay || 0;
			const dirStyles = getDirectionStyles(
				animationType,
				animationDirection
			);

			const previewStyles = {
				...( wrapperProps.style || {} ),
				...dirStyles,
				'--mb-duration': `${ duration }s`,
				'--mb-delay': `${ delay }s`,
				'--mb-timing': animationAcceleration || 'ease',
				'--mb-iteration-count': isLooping ? 'infinite' : '1',
				'--mb-direction':
					repeat === 'alternate' ? 'alternate' : 'normal',
				'--mb-fill-mode': isLooping ? 'none' : 'both',
			};
			if ( animationType === 'blur' ) {
				previewStyles[ '--mb-blur-amount' ] =
					( animationBlurAmount ?? 8 ) + 'px';
			}
			const newWrapperProps = {
				...wrapperProps,
				style: previewStyles,
			};

			return (
				<BlockListBlock
					{ ...props }
					className={ className }
					wrapperProps={ newWrapperProps }
				/>
			);
		};
	},
	'withAnimationPreview'
);

addFilter(
	'editor.BlockListBlock',
	'motion-blocks/with-animation-preview',
	withAnimationPreview,
	190
);

/**
 * Add animation classes and data attributes to saved block content.
 */
function addAnimationSaveProps( props, blockType, attributes ) {
	const { animationMode, animationType } = attributes;

	const mode = animationMode;

	if ( ! mode || ! animationType ) {
		return props;
	}

	const classNames = [
		props.className || '',
		'mb-animated',
		`mb-enter-${ animationType }`,
		`mb-mode-${ mode }`,
	];

	const dataAttrs = {
		'data-mb-mode': mode,
		'data-mb-type': animationType,
	};

	// Acceleration (timing function).
	const acceleration =
		attributes.animationAcceleration ||
		DEFAULT_ATTRIBUTES.animationAcceleration;
	if ( acceleration !== 'ease' ) {
		dataAttrs[ 'data-mb-acceleration' ] = acceleration;
	}

	// Direction (for types that have one).
	if ( attributes.animationDirection ) {
		dataAttrs[ 'data-mb-direction' ] = attributes.animationDirection;
	}

	// Blur amount (only when type is blur and value differs from default).
	if ( animationType === 'blur' ) {
		const blurAmount =
			attributes.animationBlurAmount ??
			DEFAULT_ATTRIBUTES.animationBlurAmount;
		if ( blurAmount !== DEFAULT_ATTRIBUTES.animationBlurAmount ) {
			dataAttrs[ 'data-mb-blur-amount' ] = String( blurAmount );
		}
	}

	// Page-load and scroll-appear: duration + delay.
	if ( mode === 'page-load' || mode === 'scroll-appear' ) {
		dataAttrs[ 'data-mb-duration' ] = String(
			attributes.animationDuration ?? DEFAULT_ATTRIBUTES.animationDuration
		);
		dataAttrs[ 'data-mb-delay' ] = String(
			attributes.animationDelay ?? DEFAULT_ATTRIBUTES.animationDelay
		);
	}

	// Page-load only: repeat + pause-offscreen.
	if ( mode === 'page-load' ) {
		dataAttrs[ 'data-mb-repeat' ] =
			attributes.animationRepeat || DEFAULT_ATTRIBUTES.animationRepeat;
		dataAttrs[ 'data-mb-pause-offscreen' ] = String(
			attributes.animationPauseOffscreen ??
				DEFAULT_ATTRIBUTES.animationPauseOffscreen
		);
	}

	// Scroll-appear: trigger, exit, play-once.
	if ( mode === 'scroll-appear' ) {
		const trigger =
			attributes.animationScrollTrigger ||
			DEFAULT_ATTRIBUTES.animationScrollTrigger;
		dataAttrs[ 'data-mb-scroll-trigger' ] = trigger;
		dataAttrs[ 'data-mb-play-once' ] = String(
			attributes.animationPlayOnce ??
				DEFAULT_ATTRIBUTES.animationPlayOnce
		);

		// Determine exit type for class and data attrs.
		if ( trigger === 'exit' || trigger === 'both' ) {
			const exitMode =
				attributes.animationExitMode ||
				DEFAULT_ATTRIBUTES.animationExitMode;
			dataAttrs[ 'data-mb-exit-mode' ] = exitMode;

			if ( exitMode === 'custom' ) {
				const exitType =
					attributes.animationExitType ||
					DEFAULT_ATTRIBUTES.animationExitType;
				classNames.push( `mb-exit-${ exitType }` );
				dataAttrs[ 'data-mb-exit-type' ] = exitType;
				if ( attributes.animationExitDirection ) {
					dataAttrs[ 'data-mb-exit-direction' ] =
						attributes.animationExitDirection;
				}
				dataAttrs[ 'data-mb-exit-duration' ] = String(
					attributes.animationExitDuration ??
						DEFAULT_ATTRIBUTES.animationExitDuration
				);
				dataAttrs[ 'data-mb-exit-delay' ] = String(
					attributes.animationExitDelay ??
						DEFAULT_ATTRIBUTES.animationExitDelay
				);
				const exitAccel =
					attributes.animationExitAcceleration ||
					DEFAULT_ATTRIBUTES.animationExitAcceleration;
				if ( exitAccel !== 'ease' ) {
					dataAttrs[ 'data-mb-exit-acceleration' ] = exitAccel;
				}
			} else {
				// Mirror: exit class derived from enter type.
				classNames.push( `mb-exit-${ animationType }` );
			}
		}

		// Exit-only: the enter class is still on the element for the
		// enter type, but we also need the exit class.
		if ( trigger === 'exit' ) {
			// For exit-only, the "enter type" is actually the exit animation.
			// Re-map: remove the enter class, add exit class instead.
			const exitIdx = classNames.indexOf(
				`mb-enter-${ animationType }`
			);
			if ( exitIdx !== -1 ) {
				classNames[ exitIdx ] = `mb-exit-${ animationType }`;
			}
		}
	}

	// Scroll-interactive: range.
	if ( mode === 'scroll-interactive' ) {
		dataAttrs[ 'data-mb-range-start' ] =
			attributes.animationRangeStart ||
			DEFAULT_ATTRIBUTES.animationRangeStart;
		dataAttrs[ 'data-mb-range-end' ] =
			attributes.animationRangeEnd ||
			DEFAULT_ATTRIBUTES.animationRangeEnd;
		if ( attributes.animationDirection ) {
			dataAttrs[ 'data-mb-direction' ] = attributes.animationDirection;
		}
	}

	return {
		...props,
		className: classNames.filter( Boolean ).join( ' ' ).trim(),
		...dataAttrs,
	};
}

addFilter(
	'blocks.getSaveContent.extraProps',
	'motion-blocks/add-save-props',
	addAnimationSaveProps
);
