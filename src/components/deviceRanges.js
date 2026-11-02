/**
 * Motion Blocks — help text for the per-device toggles in the Page panel:
 * the screen widths each one covers. Built from the same queries the
 * front end uses (window.motionBlocksDeviceQueries, printed by
 * motion_blocks_device_media_queries() from the theme's viewport
 * breakpoints), so the panel always says what the front end does.
 */
import { __, sprintf } from '@wordpress/i18n';

import { deviceQueries, deviceQueryRange } from '../motion-gate';

/**
 * Whole-pixel lengths read better one step in: "481px to 782px" rather
 * than "over 480px".
 *
 * @param {string} length CSS length.
 * @return {string|null} The next whole pixel, or null for other units.
 */
function nextPixel( length ) {
	const m = /^(\d+)px$/.exec( length );
	return m ? Number( m[ 1 ] ) + 1 + 'px' : null;
}

/**
 * Help text for a device toggle: the screen widths it covers, from the
 * same queries the front end uses (window.motionBlocksDeviceQueries,
 * printed by PHP from the theme's viewport breakpoints).
 *
 * @param {string}                device    'mobile', 'tablet' or 'desktop'.
 * @param {Object<string,string>} [queries] Device → media condition
 *                                          (default: the printed ones).
 * @return {string} Help text, or '' for a query it can't describe.
 */
export function deviceRangeHelp( device, queries = deviceQueries( window ) ) {
	const query = queries[ device ];
	if ( ! query ) {
		return __(
			'Not used: this theme’s screen-size breakpoints don’t include this size.',
			'motion-blocks'
		);
	}
	const range = deviceQueryRange( query );
	if ( ! range ) {
		return '';
	}
	const { min, minInclusive, max } = range;
	const from = min && ( minInclusive ? min : nextPixel( min ) );
	if ( ! min ) {
		return sprintf(
			/* translators: %s: screen width, e.g. 480px */
			__( 'Screens up to %s wide', 'motion-blocks' ),
			max
		);
	}
	if ( max ) {
		return from
			? sprintf(
					/* translators: 1: smallest screen width, e.g. 481px; 2: largest, e.g. 782px */
					__( 'Screens %1$s to %2$s wide', 'motion-blocks' ),
					from,
					max
			  )
			: sprintf(
					/* translators: 1: screen width the range starts above, e.g. 30em; 2: largest screen width */
					__(
						'Screens wider than %1$s, up to %2$s',
						'motion-blocks'
					),
					min,
					max
			  );
	}
	return from
		? sprintf(
				/* translators: %s: smallest screen width, e.g. 783px */
				__( 'Screens %s and wider', 'motion-blocks' ),
				from
		  )
		: sprintf(
				/* translators: %s: screen width, e.g. 48em */
				__( 'Screens wider than %s', 'motion-blocks' ),
				min
		  );
}
