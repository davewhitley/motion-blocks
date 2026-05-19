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

// Note on the fills:
//
// The outer rect is supposed to be a stroked outline (mouse body)
// with no fill, but WP's Button-derived components (MenuItem,
// DropdownMenu items, etc.) ship a stylesheet rule like
// `.components-button svg { fill: currentColor }` that overrides
// the SVG-level `fill="none"` and bleeds into rect children via
// SVG fill inheritance. Result: the outline rect renders as a
// solid pill, making the icon look like a filled blob.
//
// Inline `style={{ fill: 'none' }}` on the outer rect has
// specificity that beats any author CSS rule without !important,
// so the outline stays outlined regardless of which WP component
// wraps the icon. The inner fill rect keeps its own `fill=
// "currentColor"` so it inherits the surrounding text color.
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
			style={ { fill: 'none' } }
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
