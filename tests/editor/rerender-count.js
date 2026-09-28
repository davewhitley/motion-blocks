/**
 * Editor re-render check (GH #27).
 *
 * Paste into the browser console on any post or page editor that has a
 * few dozen blocks. It wraps every block's edit component in a render
 * counter, then moves the selection between two blocks 10 times and
 * reports how many block edit components rendered.
 *
 * Only the blocks whose selection changes (about 2 per step) should
 * re-render. Before #27 was fixed, Motion Blocks re-rendered EVERY block
 * on every store change, so `perStep` was close to the block count.
 * Other plugins' filters can add to the count; compare with Motion
 * Blocks deactivated to see its share.
 *
 * Nothing is edited: selection changes aren't saved.
 */
( async () => {
	const { addFilter, removeFilter } = wp.hooks;
	const { createElement } = wp.element;
	const store = wp.data.select( 'core/block-editor' );
	const { selectBlock, clearSelectedBlock } =
		wp.data.dispatch( 'core/block-editor' );
	const wait = ( ms ) => new Promise( ( r ) => setTimeout( r, ms ) );

	let renders = 0;
	// Priority 1 = innermost, so this counts every time anything above
	// it (including Motion Blocks' withAnimationControls) re-renders.
	addFilter(
		'editor.BlockEdit',
		'mb-test/count-renders',
		( BlockEdit ) => ( props ) => {
			renders++;
			return createElement( BlockEdit, props );
		},
		1
	);
	await wait( 1000 ); // Let withFilters swap in the counter.

	const ids = store.getClientIdsWithDescendants();
	const [ a, b ] = [ ids[ 0 ], ids[ Math.floor( ids.length / 2 ) ] ];
	renders = 0;
	for ( let i = 0; i < 10; i++ ) {
		selectBlock( i % 2 ? b : a );
		await wait( 100 );
	}
	const result = {
		blocks: ids.length,
		steps: 10,
		renders,
		perStep: Math.round( ( renders / 10 ) * 10 ) / 10,
	};

	removeFilter( 'editor.BlockEdit', 'mb-test/count-renders' );
	clearSelectedBlock();
	console.table( result );
	return result;
} )();
