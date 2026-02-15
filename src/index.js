/**
 * Motion Blocks - Block Editor Extension
 *
 * Adds animation controls to all blocks via the InspectorControls panel.
 * Supports three animation modes: page-load, scroll-appear, scroll-interactive.
 */

import { createHigherOrderComponent } from '@wordpress/compose';
import { InspectorControls } from '@wordpress/block-editor';
import { addFilter } from '@wordpress/hooks';
import { useState, useEffect } from '@wordpress/element';

import AnimationPanel from './components/AnimationPanel';
import { DEFAULT_ATTRIBUTES } from './components/constants';

import '../css/editor.scss';

/**
 * Convert a kebab-case animation type to its editor keyframe name.
 * e.g. "fade-in" → "mbFadeIn", "slide-up" → "mbSlideUp"
 */
function toKeyframeName( type ) {
	return (
		'mb' +
		type
			.split( '-' )
			.map( ( s ) => s.charAt( 0 ).toUpperCase() + s.slice( 1 ) )
			.join( '' )
	);
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
			animationRangeStart: {
				type: 'string',
				default: 'cover 0%',
			},
			animationRangeEnd: {
				type: 'string',
				default: 'cover 100%',
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
		const { attributes, setAttributes, isSelected } = props;

		return (
			<>
				<BlockEdit { ...props } />
				{ isSelected && (
					<InspectorControls>
						<AnimationPanel
							attributes={ attributes }
							setAttributes={ setAttributes }
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
				animationDuration,
				animationDelay,
				animationRepeat,
				animationRangeStart,
				animationRangeEnd,
				animationPreviewEnabled,
				animationPreviewPlaying,
			} = attributes;
			const [ isAnimating, setIsAnimating ] = useState( false );

			useEffect( () => {
				setIsAnimating( !! animationType );
			}, [ animationType ] );

			// Scroll-interactive: persistent scroll-driven animation.
			if (
				animationMode === 'scroll-interactive' &&
				animationType &&
				animationPreviewEnabled !== false
			) {
				const newWrapperProps = {
					...wrapperProps,
					style: {
						...( wrapperProps.style || {} ),
						animationName: toKeyframeName( animationType ),
						animationTimeline: 'view()',
						animationRangeStart:
							animationRangeStart || 'cover 0%',
						animationRangeEnd: animationRangeEnd || 'cover 100%',
						animationDuration: '1ms',
						animationTimingFunction: 'ease',
						animationFillMode: 'both',
					},
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

			// For looping: play when animationPreviewPlaying is true.
			// For one-shot: play when isAnimating (triggered by animationType change).
			const shouldAnimate = isLooping
				? animationPreviewPlaying
				: isAnimating;

			if ( ! shouldAnimate ) {
				return <BlockListBlock { ...props } />;
			}

			const className = [
				props.className || '',
				'mb-preview',
				`mb-animate-${ animationType }`,
			]
				.filter( Boolean )
				.join( ' ' );

			const duration = animationDuration || 0.6;
			const delay = animationDelay || 0;

			const newWrapperProps = {
				...wrapperProps,
				style: {
					...( wrapperProps.style || {} ),
					'--mb-duration': `${ duration }s`,
					'--mb-delay': `${ delay }s`,
					'--mb-iteration-count': isLooping ? 'infinite' : '1',
					'--mb-direction':
						repeat === 'alternate' ? 'alternate' : 'normal',
					'--mb-fill-mode': isLooping ? 'none' : 'both',
				},
				...( ! isLooping && {
					onAnimationEnd: () => setIsAnimating( false ),
				} ),
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

	const classes = [
		props.className || '',
		'mb-animated',
		`mb-${ animationType }`,
		`mb-mode-${ mode }`,
	]
		.filter( Boolean )
		.join( ' ' )
		.trim();

	const dataAttrs = {
		'data-mb-mode': mode,
		'data-mb-type': animationType,
	};

	if ( mode === 'page-load' || mode === 'scroll-appear' ) {
		dataAttrs[ 'data-mb-duration' ] = String(
			attributes.animationDuration ?? DEFAULT_ATTRIBUTES.animationDuration
		);
		dataAttrs[ 'data-mb-delay' ] = String(
			attributes.animationDelay ?? DEFAULT_ATTRIBUTES.animationDelay
		);
	}

	if ( mode === 'page-load' ) {
		dataAttrs[ 'data-mb-repeat' ] =
			attributes.animationRepeat || DEFAULT_ATTRIBUTES.animationRepeat;
		dataAttrs[ 'data-mb-pause-offscreen' ] = String(
			attributes.animationPauseOffscreen ??
				DEFAULT_ATTRIBUTES.animationPauseOffscreen
		);
	}

	if ( mode === 'scroll-appear' ) {
		dataAttrs[ 'data-mb-play-once' ] = String(
			attributes.animationPlayOnce ??
				DEFAULT_ATTRIBUTES.animationPlayOnce
		);
	}

	if ( mode === 'scroll-interactive' ) {
		dataAttrs[ 'data-mb-range-start' ] =
			attributes.animationRangeStart ||
			DEFAULT_ATTRIBUTES.animationRangeStart;
		dataAttrs[ 'data-mb-range-end' ] =
			attributes.animationRangeEnd ||
			DEFAULT_ATTRIBUTES.animationRangeEnd;
	}

	return {
		...props,
		className: classes,
		...dataAttrs,
	};
}

addFilter(
	'blocks.getSaveContent.extraProps',
	'motion-blocks/add-save-props',
	addAnimationSaveProps
);
