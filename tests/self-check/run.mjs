#!/usr/bin/env node
/**
 * Motion Blocks page & editor checks: runs the self-check on every
 * fixture page in headless Chrome and compares the results with what
 * each page is expected to report.
 *
 * Input is the manifest that `fixtures.php json` prints (one entry per
 * fixture page: url, edit_url, expect, expect_reduced_motion). For each
 * page the runner:
 *
 *   1. opens the page and runs `await motionBlocksSelfCheck({ sweep: true })`
 *      (scrolls the whole page and collects every problem seen), and
 *      compares the sorted, de-duplicated `id#issue` list with `expect`;
 *   2. does the same with prefers-reduced-motion emulated, against
 *      `expect_reduced_motion`;
 *   3. opens the page in the block editor and runs
 *      `await motionBlocksEditorCheck()`, which must report nothing.
 *
 * A page with `assets: false` in the manifest has no animated blocks,
 * so steps 1 and 2 instead check that none of the front-end assets
 * loaded (stylesheet, runtime, self-check, the html.mb-js marker).
 * Step 3 still runs: the editor loads its CSS on every post.
 *
 * The self-check scripts only load for a logged-in user while the
 * `mb_debug_markers` option (Settings → Motion Blocks → Self-check) is
 * on, so the runner logs in first.
 *
 * Usage:
 *
 *   node tests/self-check/run.mjs --manifest manifest.json [options]
 *   npm run test:pages -- --manifest manifest.json [options]
 *
 * Options (each also readable from an environment variable):
 *
 *   --manifest <file>     MB_MANIFEST     Manifest JSON from `fixtures.php json`.
 *   --base-url <url>      MB_BASE_URL     Site root (replaces the origin of the manifest's URLs).
 *                                         Default: origin of the first page URL.
 *   --login <how>         MB_LOGIN        studio (default): Studio's /studio-auto-login URL.
 *                                         form: submit wp-login.php with --user / --password.
 *                                         none: don't log in (the site logs visitors in itself).
 *   --user <name>         MB_USER         For --login form. Default: admin.
 *   --password <pw>       MB_PASSWORD     For --login form. Default: password
 *                                         (WordPress Playground's default admin password).
 *   --chrome <path>       CHROME_PATH     Chrome/Chromium binary. Default: found automatically.
 *   --concurrency <n>     MB_CONCURRENCY  Pages checked at the same time (tabs). Default: 4.
 *   --only <keys>                         Comma-separated fixture keys to run (e.g. smoke,clean).
 *
 * Exit code: 0 when every check matches, 1 when any check fails,
 * 2 when the run couldn't start (no Chrome, login failed, bad manifest).
 *
 * No dependencies: talks to Chrome over the DevTools protocol with
 * Node's built-in WebSocket (Node 22+).
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { parseArgs } from 'node:util';

/* ------------------------------------------------------------------
 * Settings
 * ---------------------------------------------------------------- */

const { values: args } = parseArgs( {
	options: {
		manifest: { type: 'string' },
		'base-url': { type: 'string' },
		login: { type: 'string' },
		user: { type: 'string' },
		password: { type: 'string' },
		chrome: { type: 'string' },
		concurrency: { type: 'string' },
		only: { type: 'string' },
		help: { type: 'boolean', short: 'h' },
	},
} );

if ( args.help ) {
	// The usage text is the comment at the top of this file.
	const source = readFileSync( new URL( import.meta.url ), 'utf8' );
	console.log( source.slice( source.indexOf( '/**' ) ).split( '*/' )[ 0 ].replace( /^\s*\/?\*+ ?/gm, '' ) );
	process.exit( 0 );
}

function setupError( message ) {
	console.error( `run.mjs: ${ message }` );
	process.exit( 2 );
}

const manifestPath = args.manifest || process.env.MB_MANIFEST;
if ( ! manifestPath ) {
	setupError( 'pass --manifest <file> (the output of `fixtures.php json`).' );
}
let manifest;
try {
	manifest = JSON.parse( readFileSync( manifestPath, 'utf8' ) );
} catch ( e ) {
	setupError( `can't read the manifest ${ manifestPath }: ${ e.message }` );
}
if ( ! Array.isArray( manifest ) || ! manifest.length ) {
	setupError( `the manifest ${ manifestPath } has no pages.` );
}
if ( args.only ) {
	const keys = args.only.split( ',' );
	manifest = manifest.filter( ( fx ) => keys.includes( fx.key ) );
	if ( ! manifest.length ) {
		setupError( `no fixture page matches --only ${ args.only }.` );
	}
}

