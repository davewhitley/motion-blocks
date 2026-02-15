# Motion Blocks

A WordPress plugin that adds CSS animations to any block in the Site Editor.

## Animation Modes

- **On page load** — Animation plays when the page is loaded. Supports looping, alternating, and pause-offscreen.
- **Scroll in view** — Animation is triggered when the block is scrolled into view via Intersection Observer.
- **Interactive scroll** — Animation timeline is tied to scroll position using CSS `animation-timeline: view()`.

## Animation Effects

Fade In, Slide Up, Slide Down, Slide Left, Slide Right, Zoom In.

## Features

- Copy/paste animations between blocks
- Editor preview for all three modes
- Loop and alternate repeat modes with play/stop controls
- Interactive scroll preview toggle (eye icon)
- Reduced motion support (`prefers-reduced-motion`)
- No JavaScript animations — pure CSS with minimal JS for triggering

## Requirements

- WordPress 6.0+
- PHP 7.4+

## Development

```bash
npm install
npm run build
npm start  # watch mode
```

## Installation

1. Clone this repo into `wp-content/plugins/`
2. Run `npm install && npm run build`
3. Activate the plugin in WordPress admin

## License

GPL-2.0-or-later
