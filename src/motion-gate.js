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
 * The device buckets are WordPress core's viewport breakpoints (theme.json
 * `settings.viewport`), built in PHP by motion_blocks_device_media_queries()
 * and handed over as `window.motionBlocksDeviceQueries`. Nothing here
 * keeps its own copy.
 *
 * Shared by frontend.js, the self-check and the editor's Page panel.
 * Dependency-free.
 */

export const MOTION_CLASS = 'mb-motion';

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** The per-device disable toggles, in core's order. */
export const DEVICES = [ 'mobile', 'tablet', 'desktop' ];

// The window startMotionGate() is listening on, so a second call only
// re-syncs.
let watching = null;

/**
 * The device buckets PHP printed: device → media condition. A device the
 * theme's breakpoints don't define has no entry, and its toggle never
 * matches.
 *
 * @param {Window} win Window holding `motionBlocksDeviceQueries`.
 * @return {Object<string,string>} Device → media condition.
 */
export function deviceQueries( win ) {
	const given = win && win.motionBlocksDeviceQueries;
	const queries = {};
	if ( given && typeof given === 'object' ) {
		DEVICES.forEach( ( device ) => {
			if ( typeof given[ device ] === 'string' && given[ device ] ) {
				queries[ device ] = given[ device ];
			}
		} );
	}
	return queries;
}

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
 * @param {Function}              matchMedia `query => MediaQueryList`.
 * @param {Object<string,string>} queries    Device → media condition.
 * @return {string|null} 'mobile', 'tablet', 'desktop', or null.
 */
export function currentDevice( matchMedia, queries ) {
	for ( let i = 0; i < DEVICES.length; i++ ) {
		const query = queries[ DEVICES[ i ] ];
		if ( query && matchMedia( query ).matches ) {
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
 * @param {Window}                win             Window to read media queries from.
 * @param {string[]}              disabledDevices Buckets disabled for this page.
 * @param {Object<string,string>} [queries]       Device buckets (default:
 *                                                the ones PHP printed).
 * @return {boolean} True when blocks may animate.
 */
export function motionWanted( win, disabledDevices, queries ) {
	if ( typeof win.matchMedia !== 'function' ) {
		return true;
	}
	const matchMedia = ( query ) => win.matchMedia( query );
	return motionAllowed(
		matchMedia( REDUCED_MOTION_QUERY ).matches,
		currentDevice( matchMedia, queries || deviceQueries( win ) ),
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
	const queries = deviceQueries( win );
	const sync = () => {
		doc.documentElement.classList.toggle(
			MOTION_CLASS,
			motionWanted( win, disabledDevicesFrom( doc.body ), queries )
		);
	};
	sync();
	if ( watching === win || typeof win.matchMedia !== 'function' ) {
		return;
	}
	watching = win;
	[ REDUCED_MOTION_QUERY ]
		.concat( Object.keys( queries ).map( ( device ) => queries[ device ] ) )
		.forEach( ( query ) => {
			const list = win.matchMedia( query );
			if ( list.addEventListener ) {
				list.addEventListener( 'change', sync );
			} else if ( list.addListener ) {
				list.addListener( sync );
			}
		} );
}

/**
 * The width range a device query covers, for the editor's help text.
 * Reads core's range form (`(width <= 480px)`, `(480px < width <=
 * 782px)`, `(width > 782px)`) and the pre-7.1 fallback's min-/max-width
 * form (`(min-width: 768px) and (max-width: 1023px), …`).
 *
 * @param {string} query Media condition.
 * @return {{min: string|null, minInclusive: boolean, max: string|null}|null}
 *         Bounds (null = open), or null for a form it doesn't know.
 */
export function deviceQueryRange( query ) {
	if ( typeof query !== 'string' ) {
		return null;
	}
	// The first query of a list; the fallback's second is its range twin.
	const first = query.split( /,(?![^(]*\))/ )[ 0 ].trim();
	const len = '(\\d*\\.?\\d+(?:px|em|rem))';
	let m = first.match( new RegExp( `^\\(width <= ${ len }\\)$` ) );
	if ( m ) {
		return { min: null, minInclusive: false, max: m[ 1 ] };
	}
	m = first.match( new RegExp( `^\\(${ len } < width <= ${ len }\\)$` ) );
	if ( m ) {
		return { min: m[ 1 ], minInclusive: false, max: m[ 2 ] };
	}
	m = first.match( new RegExp( `^\\(width > ${ len }\\)$` ) );
	if ( m ) {
		return { min: m[ 1 ], minInclusive: false, max: null };
	}
	m = first.match( new RegExp( `^\\(max-width: ${ len }\\)$` ) );
	if ( m ) {
		return { min: null, minInclusive: false, max: m[ 1 ] };
	}
	m = first.match(
		new RegExp(
			`^\\(min-width: ${ len }\\) and \\(max-width: ${ len }\\)$`
		)
	);
	if ( m ) {
		return { min: m[ 1 ], minInclusive: true, max: m[ 2 ] };
	}
	m = first.match( new RegExp( `^\\(min-width: ${ len }\\)$` ) );
	if ( m ) {
		return { min: m[ 1 ], minInclusive: true, max: null };
	}
	return null;
}
