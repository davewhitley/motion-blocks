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