// The site root, for logging in. Given explicitly, it also replaces the
// origin of every page URL in the manifest (for a manifest generated
// under another host name or port).
const givenBaseUrl = args[ 'base-url' ] || process.env.MB_BASE_URL;
const baseUrl = ( givenBaseUrl || new URL( manifest[ 0 ].url ).origin ).replace(
	/\/$/,
	''
);
if ( givenBaseUrl ) {
	const rebase = ( url ) => {
		const u = new URL( url );
		return baseUrl + u.pathname + u.search;
	};
	manifest = manifest.map( ( fx ) => ( {
		...fx,
		url: rebase( fx.url ),
		edit_url: rebase( fx.edit_url ),
	} ) );
}
const login = args.login || process.env.MB_LOGIN || 'studio';
const user = args.user || process.env.MB_USER || 'admin';
const password = args.password || process.env.MB_PASSWORD || 'password';
const concurrency = Math.max(
	1,
	parseInt( args.concurrency || process.env.MB_CONCURRENCY || '4', 10 )
);

// How long a page gets to load, and a whole check to finish, before
// it counts as failed (a hung page shouldn't hang the run).
const LOAD_TIMEOUT_MS = 120_000;
const CHECK_TIMEOUT_MS = 600_000;

const sleep = ( ms ) => new Promise( ( r ) => setTimeout( r, ms ) );

/* ------------------------------------------------------------------
 * Chrome
 * ---------------------------------------------------------------- */

function findChrome() {
	const given = args.chrome || process.env.CHROME_PATH;
	if ( given ) {
		return given;
	}
	const candidates = [
		'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
		'/Applications/Chromium.app/Contents/MacOS/Chromium',
	];
	// On Linux (CI), look the usual names up on PATH.
	for ( const dir of ( process.env.PATH || '' ).split( delimiter ) ) {
		for ( const name of [
			'google-chrome',
			'google-chrome-stable',
			'chromium',
			'chromium-browser',
		] ) {
			candidates.push( join( dir, name ) );
		}
	}
	return candidates.find( ( p ) => existsSync( p ) );
}

const chromePath = findChrome();
if ( ! chromePath ) {
	setupError( 'no Chrome found. Install Chrome or set CHROME_PATH.' );
}

const profileDir = mkdtempSync( join( tmpdir(), 'mb-self-check-' ) );
const chrome = spawn(
	chromePath,
	[
		'--headless=new',
		// Port 0: Chrome picks a free port and writes it to
		// DevToolsActivePort in the profile directory.
		'--remote-debugging-port=0',
		`--user-data-dir=${ profileDir }`,
		'--window-size=1280,800',
		'--no-first-run',
		'--no-default-browser-check',
		// Several pages run at once; none of them may be treated as a
		// background tab, or its timers and animation frames slow down
		// and the self-check would see blocks that never trigger.
		'--disable-background-timer-throttling',
		'--disable-backgrounding-occluded-windows',
		'--disable-renderer-backgrounding',
		// CI containers: small /dev/shm, and Ubuntu 24.04 blocks
		// Chrome's sandbox. Only ever pointed at a local test site.
		...( process.env.CI
			? [ '--no-sandbox', '--disable-dev-shm-usage' ]
			: [] ),
		'about:blank',
	],
	{ stdio: 'ignore' }
);

function cleanup() {
	chrome.kill();
	// Chrome may still hold files for a moment after kill.
	setTimeout( () => {
		try {
			rmSync( profileDir, { recursive: true, force: true } );
		} catch {}
	}, 500 ).unref();
}

async function browserWebSocketUrl() {
	const file = join( profileDir, 'DevToolsActivePort' );
	for ( let i = 0; i < 150; i++ ) {
		if ( existsSync( file ) ) {
			const [ port, path ] = readFileSync( file, 'utf8' ).split( '\n' );
			if ( port && path ) {
				return `ws://127.0.0.1:${ port }${ path }`;
			}
		}
		await sleep( 200 );
	}
	throw new Error( `Chrome (${ chromePath }) didn't start.` );
}

