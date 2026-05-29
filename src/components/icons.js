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

// Scrub-slider end-cap icons (start / end of the timeline).
//
// Unlike the icons above, these are intentionally MULTI-TONE rather
// than `currentColor`: a solid dot marks the current end of the
// timeline and two ghosted rings trail off toward the other end,
// reading as a little motion path. `scrubFromIcon` (solid dot left)
// flanks the slider's start; `scrubToIcon` (solid dot right) flanks
// its end. The near-white `#F5F5F5` fills are the ring "holes" so the
// trailing positions read as outlines on the light sidebar.
export const scrubFromIcon = (
	<svg
		width="24"
		height="24"
		viewBox="0 0 24 24"
		fill="none"
		xmlns="http://www.w3.org/2000/svg"
	>
		<mask
			id="mask0_638_9888"
			style={ { maskType: 'alpha' } }
			maskUnits="userSpaceOnUse"
			x="12"
			y="6"
			width="5"
			height="12"
		>
			<rect
				width="5"
				height="12"
				transform="matrix(-1 0 0 1 17 6)"
				fill="#D9D9D9"
			/>
		</mask>
		<g mask="url(#mask0_638_9888)">
			<path
				d="M7 12C7 14.7614 9.23858 17 12 17C14.7614 17 17 14.7614 17 12C17 9.23858 14.7614 7 12 7C9.23858 7 7 9.23858 7 12Z"
				fill="#F5F5F5"
			/>
			<path
				d="M8.5 12C8.5 10.067 10.067 8.5 12 8.5C13.933 8.5 15.5 10.067 15.5 12C15.5 13.933 13.933 15.5 12 15.5V17C14.7614 17 17 14.7614 17 12C17 9.23858 14.7614 7 12 7C9.23858 7 7 9.23858 7 12C7 14.7614 9.23858 17 12 17V15.5C10.067 15.5 8.5 13.933 8.5 12Z"
				fill="black"
				fillOpacity="0.7"
			/>
		</g>
		<mask
			id="mask1_638_9888"
			style={ { maskType: 'alpha' } }
			maskUnits="userSpaceOnUse"
			x="17"
			y="6"
			width="5"
			height="12"
		>
			<rect
				width="5"
				height="12"
				transform="matrix(-1 0 0 1 22 6)"
				fill="#D9D9D9"
			/>
		</mask>
		<g mask="url(#mask1_638_9888)">
			<path
				d="M12 12C12 14.7614 14.2386 17 17 17C19.7614 17 22 14.7614 22 12C22 9.23858 19.7614 7 17 7C14.2386 7 12 9.23858 12 12Z"
				fill="#F5F5F5"
			/>
			<path
				d="M13.5 12C13.5 10.067 15.067 8.5 17 8.5C18.933 8.5 20.5 10.067 20.5 12C20.5 13.933 18.933 15.5 17 15.5V17C19.7614 17 22 14.7614 22 12C22 9.23858 19.7614 7 17 7C14.2386 7 12 9.23858 12 12C12 14.7614 14.2386 17 17 17V15.5C15.067 15.5 13.5 13.933 13.5 12Z"
				fill="black"
				fillOpacity="0.3"
			/>
		</g>
		<circle cx="7" cy="12" r="5" fill="#F5F5F5" />
		<circle cx="7" cy="12" r="5" fill="black" />
	</svg>
);

export const scrubToIcon = (
	<svg
		width="24"
		height="24"
		viewBox="0 0 24 24"
		fill="none"
		xmlns="http://www.w3.org/2000/svg"
	>
		<mask
			id="mask0_638_9879"
			style={ { maskType: 'alpha' } }
			maskUnits="userSpaceOnUse"
			x="1"
			y="6"
			width="6"
			height="12"
		>
			<rect x="1" y="6" width="6" height="12" fill="#D9D9D9" />
			<rect
				x="1.5"
				y="6.5"
				width="5"
				height="11"
				stroke="black"
				strokeOpacity="0.3"
			/>
		</mask>
		<g mask="url(#mask0_638_9879)">
			<path
				d="M12 12C12 14.7614 9.76142 17 7 17C4.23858 17 2 14.7614 2 12C2 9.23858 4.23858 7 7 7C9.76142 7 12 9.23858 12 12Z"
				fill="#F5F5F5"
			/>
			<path
				d="M10.5 12C10.5 10.067 8.933 8.5 7 8.5C5.067 8.5 3.5 10.067 3.5 12C3.5 13.933 5.067 15.5 7 15.5V17C4.23858 17 2 14.7614 2 12C2 9.23858 4.23858 7 7 7C9.76142 7 12 9.23858 12 12C12 14.7614 9.76142 17 7 17V15.5C8.933 15.5 10.5 13.933 10.5 12Z"
				fill="black"
				fillOpacity="0.3"
			/>
		</g>
		<mask
			id="mask1_638_9879"
			style={ { maskType: 'alpha' } }
			maskUnits="userSpaceOnUse"
			x="6"
			y="6"
			width="6"
			height="12"
		>
			<rect x="6" y="6" width="6" height="12" fill="#D9D9D9" />
			<rect
				x="6.5"
				y="6.5"
				width="5"
				height="11"
				stroke="black"
				strokeOpacity="0.7"
			/>
		</mask>
		<g mask="url(#mask1_638_9879)">
			<path
				d="M17 12C17 14.7614 14.7614 17 12 17C9.23858 17 7 14.7614 7 12C7 9.23858 9.23858 7 12 7C14.7614 7 17 9.23858 17 12Z"
				fill="#F5F5F5"
			/>
			<path
				d="M15.5 12C15.5 10.067 13.933 8.5 12 8.5C10.067 8.5 8.5 10.067 8.5 12C8.5 13.933 10.067 15.5 12 15.5V17C9.23858 17 7 14.7614 7 12C7 9.23858 9.23858 7 12 7C14.7614 7 17 9.23858 17 12C17 14.7614 14.7614 17 12 17V15.5C13.933 15.5 15.5 13.933 15.5 12Z"
				fill="black"
				fillOpacity="0.7"
			/>
		</g>
		<circle cx="17" cy="12" r="5" fill="#F5F5F5" />
		<circle cx="17" cy="12" r="5" fill="black" />
	</svg>
);
