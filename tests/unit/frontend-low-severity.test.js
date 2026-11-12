/**
 * Small front-end fixes from the November review (GH #141):
 *
 *   - a slot with no direction plays the effect's default, not the
 *     other slot's direction;
 *   - an empty Custom slot plays nothing, even when nested in another
 *     Custom block;
 *   - the per-device disable list PHP prints is honoured without the
 *     body classes;
 *   - a number the allowlist accepts (`.5`) gets its unit;
 *   - Stagger children of a Page Load Curtain Close parent start
 *     visible.
 *
 * jsdom has no layout, so offsets are stubbed, as in
 * scroll-appear-jumps.test.js.
 *
 * Run: npm run test:unit
 */
import fs from 'fs';
import path from 'path';

import { disabledDevicesFrom } from '../../src/motion-gate';
import { coerceWithUnit } from '../../src/components/constants';

class FakeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}
global.IntersectionObserver = FakeObserver;
global.ResizeObserver = FakeObserver;

function layout( el, top, height ) {
	Object.defineProperty( el, 'offsetTop', {
		get: () => top,
		configurable: true,
	} );
	Object.defineProperty( el, 'offsetHeight', {
		get: () => height,
		configurable: true,
	} );
	Object.defineProperty( el, 'offsetParent', {
		get: () => document.body,
		configurable: true,
	} );
	return el;
}

function scrollTo( y ) {
	window.scrollY = y;
	window.motionBlocks.refresh();
}

const blocks = {};

beforeAll( () => {
	document.documentElement.classList.add( 'mb-js', 'mb-motion' );
	Object.defineProperty( window, 'innerHeight', {
		value: 800,
		configurable: true,
	} );
	Object.defineProperty( window, 'scrollY', {
		value: 0,
		writable: true,
		configurable: true,
	} );
	Object.defineProperty( document.documentElement, 'scrollHeight', {
		get: () => 20000,
		configurable: true,
	} );
	document.documentElement.getBoundingClientRect = () => ( {
		top: -window.scrollY,
	} );
	layout( document.body, 0, 20000 );
	Object.defineProperty( document.body, 'offsetParent', {
		get: () => null,
		configurable: true,
	} );

	// Entry slides in from the left; Exit has no direction.
	const slide = document.createElement( 'p' );
	slide.className =
		'mb-animated mb-mode-scroll-appear mb-enter-slide mb-has-entry mb-exit-slide';
	slide.setAttribute( 'data-mb-mode', 'scroll-appear' );
	slide.setAttribute( 'data-mb-entry-type', 'slide' );
	slide.setAttribute( 'data-mb-entry-direction', 'ltr' );
	slide.setAttribute( 'data-mb-exit-type', 'slide' );
	slide.setAttribute( 'data-mb-exit-replay', 'reverse' );
	blocks.slide = layout( slide, 3000, 48 );

	// A Custom Entry with every property removed.
	const empty = document.createElement( 'p' );
	empty.className =
		'mb-animated mb-mode-scroll-appear mb-enter-custom mb-has-entry';
	empty.setAttribute( 'data-mb-mode', 'scroll-appear' );
	empty.setAttribute( 'data-mb-entry-type', 'custom' );
	blocks.empty = layout( empty, 9000, 48 );

	document.body.append( slide, empty );
	require( '../../src/frontend.js' );
} );

describe( 'a slot with no direction', () => {
	it( 'drops the other slot’s direction, so the default plays', () => {
		scrollTo( 2700 );
		expect( blocks.slide.classList.contains( 'mb-triggered' ) ).toBe(
			true
		);
		expect( blocks.slide.style.getPropertyValue( '--mb-slide-x' ) ).toBe(
			'-50px'
		);
		// Scrolled past: the Exit plays.
		scrollTo( 5000 );
		expect( blocks.slide.classList.contains( 'mb-exit-triggered' ) ).toBe(
			true
		);
		expect( blocks.slide.style.getPropertyValue( '--mb-slide-x' ) ).toBe(
			''
		);
	} );
} );

describe( 'an empty Custom slot', () => {
	it( 'is bound to no keyframe, so it can’t inherit an outer block’s', () => {
		expect(
			blocks.empty.style.getPropertyValue( '--mb-entry-anim-name' )
		).toBe( 'none' );
	} );
} );

describe( 'per-device disable', () => {
	it( 'reads the list PHP printed when the theme prints no body classes', () => {
		const body = document.createElement( 'body' );
		expect( disabledDevicesFrom( body, [ 'mobile' ] ) ).toEqual( [
			'mobile',
		] );
		body.classList.add( 'mb-disabled-desktop' );
		expect( disabledDevicesFrom( body, [ 'mobile' ] ) ).toEqual( [
			'mobile',
			'desktop',
		] );
		expect( disabledDevicesFrom( body ) ).toEqual( [ 'desktop' ] );
	} );
} );

describe( 'numbers without a leading zero', () => {
	it( 'get their unit, like any other number', () => {
		expect( coerceWithUnit( '.5', 'deg' ) ).toBe( '.5deg' );
		expect( coerceWithUnit( ' 10 ', 'px' ) ).toBe( '10px' );
		expect( coerceWithUnit( '10%', 'px' ) ).toBe( '10%' );
	} );
} );

describe( 'Stagger under a Page Load Curtain Close parent', () => {
	it( 'starts the children visible, like the other Out effects', () => {
		const css = fs.readFileSync(
			path.join( __dirname, '../../css/animations.css' ),
			'utf8'
		);
		const lists = css.match(
			/\.mb-stagger-parent:is\([^)]*\)\.mb-mode-page-load:not\(\.mb-triggered\)/g
		);
		expect( lists ).toHaveLength( 2 );
		lists.forEach( ( list ) =>
			expect( list ).toContain( '.mb-enter-curtain-out' )
		);
	} );
} );