/* ------------------------------------------------------------------
 * DevTools protocol: one connection to the browser, one session per tab
 * ---------------------------------------------------------------- */

let nextId = 0;
const pending = new Map();
const listeners = new Set();
let ws;

function send( method, params = {}, sessionId ) {
	return new Promise( ( resolve, reject ) => {
		const id = ++nextId;
		pending.set( id, { resolve, reject, method } );
		ws.send( JSON.stringify( { id, method, params, sessionId } ) );
	} );
}

async function connect() {
	ws = new WebSocket( await browserWebSocketUrl() );
	await new Promise( ( resolve, reject ) => {
		ws.addEventListener( 'open', resolve );
		ws.addEventListener( 'error', reject );
	} );
	ws.addEventListener( 'message', ( event ) => {
		const msg = JSON.parse( event.data );
		if ( msg.id && pending.has( msg.id ) ) {
			const { resolve, reject, method } = pending.get( msg.id );
			pending.delete( msg.id );
			if ( msg.error ) {
				reject( new Error( `${ method }: ${ msg.error.message }` ) );
			} else {
				resolve( msg.result );
			}
		} else if ( msg.method ) {
			listeners.forEach( ( fn ) => fn( msg ) );
		}
	} );
}

/** A browser tab with the helpers the checks need. */
async function openTab() {
	// A window of its own, so every tab counts as visible and focused.
	const { targetId } = await send( 'Target.createTarget', {
		url: 'about:blank',
		newWindow: true,
	} );
	const { sessionId } = await send( 'Target.attachToTarget', {
		targetId,
		flatten: true,
	} );
	const tab = {
		send: ( method, params ) => send( method, params, sessionId ),

		/** Navigates and resolves once the load event fires. */
		go( url ) {
			return tab.waitForLoad(
				() => tab.send( 'Page.navigate', { url } ),
				url
			);
		},

		/** Runs `action`, then waits for the page load it starts. */
		async waitForLoad( action, what = 'page' ) {
			let onEvent;
			let timer;
			const loaded = new Promise( ( resolve, reject ) => {
				timer = setTimeout(
					() => reject( new Error( `timed out loading ${ what }` ) ),
					LOAD_TIMEOUT_MS
				);
				onEvent = ( msg ) => {
					if (
						msg.sessionId === sessionId &&
						msg.method === 'Page.loadEventFired'
					) {
						resolve();
					}
				};
				listeners.add( onEvent );
			} );
			loaded.catch( () => {} ); // handled below; avoids an unhandled rejection
			try {
				await action();
				await loaded;
			} finally {
				clearTimeout( timer );
				listeners.delete( onEvent );
			}
		},

		/** Runs an expression in the page and returns its (awaited) value. */
		async evaluate( expression ) {
			const res = await tab.send( 'Runtime.evaluate', {
				expression,
				awaitPromise: true,
				returnByValue: true,
			} );
			if ( res.exceptionDetails ) {
				const ex = res.exceptionDetails.exception;
				throw new Error(
					( ex && ( ex.description || ex.value ) ) ||
						res.exceptionDetails.text
				);
			}
			return res.result.value;
		},
	};
	await tab.send( 'Page.enable' );
	await tab.send( 'Emulation.setFocusEmulationEnabled', { enabled: true } );
	await tab.send( 'Emulation.setDeviceMetricsOverride', {
		width: 1280,
		height: 800,
		deviceScaleFactor: 1,
		mobile: false,
	} );
	return tab;
}

/* ------------------------------------------------------------------
 * Logging in
 * ---------------------------------------------------------------- */

