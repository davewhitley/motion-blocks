/**
 * Motion Blocks — Editor check (developer tool, GH #60)
 *
 * The editor half of the self-check: confirms a post opens cleanly in
 * the block editor with Motion Blocks active. Loaded only when the
 * Self-check setting is on (see motion_blocks_enqueue_editor_check).
 *
 *   await motionBlocksEditorCheck()
 *
 * resolves with the problems found, and logs them to the console:
 *   - invalid-block:  a block the editor flags as invalid content
 *                     ("This block contains unexpected or invalid content")
 *   - missing-block:  a block type that isn't registered
 *   - block-warning:  a warning or crash notice rendered in the canvas
 *   - console-error:  console errors and uncaught exceptions since load
 */

import { select } from '@wordpress/data';
import { menuOverlayBlockers } from './components/menuOverlay';

/**
 * console-style formatting: fills `%s` / `%o` / `%d` placeholders in a
 * leading format string, the way the console would display it.
 */
function format( args ) {
	const show = ( arg ) => {
		if ( arg instanceof Error ) {
			return arg.message;
		}
		if ( arg && typeof arg === 'object' ) {
			try {
				return JSON.stringify( arg );
			} catch ( e ) {
				return String( arg );
			}
		}
		return String( arg );
	};
	const rest = [ ...args ];
	let text = '';
	if ( typeof rest[ 0 ] === 'string' ) {
		text = rest
			.shift()
			.replace( /%[sodifO]/g, () =>
				rest.length ? show( rest.shift() ) : ''
			);
	}
	return [ text, ...rest.map( show ) ].filter( Boolean ).join( ' ' );
}

// Captured from the moment this script loads, which is before the
// editor mounts, so errors thrown while blocks render are included.
const consoleErrors = [];
const originalConsoleError = window.console.error;
window.console.error = function ( ...args ) {
	consoleErrors.push( format( args ) );
	return originalConsoleError.apply( this, args );
};
window.addEventListener( 'error', ( event ) => {
	consoleErrors.push( event.message );
} );
window.addEventListener( 'unhandledrejection', ( event ) => {
	consoleErrors.push( String( event.reason ) );
} );

function wait( ms ) {
	return new Promise( ( resolve ) => setTimeout( resolve, ms ) );
}

/**
 * Resolves once the editor has parsed the post into blocks (or after
 * `timeoutMs`, whichever comes first).
 */
async function editorReady( timeoutMs ) {
	const start = Date.now();
	while ( Date.now() - start < timeoutMs ) {
		const editor = select( 'core/editor' );
		const hasPost = editor && editor.getCurrentPostId();
		const blocks = select( 'core/block-editor' ).getBlocks();
		if ( hasPost && blocks.length ) {
			return true;
		}
		await wait( 200 );
	}
	return false;
}

function walk( blocks, visit ) {
	blocks.forEach( ( block ) => {
		visit( block );
		walk( block.innerBlocks || [], visit );
	} );
}

function describe( block ) {
	const mode = block.attributes && block.attributes.animationMode;
	return block.name + ( mode ? ` (${ mode })` : '' );
}

function canvasDocument() {
	const iframe = document.querySelector( 'iframe[name="editor-canvas"]' );
	return ( iframe && iframe.contentDocument ) || document;
}

async function editorCheck( options = {} ) {
	// Give blocks a moment to render after the editor is ready, so
	// render-time crashes and warnings are on the page.
	const settleMs = options.settleMs ?? 1500;
	const results = [];

	if ( ! ( await editorReady( options.timeoutMs ?? 15000 ) ) ) {
		results.push( {
			id: 'editor-not-ready',
			message: 'The editor didn’t finish loading the post’s blocks.',
		} );
		return results;
	}
	await wait( settleMs );

	let total = 0;
	let animated = 0;
	walk( select( 'core/block-editor' ).getBlocks(), ( block ) => {
		total++;
		if ( block.attributes && block.attributes.animationMode ) {
			animated++;
		}
		if ( block.name === 'core/missing' ) {
			results.push( {
				id: 'missing-block',
				clientId: block.clientId,
				message: `Unregistered block type: ${
					block.attributes.originalName || 'unknown'
				}.`,
			} );
			return;
		}
		if ( block.isValid === false ) {
			const issues = ( block.validationIssues || [] )
				.map( ( issue ) => format( issue.args || [] ) )
				.filter( Boolean );
			results.push( {
				id: 'invalid-block',
				clientId: block.clientId,
				message:
					`${ describe( block ) } is flagged as invalid content.` +
					( issues.length ? ` ${ issues[ 0 ] }` : '' ),
			} );
		}
	} );

	// An invalid block also renders a warning and logs a validation
	// error; report it once, as invalid-block.
	const reported = new Set( results.map( ( r ) => r.clientId ) );
	canvasDocument()
		.querySelectorAll( '.block-editor-warning' )
		.forEach( ( warning ) => {
			const blockEl = warning.closest( '[data-block]' );
			const clientId = blockEl ? blockEl.getAttribute( 'data-block' ) : null;
			if ( clientId && reported.has( clientId ) ) {
				return;
			}
			results.push( {
				id: 'block-warning',
				clientId,
				message: `Block shows a warning: “${ warning.textContent
					.trim()
					.slice( 0, 160 ) }”`,
			} );
		} );

	consoleErrors.forEach( ( message ) => {
		if ( message.startsWith( 'Block validation:' ) ) {
			return;
		}
		results.push( {
			id: 'console-error',
			message: message.slice( 0, 300 ),
		} );
	} );

	/* eslint-disable no-console */
	const title = `[Motion Blocks] editor check: ${ total } blocks (${ animated } animated), ${
		results.length
			? `${ results.length } issue${ results.length === 1 ? '' : 's' }`
			: 'no issues'
	}`;
	if ( results.length ) {
		console.groupCollapsed( title );
		console.table( results );
		console.groupEnd();
	} else {
		console.info( title );
	}
	/* eslint-enable no-console */

	return results;
}

window.motionBlocksEditorCheck = editorCheck;

/**
 * What the editor predicts for every block's settle eligibility (the
 * "May break the menu overlay" warning's inputs), in document order.
 * Compared with the front end's `.mb-settled` blocks to check the
 * editor and front end agree.
 *
 *   motionBlocksSettlePrediction()
 *
 * @return {Object[]} One entry per block: clientId, name and the
 *                    menuOverlayBlockers() result.
 */
window.motionBlocksSettlePrediction = () => {
	const sel = select( 'core/block-editor' );
	return sel.getClientIdsWithDescendants().map( ( clientId ) => ( {
		clientId,
		name: sel.getBlockName( clientId ),
		...menuOverlayBlockers(
			sel.getBlockName( clientId ),
			sel.getBlockAttributes( clientId )
		),
	} ) );
};
