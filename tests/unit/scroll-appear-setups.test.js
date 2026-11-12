/**
 * Every Scroll Appear setup through the same scroll sequences.
 *
 * A block has an Entry, an Exit, or both, and each has a Replay choice
 * (Once, Repeat, Reverse): 15 setups. The other Scroll Appear tests
 * cover the setups that broke; this one runs all 15 through the same
 * five journeys and records, at every stop, whether the block is
 * visible. It is the place to look when a change to tick() or a
 * handleSlot*() function shifts a setup nobody was thinking about.
 *
 * Two checks:
 *
 *   1. The rule no setup may break: a block resting in the trigger band
 *      is visible, unless its Exit is Replay Once and has played (that
 *      block stays gone by design).
 *   2. The full record for each setup and journey ("V" visible, "."
 *      hidden, one character per stop). These are what the engine does
 *      today, written down so a change shows up as a diff. If a change
 *      is meant, update the record in the same commit and say why.
 *
 * "Visible" is read from the trigger classes, as the stylesheet does:
 * the Entry played forward, the Exit played in reverse, or (with no
 * Entry) no trigger class at all.
 *
 * jsdom has no layout, so the block's offsets are stubbed. Each scroll
 * step sets window.scrollY and calls window.motionBlocks.refresh(),
 * which re-measures and re-ticks every block the way a scroll frame
 * does. A "scroll" moves 40px at a time; a "jump" lands in one step
 * (an anchor link, the Home key, a reload).
 *
 * Run: npm run test:unit
 */
class FakeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}
global.IntersectionObserver = FakeObserver;
global.ResizeObserver = FakeObserver;

// An 800px screen: the trigger band is 120–680. The block is 48px
// tall at 3000 in a 20000px page.
const VH = 800;
const TOP = 3000;
// Scroll positions, by where they put the block on the screen.
const PAGE_TOP = 0; // far below the screen
const IN_BAND = 2600; // 400 down the screen
const ABOVE_BAND = 2950; // 50 down: on screen, above the band
const BELOW_BAND = 2250; // 750 down: on screen, below the band
const TOP_EDGE = 2990; // 10 down: on screen, above the band
const PAST = 4000; // above the screen
const FAR_PAST = 6000;

const REPLAYS = [ 'once', 'repeat', 'reverse' ];
const SETUPS = [];
REPLAYS.forEach( ( entry ) => SETUPS.push( { entry, exit: null } ) );
REPLAYS.forEach( ( exit ) => SETUPS.push( { entry: null, exit } ) );
REPLAYS.forEach( ( entry ) =>
	REPLAYS.forEach( ( exit ) => SETUPS.push( { entry, exit } ) )
);
// "Entry replay / Exit replay", "-" for an empty slot.
const setupName = ( s ) => `${ s.entry || '-' } / ${ s.exit || '-' }`;

/**
 * The journeys. `start` is the scroll position the page loads at;
 * each stop is [ label, 'scroll' | 'jump', position, in the band?,
 * left through the top? ]. `expected` has one character per stop,
 * the first for the load itself.
 */
