/**
 * Motion Blocks — Frontend Script
 *
 * Handles three animation modes:
 *   1. Page load — immediate trigger with optional repeat & pause-offscreen.
 *   2. Scroll in view — Intersection Observer with enter/exit/both support.
 *   3. Interactive scroll — CSS scroll-driven animations (view-timeline).
 */

( function () {
	'use strict';

	function init() {
		initPageLoadAnimations();
		initScrollAppearAnimations();
		initScrollInteractiveAnimations();
	}

	/* ---------------------------------------------------------------
	 * Direction → CSS Custom Property Mappings
	 *
	 * Mirrors DIRECTION_CSS_VARS from constants.js. Kept as plain
	 * objects so the frontend stays dependency-free.
	 * ------------------------------------------------------------- */

	var DIRECTION_VARS = {
		slide: {
			ltr: { '--mb-slide-x': '-50px', '--mb-slide-y': '0' },
			rtl: { '--mb-slide-x': '50px', '--mb-slide-y': '0' },
			ttb: { '--mb-slide-x': '0', '--mb-slide-y': '-50px' },
			btt: { '--mb-slide-x': '0', '--mb-slide-y': '50px' },
		},
		// Slide Out — vars are the END position. Negated from `slide`
		// so the direction value still names the motion direction
		// (btt = element moves upward, ending above its rest spot).
		'slide-out': {
			ltr: { '--mb-slide-x': '50px', '--mb-slide-y': '0' },
			rtl: { '--mb-slide-x': '-50px', '--mb-slide-y': '0' },
			ttb: { '--mb-slide-x': '0', '--mb-slide-y': '50px' },
			btt: { '--mb-slide-x': '0', '--mb-slide-y': '-50px' },
		},
		wipe: {
			ltr: { '--mb-wipe-from': 'inset(0 100% 0 0)' },
			rtl: { '--mb-wipe-from': 'inset(0 0 0 100%)' },
			ttb: { '--mb-wipe-from': 'inset(100% 0 0 0)' },
			btt: { '--mb-wipe-from': 'inset(0 0 100% 0)' },
		},
		curtain: {
			horizontal: { '--mb-curtain-from': 'inset(0 50% 0 50%)' },
			vertical: { '--mb-curtain-from': 'inset(50% 0 50% 0)' },
		},
		flip: {
			ltr: { '--mb-flip-transform': 'rotateY(-90deg)' },
			rtl: { '--mb-flip-transform': 'rotateY(90deg)' },
			ttb: { '--mb-flip-transform': 'rotateX(90deg)' },
			btt: { '--mb-flip-transform': 'rotateX(-90deg)' },
		},
		scale: {
			none: { '--mb-scale-x': '0', '--mb-scale-y': '0' },
			btt: { '--mb-scale-x': '0', '--mb-scale-y': '50px' },
			ttb: { '--mb-scale-x': '0', '--mb-scale-y': '-50px' },
			ltr: { '--mb-scale-x': '-50px', '--mb-scale-y': '0' },
			rtl: { '--mb-scale-x': '50px', '--mb-scale-y': '0' },
		},
		// Scale Out — same negation rationale as slide-out above.
		'scale-out': {
			none: { '--mb-scale-x': '0', '--mb-scale-y': '0' },
			btt: { '--mb-scale-x': '0', '--mb-scale-y': '-50px' },
			ttb: { '--mb-scale-x': '0', '--mb-scale-y': '50px' },
			ltr: { '--mb-scale-x': '50px', '--mb-scale-y': '0' },
			rtl: { '--mb-scale-x': '-50px', '--mb-scale-y': '0' },
		},
	};

	/* Exit keyframe map — mirrors EXIT_KEYFRAME_MAP from constants.js */
	var EXIT_KEYFRAME_FOR = {
		fade: 'mbFadeOut',
		slide: 'mbSlideOut',
		wipe: 'mbWipeOut',
		curtain: 'mbCurtainClose',
		flip: 'mbFadeOut',
		scale: 'mbScaleOut',
		blur: 'mbBlurOut',
		rotate: 'mbRotateOut',
	};

	/* Exit class map — derives from enter type */
	var EXIT_CLASS_FOR = {
		fade: 'mb-exit-fade',
		slide: 'mb-exit-slide',
		wipe: 'mb-exit-wipe',
		curtain: 'mb-exit-curtain',
		flip: 'mb-exit-fade',
		scale: 'mb-exit-scale',
		blur: 'mb-exit-blur',
		rotate: 'mb-exit-rotate',
	};

	/* ---------------------------------------------------------------
	 * Helpers
	 * ------------------------------------------------------------- */

	/**
	 * Apply CSS custom properties for duration and delay from data attributes.
	 */
	function applyTimingProps( el ) {
		var duration = el.dataset.mbDuration;
		var delay = el.dataset.mbDelay;
		var acceleration = el.dataset.mbAcceleration;

		if ( duration ) {
			el.style.setProperty( '--mb-duration', duration + 's' );
		}
		if ( delay ) {
			el.style.setProperty( '--mb-delay', delay + 's' );
		}
		if ( acceleration ) {
			el.style.setProperty( '--mb-timing', acceleration );
		}
	}

	/**
	 * Apply blur amount CSS custom property from data attribute.
	 */
	function applyBlurProps( el ) {
		var blurAmount = el.dataset.mbBlurAmount;
		if ( blurAmount ) {
			el.style.setProperty( '--mb-blur-amount', blurAmount + 'px' );
		}
	}

	/**
	 * Apply rotate angle CSS custom property from data attribute.
	 */
	function applyRotateProps( el ) {
		var rotateAngle = el.dataset.mbRotateAngle;
		if ( rotateAngle ) {
			el.style.setProperty( '--mb-rotate-angle', rotateAngle + 'deg' );
		}
	}

	/* ---------------------------------------------------------------
	 * Custom (Start / End) — per-block @keyframes injection.
	 *
	 * For animationType === 'custom', the editor saves data attrs
	 * `data-mb-from-{prop}` / `data-mb-to-{prop}` for each property
	 * the user explicitly added. Properties not added are absent —
	 * which is meaningful: the keyframe will omit them and CSS will
	 * interpolate to the element's computed style on that side.
	 *
	 * For each custom-type element, we synthesize a unique
	 * `@keyframes mb-custom-{n}` rule from its data attrs, append it
	 * to a shared <style> in <head>, and bind it via inline
	 * animation-name on the element.
	 * ------------------------------------------------------------- */

	// Definition list mirrors PROPERTY_DEFINITIONS in constants.js.
	// Order matters — composes left-to-right into the transform.
	var CUSTOM_PROPS = [
		{ id: 'opacity', dataFrom: 'mbFromOpacity', dataTo: 'mbToOpacity' },
		{ id: 'translateX', dataFrom: 'mbFromTranslateX', dataTo: 'mbToTranslateX' },
		{ id: 'translateY', dataFrom: 'mbFromTranslateY', dataTo: 'mbToTranslateY' },
		{ id: 'scale', dataFrom: 'mbFromScale', dataTo: 'mbToScale' },
		{ id: 'rotate', dataFrom: 'mbFromRotate', dataTo: 'mbToRotate' },
		// 3D rotations (Flip).
		{ id: 'rotateX', dataFrom: 'mbFromRotateX', dataTo: 'mbToRotateX' },
		{ id: 'rotateY', dataFrom: 'mbFromRotateY', dataTo: 'mbToRotateY' },
		// Filter blur.
		{ id: 'blur', dataFrom: 'mbFromBlur', dataTo: 'mbToBlur' },
		// Clip path (Curtain / Wipe).
		{ id: 'clipPath', dataFrom: 'mbFromClipPath', dataTo: 'mbToClipPath' },
	];

	function isAddedDatasetVal( v ) {
		return v !== undefined && v !== null && v !== '';
	}

	/**
	 * Build the body of one side of the keyframe (the contents of
	 * `from { … }` or `to { … }`) from the element's data attrs.
	 *
	 * `attrPrefix` overrides the dataset prefix when reading per-slot
	 * Custom From/To values. Pass 'mbEntryFrom'/'mbEntryTo' or
	 * 'mbExitFrom'/'mbExitTo' to read the slot-prefixed attrs; default
	 * is the shared `mbFromX` / `mbToX` used by Page Load and Scroll
	 * Interactive.
	 */
	function buildSideBody( el, sideKey, attrPrefix ) {
		var bag = {};
		CUSTOM_PROPS.forEach( function ( p ) {
			var key;
			if ( attrPrefix ) {
				// p.id is the lowerCamel key suffix (Opacity, TranslateX, …)
				key =
					attrPrefix +
					p.id.charAt( 0 ).toUpperCase() +
					p.id.slice( 1 );
			} else {
				key = sideKey === 'from' ? p.dataFrom : p.dataTo;
			}
			var raw = el.dataset[ key ];
			if ( isAddedDatasetVal( raw ) ) {
				bag[ p.id ] = raw;
			}
		} );
		var decls = [];
		if ( bag.opacity !== undefined ) {
			decls.push( 'opacity: ' + bag.opacity );
		}
		// Compose transform — perspective() only when a 3D rotation
		// is present (mirrors buildKeyframeSide in constants.js).
		var tx = [];
		var has3D =
			bag.rotateX !== undefined || bag.rotateY !== undefined;
		if ( has3D ) {
			tx.push( 'perspective(800px)' );
		}
		var hasTx = bag.translateX !== undefined;
		var hasTy = bag.translateY !== undefined;
		if ( hasTx || hasTy ) {
			tx.push(
				'translate(' +
					( hasTx ? bag.translateX : '0px' ) +
					', ' +
					( hasTy ? bag.translateY : '0px' ) +
					')'
			);
		}
		if ( bag.scale !== undefined ) {
			tx.push( 'scale(' + bag.scale + ')' );
		}
		if ( bag.rotate !== undefined ) {
			tx.push( 'rotate(' + bag.rotate + 'deg)' );
		}
		if ( bag.rotateX !== undefined ) {
			tx.push( 'rotateX(' + bag.rotateX + 'deg)' );
		}
		if ( bag.rotateY !== undefined ) {
			tx.push( 'rotateY(' + bag.rotateY + 'deg)' );
		}
		if ( tx.length > 0 ) {
			decls.push( 'transform: ' + tx.join( ' ' ) );
		}
		if ( bag.blur !== undefined ) {
			decls.push( 'filter: blur(' + bag.blur + 'px)' );
		}
		if ( bag.clipPath !== undefined ) {
			decls.push( 'clip-path: ' + bag.clipPath );
		}
		if ( decls.length === 0 ) {
			return null;
		}
		return decls.join( '; ' ) + ';';
	}

	// Shared <style> element for all custom keyframes. Created
	// lazily on first use; one rule appended per custom block.
	var customStyleEl = null;
	var customKeyframeCounter = 0;

	function getCustomStyleEl() {
		if ( ! customStyleEl ) {
			customStyleEl = document.createElement( 'style' );
			customStyleEl.setAttribute( 'data-mb-custom', '' );
			document.head.appendChild( customStyleEl );
		}
		return customStyleEl;
	}

	/**
	 * Build the scoped CSS rule string for target='img' mode.
	 * Mirrors buildImgTargetCSS in src/index.js — see that for the
	 * full reasoning. Selectors cover the common WP image markup
	 * paths (figure > img, a > img, figure > a > img, the wrapper
	 * itself, plus cover-bg). `:has()` makes the img's immediate
	 * parent the clipping frame without injecting any wrapper.
	 */
	function buildImgScopedCSS( uid, keyframeName, mode ) {
		var scope = '[data-mb-uid="' + uid + '"]';
		// Descendant selector — works in editor (extra wrappers) and
		// frontend (direct figure child). `:first-of-type` filters
		// to the first img in its sibling group, so figcaption stays
		// unaffected.
		var imgSelector = scope + ' img:first-of-type';
		// Match both the wrapper itself (e.g. `<figure data-mb-uid>`)
		// and any descendant of the wrapper that directly holds the
		// img. The wrapper-self case is the common Image block path.
		var parentSelector = [
			scope + ':has(> img:first-of-type)',
			scope + ' :has(> img:first-of-type)',
		].join( ', ' );

		var animProps;
		if ( mode === 'scroll-interactive' ) {
			animProps = [
				'animation-name: ' + keyframeName,
				'animation-timeline: view()',
				'animation-range-start: var(--mb-range-start, entry 0%)',
				'animation-range-end: var(--mb-range-end, exit 100%)',
				'animation-duration: 1ms',
				'animation-fill-mode: both',
				'animation-timing-function: var(--mb-timing, linear)',
			];
		} else {
			animProps = [
				'animation-name: ' + keyframeName,
				'animation-duration: var(--mb-duration, 0.6s)',
				'animation-delay: var(--mb-delay, 0s)',
				'animation-fill-mode: var(--mb-fill-mode, both)',
				'animation-timing-function: var(--mb-timing, ease)',
				'animation-iteration-count: var(--mb-iteration-count, 1)',
				'animation-direction: var(--mb-direction, normal)',
			];
		}

		return [
			parentSelector + ' { overflow: clip; }',
			'@supports not (overflow: clip) { ' +
				parentSelector +
				' { overflow: hidden; } }',
			imgSelector + ' { ' + animProps.join( '; ' ) + '; }',
		].join( '\n' );
	}

	/**
	 * For `image-move` mode: synthesize the parallax from/to values
	 * from the direction. Mirrors getPresetFromTo('image-move') in
	 * constants.js — the formula is `(scale - 1) / 2 * 100%` for
	 * the translate distance at SCALE = 1.2.
	 */
	function buildImageMoveSides( direction ) {
		var SCALE = 1.2;
		var SHIFT = ( ( SCALE - 1 ) / 2 ) * 100; // 10 (percent)
		var dirs = {
			btt: { x: 0, y: SHIFT },
			ttb: { x: 0, y: -SHIFT },
			ltr: { x: -SHIFT, y: 0 },
			rtl: { x: SHIFT, y: 0 },
		};
		var m = dirs[ direction ] || dirs.btt;
		var fromDecls = [ 'transform: ' ];
		var toDecls = [ 'transform: ' ];
		var fromTx = [];
		var toTx = [];
		// translate first, scale second (matches buildKeyframeSide).
		if ( m.x !== 0 || m.y !== 0 ) {
			fromTx.push(
				'translate(' + m.x + '%, ' + m.y + '%)'
			);
			toTx.push(
				'translate(' + -m.x + '%, ' + -m.y + '%)'
			);
		}
		fromTx.push( 'scale(' + SCALE + ')' );
		toTx.push( 'scale(' + SCALE + ')' );
		fromDecls[ 0 ] += fromTx.join( ' ' ) + ';';
		toDecls[ 0 ] += toTx.join( ' ' ) + ';';
		return { fromBody: fromDecls[ 0 ], toBody: toDecls[ 0 ] };
	}

	/**
	 * For `image-zoom` mode: pure scale 1 → 1.2. No direction, no
	 * translate. Mirrors getPresetFromTo('image-zoom') in constants.js.
	 */
	function buildImageZoomSides() {
		return {
			fromBody: 'transform: scale(1);',
			toBody: 'transform: scale(1.2);',
		};
	}

	/**
	 * For a custom-type element: build its @keyframes rule, append
	 * it to the shared style element, set animation-name inline.
	 * No-op if neither side has any added properties.
	 *
	 * For target='img', also inject a scoped CSS rule that animates
	 * the first img descendant instead of the block wrapper, with
	 * `overflow: clip` on the img's immediate parent.
	 *
	 * For type='image-move', synthesize a parallax keyframe from the
	 * direction and treat as img-target.
	 */
	function applyCustomKeyframe( el ) {
		// Scroll Appear blocks read per-slot data attributes
		// (`data-mb-entry-*` / `data-mb-exit-*`) instead of the shared
		// `data-mb-type` / `data-mb-from-*` / `data-mb-to-*`. Up to
		// two keyframes are injected (one per Custom slot) and bound
		// via `--mb-entry-anim-name` / `--mb-exit-anim-name` CSS
		// variables, which the slot-specific CSS rules consume.
		if ( el.dataset.mbMode === 'scroll-appear' ) {
			applyScrollAppearCustomKeyframes( el );
			return;
		}

		var type = el.dataset.mbType;
		if (
			type !== 'custom' &&
			type !== 'image-move' &&
			type !== 'image-zoom'
		) {
			return;
		}
		var fromBody;
		var toBody;
		if ( type === 'image-move' ) {
			var moveSides = buildImageMoveSides(
				el.dataset.mbDirection || 'btt'
			);
			fromBody = moveSides.fromBody;
			toBody = moveSides.toBody;
		} else if ( type === 'image-zoom' ) {
			var zoomSides = buildImageZoomSides();
			fromBody = zoomSides.fromBody;
			toBody = zoomSides.toBody;
		} else {
			fromBody = buildSideBody( el, 'from' );
			toBody = buildSideBody( el, 'to' );
		}
		if ( ! fromBody && ! toBody ) {
			return;
		}
		customKeyframeCounter += 1;
		var name = 'mb-custom-runtime-' + customKeyframeCounter;
		appendKeyframeRule( name, fromBody, toBody );

		// Branch on target: block (default) animates the wrapper;
		// img scopes the keyframe to the first <img> descendant.
		if ( el.dataset.mbTarget === 'img' ) {
			var uid = 'mb-' + customKeyframeCounter;
			el.setAttribute( 'data-mb-uid', uid );
			var scopedCSS = buildImgScopedCSS(
				uid,
				name,
				el.dataset.mbMode
			);
			getCustomStyleEl().appendChild(
				document.createTextNode( scopedCSS )
			);
		} else {
			el.style.animationName = name;
			// Stagger cascade for Custom: inner blocks bind their
			// animation-name to this same per-block keyframe via
			// `--mb-stagger-anim-name` (see animations.css). Custom
			// properties inherit by default, so simply setting it on
			// the parent block is enough — no per-child wiring
			// required. Safe to set unconditionally: the CSS rule
			// that reads it only fires on `.mb-stagger-parent`
			// elements, so non-stagger blocks ignore it.
			el.style.setProperty( '--mb-stagger-anim-name', name );
		}
	}

	/**
	 * Inject 0-2 per-block keyframes for a Scroll Appear block's
	 * Custom slots, and expose their names via CSS variables that
	 * the slot-binding rules in animations.css consume.
	 *
	 * Both slots share the wrapper's `--mb-stagger-anim-name` (which
	 * the existing Stagger cascade reads) — but only the Entry slot
	 * sets it. Exit-only Custom blocks don't compose with Stagger
	 * meaningfully (no entry animation to cascade), and the inner
	 * blocks wouldn't run an exit animation either.
	 *
	 * When the block carries `data-mb-target="img"`, the per-slot
	 * keyframes are bound to the first `<img>` descendant instead of
	 * the wrapper — same approach as Page Load + Custom + img. The
	 * wrapper is left animation-free; a CSS override keeps the
	 * `mb-has-entry` pre-hide from applying so the figure / caption
	 * remain visible.
	 */
	function applyScrollAppearCustomKeyframes( el ) {
		var entryType = el.dataset.mbEntryType || '';
		var exitType = el.dataset.mbExitType || '';
		var imgTarget = el.dataset.mbTarget === 'img';
		var entryName = null;
		var exitName = null;

		// Entry slot. Three flavors share the same synthesis path:
		//   - `custom`        — keyframe built from the user's From/To attrs
		//   - `image-move`    — keyframe built from direction (scale + translate)
		//   - `image-zoom`    — keyframe built from scale 1 → 1.2 (no direction)
		// Image effects always imply imgTarget (the save-props layer
		// forces `data-mb-target="img"` for them).
		var entryFrom = null;
		var entryTo = null;
		if ( entryType === 'custom' ) {
			entryFrom = buildSideBody( el, null, 'mbEntryFrom' );
			entryTo = buildSideBody( el, null, 'mbEntryTo' );
		} else if ( entryType === 'image-move' ) {
			var moveSides = buildImageMoveSides(
				el.dataset.mbEntryDirection || 'btt'
			);
			entryFrom = moveSides.fromBody;
			entryTo = moveSides.toBody;
		} else if ( entryType === 'image-zoom' ) {
			var zoomSides = buildImageZoomSides();
			entryFrom = zoomSides.fromBody;
			entryTo = zoomSides.toBody;
		}
		if ( entryFrom || entryTo ) {
			customKeyframeCounter += 1;
			entryName = 'mb-custom-runtime-' + customKeyframeCounter;
			appendKeyframeRule( entryName, entryFrom, entryTo );
			if ( ! imgTarget ) {
				el.style.setProperty( '--mb-entry-anim-name', entryName );
				// Stagger cascade for the entry phase — inner blocks
				// inherit this var via the cascade.
				el.style.setProperty(
					'--mb-stagger-anim-name',
					entryName
				);
			}
		}

		// Exit slot. Same three flavors as the Entry slot. Image
		// effects play the same keyframe but on the exit phase — the
		// image zooms / parallaxes as the element scrolls out of view.
		var exitFrom = null;
		var exitTo = null;
		if ( exitType === 'custom' ) {
			exitFrom = buildSideBody( el, null, 'mbExitFrom' );
			exitTo = buildSideBody( el, null, 'mbExitTo' );
		} else if ( exitType === 'image-move' ) {
			var moveSidesExit = buildImageMoveSides(
				el.dataset.mbExitDirection || 'btt'
			);
			exitFrom = moveSidesExit.fromBody;
			exitTo = moveSidesExit.toBody;
		} else if ( exitType === 'image-zoom' ) {
			var zoomSidesExit = buildImageZoomSides();
			exitFrom = zoomSidesExit.fromBody;
			exitTo = zoomSidesExit.toBody;
		}
		if ( exitFrom || exitTo ) {
			customKeyframeCounter += 1;
			exitName = 'mb-custom-runtime-' + customKeyframeCounter;
			appendKeyframeRule( exitName, exitFrom, exitTo );
			if ( ! imgTarget ) {
				el.style.setProperty( '--mb-exit-anim-name', exitName );
			}
		}

		// img-target: emit slot-aware scoped CSS that animates the
		// first <img> descendant for each filled slot, scoped to a
		// per-block uid so multiple img-target blocks don't collide.
		if ( imgTarget && ( entryName || exitName ) ) {
			customKeyframeCounter += 1;
			var uid = 'mb-' + customKeyframeCounter;
			el.setAttribute( 'data-mb-uid', uid );
			var scopedCSS = buildScrollAppearImgScopedCSS(
				uid,
				entryName,
				exitName
			);
			if ( scopedCSS ) {
				getCustomStyleEl().appendChild(
					document.createTextNode( scopedCSS )
				);
			}
		}
	}

	/**
	 * Build slot-aware scoped CSS for Scroll Appear + Custom +
	 * img-target. Each slot binds its keyframe to the first img
	 * descendant gated on the slot's trigger class
	 * (`.mb-triggered` for entry, `.mb-exit-triggered` for exit).
	 * Animation timing reads the shared `--mb-duration` etc. vars
	 * that the IO callback swaps between phases.
	 *
	 * `overflow: clip` on the img's immediate parent (matched via
	 * `:has(> img:first-of-type)`) provides a static clipping
	 * rectangle. A transformed img child gets clipped against that
	 * rectangle — clip-path on the img itself wouldn't work because
	 * the clip transforms with the element and follows it past its
	 * natural border.
	 */
	function buildScrollAppearImgScopedCSS( uid, entryName, exitName ) {
		var scope = '[data-mb-uid="' + uid + '"]';
		var imgSelector = scope + ' img:first-of-type';
		var parentSelector = [
			scope + ':has(> img:first-of-type)',
			scope + ' :has(> img:first-of-type)',
		].join( ', ' );
		var rules = [];
		rules.push( parentSelector + ' { overflow: clip; }' );
		rules.push(
			'@supports not (overflow: clip) { ' +
				parentSelector +
				' { overflow: hidden; } }'
		);
		var sharedAnim = [
			'animation-duration: var(--mb-duration, 0.6s)',
			'animation-delay: var(--mb-delay, 0s)',
			'animation-fill-mode: var(--mb-fill-mode, both)',
			'animation-timing-function: var(--mb-timing, ease)',
			'animation-iteration-count: var(--mb-iteration-count, 1)',
			'animation-direction: var(--mb-direction, normal)',
		];
		if ( entryName ) {
			rules.push(
				scope +
					'.mb-triggered img:first-of-type { ' +
					'animation-name: ' +
					entryName +
					'; ' +
					sharedAnim.join( '; ' ) +
					'; }'
			);
		}
		if ( exitName ) {
			rules.push(
				scope +
					'.mb-exit-triggered img:first-of-type { ' +
					'animation-name: ' +
					exitName +
					'; ' +
					sharedAnim.join( '; ' ) +
					'; }'
			);
		}
		return rules.join( '\n' );
	}

	/**
	 * Append a `@keyframes name { from { … } to { … } }` rule to the
	 * shared `<style data-mb-custom>` element. Either body may be null
	 * (CSS interpolates to the element's computed style on that end).
	 */
	function appendKeyframeRule( name, fromBody, toBody ) {
		var lines = [ '@keyframes ' + name + ' {' ];
		if ( fromBody ) {
			lines.push( '  from { ' + fromBody + ' }' );
		}
		if ( toBody ) {
			lines.push( '  to { ' + toBody + ' }' );
		}
		lines.push( '}' );
		getCustomStyleEl().appendChild(
			document.createTextNode( lines.join( '\n' ) )
		);
	}

	/**
	 * Apply direction CSS custom properties for a given type + direction.
	 */
	function applyDirectionProps( el, type, direction ) {
		if ( ! type || ! direction ) {
			return;
		}
		var typeVars = DIRECTION_VARS[ type ];
		if ( ! typeVars ) {
			return;
		}
		var vars = typeVars[ direction ];
		if ( ! vars ) {
			return;
		}
		for ( var prop in vars ) {
			el.style.setProperty( prop, vars[ prop ] );
		}
	}

	/* ---------------------------------------------------------------
	 * 1. Page Load Animations
	 * ------------------------------------------------------------- */

	function initPageLoadAnimations() {
		var elements = document.querySelectorAll( '.mb-mode-page-load' );

		elements.forEach( function ( el ) {
			applyTimingProps( el );
			applyDirectionProps(
				el,
				el.dataset.mbType,
				el.dataset.mbDirection
			);
			applyBlurProps( el );
			applyRotateProps( el );
			applyCustomKeyframe( el );

			// Handle repeat mode.
			var repeat = el.dataset.mbRepeat || 'once';

			if ( repeat === 'loop' ) {
				el.style.animationIterationCount = 'infinite';
				el.style.animationFillMode = 'none';
			} else if ( repeat === 'alternate' ) {
				el.style.animationIterationCount = 'infinite';
				el.style.animationDirection = 'alternate';
				el.style.animationFillMode = 'none';
			}

			// Trigger the animation.
			el.classList.add( 'mb-triggered' );

			// Pause off-screen (mainly useful for looping/alternating animations).
			if ( el.dataset.mbPauseOffscreen === 'true' ) {
				setupPauseOffscreen( el );
			}
		} );
	}

	/**
	 * Pause/resume animation based on element visibility.
	 */
	function setupPauseOffscreen( el ) {
		var observer = new IntersectionObserver(
			function ( entries ) {
				entries.forEach( function ( entry ) {
					el.style.animationPlayState = entry.isIntersecting
						? 'running'
						: 'paused';
				} );
			},
			{ threshold: 0 }
		);

		observer.observe( el );
	}

	/* ---------------------------------------------------------------
	 * 2. Scroll in View Animations (slot model)
	 *
	 * Each block has an Entry slot and an Exit slot, each
	 * independently filled or empty. The IO callback fires the
	 * matching slot's animation on each scroll-direction transition:
	 *
	 *   - intersecting (forward enter)     → Entry slot fires
	 *   - not intersecting (forward leave) → Exit slot fires
	 *   - intersecting after exit          → Entry slot fires again
	 *   - …
	 *
	 * `mb-has-entry` class on the wrapper signals "Entry slot is
	 * filled" — used by the CSS initial-hide rule.
	 *
	 * Slot config comes from per-slot data attributes
	 * (data-mb-entry-* / data-mb-exit-*). The frontend doesn't read
	 * `data-mb-type` for Scroll Appear blocks any more.
	 * ------------------------------------------------------------- */

	function initScrollAppearAnimations() {
		var elements = document.querySelectorAll( '.mb-mode-scroll-appear' );

		if ( ! elements.length ) {
			return;
		}

		elements.forEach( function ( el ) {
			var entry = readSlotConfig( el, 'entry' );
			var exit = readSlotConfig( el, 'exit' );
			var hasEntry = entry.type !== '';
			var hasExit = exit.type !== '';
			if ( ! hasEntry && ! hasExit ) {
				return;
			}
			// Play once is meaningful only when the Entry slot is
			// filled (semantic: "fire the entry animation exactly
			// once, then unobserve"). When only Exit is filled, the
			// block is observable indefinitely so the user can scroll
			// back to it and see the fade-out replay.
			var playOnce =
				hasEntry && el.dataset.mbPlayOnce !== 'false';
			// Track whether the element has been seen at least once,
			// so the IO's initial "not intersecting" callback doesn't
			// fire the exit animation before any enter has happened.
			var hasEntered = false;

			// Apply baseline direction / blur / rotate / custom-keyframe
			// setup. Per-slot timing is applied on each transition below.
			applyCustomKeyframe( el );
			applyBlurProps( el );
			applyRotateProps( el );

			var observer = new IntersectionObserver(
				function ( entries ) {
					entries.forEach( function ( ioEntry ) {
						if ( ioEntry.isIntersecting ) {
							hasEntered = true;
							handleSlotEnter(
								el,
								entry,
								hasExit,
								playOnce,
								observer
							);
						} else {
							// Forward-leave guard for Exit-only blocks:
							// IO can't tell us whether the element left
							// out the top (forward) or out the bottom
							// (backward / initial-state). Only fire the
							// exit animation when the element is fully
							// above the shrunken viewport — never when
							// it's below.
							//
							// Bug history: an earlier check compared
							// `rect.bottom > rb.top`, which is true at
							// the exact moment IO fires not-intersecting
							// from a forward leave (the threshold drop
							// happens with a few pixels of overlap still
							// present), so the guard ate every
							// legitimate exit. The `rect.top >= rb.bottom`
							// form correctly only matches the "fully
							// below viewport" case.
							if ( ! hasEntered && ! hasExit ) {
								return;
							}
							if ( ! hasEntered ) {
								// Exit-only block, initial callback:
								// only count as exited when the element
								// has truly cleared the top edge. Else
								// the page-load "below the fold" state
								// would stamp every block as exited.
								var rb = ioEntry.rootBounds;
								if (
									rb &&
									ioEntry.boundingClientRect.top >= rb.bottom
								) {
									return;
								}
								hasEntered = true;
							}
							handleSlotExit(
								el,
								exit,
								hasEntry,
								playOnce,
								observer
							);
						}
					} );
				},
				{
					threshold: 0.1,
					rootMargin: '-15% 0px -15% 0px',
				}
			);

			observer.observe( el );
		} );
	}

	/**
	 * Read a slot's config from the element's data attributes. Returns
	 * an object even when the slot is empty (type === '').
	 */
	function readSlotConfig( el, slot ) {
		var prefix = slot === 'entry' ? 'mbEntry' : 'mbExit';
		return {
			slot: slot,
			type: el.dataset[ prefix + 'Type' ] || '',
			direction: el.dataset[ prefix + 'Direction' ] || '',
			duration: el.dataset[ prefix + 'Duration' ],
			delay: el.dataset[ prefix + 'Delay' ],
			acceleration: el.dataset[ prefix + 'Acceleration' ],
			blurAmount: el.dataset[ prefix + 'BlurAmount' ],
			rotateAngle: el.dataset[ prefix + 'RotateAngle' ],
		};
	}

	/**
	 * Apply the slot's per-property CSS custom properties to the
	 * element. Sets shared `--mb-duration` / `--mb-delay` /
	 * `--mb-timing` / `--mb-blur-amount` / `--mb-rotate-angle` so the
	 * existing CSS animation rules (which read these names) consume
	 * the right values for the current phase.
	 */
	function applySlotVars( el, slotConfig ) {
		if ( slotConfig.duration ) {
			el.style.setProperty(
				'--mb-duration',
				slotConfig.duration + 's'
			);
		}
		if ( slotConfig.delay ) {
			el.style.setProperty( '--mb-delay', slotConfig.delay + 's' );
		}
		if ( slotConfig.acceleration ) {
			el.style.setProperty( '--mb-timing', slotConfig.acceleration );
		}
		if ( slotConfig.blurAmount ) {
			el.style.setProperty(
				'--mb-blur-amount',
				slotConfig.blurAmount + 'px'
			);
		}
		if ( slotConfig.rotateAngle ) {
			el.style.setProperty(
				'--mb-rotate-angle',
				slotConfig.rotateAngle + 'deg'
			);
		}
		applyDirectionProps( el, slotConfig.type, slotConfig.direction );
	}

	/**
	 * Handle an entering-viewport event. Fires the Entry slot if
	 * it's filled. If not, removes any lingering `mb-exit-triggered`
	 * class so the element returns to its base visible state.
	 */
	function handleSlotEnter( el, entry, hasExit, playOnce, observer ) {
		if ( entry.type === '' ) {
			// Entry slot empty (e.g., Exit-only block re-entering
			// viewport). Drop the exit-triggered class and clear any
			// reverse-direction flag from a Custom exit. The element
			// returns to its natural base state — no entry animation
			// to play.
			el.classList.remove( 'mb-exit-triggered' );
			el.style.setProperty( '--mb-direction', 'normal' );
			return;
		}

		applySlotVars( el, entry );
		// Mirror re-entry on Custom / image-move resets the reverse
		// flag that the prior exit set. Non-custom types use their
		// own `mbXxxOut` keyframes on exit, so no reverse flag.
		if ( entry.type === 'custom' || entry.type === 'image-move' ) {
			el.style.setProperty( '--mb-direction', 'normal' );
		}

		el.classList.remove( 'mb-exit-triggered' );
		el.classList.add( 'mb-triggered' );

		// Play once only matters when Exit slot is empty. With both
		// slots filled, the block is implicitly a round-trip and we
		// keep observing so the exit phase can fire.
		if ( ! hasExit && playOnce ) {
			observer.unobserve( el );
		}
	}

	/**
	 * Handle a leaving-viewport event. Fires the Exit slot if filled,
	 * or clears the entry state for an Entry-only block (so the
	 * animation can replay on the next entry when playOnce is off).
	 */
	function handleSlotExit( el, exit, hasEntry, playOnce, observer ) {
		if ( exit.type === '' ) {
			// Exit slot empty. If playOnce is off and we have an
			// Entry slot, re-hide the element so the next intersection
			// replays the entry animation. With playOnce on, the
			// observer already unobserved at enter time.
			if ( hasEntry && ! playOnce ) {
				el.classList.remove( 'mb-triggered' );
			}
			return;
		}

		applySlotVars( el, exit );
		// Custom and image-move types share a single per-block
		// keyframe across entry and exit phases. To play it as the
		// "exit" animation we run it in reverse via --mb-direction.
		// Non-custom types have explicit mbXxxOut keyframes already
		// bound by the `.mb-exit-{type}.mb-exit-triggered` rules in
		// animations.css.
		if ( exit.type === 'custom' || exit.type === 'image-move' ) {
			el.style.setProperty( '--mb-direction', 'reverse' );
		}

		el.classList.remove( 'mb-triggered' );
		el.classList.add( 'mb-exit-triggered' );

		// Stop observing if playOnce is on AND there's no entry slot
		// to replay back from. Round-trip configs (both slots) ignore
		// playOnce; entry-only with playOnce already unsubscribed.
		if ( ! hasEntry && playOnce ) {
			observer.unobserve( el );
		}
	}

	/* ---------------------------------------------------------------
	 * 3. Interactive Scroll Animations
	 * ------------------------------------------------------------- */

	function initScrollInteractiveAnimations() {
		var elements = document.querySelectorAll(
			'.mb-mode-scroll-interactive'
		);

		if ( ! elements.length ) {
			return;
		}

		elements.forEach( function ( el ) {
			var type = el.dataset.mbType;

			applyDirectionProps(
				el,
				type,
				el.dataset.mbDirection
			);
			applyBlurProps( el );
			applyRotateProps( el );
			applyCustomKeyframe( el );

			// Apply acceleration (timing function).
			var acceleration = el.dataset.mbAcceleration;
			if ( acceleration ) {
				el.style.setProperty( '--mb-timing', acceleration );
			}

			// Apply scroll-driven animation to container.
			var rangeStart = el.dataset.mbRangeStart || 'entry 0%';
			var rangeEnd = el.dataset.mbRangeEnd || 'exit 100%';
			el.style.animationTimeline = 'view()';
			el.style.animationRangeStart = rangeStart;
			el.style.animationRangeEnd = rangeEnd;

		} );
	}

	/* ---------------------------------------------------------------
	 * Initialise
	 * ------------------------------------------------------------- */

	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', init );
	} else {
		init();
	}
} )();
