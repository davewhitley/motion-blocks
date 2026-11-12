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
 *   'no_class'  => array   Classes that must NOT be on the wrapper.
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
			'data-mb-play-once'    => null,
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
		'panel'    => 'Page Load: Fade In · Delay 0.4s · Loop: Off',
		'behavior' => 'Fades in 0.4s after the page loads.',
		'attrs'    => array(
			'animationMode' => 'page-load',
		),
		'expect'   => array(
			'data-mb-type'            => 'fade',
			'data-mb-delay'           => '0.4',
			'data-mb-loop'            => 'off',
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
		'label'    => 'Auto-animate Section (slot shape, GH #25)',
		'panel'    => 'Entry: Fade In · Duration 0.7s · Delay 0s · Replay: Once',
		'behavior' => 'Fades in the first time it scrolls into view, then stays put.',
		'attrs'    => array(
			'animationMode'          => 'scroll-appear',
			'animationEntryType'     => 'fade',
			'animationEntryDuration' => 0.7,
			'animationEntryDelay'    => 0,
		),
		'expect'   => array(
			'data-mb-entry-type'     => 'fade',
			'data-mb-entry-duration' => '0.7',
			'data-mb-entry-delay'    => '0',
			'data-mb-entry-replay'   => 'once',
			'data-mb-exit-type'      => null,
		),
	),
	array(
		'label'    => 'Legacy Scroll Appear saved with Play once off (GH #33)',
		'panel'    => 'Entry: Fade In · Delay 0s · Replay: Once',
		'behavior' => 'Fades in the first time it scrolls into view, then stays put (the retired Play once flag is ignored).',
		'attrs'    => array(
			'animationMode'       => 'scroll-appear',
			'animationEntryType'  => 'fade',
			'animationEntryDelay' => 0,
			'animationPlayOnce'   => false,
		),
		'expect'   => array(
			'data-mb-entry-type'   => 'fade',
			'data-mb-entry-replay' => 'once',
			'data-mb-play-once'    => null,
		),
	),
	array(
		'label'    => 'Legacy mirror Scale after one Entry edit (GH #25)',
		'panel'    => 'Entry: Slide In (bottom to top) · Exit: Scale Out · Replay: Reverse',
		'behavior' => 'Slides in; scales out when scrolled past and back in on scroll-back.',
		'attrs'    => array(
			'animationMode'           => 'scroll-appear',
			'animationType'           => 'scale',
			'animationScrollTrigger'  => 'mirror',
			'animationEntryType'      => 'slide',
			'animationEntryDirection' => 'btt',
			'animationExitType'       => 'scale',
		),
		'expect'   => array(
			'data-mb-entry-type'  => 'slide',
			'data-mb-exit-type'   => 'scale',
			'data-mb-exit-replay' => 'reverse',
			'data-mb-exit-delay'  => '0',
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
		'label'    => 'Scroll Interactive Group with a leftover Stagger flag',
		'panel'    => 'Scroll Interactive: Slide In (bottom to top) · no Stagger control',
		'behavior' => 'The group itself slides in step with the scroll; the leftover Stagger flag is ignored (GH #48).',
		'block'    => 'core/group',
		'children' => 3,
		'attrs'    => array(
			'animationMode'           => 'scroll-interactive',
			'animationType'           => 'slide',
			'animationDirection'      => 'btt',
			'animationStaggerEnabled' => true,
		),
		'expect'   => array(
			'data-mb-mode' => 'scroll-interactive',
			'data-mb-type' => 'slide',
			'no_class'     => array( 'mb-stagger-parent' ),
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
	// Legacy (pre-slot) Scroll Appear with an empty trigger: the editor
	// reads '' as 'enter' (normalizeScrollTrigger), so only the Entry
	// slot is filled. PHP used to fill both (2026-10-20 review, #57).
	array(
		'label'    => 'Legacy Scroll Appear with an empty animationScrollTrigger',
		'panel'    => 'Entry: Fade In · no Exit',
		'behavior' => 'Fades in once; no fade out.',
		'attrs'    => array(
			'animationMode'          => 'scroll-appear',
			'animationType'          => 'fade',
			'animationScrollTrigger' => '',
		),
		'expect'   => array(
			'data-mb-entry-type' => 'fade',
			'data-mb-exit-type'  => null,
		),
	),
	// A non-string custom timing function (hand-edited or corrupted
	// block comment) used to be a fatal TypeError in trim() on PHP 8
	// (2026-10-20 review). The editor drops it to the default curve.
	array(
		'label'    => 'Page Load, Custom timing function that is not a string',
		'panel'    => 'Page Load: Fade In · Easing: Custom · default curve',
		'behavior' => 'Fades in with the default custom curve; the page renders.',
		'attrs'    => array(
			'animationMode'                 => 'page-load',
			'animationEasing'         => 'custom',
			'animationCustomTimingFunction' => array( 'not', 'a', 'string' ),
		),
		'expect'   => array(
			'data-mb-type'         => 'fade',
			'data-mb-easing' => 'cubic-bezier(0.25, 0.1, 0.25, 1)',
		),
	),
	array(
		'label'    => 'Scroll Appear, Entry custom timing function that is not a string',
		'panel'    => 'Entry: Fade In · Easing: Custom · default curve',
		'behavior' => 'Fades in with the default custom curve; the page renders.',
		'attrs'    => array(
			'animationMode'                      => 'scroll-appear',
			'animationEntryType'                 => 'fade',
			'animationEntryEasing'         => 'custom',
			'animationEntryCustomTimingFunction' => 42,
		),
		'expect'   => array(
			'data-mb-entry-type'         => 'fade',
			'data-mb-entry-easing' => 'cubic-bezier(0.25, 0.1, 0.25, 1)',
		),
	),
	// Blocks that can't keep animation settings (nonAnimatableBlocks).
	// Animations saved on them before the panel was hidden must not
	// land on whatever their content prints first.
	array(
		'label'    => 'Custom HTML with a saved Page Load animation',
		'panel'    => 'No Motion Effects panel on this block',
		'behavior' => 'The HTML shows as written, not animated.',
		'block'    => 'core/html',
		'html'     => '<div class="mbtest-html">Custom HTML</div>',
		'attrs'    => array(
			'animationMode' => 'page-load',
		),
		'expect'   => array(
			'animated' => false,
			'no_class' => array( 'mb-animated' ),
		),
	),
	array(
		'label'    => 'Shortcode with a saved Scroll Appear animation',
		'panel'    => 'No Motion Effects panel on this block',
		'behavior' => 'The shortcode output shows as written, not animated.',
		'block'    => 'core/shortcode',
		'html'     => '<p class="mbtest-shortcode">Shortcode output</p>',
		'attrs'    => array(
			'animationMode'      => 'scroll-appear',
			'animationEntryType' => 'fade',
		),
		'expect'   => array(
			'animated' => false,
			'no_class' => array( 'mb-animated' ),
		),
	),
	array(
		'label'    => 'Spacer with a saved Page Load animation',
		'panel'    => 'No Motion Effects panel on this block',
		'behavior' => 'The spacer is empty space, not animated.',
		'block'    => 'core/spacer',
		'html'     => '<div style="height:40px" aria-hidden="true" class="wp-block-spacer mbtest-spacer"></div>',
		'attrs'    => array(
			'animationMode' => 'page-load',
		),
		'expect'   => array(
			'animated' => false,
			'no_class' => array( 'mb-animated' ),
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
	// Easing left at "this effect's default" (GH #109): Custom,
	// Image Move and Image Zoom follow the scroll linearly in Scroll
	// Interactive; every other effect and mode stays on Ease.
	array(
		'label'    => 'Scroll Interactive, Custom, Easing left at default',
		'panel'    => 'Scroll Interactive: Custom · Easing: Linear',
		'behavior' => 'Moves in step with the scroll at an even pace.',
		'attrs'    => array(
			'animationMode'           => 'scroll-interactive',
			'animationType'           => 'custom',
			'animationFromTranslateX' => '0px',
			'animationToTranslateX'   => '120px',
		),
		'expect'   => array(
			'data-mb-type'         => 'custom',
			'data-mb-easing' => 'linear',
		),
	),
	array(
		'label'    => 'Scroll Interactive, Custom, Easing set to Ease',
		'panel'    => 'Scroll Interactive: Custom · Easing: Ease',
		'behavior' => 'Moves in step with the scroll, front-loaded: most of the motion in the first half.',
		'attrs'    => array(
			'animationMode'           => 'scroll-interactive',
			'animationType'           => 'custom',
			'animationEasing'   => 'ease',
			'animationFromTranslateX' => '0px',
			'animationToTranslateX'   => '120px',
		),
		'expect'   => array(
			'data-mb-type'         => 'custom',
			'data-mb-easing' => null,
		),
	),
	array(
		'label'    => 'Scroll Interactive, Fade, Easing left at default',
		'panel'    => 'Scroll Interactive: Fade In · Easing: Ease',
		'behavior' => 'Fades in with the scroll, mostly visible by the middle of the screen.',
		'attrs'    => array(
			'animationMode' => 'scroll-interactive',
			'animationType' => 'fade',
		),
		'expect'   => array(
			'data-mb-type'         => 'fade',
			'data-mb-easing' => null,
		),
	),
	array(
		'label'    => 'Page Load, Custom, Easing left at default',
		'panel'    => 'Page Load: Custom · Easing: Ease',
		'behavior' => 'Slides right once on load, easing in and out.',
		'attrs'    => array(
			'animationMode'           => 'page-load',
			'animationType'           => 'custom',
			'animationDelay'          => 0,
			'animationFromTranslateX' => '0px',
			'animationToTranslateX'   => '120px',
		),
		'expect'   => array(
			'data-mb-type'         => 'custom',
			'data-mb-easing' => null,
		),
	),
	// Legacy (pre-slot) Scroll Appear with trigger = exit: only the
	// Exit slot is filled, with no delay, like the editor's shim.
	array(
		'label'    => 'Legacy (pre-0.2) Scroll Appear, trigger = exit, Fade',
		'panel'    => 'Exit: Fade Out · Delay 0s · Replay: Reverse · no Entry',
		'behavior' => 'Visible straight away; fades out as it leaves, back in on scroll-back.',
		'attrs'    => array(
			'animationMode'          => 'scroll-appear',
			'animationType'          => 'fade',
			'animationScrollTrigger' => 'exit',
		),
		'expect'   => array(
			'data-mb-entry-type'  => null,
			'data-mb-exit-type'   => 'fade',
			'data-mb-exit-delay'  => '0',
			'data-mb-exit-replay' => 'reverse',
		),
	),
	array(
		'label'    => 'Page Load, Custom timing function left empty',
		'panel'    => 'Page Load: Fade In · Easing: Custom · default curve',
		'behavior' => 'Fades in with the default custom curve.',
		'attrs'    => array(
			'animationMode'                 => 'page-load',
			'animationEasing'         => 'custom',
			'animationCustomTimingFunction' => '',
		),
		'expect'   => array(
			'data-mb-type'         => 'fade',
			'data-mb-easing' => 'cubic-bezier(0.25, 0.1, 0.25, 1)',
		),
	),
	// Custom From / To values: bare numbers are emitted as saved (the
	// front end adds each property's default unit, as the panel shows
	// it); empty, null and invalid values are left out.
	array(
		'label'    => 'Scroll Appear Entry = Custom with bare numbers, an empty value and an invalid one',
		'panel'    => 'Entry: Custom · From rotate 45°, move down 24px · To rotate 0°, move down 0px',
		'behavior' => 'Rotates and rises into place once.',
		'attrs'    => array(
			'animationMode'                => 'scroll-appear',
			'animationEntryType'           => 'custom',
			'animationEntryDelay'          => 0,
			'animationEntryFromRotate'     => 45,
			'animationEntryToRotate'       => 0,
			'animationEntryFromTranslateY' => 24,
			'animationEntryToTranslateY'   => '0px',
			'animationEntryFromOpacity'    => '',
			'animationEntryFromBlur'       => '4px} body{display:none',
		),
		'expect'   => array(
			'data-mb-entry-type'             => 'custom',
			'data-mb-entry-from-rotate'      => '45',
			'data-mb-entry-to-rotate'        => '0',
			'data-mb-entry-from-translate-y' => '24',
			'data-mb-entry-to-translate-y'   => '0px',
			'data-mb-entry-from-opacity'     => null,
			'data-mb-entry-from-blur'        => null,
		),
	),
	// "Animate image only" (animationFromToTarget = 'img') and the image
	// effects on a Cover: the render filter marks the wrapper with
	// data-mb-target="img" so the CSS animates the background <img>
	// instead of the whole block.
	array(
		'label'    => 'Cover, Scroll Appear Entry = Fade, Animate image only',
		'panel'    => 'Entry: Fade In · Animate image only: on · Replay: Once',
		'behavior' => 'Only the background image fades in, once; the text shows straight away.',
		'block'    => 'core/cover',
		'attrs'    => array(
			'animationMode'         => 'scroll-appear',
			'animationEntryType'    => 'fade',
			'animationEntryDelay'   => 0,
			'animationFromToTarget' => 'img',
		),
		'expect'   => array(
			'class'              => array( 'mb-animated', 'mb-mode-scroll-appear', 'mb-enter-fade', 'mb-has-entry' ),
			'data-mb-target'     => 'img',
			'data-mb-entry-type' => 'fade',
		),
	),
	array(
		'label'    => 'Cover, Page Load Fade, Animate image only',
		'panel'    => 'Page Load: Fade In · Animate image only: on · Delay 0s',
		'behavior' => 'Only the background image fades in on page load.',
		'block'    => 'core/cover',
		'attrs'    => array(
			'animationMode'         => 'page-load',
			'animationDelay'        => 0,
			'animationFromToTarget' => 'img',
		),
		'expect'   => array(
			'class'          => array( 'mb-animated', 'mb-mode-page-load', 'mb-enter-fade' ),
			'data-mb-type'   => 'fade',
			'data-mb-target' => 'img',
		),
	),
	array(
		'label'    => 'Cover, Scroll Interactive Image Zoom',
		'panel'    => 'Scroll Interactive: Image Zoom · Easing: Linear',
		'behavior' => 'The background image zooms in step with the scroll; the text stays put.',
		'block'    => 'core/cover',
		'attrs'    => array(
			'animationMode' => 'scroll-interactive',
			'animationType' => 'image-zoom',
		),
		'expect'   => array(
			'class'                => array( 'mb-animated', 'mb-mode-scroll-interactive', 'mb-enter-image-zoom' ),
			'data-mb-type'         => 'image-zoom',
			'data-mb-target'       => 'img',
			'data-mb-easing' => 'linear',
		),
	),
	array(
		'label'    => 'Cover, Scroll Appear Entry = Image Zoom',
		'panel'    => 'Entry: Image Zoom · Replay: Once',
		'behavior' => 'The background image zooms once as the Cover scrolls into view.',
		'block'    => 'core/cover',
		'attrs'    => array(
			'animationMode'       => 'scroll-appear',
			'animationEntryType'  => 'image-zoom',
			'animationEntryDelay' => 0,
		),
		'expect'   => array(
			'class'              => array( 'mb-animated', 'mb-enter-image-zoom', 'mb-has-entry' ),
			'data-mb-entry-type' => 'image-zoom',
			'data-mb-target'     => 'img',
		),
	),
	// "Fixed background" and "Repeated background" save the image as a
	// <div> background, so there's no <img> to target: the editor
	// disables "Animate image only" and the image effects, and the
	// render filter must not emit data-mb-target.
	array(
		'label'    => 'Cover with Fixed background, Page Load Fade, Animate image only left on',
		'panel'    => 'Page Load: Fade In · Animate image only: unavailable (Fixed background)',
		'behavior' => 'The whole Cover fades in on page load.',
		'block'    => 'core/cover',
		'attrs'    => array(
			'hasParallax'           => true,
			'animationMode'         => 'page-load',
			'animationDelay'        => 0,
			'animationFromToTarget' => 'img',
		),
		'expect'   => array(
			'class'          => array( 'mb-animated', 'mb-enter-fade' ),
			'data-mb-type'   => 'fade',
			'data-mb-target' => null,
		),
	),
	array(
		'label'    => 'Cover with Fixed background, Scroll Appear Entry = Fade, Animate image only left on',
		'panel'    => 'Entry: Fade In · Animate image only: unavailable (Fixed background)',
		'behavior' => 'The whole Cover fades in once.',
		'block'    => 'core/cover',
		'attrs'    => array(
			'hasParallax'           => true,
			'animationMode'         => 'scroll-appear',
			'animationEntryType'    => 'fade',
			'animationEntryDelay'   => 0,
			'animationFromToTarget' => 'img',
		),
		'expect'   => array(
			'class'              => array( 'mb-animated', 'mb-enter-fade', 'mb-has-entry' ),
			'data-mb-entry-type' => 'fade',
			'data-mb-target'     => null,
		),
	),
	array(
		'label'    => 'Cover with Repeated background, Scroll Interactive Image Zoom',
		'panel'    => 'Scroll Interactive: Image Zoom (unavailable: Repeated background)',
		'behavior' => 'Nothing zooms: image effects need an <img> background.',
		'block'    => 'core/cover',
		'attrs'    => array(
			'isRepeated'    => true,
			'animationMode' => 'scroll-interactive',
			'animationType' => 'image-zoom',
		),
		'expect'   => array(
			'data-mb-type'   => 'image-zoom',
			'data-mb-target' => null,
		),
	),
	// Legacy units. Durations and delays have always been stored in
	// seconds; the Stagger step used to be milliseconds (default 100)
	// and moved to seconds (default 0.1). Anything over 5 is read as
	// milliseconds (staggerStepSeconds() in JS, the render filter in
	// PHP), so old saves keep their timing.
	array(
		'label'    => 'Stagger step saved in milliseconds (legacy default 100)',
		'panel'    => 'Entry: Fade In · Stagger on · Step 0.1s',
		'behavior' => 'Each child fades in 0.1s after the previous one.',
		'block'    => 'core/group',
		'children' => 3,
		'attrs'    => array(
			'animationMode'           => 'scroll-appear',
			'animationEntryType'      => 'fade',
			'animationEntryDelay'     => 0,
			'animationStaggerEnabled' => true,
			'animationStaggerStep'    => 100,
		),
		'expect'   => array(
			'class' => array( 'mb-stagger-parent' ),
			'style' => '--mb-stagger-step:0.1s;',
		),
	),
	array(
		'label'    => 'Page Load stagger step saved in milliseconds (250)',
		'panel'    => 'Page Load: Fade In · Stagger on · Step 0.25s',
		'behavior' => 'Each child fades in 0.25s after the previous one on page load.',
		'block'    => 'core/group',
		'children' => 3,
		'attrs'    => array(
			'animationMode'           => 'page-load',
			'animationDelay'          => 0,
			'animationStaggerEnabled' => true,
			'animationStaggerStep'    => 250,
		),
		'expect'   => array(
			'class' => array( 'mb-stagger-parent' ),
			'style' => '--mb-stagger-step:0.25s;',
		),
	),
	array(
		'label'    => 'Stagger step of 5 seconds (the panel maximum) stays in seconds',
		'panel'    => 'Entry: Fade In · Stagger on · Step 5s',
		'behavior' => 'Each child fades in 5s after the previous one.',
		'block'    => 'core/group',
		'children' => 3,
		'attrs'    => array(
			'animationMode'           => 'scroll-appear',
			'animationEntryType'      => 'fade',
			'animationEntryDelay'     => 0,
			'animationStaggerEnabled' => true,
			'animationStaggerStep'    => 5,
		),
		'expect'   => array(
			'class' => array( 'mb-stagger-parent' ),
			'style' => '--mb-stagger-step:5s;',
		),
	),
);
