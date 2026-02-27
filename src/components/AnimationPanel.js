/**
 * AnimationPanel — Main animation controls panel.
 *
 * Shows mode-selection buttons when no animation is set,
 * or the matching sub-panel when a mode is active.
 */

import { PanelBody, Icon } from '@wordpress/components';
import { useRef, useCallback } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { desktop, seen, drawerRight } from '@wordpress/icons';

import PageLoadControls from './PageLoadControls';
import ScrollAppearControls from './ScrollAppearControls';
import ScrollInteractiveControls from './ScrollInteractiveControls';
import AnimationOptionsMenu from './AnimationOptionsMenu';
import { DEFAULT_ATTRIBUTES } from './constants';

export default function AnimationPanel( { attributes, setAttributes, blockName } ) {
	const {
		animationMode,
		animationType,
		animationRepeat,
		animationPreviewPlaying,
	} = attributes;
	const savedType = useRef( '' );

	const isLoopingMode =
		animationRepeat === 'loop' || animationRepeat === 'alternate';

	/**
	 * Replay the current animation preview by briefly clearing
	 * animationType so the withAnimationPreview HOC re-triggers.
	 * For looping modes, also set animationPreviewPlaying = true.
	 */
	const replayPreview = useCallback( () => {
		const current = animationType;
		if ( ! current ) {
			return;
		}
		if ( isLoopingMode ) {
			setAttributes( { animationPreviewPlaying: true } );
			return;
		}
		savedType.current = current;
		setAttributes( { animationType: '' } );
		requestAnimationFrame( () => {
			setAttributes( { animationType: savedType.current } );
		} );
	}, [ animationType, setAttributes, isLoopingMode ] );

	/**
	 * Stop a looping preview.
	 */
	const stopPreview = useCallback( () => {
		setAttributes( { animationPreviewPlaying: false } );
	}, [ setAttributes ] );

	/**
	 * Set animation mode and initialize defaults.
	 */
	const selectMode = ( mode ) => {
		setAttributes( {
			animationMode: mode,
			animationType: DEFAULT_ATTRIBUTES.animationType,
			animationDirection: DEFAULT_ATTRIBUTES.animationDirection,
			animationDuration: DEFAULT_ATTRIBUTES.animationDuration,
			animationDelay: DEFAULT_ATTRIBUTES.animationDelay,
			animationScrollTrigger: DEFAULT_ATTRIBUTES.animationScrollTrigger,
			animationExitMode: DEFAULT_ATTRIBUTES.animationExitMode,
			animationExitType: DEFAULT_ATTRIBUTES.animationExitType,
			animationExitDirection: DEFAULT_ATTRIBUTES.animationExitDirection,
			animationAcceleration: DEFAULT_ATTRIBUTES.animationAcceleration,
			animationBlurAmount: DEFAULT_ATTRIBUTES.animationBlurAmount,
			animationExitDuration: DEFAULT_ATTRIBUTES.animationExitDuration,
			animationExitDelay: DEFAULT_ATTRIBUTES.animationExitDelay,
			animationExitAcceleration: DEFAULT_ATTRIBUTES.animationExitAcceleration,
		} );
	};

	/**
	 * Paste animation — apply copied attributes to the current block.
	 */
	const pasteAnimation = useCallback(
		( data ) => {
			setAttributes( data );
		},
		[ setAttributes ]
	);

	/**
	 * Reset settings — revert properties to defaults, keep the current mode.
	 */
	const resetSettings = useCallback( () => {
		setAttributes( {
			animationType: DEFAULT_ATTRIBUTES.animationType,
			animationDirection: DEFAULT_ATTRIBUTES.animationDirection,
			animationDuration: DEFAULT_ATTRIBUTES.animationDuration,
			animationDelay: DEFAULT_ATTRIBUTES.animationDelay,
			animationRepeat: DEFAULT_ATTRIBUTES.animationRepeat,
			animationPauseOffscreen: DEFAULT_ATTRIBUTES.animationPauseOffscreen,
			animationPlayOnce: DEFAULT_ATTRIBUTES.animationPlayOnce,
			animationScrollTrigger: DEFAULT_ATTRIBUTES.animationScrollTrigger,
			animationExitMode: DEFAULT_ATTRIBUTES.animationExitMode,
			animationExitType: DEFAULT_ATTRIBUTES.animationExitType,
			animationExitDirection: DEFAULT_ATTRIBUTES.animationExitDirection,
			animationAcceleration: DEFAULT_ATTRIBUTES.animationAcceleration,
			animationBlurAmount: DEFAULT_ATTRIBUTES.animationBlurAmount,
			animationExitDuration: DEFAULT_ATTRIBUTES.animationExitDuration,
			animationExitDelay: DEFAULT_ATTRIBUTES.animationExitDelay,
			animationExitAcceleration: DEFAULT_ATTRIBUTES.animationExitAcceleration,
			animationRangeStart: DEFAULT_ATTRIBUTES.animationRangeStart,
			animationRangeEnd: DEFAULT_ATTRIBUTES.animationRangeEnd,
			animationPreviewPlaying: false,
		} );
	}, [ setAttributes ] );

	const removeAnimation = () => {
		setAttributes( {
			animationMode: '',
			animationType: '',
			animationDirection: '',
			animationDuration: DEFAULT_ATTRIBUTES.animationDuration,
			animationDelay: DEFAULT_ATTRIBUTES.animationDelay,
			animationAcceleration: DEFAULT_ATTRIBUTES.animationAcceleration,
			animationBlurAmount: DEFAULT_ATTRIBUTES.animationBlurAmount,
			animationRepeat: DEFAULT_ATTRIBUTES.animationRepeat,
			animationPauseOffscreen: DEFAULT_ATTRIBUTES.animationPauseOffscreen,
			animationPlayOnce: DEFAULT_ATTRIBUTES.animationPlayOnce,
			animationScrollTrigger: DEFAULT_ATTRIBUTES.animationScrollTrigger,
			animationExitMode: DEFAULT_ATTRIBUTES.animationExitMode,
			animationExitType: DEFAULT_ATTRIBUTES.animationExitType,
			animationExitDirection: DEFAULT_ATTRIBUTES.animationExitDirection,
			animationExitDuration: DEFAULT_ATTRIBUTES.animationExitDuration,
			animationExitDelay: DEFAULT_ATTRIBUTES.animationExitDelay,
			animationExitAcceleration: DEFAULT_ATTRIBUTES.animationExitAcceleration,
			animationRangeStart: DEFAULT_ATTRIBUTES.animationRangeStart,
			animationRangeEnd: DEFAULT_ATTRIBUTES.animationRangeEnd,
			animationPreviewPlaying: false,
		} );
	};

	return (
		<PanelBody
			title={
				animationMode
					? __( 'Animation', 'motion-blocks' ) + ' ✦'
					: __( 'Animation', 'motion-blocks' )
			}
			initialOpen={ false }
		>
			{ ! animationMode && (
				<div className="mb-mode-selector">
					<div className="mb-mode-selector__header">
						<span className="mb-mode-selector__label">
							{ __( 'Animation type', 'motion-blocks' ) }
						</span>
						<AnimationOptionsMenu
							onPaste={ pasteAnimation }
							pasteOnly
						/>
					</div>
					<div className="mb-mode-selector__cards">
						<button
							type="button"
							className="mb-mode-card"
							onClick={ () => selectMode( 'page-load' ) }
						>
							<div className="mb-mode-card__header">
								<Icon icon={ desktop } size={ 24 } />
								<span className="mb-mode-card__title">
									{ __(
										'On page load',
										'motion-blocks'
									) }
								</span>
							</div>
							<p className="mb-mode-card__description">
								{ __(
									'Plays once (or loops continuously) when the page first loads.',
									'motion-blocks'
								) }
							</p>
						</button>
						<button
							type="button"
							className="mb-mode-card"
							onClick={ () => selectMode( 'scroll-appear' ) }
						>
							<div className="mb-mode-card__header">
								<Icon icon={ seen } size={ 24 } />
								<span className="mb-mode-card__title">
									{ __(
										'Appear on scroll',
										'motion-blocks'
									) }
								</span>
							</div>
							<p className="mb-mode-card__description">
								{ __(
									'Trigger animations when the element enters or exits the screen.',
									'motion-blocks'
								) }
							</p>
						</button>
						<button
							type="button"
							className="mb-mode-card"
							onClick={ () =>
								selectMode( 'scroll-interactive' )
							}
						>
							<div className="mb-mode-card__header">
								<Icon icon={ drawerRight } size={ 24 } />
								<span className="mb-mode-card__title">
									{ __(
										'Interactive scroll',
										'motion-blocks'
									) }
								</span>
							</div>
							<p className="mb-mode-card__description">
								{ __(
									'Ties animation progress directly to scroll position.',
									'motion-blocks'
								) }
							</p>
						</button>
					</div>
				</div>
			) }

			{ animationMode === 'page-load' && (
				<PageLoadControls
					attributes={ attributes }
					setAttributes={ setAttributes }
					blockName={ blockName }
					onRemove={ removeAnimation }
					onPreview={ replayPreview }
					onStopPreview={ stopPreview }
					isLoopRunning={
						isLoopingMode && animationPreviewPlaying
					}
					onPaste={ pasteAnimation }
					onReset={ resetSettings }
				/>
			) }

			{ animationMode === 'scroll-appear' && (
				<ScrollAppearControls
					attributes={ attributes }
					setAttributes={ setAttributes }
					blockName={ blockName }
					onRemove={ removeAnimation }
					onPreview={ replayPreview }
					onPaste={ pasteAnimation }
					onReset={ resetSettings }
				/>
			) }

			{ animationMode === 'scroll-interactive' && (
				<ScrollInteractiveControls
					attributes={ attributes }
					setAttributes={ setAttributes }
					blockName={ blockName }
					onRemove={ removeAnimation }
					onPaste={ pasteAnimation }
					onReset={ resetSettings }
				/>
			) }
		</PanelBody>
	);
}
