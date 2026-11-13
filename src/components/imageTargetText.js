/**
 * Wording for a Cover whose image can't be animated, shared by the
 * three mode panels. Two different causes, two different ways out
 * (GH #170): no image at all, or a fixed / repeated background.
 */
import { __ } from '@wordpress/i18n';

import { coverHasNoImage } from './constants';

/**
 * @param {Object} attributes Cover attributes.
 * @return {{notice: string, help: string}} The warning notice and the
 *     help under the disabled "Animate image only" toggle.
 */
export function imageTargetUnavailableText( attributes ) {
	if ( coverHasNoImage( attributes ) ) {
		return {
			notice: __(
				'Image Move, Image Zoom, and “Animate image only” need an image background, and this Cover has none (it uses a video, or a colour only). The whole block animates instead.',
				'motion-blocks'
			),
			help: __(
				'Unavailable: this Cover has no image background.',
				'motion-blocks'
			),
		};
	}
	return {
		notice: __(
			'Image Move, Image Zoom, and “Animate image only” don’t work with “Fixed background” or “Repeated background”. Turn those off in the Cover block’s settings to use them.',
			'motion-blocks'
		),
		help: __(
			'Unavailable while “Fixed background” or “Repeated background” is on.',
			'motion-blocks'
		),
	};
}

/**
 * A note for the one pairing that visibly clashes with a core feature
 * (GH #170): Blur with "Animate image only" on a block with a Duotone.
 * Both are a CSS `filter` on the picture, and only one can apply, so
 * the picture shows in full colour while the blur plays. Not fixed on
 * purpose (a rare pairing); the note says how to avoid it.
 *
 * @param {Object} attributes Block attributes.
 * @param {string} type       The chosen effect.
 * @return {string|null} The note, or null when the pairing isn't there.
 */
export function duotoneBlurText( attributes, type ) {
	const duotone = attributes?.style?.color?.duotone;
	if (
		! duotone ||
		duotone === 'unset' ||
		attributes.animationFromToTarget !== 'img' ||
		! /^blur(-out)?$/.test( type || '' )
	) {
		return null;
	}
	return __(
		'This block has a Duotone filter. With “Animate image only”, the Duotone is not shown while Blur plays. Turn off “Animate image only” to keep it.',
		'motion-blocks'
	);
}
