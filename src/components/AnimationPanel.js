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
import {
	DEFAULT_ATTRIBUTES,
	PROPERTY_DEFINITIONS,
	FROM_ATTR,
	TO_ATTR,
} from './constants';

/**
 * Reset all custom From/To attributes to their identity defaults.
 * Used by selectMode / resetSettings / removeAnimation so the custom
 * editor starts fresh whenever the animation is reconfigured.
 */
function customFromToDefaults() {
	const out = {};
	for ( const def of PROPERTY_DEFINITIONS ) {
		out[ FROM_ATTR[ def.id ] ] = DEFAULT_ATTRIBUTES[ FROM_ATTR[ def.id ] ];
		out[ TO_ATTR[ def.id ] ] = DEFAULT_ATTRIBUTES[ TO_ATTR[ def.id ] ];
	}
	return out;
}

export default function AnimationPanel( {
	attributes,
	setAttributes,
	blockName,
	clientId,
	multiSelectCount = 0,
} ) {
	const {
		animationMode,
		animationType,
		animationRepeat,
		animationPreviewPlaying,
		animationDuration,
		animationDelay,
	} = attributes;
	const savedType = useRef( '' );

	const isLoopingMode =
		animationRepeat === 'loop' || animationRepeat === 'alternate';

	/**
	 * Replay the current animation preview.
	 *
	 * - Looping mode: just sets the play flag; the looping animation
	 *   keeps cycling until stopped.
	 * - Custom mode: also uses the play flag, but auto-clears it
	 *   after duration+delay so the animation runs once. (Custom is
	 *   static-by-default in the editor; the flag is the only thing
	 *   that lets the keyframe attach.)
	 * - Preset modes (Fade/Slide/etc.): briefly clears `animationType`
	 *   so the HOC re-attaches the className, restarting the CSS
	 *   animation.
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
		if ( current === 'custom' ) {
			setAttributes( { animationPreviewPlaying: true } );
			const duration = parseFloat( animationDuration ) || 0.6;
			const delay = parseFloat( animationDelay ) || 0;
			const totalMs = ( duration + delay ) * 1000;
			setTimeout( () => {
				setAttributes( { animationPreviewPlaying: false } );
			}, totalMs + 100 );
			return;
		}
		savedType.current = current;
		setAttributes( { animationType: '' } );
		requestAnimationFrame( () => {
			setAttributes( { animationType: savedType.current } );
		} );
	}, [
		animationType,
		setAttributes,
		isLoopingMode,
		animationDuration,
		animationDelay,
	] );

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
			...customFromToDefaults(),
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
			...customFromToDefaults(),
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
			...customFromToDefaults(),
		} );
	};

	return (
		<PanelBody
			title={
				animationMode
					? __( 'Animation', 'motion-blocks' ) + ' ✦'
					: __( 'Animation', 'motion-blocks' )
			}
			initialOpen={ !! animationMode }
		>
			{ multiSelectCount > 1 && (
				<div className="mb-multiselect-notice">
					{ /* eslint-disable-next-line @wordpress/i18n-translator-comments */ }
					{ __(
						'Changes apply to all selected blocks.',
						'motion-blocks'
					) }
					<span className="mb-multiselect-notice__count">
						{ multiSelectCount }
					</span>
				</div>
			) }

			{ ! animationMode && (
				<div className="mb-mode-selector">
					<div className="mb-mode-selector__header">
						<span className="mb-mode-selector__label">
							{ __( 'Animation type', 'motion-blocks' ) }
						</span>
						<AnimationOptionsMenu
							attributes={ attributes }
							blockName={ blockName }
							clientId={ clientId }
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
					clientId={ clientId }
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
					clientId={ clientId }
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
					clientId={ clientId }
					onRemove={ removeAnimation }
					onPaste={ pasteAnimation }
					onReset={ resetSettings }
				/>
			) }
		</PanelBody>
	);
}