async function logIn( tab ) {
	if ( login === 'studio' ) {
		await tab.go(
			`${ baseUrl }/studio-auto-login?redirect_to=${ encodeURIComponent(
				baseUrl + '/'
			) }`
		);
		await sleep( 1000 );
	} else if ( login === 'form' ) {
		await tab.go( `${ baseUrl }/wp-login.php` );
		// Fill in and submit the login form, then wait for the page it
		// redirects to (wp-admin) to finish loading.
		await tab.waitForLoad( () =>
			tab.evaluate( `(() => {
				document.getElementById( 'user_login' ).value = ${ JSON.stringify( user ) };
				document.getElementById( 'user_pass' ).value = ${ JSON.stringify( password ) };
				document.getElementById( 'loginform' ).submit();
			})()` )
		);
	} else if ( login !== 'none' ) {
		setupError( `unknown --login "${ login }" (use studio, form or none).` );
	}

	// Every theme prints `logged-in` on <body> for a logged-in user.
	await tab.go( `${ baseUrl }/` );
	const loggedIn = await tab.evaluate(
		`document.body.classList.contains( 'logged-in' )`
	);
	if ( ! loggedIn ) {
		throw new Error(
			`not logged in at ${ baseUrl }/ after --login ${ login }. The self-check only loads for users who can edit posts.`
		);
	}
}

/* ------------------------------------------------------------------
 * The checks
 * ---------------------------------------------------------------- */

const sortedUnique = ( list ) => [ ...new Set( list ) ].sort();

/** Front-end sweep, with or without reduced motion. */
async function pageCheck( tab, fx, reduced ) {
	await tab.send( 'Emulation.setEmulatedMedia', {
		features: [
			{
				name: 'prefers-reduced-motion',
				value: reduced ? 'reduce' : 'no-preference',
			},
		],
	} );
	await tab.go( fx.url );
	// Let load-time animations and late layout finish first.
	await sleep( 1500 );
	if ( fx.assets === false ) {
		return assetsAbsentCheck( tab, fx, reduced );
	}
	let got;
	try {
		got = await tab.evaluate( `(() => {
			if ( typeof motionBlocksSelfCheck !== 'function' ) {
				return [ 'self-check script not loaded (is Settings → Motion Blocks → Self-check on, and are we logged in?)' ];
			}
			return motionBlocksSelfCheck( { sweep: true } ).then( ( rs ) =>
				rs.map( ( r ) => r.id + ( r.issue ? '#' + r.issue : '' ) + ' :: ' + r.message )
			);
		})()` );
	} catch ( e ) {
		got = [ 'EXCEPTION ' + e.message ];
	}
	const gotIds = sortedUnique( got.map( ( s ) => s.split( ' :: ' )[ 0 ] ) );
	const want = [ ...( reduced ? fx.expect_reduced_motion : fx.expect ) ].sort();
	const ok = JSON.stringify( gotIds ) === JSON.stringify( want );
	return {
		ok,
		line: `${ ok ? 'PASS' : 'FAIL' } ${ reduced ? '[reduced] ' : '' }${
			fx.key
		}  want=${ JSON.stringify( want ) } got=${ JSON.stringify( gotIds ) }`,
		details: ok ? [] : got,
	};
}

/**
 * A page with no animated blocks must load none of the front-end
 * assets, and so has no self-check to run.
 */
async function assetsAbsentCheck( tab, fx, reduced ) {
	let got;
	try {
		got = await tab.evaluate( `(() => {
			const found = [
				'#motion-blocks-styles-css',
				'#motion-blocks-frontend-js',
				'#motion-blocks-self-check-js',
				'#motion-blocks-js-marker',
			].filter( ( s ) => document.querySelector( s ) );
			if ( document.documentElement.classList.contains( 'mb-js' ) ) {
				found.push( 'html.mb-js' );
			}
			if ( typeof motionBlocksSelfCheck !== 'undefined' ) {
				found.push( 'motionBlocksSelfCheck' );
			}
			return found;
		})()` );
	} catch ( e ) {
		got = [ 'EXCEPTION ' + e.message ];
	}
	const ok = got.length === 0;
	return {
		ok,
		line: `${ ok ? 'PASS' : 'FAIL' } ${ reduced ? '[reduced] ' : '' }${
			fx.key
		}  assets absent, found=${ JSON.stringify( got ) }`,
		details: ok
			? []
			: got.map( ( s ) => `loaded on a page with no animations: ${ s }` ),
	};
}