const JOURNEYS = {
	'scrolling down past the block and back, twice': {
		start: PAGE_TOP,
		stops: [
			[ 'in the band', 'scroll', IN_BAND, true ],
			[ 'left through the top', 'scroll', ABOVE_BAND, false, true ],
			[ 'scrolled past', 'scroll', PAST ],
			[ 'back in the band', 'scroll', IN_BAND, true ],
			[ 'left through the bottom', 'scroll', BELOW_BAND ],
			[ 'back at the top of the page', 'scroll', PAGE_TOP ],
			[ 'in the band again', 'scroll', IN_BAND, true ],
			[ 'scrolled past again', 'scroll', PAST, false, true ],
			[ 'in the band a third time', 'scroll', IN_BAND, true ],
		],
		expected: {
			'once / -': '.VVVVVVVVV',
			'repeat / -': '.VVVVV.VVV',
			'reverse / -': '.VVVV..VVV',
			'- / once': 'VV........',
			'- / repeat': 'VV..VVVV.V',
			'- / reverse': 'VV..VVVV.V',
			'once / once': '.V........',
			'once / repeat': '.V..VVVV.V',
			'once / reverse': '.V..VVVV.V',
			'repeat / once': '.V........',
			'repeat / repeat': '.V..VV.V.V',
			'repeat / reverse': '.V..VV.V.V',
			'reverse / once': '.V........',
			'reverse / repeat': '.V..V..V.V',
			'reverse / reverse': '.V..V..V.V',
		},
	},
	'jumping past the block and back': {
		start: PAGE_TOP,
		stops: [
			[ 'in the band', 'scroll', IN_BAND, true ],
			[ 'jumped far past', 'jump', FAR_PAST, false, true ],
			[ 'jumped to the top of the page', 'jump', PAGE_TOP ],
			[ 'jumped into the band', 'jump', IN_BAND, true ],
			[ 'jumped to the top again', 'jump', PAGE_TOP ],
			[ 'scrolled into the band', 'scroll', IN_BAND, true ],
		],
		expected: {
			'once / -': '.VVVVVV',
			'repeat / -': '.VVVV.V',
			'reverse / -': '.VVVV.V',
			'- / once': 'VV.....',
			'- / repeat': 'VV.VVVV',
			'- / reverse': 'VV.VVVV',
			'once / once': '.V.....',
			'once / repeat': '.V.VVVV',
			'once / reverse': '.V.VVVV',
			'repeat / once': '.V.....',
			'repeat / repeat': '.V..V.V',
			'repeat / reverse': '.V..V.V',
			'reverse / once': '.V.....',
			'reverse / repeat': '.V..V.V',
			'reverse / reverse': '.V..V.V',
		},
	},
	'a page loaded below the block, then scrolled up': {
		start: 5000,
		stops: [
			[ 'scrolled up into the band', 'scroll', IN_BAND, true ],
			[ 'on up to the top of the page', 'scroll', PAGE_TOP ],
			[ 'back down into the band', 'scroll', IN_BAND, true ],
		],
		expected: {
			'once / -': '.VVV',
			'repeat / -': '.V.V',
			'reverse / -': '.V.V',
			'- / once': 'VVVV',
			'- / repeat': 'VVVV',
			'- / reverse': 'VVVV',
			'once / once': '.VVV',
			'once / repeat': '.VVV',
			'once / reverse': '.VVV',
			'repeat / once': '.V.V',
			'repeat / repeat': '.V.V',
			'repeat / reverse': '.V.V',
			'reverse / once': '.V.V',
			'reverse / repeat': '.V.V',
			'reverse / reverse': '.V.V',
		},
	},
	'a page loaded with the block in the band': {
		start: IN_BAND,
		stops: [
			[ 'scrolled past', 'scroll', PAST, false, true ],
			[ 'back in the band', 'scroll', IN_BAND, true ],
		],
		expected: {
			'once / -': 'VVV',
			'repeat / -': 'VVV',
			'reverse / -': 'VVV',
			'- / once': 'V..',
			'- / repeat': 'V.V',
			'- / reverse': 'V.V',
			'once / once': 'V..',
			'once / repeat': 'V.V',
			'once / reverse': 'V.V',
			'repeat / once': 'V..',
			'repeat / repeat': 'V.V',
			'repeat / reverse': 'V.V',
			'reverse / once': 'V..',
			'reverse / repeat': 'V.V',
			'reverse / reverse': 'V.V',
		},
	},
	'a page loaded with the block at the top edge of the screen': {
		start: TOP_EDGE,
		stops: [
			[ 'scrolled past', 'scroll', PAST ],
			[ 'back in the band', 'scroll', IN_BAND, true ],
		],
		expected: {
			'once / -': 'VVV',
			'repeat / -': 'VVV',
			'reverse / -': 'VVV',
			'- / once': 'VVV',
			'- / repeat': 'VVV',
			'- / reverse': 'VVV',
			'once / once': '..V',
			'once / repeat': '..V',
			'once / reverse': '..V',
			'repeat / once': '..V',
			'repeat / repeat': '..V',
			'repeat / reverse': '..V',
			'reverse / once': '..V',
			'reverse / repeat': '..V',
			'reverse / reverse': '..V',
		},
	},
};

function layout( el, top, height, parent = document.body ) {
	Object.defineProperty( el, 'offsetTop', {
		get: () => top,
		configurable: true,
	} );
	Object.defineProperty( el, 'offsetHeight', {
		get: () => height,
		configurable: true,
	} );
	Object.defineProperty( el, 'offsetParent', {
		get: () => parent,
		configurable: true,
	} );
	return el;
}

/**
 * The block as the render filter prints it. No Delay on either slot.
 *
 * @param {Object} setup Entry and Exit replay.
 * @return {Element} The block, laid out at TOP.
 */
function block( setup ) {
	const p = document.createElement( 'p' );
	p.className = 'mb-animated mb-mode-scroll-appear';
	p.setAttribute( 'data-mb-mode', 'scroll-appear' );
	if ( setup.entry ) {
		p.classList.add( 'mb-enter-fade', 'mb-has-entry' );
		p.setAttribute( 'data-mb-entry-type', 'fade' );
		p.setAttribute( 'data-mb-entry-replay', setup.entry );
		p.setAttribute( 'data-mb-entry-delay', '0' );
	}
	if ( setup.exit ) {
		p.classList.add( 'mb-exit-fade' );
		p.setAttribute( 'data-mb-exit-type', 'fade' );
		p.setAttribute( 'data-mb-exit-replay', setup.exit );
		p.setAttribute( 'data-mb-exit-delay', '0' );
	}
	return layout( p, TOP, 48 );
}

