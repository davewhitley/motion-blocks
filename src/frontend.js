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
	/**
	 * Append `unit` to `value` only when `value` looks purely
	 * numeric. Custom From/To values are stored in BOTH formats
	 * depending on which input control wrote them:
	 *   - some flows store `"-10deg"` / `"8px"` (unit included)
	 *   - others store `"0"` / `"360"` / `"40"` (bare number)
	 *
	 * The frontend has to handle both. If we always appended the
	 * unit we'd produce `rotate(-10degdeg)` for the first format
	 * (invalid CSS, invalidates the whole transform); if we never
	 * appended it we'd produce `rotate(0)` for the second format
	 * (also invalid — rotate() requires an angle unit). The regex
	 * matches an optionally-signed integer or decimal — anything
	 * with a trailing letter or `%` or `vw` etc. passes through.
	 */
	function withUnit( value, unit ) {
		if ( value === undefined || value === null ) {
			return value;
		}
		return /^-?\d+(\.\d+)?$/.test( String( value ).trim() )
			? value + unit
			: value;
	}

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
					( hasTx ? withUnit( bag.translateX, 'px' ) : '0px' ) +
					', ' +
					( hasTy ? withUnit( bag.translateY, 'px' ) : '0px' ) +
					')'
			);
		}
		if ( bag.scale !== undefined ) {
			tx.push( 'scale(' + bag.scale + ')' );
		}
		if ( bag.rotate !== undefined ) {
			tx.push( 'rotate(' + withUnit( bag.rotate, 'deg' ) + ')' );
		}
		if ( bag.rotateX !== undefined ) {
			tx.push( 'rotateX(' + withUnit( bag.rotateX, 'deg' ) + ')' );
		}
		if ( bag.rotateY !== undefined ) {
			tx.push( 'rotateY(' + withUnit( bag.rotateY, 'deg' ) + ')' );
		}
		if ( tx.length > 0 ) {
			decls.push( 'transform: ' + tx.join( ' ' ) );
		}
		if ( bag.blur !== undefined ) {
			decls.push( 'filter: blur(' + withUnit( bag.blur, 'px' ) + ')' );
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
	 *
	 * Idempotent — stamps the element with `data-mb-keyframe-applied`
	 * on first run so a second call (e.g. from a theme block-template
	 * re-render or a future SPA-nav handler) doesn't append duplicate
	 * keyframe rules to the shared `<style data-mb-custom>` element.
	 */
	function applyCustomKeyframe( el ) {
		if ( el.dataset.mbKeyframeApplied ) {
			return;
		}
		el.dataset.mbKeyframeApplied = 'true';
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
		// Image effects are v1-scoped to `core/cover` (see
		// IMAGE_EFFECT_BLOCKS in constants.js). If a legacy block was
		// saved before the restriction landed and still has image-move
		// / image-zoom set on a non-Cover block, no-op rather than
		// animating into a clip-frame-less figure (would visually
		// "explode" past the figure bounds onto surrounding content).
		// The editor's dropdown no longer offers these on non-Cover
		// blocks, so users can pick a different effect on next edit.
		if (
			( type === 'image-move' || type === 'image-zoom' ) &&
			! el.classList.contains( 'wp-block-cover' )
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

		// Image effects are v1-scoped to Cover blocks. Strip orphaned
		// legacy selections on non-Cover blocks so they don't render
		// without a clip frame. See the non-slot path above for the
		// same gate + rationale.
		var isCover = el.classList.contains( 'wp-block-cover' );
		if ( ! isCover ) {
			if ( entryType === 'image-move' || entryType === 'image-zoom' ) {
				entryType = '';
			}
			if ( exitType === 'image-move' || exitType === 'image-zoom' ) {
				exitType = '';
			}
		}

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

			// Handle repeat mode. Set CSS custom properties instead
			// of inline `animation-*` shorthand — the custom props
			// inherit through the cascade, so a staggered parent's
			// loop / alternate settings propagate to its inner blocks
			// via the `.mb-stagger-parent.mb-triggered > *` rule in
			// animations.css. Inline `animationIterationCount` on the
			// parent would NOT cascade.
			var repeat = el.dataset.mbRepeat || 'once';

			if ( repeat === 'loop' ) {
				el.style.setProperty( '--mb-iteration-count', 'infinite' );
				el.style.setProperty( '--mb-fill-mode', 'none' );
			} else if ( repeat === 'alternate' ) {
				el.style.setProperty( '--mb-iteration-count', 'infinite' );
				el.style.setProperty( '--mb-direction', 'alternate' );
				el.style.setProperty( '--mb-fill-mode', 'none' );
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

		// Architecture: IntersectionObserver as a "something changed
		// near the trigger zone" wake-up signal + cached page-relative
		// LAYOUT bounds (offsetTop / offsetHeight) as the source of
		// truth for trigger decisions. Mirrors how ScrollMagic v3
		// uses IO + cached geometry (and how GSAP ScrollTrigger uses
		// scroll events + refreshed bounds).
		//
		// Why not trust IO directly: IO's intersection result uses
		// the element's CURRENT rendered geometry, which includes CSS
		// transforms. Animations that change the bbox (rotate's AABB
		// expansion, slide translates, scale grows/shrinks the box)
		// feed back into IO and produce a flicker loop where trigger
		// detection is driven by the animation itself rather than by
		// the user's scroll. Earlier downstream guards (2e9d8ce,
		// 641c8d5, 915a127) each reduced the damage but couldn't
		// eliminate the class of bug — trackpad sub-pixel jitter
		// defeats scroll-delta heuristics.
		//
		// The fix: keep IO for the wake-up (efficient, compositor-
		// thread, fires only when geometry approaches the threshold)
		// but ignore its `isIntersecting` value. Instead, on each IO
		// callback, run `tick(state)` which compares cached layout
		// bounds against the current scroll viewport. Cached bounds
		// are transform-immune (offsetTop ignores transforms), so the
		// trigger decision is stable regardless of what the animation
		// is doing visually. If the cached inZone doesn't flip, tick
		// is a no-op — bbox-bounce IO callbacks become silent.
		//
		// Direction-aware dispatch (GSAP toggleActions analog) is
		// preserved:
		//   in zone   + dir=down/same → onEnter     (fire Entry)
		//   in zone   + dir=up        → onEnterBack (reverse-play exit)
		//   out zone  + dir=down/same → onLeave     (fire Exit forward)
		//   out zone  + dir=up        → onLeaveBack (no-op)

		var states = [];
		var prevScrollY = window.scrollY;

		/**
		 * Compute the element's page-relative top via the offsetParent
		 * chain. Unlike `getBoundingClientRect()`, `offsetTop` is the
		 * layout box position — CSS transforms (rotate, scale, translate)
		 * don't affect it. That's the property we need: animation-stable
		 * trigger geometry.
		 *
		 * Edge case: a `position: fixed` ancestor breaks the offsetParent
		 * chain. For Scroll Appear blocks inside fixed containers the
		 * bounds will be off; that's a corner case we accept (the
		 * simpler implementation is worth more than the marginal
		 * accuracy gain).
		 */
		function refreshBounds( state ) {
			var top = 0;
			var n = state.el;
			while ( n && n.offsetParent !== null ) {
				top += n.offsetTop;
				n = n.offsetParent;
			}
			state.pageTop = top;
			state.pageHeight = state.el.offsetHeight;
			state.pageBottom = top + state.pageHeight;
		}

		/**
		 * Pseudo-observer interface for the handlers (which expect to
		 * call `observer.unobserve(el)` on play-once). Flips an
		 * internal flag that the tick loop checks AND calls
		 * `state.io.unobserve` to stop the wake-up signal too — saves
		 * the per-element IO callback cost once the element is
		 * permanently "done."
		 */
		function makeObserver( state ) {
			return {
				unobserve: function () {
					state.unobserved = true;
					if ( state.io ) {
						state.io.unobserve( state.el );
					}
				},
			};
		}

		/**
		 * The truth function. Reads cached bounds against the current
		 * scroll viewport, computes inZone, fires a handler only on
		 * inZone state flips. Called from IO callbacks and from
		 * ResizeObserver / window resize.
		 */
		function tick( state ) {
			if ( state.unobserved ) {
				return;
			}
			var currentScrollY = window.scrollY;
			var dir =
				currentScrollY > prevScrollY
					? 'down'
					: currentScrollY < prevScrollY
					? 'up'
					: 'same';
			prevScrollY = currentScrollY;

			var vh = window.innerHeight;
			var viewportTop = currentScrollY;
			var viewportBottom = currentScrollY + vh;

			// Off-screen reset.
			//
			// When the element fully exits the viewport at the BOTTOM
			// (user scrolled UP past it), reset trigger classes so the
			// next forward enter plays from the initial-hide state.
			// Without this, an element that has been
			// entered → exited → reverse-played settles with
			// `mb-exit-triggered` + `--mb-direction: reverse` held by
			// `animation-fill-mode: both` at the keyframe's "from"
			// (natural / opacity 1). When the next forward enter
			// swaps `mb-exit-triggered` → `mb-triggered`, the new
			// keyframe binding (mbFadeIn etc.) snaps to opacity 0
			// via its `from` state, producing a visible flash before
			// the entry animation runs.
			//
			// Doing the reset only when fully off-screen ensures the
			// snap-to-opacity-0 is invisible to the user. Top-exit
			// (scroll-down past) is left alone so the forward exit
			// animation keeps its held state — that one's needed for
			// the round-trip onEnterBack reverse-play.
			var inViewport =
				state.pageBottom > viewportTop &&
				state.pageTop < viewportBottom;
			if ( state.inViewport && ! inViewport ) {
				var exitedAtBottom = state.pageTop >= viewportBottom;
				if ( exitedAtBottom ) {
					state.el.classList.remove( 'mb-triggered' );
					state.el.classList.remove( 'mb-exit-triggered' );
					state.el.style.removeProperty( '--mb-direction' );
					// Reset inZone tracking so the next forward enter
					// is detected as a flip rather than a no-op.
					state.inZone = false;
				}
			}
			state.inViewport = inViewport;

			// Match the previous IO config (`-15% 0px -15% 0px`
			// rootMargin + threshold 0.1). Trigger zone is the middle
			// 70% of the viewport; an element is "in zone" when
			// 10%+ of its area is in that range — same as IO.
			//
			// CRITICAL: using "any overlap" instead of the 10%
			// threshold here breaks the IO + cached-bounds hybrid.
			// IO fires intersecting=false at exactly the 10% boundary;
			// if cached-bounds disagrees and still reports inZone at
			// that moment, tick no-ops and the exit handler never
			// fires — then IO stops firing because its intersection
			// state has settled at false, leaving the element stuck.
			var triggerTop = currentScrollY + vh * 0.15;
			var triggerBottom = currentScrollY + vh * 0.85;
			var overlap = Math.max(
				0,
				Math.min( state.pageBottom, triggerBottom ) -
					Math.max( state.pageTop, triggerTop )
			);
			var ratio =
				state.pageHeight > 0 ? overlap / state.pageHeight : 0;
			var inZone = ratio >= 0.1;
			if ( inZone === state.inZone ) {
				// No flip. Bbox-bounce IO callbacks land here and
				// silently no-op.
				return;
			}
			state.inZone = inZone;

			if ( inZone ) {
				state.hasEntered = true;
				if ( dir === 'up' ) {
					handleSlotReverseEnter( state.el );
				} else {
					handleSlotEnter(
						state.el,
						state.entry,
						state.hasExit,
						state.playOnce,
						makeObserver( state )
					);
				}
			} else {
				// Forward-leave guard: skip if the element has
				// never been in-zone AND has no exit slot. Below-
				// the-fold blocks at page load shouldn't fire
				// exits. (Cached bounds make this guard simpler
				// than the IO version — no rootBounds inference.)
				if ( ! state.hasEntered && ! state.hasExit ) {
					return;
				}
				if ( ! state.hasEntered ) {
					// Exit-only block, never entered: only count
					// as having exited if the element is truly
					// above the trigger zone (page-relative). Below
					// the zone means we're still at page-load
					// initial state.
					if ( state.pageTop >= triggerBottom ) {
						return;
					}
					state.hasEntered = true;
				}
				if ( dir === 'up' ) {
					// onLeaveBack: no-op. Element fell off the
					// bottom of the trigger zone while user
					// scrolled up. Last-seen state stays.
					return;
				}
				handleSlotExit(
					state.el,
					state.exit,
					state.hasEntry,
					state.playOnce,
					makeObserver( state )
				);
			}
		}

		elements.forEach( function ( el ) {
			var entry = readSlotConfig( el, 'entry' );
			var exit = readSlotConfig( el, 'exit' );
			var hasEntry = entry.type !== '';
			var hasExit = exit.type !== '';
			if ( ! hasEntry && ! hasExit ) {
				return;
			}
			var playOnce =
				hasEntry && el.dataset.mbPlayOnce !== 'false';

			// Apply baseline direction / blur / rotate / custom-keyframe
			// setup. Per-slot timing is applied on each transition.
			applyCustomKeyframe( el );
			applyBlurProps( el );
			applyRotateProps( el );

			var state = {
				el: el,
				entry: entry,
				exit: exit,
				hasEntry: hasEntry,
				hasExit: hasExit,
				playOnce: playOnce,
				inZone: false,
				inViewport: false,
				hasEntered: false,
				unobserved: false,
				pageTop: 0,
				pageBottom: 0,
				pageHeight: 0,
				io: null,
			};
			refreshBounds( state );

			// Per-element ResizeObserver to catch layout changes
			// (image / font load, theme reflow). Transforms don't
			// trigger ResizeObserver since they don't affect layout,
			// so this is animation-safe.
			if ( typeof ResizeObserver !== 'undefined' ) {
				var ro = new ResizeObserver( function () {
					refreshBounds( state );
					tick( state );
				} );
				ro.observe( el );
			}

			// IO as the wake-up signal. Same threshold + rootMargin
			// the previous implementation used so the wake-up fires
			// at the right moments. The callback delegates to tick(),
			// which makes the actual trigger decision against cached
			// bounds. IO will also fire spuriously from bbox-bounce
			// during animations — tick() silently no-ops those.
			var io = new IntersectionObserver(
				function () {
					tick( state );
				},
				{
					threshold: 0.1,
					rootMargin: '-15% 0px -15% 0px',
				}
			);
			state.io = io;
			io.observe( el );

			states.push( state );
		} );

		// Window resize: viewport-height change affects the trigger
		// zone calculation, so re-evaluate all states. Per-element
		// ResizeObserver above catches element-level changes; this
		// catches viewport-level changes. Debounced because resize
		// fires rapidly during window drag.
		var resizeTimer = null;
		window.addEventListener( 'resize', function () {
			if ( resizeTimer ) {
				clearTimeout( resizeTimer );
			}
			resizeTimer = setTimeout( function () {
				states.forEach( function ( state ) {
					refreshBounds( state );
					tick( state );
				} );
			}, 100 );
		} );

		// Scroll listener safety net.
		//
		// IO is the efficient primary wake-up, but it has a known
		// failure mode with animated elements: when a bbox-changing
		// animation (rotate, scale) runs, the transformed AABB can
		// leave IO settled in the "wrong" intersection state by the
		// time the animation completes. If the user then scrolls back
		// without crossing IO's threshold from the settled state's
		// perspective, no IO callback fires and tick() never runs —
		// onEnterBack (reverse-play of the exit) never dispatches.
		//
		// The scroll listener catches these missed wake-ups. It's
		// rAF-throttled (one tick per frame max) so the cost is
		// bounded even on long pages with many animated blocks. The
		// tick() function's `inZone === state.inZone` short-circuit
		// makes redundant calls (when IO already fired for this same
		// frame) cheap no-ops.
		var scrollScheduled = false;
		window.addEventListener(
			'scroll',
			function () {
				if ( scrollScheduled ) {
					return;
				}
				scrollScheduled = true;
				requestAnimationFrame( function () {
					scrollScheduled = false;
					states.forEach( tick );
				} );
			},
			{ passive: true }
		);
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
	 * Restart a CSS animation by toggling the class that binds it.
	 * Reading `offsetWidth` between remove and add forces a layout
	 * flush so the browser treats the next class application as a
	 * brand-new animation cycle rather than a continuation. Painting
	 * happens at the next frame boundary, so the brief class-less
	 * intermediate state doesn't flash visually.
	 */
	function restartAnimation( el, className ) {
		el.classList.remove( className );
		void el.offsetWidth;
		el.classList.add( className );
	}

	/**
	 * Handle a forward-direction enter (`onEnter`): scrolling down
	 * brings the element into the trigger zone for the first time,
	 * or re-enters from below after a forward leave.
	 *
	 * Fires the Entry slot if it's filled. For Exit-only blocks
	 * (entry.type === ''), this branch is unreachable on a fresh
	 * forward enter — Exit-only re-entries happen via
	 * `handleSlotReverseEnter` on scroll-up (the only way an
	 * Exit-only block can be in mb-exit-triggered state when
	 * intersecting=true is after a previous forward leave; the
	 * IO callback only routes here when direction is down/same,
	 * which can't happen for that flow).
	 *
	 * Idempotent: if the element is already in the desired entry-
	 * triggered terminal state, do nothing. Geometry-changing
	 * animations (rotate, scale, slide) can shift the element's
	 * bounding box mid-animation, causing IntersectionObserver to
	 * fire repeat events; the guard prevents flicker.
	 */
	function handleSlotEnter( el, entry, hasExit, playOnce, observer ) {
		if ( entry.type === '' ) {
			// Exit-only block, forward enter. Nothing to fire — the
			// Entry slot is empty by definition. Reverse-play (if
			// applicable) happens via handleSlotReverseEnter on
			// scroll-up only.
			return;
		}

		var inExited = el.classList.contains( 'mb-exit-triggered' );
		var inTriggered = el.classList.contains( 'mb-triggered' );

		// Already in entry-triggered state (mb-triggered present,
		// mb-exit-triggered not). Skip — redundant IO event.
		if ( inTriggered && ! inExited ) {
			return;
		}

		applySlotVars( el, entry );
		el.style.setProperty( '--mb-direction', 'normal' );
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
	 * Handle a backward-direction enter (`onEnterBack`): scrolling up,
	 * the element re-enters the trigger zone from the top edge of
	 * the viewport after a prior forward exit.
	 *
	 * Reverse-plays the exit keyframe so the element glides back to
	 * natural state instead of snap-cutting. Works for both Exit-only
	 * blocks (the originally-supported case from `3d3cfbe`) and now
	 * also Entry+Exit blocks (which previously re-fired the Entry
	 * animation here — the "weird" UX the user reported).
	 *
	 * Idempotent: skip if there's no prior exit to reverse, or if
	 * reverse is already the current direction.
	 */
	function handleSlotReverseEnter( el ) {
		var inExited = el.classList.contains( 'mb-exit-triggered' );
		if ( ! inExited ) {
			// No prior exit fired — nothing to reverse. Element
			// stays in whatever state it was last in (entered or
			// natural). Matches the user's "stay" preference for
			// Entry-only on scroll-up.
			return;
		}
		var alreadyReversed =
			el.style.getPropertyValue( '--mb-direction' ) === 'reverse';
		if ( alreadyReversed ) {
			// Reverse is already in effect — redundant IO event
			// (bbox shift during reverse-play). No-op.
			return;
		}
		el.style.setProperty( '--mb-direction', 'reverse' );
		restartAnimation( el, 'mb-exit-triggered' );
	}

	/**
	 * Handle a leaving-viewport event. Fires the Exit slot if filled,
	 * or clears the entry state for an Entry-only block (so the
	 * animation can replay on the next entry when playOnce is off).
	 *
	 * Idempotent in the same way as handleSlotEnter: redundant IO
	 * events caused by bounding-box shifts during the exit animation
	 * (e.g. rotate's expanding AABB) are no-ops.
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

		var inExited = el.classList.contains( 'mb-exit-triggered' );
		var wasReversed =
			el.style.getPropertyValue( '--mb-direction' ) === 'reverse';

		// Already in forward-played exit state. Skip.
		if ( inExited && ! wasReversed ) {
			return;
		}

		applySlotVars( el, exit );
		el.style.setProperty( '--mb-direction', 'normal' );
		el.classList.remove( 'mb-triggered' );

		if ( inExited ) {
			// Coming from a reverse-played re-enter (Exit-only round
			// trip going forward again). Force restart so the keyframe
			// replays forward — the class is already there, so a plain
			// add() wouldn't re-trigger the animation.
			restartAnimation( el, 'mb-exit-triggered' );
		} else {
			// First forward exit since most recent entry. Plain add.
			el.classList.add( 'mb-exit-triggered' );
		}

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

			// Apply scroll-driven animation to container. Set both
			// inline animation props (so the figure itself animates)
			// AND CSS custom properties (so img-target blocks can
			// read the custom range via inheritance — the img's
			// scoped CSS rule consumes `var(--mb-range-start)`,
			// which doesn't propagate from inline `animation-range-*`
			// declarations on the parent).
			var rangeStart = el.dataset.mbRangeStart || 'entry 0%';
			var rangeEnd = el.dataset.mbRangeEnd || 'exit 100%';
			el.style.animationTimeline = 'view()';
			el.style.animationRangeStart = rangeStart;
			el.style.animationRangeEnd = rangeEnd;
			el.style.setProperty( '--mb-range-start', rangeStart );
			el.style.setProperty( '--mb-range-end', rangeEnd );

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
