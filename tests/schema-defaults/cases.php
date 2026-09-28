<?php
/**
 * Fixtures for the schema-defaults check (see check.php).
 *
 * Each case is block markup exactly as the editor saves it — i.e. with
 * every attribute that equals its schema default OMITTED from the block
 * comment — plus what the editor's inspector panel shows for that
 * block. The front end must resolve the omitted attributes the same way
 * the editor does, so `expect` is derived from the panel, not from
 * whatever PHP happened to emit historically.
 *
 * `expect` keys:
 *   'data-mb-…' => string  Attribute must equal this value.
 *   'data-mb-…' => null    Attribute must be absent.
 *   'class'     => array   Classes that must be present on the wrapper.
 *   'style'     => string  Substring the wrapper's style attr must contain.
 *   'animated'  => false   Block must not be animated (no data-mb-mode).
 *
 * The `mbtest-{n}` class on each block lets the test page's inline
 * checker find it on the front end; it has no effect on the render.
 */

return array(
	array(
		'label'    => 'Scroll Appear, Entry = Fade, created through the panel',
		'panel'    => 'Entry: Fade In · Delay 0s · Replay: Once',
		'behavior' => 'Fades in the first time it scrolls into view, then stays put.',
		'attrs'    => array(
			'animationMode'       => 'scroll-appear',
			'animationEntryType'  => 'fade',
			'animationEntryDelay' => 0,
		),
		'expect'   => array(
			'data-mb-entry-type'   => 'fade',
			'data-mb-entry-replay' => 'once',
			'data-mb-entry-delay'  => '0',
		),
	),
	array(
		'label'    => 'Scroll Appear, Entry = Fade + Exit = Fade (Replay not changed)',
		'panel'    => 'Entry Replay: Once · Exit Replay: Reverse',
		'behavior' => 'Fades in once; fades out when scrolled past and back in on scroll-back.',
		'attrs'    => array(
			'animationMode'       => 'scroll-appear',
			'animationEntryType'  => 'fade',
			'animationExitType'   => 'fade',
			'animationEntryDelay' => 0,
		),
		'expect'   => array(
			'data-mb-entry-replay' => 'once',
			'data-mb-exit-replay'  => 'reverse',
		),
	),
	array(
		'label'    => 'Scroll Appear, Exit only = Fade',
		'panel'    => 'Exit: Fade Out · Replay: Reverse',
		'behavior' => 'Visible immediately; fades out as it leaves, back in on scroll-back.',
		'attrs'    => array(
			'animationMode'     => 'scroll-appear',
			'animationExitType' => 'fade',
		),
		'expect'   => array(
			'data-mb-exit-type'    => 'fade',
			'data-mb-exit-replay'  => 'reverse',
			'data-mb-exit-delay'   => '0',
			'data-mb-entry-type'   => null,
			'data-mb-entry-replay' => null,
		),
	),
	array(
		'label'    => 'Scroll Appear, Entry = Fade, Replay explicitly set to Repeat',
		'panel'    => 'Entry: Fade In · Replay: Repeat',
		'behavior' => 'Fades in every time it scrolls into view.',
		'attrs'    => array(
			'animationMode'        => 'scroll-appear',
			'animationEntryType'   => 'fade',
			'animationEntryDelay'  => 0,
			'animationEntryReplay' => 'repeat',
		),
		'expect'   => array(
			'data-mb-entry-replay' => 'repeat',
		),
	),
	array(
		'label'    => 'Scroll Appear, Entry = Slide, Delay left at 0.4s',
		'panel'    => 'Entry: Slide In (bottom to top) · Delay 0.4s · Replay: Once',
		'behavior' => 'Slides up once, after a 0.4s delay.',
		'attrs'    => array(
			'animationMode'           => 'scroll-appear',
			'animationEntryType'      => 'slide',
			'animationEntryDirection' => 'btt',
		),
		'expect'   => array(
			'data-mb-entry-type'   => 'slide',
			'data-mb-entry-delay'  => '0.4',
			'data-mb-entry-replay' => 'once',
		),
	),
	array(
		'label'    => 'Page Load, Fade, Delay left at 0.4s',
		'panel'    => 'Page Load: Fade In · Delay 0.4s · Repeat: Once',
		'behavior' => 'Fades in 0.4s after the page loads.',
		'attrs'    => array(
			'animationMode' => 'page-load',
		),
		'expect'   => array(
			'data-mb-type'            => 'fade',
			'data-mb-delay'           => '0.4',
			'data-mb-repeat'          => 'once',
			'data-mb-pause-offscreen' => 'true',
		),
	),
	array(
		'label'    => 'Page Load, Fade, Delay set to 0s',
		'panel'    => 'Page Load: Fade In · Delay 0s',
		'behavior' => 'Fades in immediately on page load.',
		'attrs'    => array(
			'animationMode'  => 'page-load',
			'animationDelay' => 0,
		),
		'expect'   => array(
			'data-mb-delay' => '0',
		),
	),
	array(
		'label'    => 'Auto-animate "Section" output (Fade, legacy shape)',
		'panel'    => 'Entry: Fade In · Delay 0s · Replay: Once',
		'behavior' => 'Fades in once.',
		'block'    => 'core/group',
		'attrs'    => array(
			'animationMode'  => 'scroll-appear',
			'animationDelay' => 0,
		),
		'expect'   => array(
			'class'                => array( 'mb-animated', 'mb-enter-fade' ),
			'data-mb-entry-type'   => 'fade',
			'data-mb-entry-replay' => 'once',
			'data-mb-entry-delay'  => '0',
		),
	),
	array(
		'label'    => 'Auto-animate "Hero" output (Slide, legacy shape)',
		'panel'    => 'Entry: Slide In (bottom to top) · Delay 0s · Replay: Once',
		'behavior' => 'Slides up once.',
		'attrs'    => array(
			'animationMode'      => 'scroll-appear',
			'animationType'      => 'slide',
			'animationDirection' => 'btt',
			'animationDelay'     => 0,
		),
		'expect'   => array(
			'data-mb-entry-type'   => 'slide',
			'data-mb-entry-replay' => 'once',
		),
	),
	array(
		'label'    => 'Legacy (pre-0.2) Scroll Appear, trigger = enter, Slide',
		'panel'    => 'Entry: Slide In (bottom to top) · Delay 0.4s · Replay: Once',
		'behavior' => 'Slides up once, after a 0.4s delay.',
		'attrs'    => array(
			'animationMode'      => 'scroll-appear',
			'animationType'      => 'slide',
			'animationDirection' => 'btt',
		),
		'expect'   => array(
			'data-mb-entry-type'   => 'slide',
			'data-mb-entry-delay'  => '0.4',
			'data-mb-entry-replay' => 'once',
		),
	),
	array(
		'label'    => 'Legacy (pre-0.2) Scroll Appear, trigger = both (mirror), Scale',
		'panel'    => 'Entry: Scale In · Replay: Once · Exit: Scale Out · Replay: Reverse',
		'behavior' => 'Scales in once; scales out when scrolled past and back in on scroll-back.',
		'attrs'    => array(
			'animationMode'          => 'scroll-appear',
			'animationType'          => 'scale',
			'animationScrollTrigger' => 'both',
		),
		'expect'   => array(
			'data-mb-entry-type'   => 'scale',
			'data-mb-exit-type'    => 'scale',
			'data-mb-entry-replay' => 'once',
			'data-mb-exit-replay'  => 'reverse',
			'data-mb-exit-delay'   => '0',
		),
	),
	array(
		'label'    => 'Legacy (pre-0.2) Scroll Appear with the effect cleared',
		'panel'    => 'Scroll Appear with both slots empty',
		'behavior' => 'Not animated.',
		'attrs'    => array(
			'animationMode' => 'scroll-appear',
			'animationType' => '',
		),
		'expect'   => array(
			'animated' => false,
		),
	),
	array(
		'label'    => 'Stagger on a Group, step left at 0.1s',
		'panel'    => 'Entry: Fade In · Stagger on · Step 0.1s',
		'behavior' => 'Each child fades in 0.1s after the previous one.',
		'block'    => 'core/group',
		'children' => 3,
		'attrs'    => array(
			'animationMode'           => 'scroll-appear',
			'animationEntryType'      => 'fade',
			'animationEntryDelay'     => 0,
			'animationStaggerEnabled' => true,
		),
		'expect'   => array(
			'class' => array( 'mb-stagger-parent' ),
			'style' => '--mb-stagger-step:0.1s',
		),
	),
	array(
		'label'    => 'Scroll Interactive, Slide, range left at default',
		'panel'    => 'Scroll Interactive: Slide In · Start entry 0% · End exit 100%',
		'behavior' => 'Slides up in step with the scroll position.',
		'attrs'    => array(
			'animationMode'      => 'scroll-interactive',
			'animationType'      => 'slide',
			'animationDirection' => 'btt',
		),
		'expect'   => array(
			'data-mb-type'        => 'slide',
			'data-mb-range-start' => 'entry 0%',
			'data-mb-range-end'   => 'exit 100%',
		),
	),
	// Server-rendered (dynamic) blocks. In the editor these preview
	// through the block-renderer endpoint, which used to reject the
	// animation attributes ("Error loading block", GH #24).
	array(
		'label'    => 'Archives (server-rendered), Scroll Appear Entry = Slide',
		'panel'    => 'Block loads in the editor · Entry: Slide In (bottom to top) · Replay: Once',
		'behavior' => 'The archive list slides up once.',
		'block'    => 'core/archives',
		'attrs'    => array(
			'animationMode'           => 'scroll-appear',
			'animationEntryType'      => 'slide',
			'animationEntryDirection' => 'btt',
			'animationEntryDelay'     => 0,
		),
		'expect'   => array(
			'data-mb-entry-type'   => 'slide',
			'data-mb-entry-replay' => 'once',
		),
	),
	array(
		'label'    => 'Calendar (server-rendered), Page Load Fade',
		'panel'    => 'Block loads in the editor · Page Load: Fade In · Delay 0s',
		'behavior' => 'The calendar fades in on page load.',
		'block'    => 'core/calendar',
		'attrs'    => array(
			'animationMode'  => 'page-load',
			'animationDelay' => 0,
		),
		'expect'   => array(
			'data-mb-type'  => 'fade',
			'data-mb-delay' => '0',
		),
	),
);