/** The page must open in the editor with no invalid blocks or errors. */
async function editorCheck( tab, fx ) {
	await tab.send( 'Emulation.setEmulatedMedia', { features: [] } );
	await tab.go( fx.edit_url );
	let got;
	try {
		got = await tab.evaluate( `(async () => {
			for ( let i = 0; i < 100 && ! window.motionBlocksEditorCheck; i++ ) {
				await new Promise( ( r ) => setTimeout( r, 100 ) );
			}
			if ( ! window.motionBlocksEditorCheck ) {
				return [ 'editor-check script not loaded' ];
			}
			return ( await motionBlocksEditorCheck() ).map( ( r ) => r.id + ' :: ' + r.message );
		})()` );
	} catch ( e ) {
		got = [ 'EXCEPTION ' + e.message ];
	}
	const ok = got.length === 0;
	return {
		ok,
		line: `${ ok ? 'PASS' : 'FAIL' } [editor] ${ fx.key }`,
		details: got,
	};
}

/* ------------------------------------------------------------------
 * Run
 * ---------------------------------------------------------------- */

// Every check is an independent job. They're listed in report order
// (all pages, then all pages with reduced motion, then the editor).
const jobs = [
	...manifest.map( ( fx ) => ( tab ) => pageCheck( tab, fx, false ) ),
	...manifest.map( ( fx ) => ( tab ) => pageCheck( tab, fx, true ) ),
	...manifest.map( ( fx ) => ( tab ) => editorCheck( tab, fx ) ),
];

// The order they're handed out to the tabs: each page's two sweeps
// next to each other, then the (quick) editor checks. The smoke page,
// by far the longest sweep, comes first in the manifest, so both its
// sweeps start right away instead of one of them holding up the end.
const n = manifest.length;
const queue = [
	...manifest.flatMap( ( fx, i ) => [ i, n + i ] ),
	...manifest.map( ( fx, i ) => 2 * n + i ),
];

function withTimeout( promise, ms, what ) {
	let timer;
	return Promise.race( [
		promise,
		new Promise( ( _, reject ) => {
			timer = setTimeout(
				() => reject( new Error( `${ what } timed out` ) ),
				ms
			);
		} ),
	] ).finally( () => clearTimeout( timer ) );
}

async function main() {
	const started = Date.now();
	await connect();

	const first = await openTab();
	try {
		await logIn( first );
	} catch ( e ) {
		setupError( e.message );
	}

	const tabs = [ first ];
	while ( tabs.length < Math.min( concurrency, jobs.length ) ) {
		tabs.push( await openTab() );
	}

	const results = new Array( jobs.length );
	let next = 0;
	let done = 0;
	await Promise.all(
		tabs.map( async ( tab ) => {
			while ( next < queue.length ) {
				const index = queue[ next++ ];
				const jobStarted = Date.now();
				try {
					results[ index ] = await withTimeout(
						jobs[ index ]( tab ),
						CHECK_TIMEOUT_MS,
						'check'
					);
				} catch ( e ) {
					results[ index ] = {
						ok: false,
						line: `FAIL job ${ index + 1 }`,
						details: [ 'EXCEPTION ' + e.message ],
					};
				}
				done++;
				const secs = ( ( Date.now() - jobStarted ) / 1000 ).toFixed( 1 );
				console.error(
					`[${ done }/${ jobs.length }] ${ results[ index ].line } (${ secs }s)`
				);
			}
		} )
	);

	// The report, in a fixed order whatever order the checks finished in.
	console.log( '' );
	let failures = 0;
	for ( const r of results ) {
		console.log( r.line );
		if ( ! r.ok ) {
			failures++;
			r.details.forEach( ( d ) => console.log( '      ' + d ) );
		}
	}
	const total = ( ( Date.now() - started ) / 1000 ).toFixed( 0 );
	console.log(
		`${ failures ? `${ failures } failing` : 'all passing' } (${
			jobs.length
		} checks, ${ manifest.length } pages, ${ total }s, concurrency ${
			tabs.length
		})`
	);
	return failures;
}

main()
	.then( ( failures ) => {
		cleanup();
		process.exit( failures ? 1 : 0 );
	} )
	.catch( ( e ) => {
		cleanup();
		setupError( e.stack || e.message );
	} );
