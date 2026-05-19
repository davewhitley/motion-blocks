/**
 * Custom SVG icons used across the panels.
 *
 * Built as plain JSX `<svg>` elements (not wrapped in
 * `@wordpress/primitives`) because we don't need cross-renderer
 * support — these only ever paint in the web editor. `currentColor`
 * on stroke/fill lets them inherit the surrounding text color, the
 * same convention `@wordpress/icons` uses.
 *
 * Pass to `<Icon icon={ ... } size={ 24 } />` from
 * `@wordpress/components`.
 */

export const scrollInteractiveIcon = (
	<svg
		width="24"
		height="24"
		viewBox="0 0 24 24"
		fill="none"
		xmlns="http://www.w3.org/2000/svg"
	>
		<rect
			x="5.75"
			y="2.75"
			width="12.5"
			height="18.5"
			rx="5.25"
			stroke="currentColor"
			strokeWidth="1.5"
		/>
		<rect
			x="11"
			y="7"
			width="2"
			height="5"
			rx="1"
			fill="currentColor"
		/>
	</svg>
);
