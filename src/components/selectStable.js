/**
 * Pure `mapSelect` bodies for the editor's `useSelect` calls that
 * look across the block tree (GH #27).
 *
 * `useSelect` compares what its callback returns shallowly and
 * re-renders on any difference. A callback that builds a fresh array
 * or object (or a fresh closure) on every run therefore re-renders its
 * component on every block-editor store change — every keystroke and
 * caret move — and core logs "The `useSelect` hook returns different
 * values when called with the same state and parameters" in
 * SCRIPT_DEBUG. Each helper below returns only primitives or arrays
 * the store already memoizes, so two runs against the same state are
 * shallow-equal.
 *
 * No @wordpress imports: the selector objects are passed in, which
 * keeps these unit-testable with plain fakes.
 */

// Shared empty result so a menu with nothing to look up returns the
// same reference on every run.
export const EMPTY_IDS = [];

/**
 * Client ids of every block named `blockName` (nested matches
 * included, current block included) plus how many of the *other*
 * ones already carry an animation.
 *
 * `getBlocksByName` is a store selector memoized on block order and
 * block identity but not on attributes, so it hands back the same
 * array while the user types. The public name exists from WP 6.5; the
 * `__experimental` name is kept as a fallback for older cores. Checking
 * the public name first avoids the deprecation warning.
 *
 * Paste-only menus never use the ids, so they skip the lookup.
 *
 * @param {Object}  sel       `select( blockEditorStore )`.
 * @param {string}  blockName Block type name, e.g. `core/image`.
 * @param {string}  clientId  The block the menu belongs to.
 * @param {boolean} pasteOnly Whether the menu only offers Paste.
 * @return {{ sameTypeIds: string[], existingCount: number }} Result.
 */
export function selectSameTypeInfo( sel, blockName, clientId, pasteOnly ) {
	if ( pasteOnly || ! blockName || ! clientId ) {
		return { sameTypeIds: EMPTY_IDS, existingCount: 0 };
	}
	const getByName =
		sel.getBlocksByName || sel.__experimentalGetGlobalBlocksByName;
	const ids = getByName ? getByName( blockName ) || EMPTY_IDS : EMPTY_IDS;
	let existingCount = 0;
	for ( const id of ids ) {
		if ( id !== clientId && sel.getBlockAttributes( id )?.animationMode ) {
			existingCount++;
		}
	}
	return { sameTypeIds: ids, existingCount };
}

/**
 * Nearest ancestor of `clientId` that has an animation, as a
 * fixed-shape object of primitives (`{ clientId: null, title: null }`
 * when there is none) so the shallow compare passes between runs.
 *
 * @param {Object} sel       `select( blockEditorStore )`.
 * @param {Object} blocksSel `select( blocksStore )`.
 * @param {string} clientId  The selected block.
 * @return {{ clientId: ?string, title: ?string }} Ancestor info.
 */
export function selectAnimatedAncestor( sel, blocksSel, clientId ) {
	if ( clientId ) {
		const parentIds = sel.getBlockParents( clientId );
		// Walk from nearest ancestor outward — the closest animated
		// ancestor is the most relevant one to point the user at.
		for ( let i = parentIds.length - 1; i >= 0; i-- ) {
			const id = parentIds[ i ];
			if ( sel.getBlockAttributes( id )?.animationMode ) {
				const name = sel.getBlockName( id );
				const title = blocksSel.getBlockType( name )?.title || name;
				return { clientId: id, title };
			}
		}
	}
	return { clientId: null, title: null };
}

/**
 * How many blocks are nested below `clientId` (not counting itself).
 *
 * @param {Object} sel      `select( blockEditorStore )`.
 * @param {string} clientId Parent block.
 * @return {number} Descendant count.
 */
export function countDescendantsIn( sel, clientId ) {
	const tree = sel.getClientIdsOfDescendants
		? sel.getClientIdsOfDescendants( [ clientId ] )
		: sel.getClientIdsWithDescendants().filter( ( id ) => {
				if ( id === clientId ) {
					return false;
				}
				let parent = sel.getBlockRootClientId( id );
				while ( parent ) {
					if ( parent === clientId ) {
						return true;
					}
					parent = sel.getBlockRootClientId( parent );
				}
				return false;
		  } );
	return Array.isArray( tree ) ? tree.length : 0;
}
