/**
 * Motion Blocks — the motion gate (#53).
 *
 * Every rule in css/animations.css that animates, hides or transforms a
 * block is scoped under `:where(html.mb-motion)`. The class is on
 * `<html>` only while motion is on: JavaScript ran, the visitor hasn't
 * asked for reduced motion, and animations aren't disabled for this
 * page on the current device. With the class off, the plugin's CSS
 * sets nothing on the block, so the theme's own opacity, transform,
 * filter and clip-path show untouched. (This replaced reset rules that
 * forced the block to rest with `!important`, wiping those styles.)
 *
 * Who sets it:
 *   - the head script printed by motion_blocks_print_js_marker(), before
 *     first paint, on pages that load the assets in <head>. It carries
 *     its own copy of this decision (it runs before any bundle loads);
 *     tests/unit/motion-gate.test.js runs both on the same inputs;
 *   - frontend.js after init (startMotionGate below), which covers pages
 *     whose assets load after <head> and keeps the class current;
 *   - the editor, unconditionally: previews always play (an inline
 *     script in motion_blocks_enqueue_block_assets()).
 *
 * Shared by frontend.js and the self-check. Dependency-free apart from
 * the device breakpoints in shared-constants.json.
 */
import SHARED from '../shared-constants.json';

export const MOTION_CLASS = 'mb-motion';

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Per-device disable buckets: device → media query list. Three
 * non-overlapping ranges, so every viewport width is in exactly one.
 */
export const DEVICE_QUERIES = SHARED.deviceQueries;

export const DEVICES = Object.keys( DEVICE_QUERIES );

// The window startMotionGate() is listening on, so a second call only
// re-syncs.
let watching = null;

/**
 * Whether motion is on. Pure: the whole decision, for unit tests and
 * for every caller below.
 *
 * @param {boolean}     reducedMotion   prefers-reduced-motion: reduce.
 * @param {string|null} device          Current device bucket, or null.
 * @param {string[]}    disabledDevices Buckets disabled for this page.
 * @return {boolean} True when blocks may animate.
 */
export function motionAllowed( reducedMotion, device, disabledDevices ) {
	return (
		! reducedMotion &&
		! ( device && disabledDevices.indexOf( device ) !== -1 )
	);
}

/**
 * The device bucket the viewport is in.
 *
 * @param {Function} matchMedia `query => MediaQueryList`.
 * @return {string|null} 'desktop', 'tablet', 'mobile', or null.
 */
export function currentDevice( matchMedia ) {
	for ( let i = 0; i < DEVICES.length; i++ ) {
		if ( matchMedia( DEVICE_QUERIES[ DEVICES[ i ] ] ).matches ) {
			return DEVICES[ i ];
		}
	}
	return null;
}

/**
 * The buckets disabled for this page, from the `mb-disabled-{device}`
 * body classes (motion_blocks_body_class()).
 *
 * @param {Element} body Document body.
 * @return {string[]} Disabled buckets.
 */
export function disabledDevicesFrom( body ) {
	return DEVICES.filter( ( device ) =>
		body.classList.contains( 'mb-disabled-' + device )
	);
}

/**
 * Whether motion should be on right now in `win`.
 *
 * @param {Window}   win             Window to read media queries from.
 * @param {string[]} disabledDevices Buckets disabled for this page.
 * @return {boolean} True when blocks may animate.
 */
export function motionWanted( win, disabledDevices ) {
	if ( typeof win.matchMedia !== 'function' ) {
		return true;
	}
	const matchMedia = ( query ) => win.matchMedia( query );
	return motionAllowed(
		matchMedia( REDUCED_MOTION_QUERY ).matches,
		currentDevice( matchMedia ),
		disabledDevices
	);
}

/**
 * Set `html.mb-motion` now, and again whenever reduced motion or the
 * device bucket changes. Safe to call more than once: later calls only
 * re-sync.
 *
 * @param {Window} win Window whose document gets the class.
 */
export function startMotionGate( win ) {
	const doc = win.document;
	const sync = () => {
		doc.documentElement.classList.toggle(
			MOTION_CLASS,
			motionWanted( win, disabledDevicesFrom( doc.body ) )
		);
	};
	sync();
	if ( watching === win || typeof win.matchMedia !== 'function' ) {
		return;
	}
	watching = win;
	[ REDUCED_MOTION_QUERY ]
		.concat( DEVICES.map( ( device ) => DEVICE_QUERIES[ device ] ) )
		.forEach( ( query ) => {
			const list = win.matchMedia( query );
			if ( list.addEventListener ) {
				list.addEventListener( 'change', sync );
			} else if ( list.addListener ) {
				list.addListener( sync );
			}
		} );
}