/**
 * Whether the block's trigger classes leave it visible.
 *
 * @param {Element} el Block.
 * @return {boolean} True when visible.
 */
function visible( el ) {
	const reversed =
		el.style.getPropertyValue( '--mb-direction' ) === 'reverse';
	if ( el.classList.contains( 'mb-exit-triggered' ) ) {
		// The Exit ends hidden; played in reverse it ends shown.
		return reversed;
	}
	if ( el.classList.contains( 'mb-triggered' ) ) {
		return ! reversed;
	}
	// No trigger class: a block with an Entry is pre-hidden.
	return ! el.classList.contains( 'mb-has-entry' );
}

function jumpTo( y ) {
	window.scrollY = y;
	window.motionBlocks.refresh();
}

function scrollTo( y ) {
	const step = y > window.scrollY ? 40 : -40;
	while ( Math.abs( y - window.scrollY ) > 40 ) {
		jumpTo( window.scrollY + step );
	}
	jumpTo( y );
}

/** Let the MutationObserver wire (or drop) blocks, then tick them. */
async function settled() {
	await new Promise( ( r ) => setTimeout( r, 0 ) );
	window.motionBlocks.refresh();
}

/**
 * Take a fresh block of this setup through a journey.
 *
 * @param {Object} setup   Entry and Exit replay.
 * @param {Object} journey One of JOURNEYS.
 * @return {Promise<boolean[]>} Visible or not at load and at each stop.
 */
async function travel( setup, journey ) {
	window.scrollY = journey.start;
	const el = block( setup );
	document.body.append( el );
	await settled();
	const seen = [ visible( el ) ];
	journey.stops.forEach( ( [ , how, y ] ) => {
		( how === 'jump' ? jumpTo : scrollTo )( y );
		seen.push( visible( el ) );
	} );
	el.remove();
	await settled();
	return seen;
}

beforeAll( () => {
	document.documentElement.classList.add( 'mb-js', 'mb-motion' );
	Object.defineProperty( window, 'innerHeight', {
		value: VH,
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
	// <html>'s box moves up as the page scrolls, as in a browser.
	document.documentElement.getBoundingClientRect = () => ( {
		top: -window.scrollY,
	} );
	layout( document.body, 0, 20000, null );
	// jsdom's readyState is already 'complete', so this runs init().
	require( '../../src/frontend.js' );
} );

it( 'covers all 15 setups in every journey', () => {
	expect( SETUPS ).toHaveLength( 15 );
	Object.values( JOURNEYS ).forEach( ( journey ) => {
		expect( Object.keys( journey.expected ) ).toEqual(
			SETUPS.map( setupName )
		);
		Object.values( journey.expected ).forEach( ( record ) =>
			expect( record ).toHaveLength( journey.stops.length + 1 )
		);
	} );
} );

describe.each( Object.entries( JOURNEYS ) )( '%s', ( title, journey ) => {
	describe.each( SETUPS.map( ( s ) => [ setupName( s ), s ] ) )(
		'Entry / Exit: %s',
		( name, setup ) => {
			let seen;
			beforeAll( async () => {
				seen = await travel( setup, journey );
			} );

			it( 'is visible whenever it rests in the band', () => {
				// The one exception: an Exit with Replay Once that has
				// played. That block stays gone by design.
				let exitPlayed = false;
				const wrong = [];
				journey.stops.forEach(
					( [ label, , , inBand, leftTop ], i ) => {
						if ( leftTop ) {
							exitPlayed = true;
						}
						const goneForGood = setup.exit === 'once' && exitPlayed;
						if ( inBand && seen[ i + 1 ] !== ! goneForGood ) {
							wrong.push( label );
						}
					}
				);
				expect( wrong ).toEqual( [] );
			} );

			it( 'does what it did before at every stop', () => {
				const labels = [
					'on load',
					...journey.stops.map( ( [ label ] ) => label ),
				];
				const read = ( record ) =>
					labels.map(
						( label, i ) =>
							`${ label }: ${
								record[ i ] === 'V' ? 'visible' : 'hidden'
							}`
					);
				const actual = seen
					.map( ( v ) => ( v ? 'V' : '.' ) )
					.join( '' );
				expect( read( actual ) ).toEqual(
					read( journey.expected[ name ] )
				);
			} );
		}
	);
} );
