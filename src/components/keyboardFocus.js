/**
 * Tells keyboard activation apart from a mouse click.
 *
 * Choosing a mode, switching it, pasting an animation in another mode
 * or removing the animation unmounts the control that had focus, and
 * the browser then drops focus to <body>: a keyboard or screen-reader
 * user is sent back to the start of the page. AnimationPanel moves
 * focus to the matching control in the new panel, but only when this
 * says the action came from the keyboard. Core buttons draw a focus
 * ring on plain :focus, so focusing after a mouse click would leave a
 * ring that a mouse user never saw before.
 *
 * A keyboard-activated button fires its click with `detail === 0`
 * (a mouse click counts its clicks). Menu items that only call back,
 * without the event, fall back to the last input seen on the page.
 */

import { useCallback, useEffect, useRef } from '@wordpress/element';

let lastInput = null;

if ( typeof document !== 'undefined' ) {
	// Capture phase, so menus that stop propagation still count.
	document.addEventListener(
		'keydown',
		() => {
			lastInput = 'keyboard';
		},
		true
	);
	document.addEventListener(
		'pointerdown',
		() => {
			lastInput = 'pointer';
		},
		true
	);
}

/**
 * Whether the action that is running was started from the keyboard.
 *
 * @param {Event} [event] The click event, when the caller has one.
 * @return {boolean} True for keyboard (or assistive-tech) activation.
 */
export function isKeyboardActivation( event ) {
	if ( event && typeof event.detail === 'number' ) {
		return event.detail === 0;
	}
	return lastInput === 'keyboard';
}

/**
 * Puts keyboard focus back in the panel when a dialog closes.
 *
 * A Modal returns focus to whatever had it when the Modal opened. For
 * a dialog opened from the Options menu that can be a menu item, which
 * unmounted with the menu; for "Remove all animations" it is a button
 * that the removal just disabled. Focus then falls to <body>. When the
 * dialog was opened from the keyboard and focus did fall to <body>,
 * this focuses the element on `ref` instead. Mouse users keep today's
 * behaviour (no focus ring appears).
 *
 * @param {boolean} isOpen Whether the dialog is open.
 * @return {{ref: Object, noteOpener: Function}} `ref` goes on the
 *     element to focus; call `noteOpener( event )` from the click
 *     that opens the dialog.
 */
export function useFocusAfterDialog( isOpen ) {
	const ref = useRef( null );
	const openedByKeyboard = useRef( false );
	const wasOpen = useRef( isOpen );

	useEffect( () => {
		const closed = wasOpen.current && ! isOpen;
		wasOpen.current = isOpen;
		if ( ! closed || ! openedByKeyboard.current ) {
			return;
		}
		openedByKeyboard.current = false;

		// ConfirmDialog unmounts its Modal a render after `isOpen`
		// turns false, so give focus a moment to leave the dialog.
		let timer;
		let triesLeft = 30;
		const check = () => {
			const target = ref.current;
			const doc = target?.ownerDocument;
			if ( ! doc ) {
				return;
			}
			const active = doc.activeElement;
			if ( ! active || active === doc.body ) {
				target.focus();
			} else if ( active.closest( '[role="dialog"]' ) && triesLeft-- ) {
				timer = setTimeout( check, 16 );
			}
		};
		check();
		return () => clearTimeout( timer );
	}, [ isOpen ] );

	const noteOpener = useCallback( ( event ) => {
		openedByKeyboard.current = isKeyboardActivation( event );
	}, [] );

	return { ref, noteOpener };
}
