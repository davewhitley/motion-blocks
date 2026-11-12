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

// Blocks whose inner blocks belong to another document, or to shared
// content: a header or footer, a synced pattern, the page inside its
// template.
const SCOPE_BLOCKS = [
	'core/template-part',
	'core/block',
	'core/post-content',
];

/**
 * The document a block belongs to: the client id of its nearest
 * template part, synced pattern or Post Content ancestor, or `''`.
 *
 * @param {Object} sel `select( blockEditorStore )`.
 * @param {string} id  Block client id.
 * @return {string} Scope id.
 */
function scopeOf( sel, id ) {
	const parents = sel.getBlockParents( id ) || EMPTY_IDS;
	for ( let i = parents.length - 1; i >= 0; i-- ) {
		if ( SCOPE_BLOCKS.includes( sel.getBlockName( parents[ i ] ) ) ) {
			return parents[ i ];
		}
	}
	return '';
}

// `ids` array (as memoized by the store) -> clientId -> filtered ids.
// Keeps the result's identity stable between runs (GH #27): the store
// hands out a new `ids` array whenever the block order changes, which
// is also the only time a block's ancestors change.
const scopeCache = new WeakMap();

/**
 * The ids that sit in the same document as `clientId` (GH #132).
 * "Apply to other blocks" used to reach every block of the type in the
 * editor: with a page shown inside its template that included the
 * header and footer, which are shared with every other page.
 *
 * @param {Object}   sel      `select( blockEditorStore )`.
 * @param {string[]} ids      Candidate client ids.
 * @param {string}   clientId The block the menu belongs to.
 * @return {string[]} Ids in the same scope, `clientId` included.
 */
function sameScopeIds( sel, ids, clientId ) {
	if ( ids === EMPTY_IDS || ids.length === 0 ) {
		return EMPTY_IDS;
	}
	let byClient = scopeCache.get( ids );
	if ( ! byClient ) {
		byClient = new Map();
		scopeCache.set( ids, byClient );
	}
	if ( ! byClient.has( clientId ) ) {
		const scope = scopeOf( sel, clientId );
		byClient.set(
			clientId,
			ids.filter( ( id ) => scopeOf( sel, id ) === scope )
		);
	}
	return byClient.get( clientId );
}

/**
 * Client ids of every block named `blockName` in the same document as
 * the current block (nested matches included, current block included;
 * see sameScopeIds) plus how many of the *other* ones already carry an
 * animation.
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
	const all = getByName ? getByName( blockName ) || EMPTY_IDS : EMPTY_IDS;
	const ids = sameScopeIds( sel, all, clientId );
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
 * The block's direct parent, when that parent staggers its children
 * (GH #138). On the page a staggering parent plays its own effect on
 * every child, so a child's own animation is not what visitors see.
 * Fixed shape of primitives, like `selectAnimatedAncestor`.
 *
 * @param {Object}   sel             `select( blockEditorStore )`.
 * @param {Object}   blocksSel       `select( blocksStore )`.
 * @param {string}   clientId        The selected block.
 * @param {Function} staggersInside `( name, attributes ) => boolean`:
 *                                   does this block stagger its children?
 * @return {{ clientId: ?string, title: ?string }} Parent info.
 */
export function selectStaggerParent(
	sel,
	blocksSel,
	clientId,
	staggersInside
) {
	if ( clientId ) {
		const parentIds = sel.getBlockParents( clientId );
		const id = parentIds[ parentIds.length - 1 ];
		if ( id ) {
			const name = sel.getBlockName( id );
			if ( staggersInside( name, sel.getBlockAttributes( id ) ) ) {
				const title = blocksSel.getBlockType( name )?.title || name;
				return { clientId: id, title };
			}
		}
	}
	return { clientId: null, title: null };
}

/**
 * Whether a core/navigation block can open its full-screen overlay
 * menu: Overlay Menu "Mobile" (core's default) or "Always".
 *
 * @param {Object} attrs Navigation block attributes.
 * @return {boolean} True unless Overlay Menu is "Off" ('never').
 */
export function navHasOverlay( attrs ) {
	return ( attrs?.overlayMenu ?? 'mobile' ) !== 'never';
}

const hasAnimationMode = ( attrs ) => !! attrs?.animationMode;

/**
 * Whether the block's animation can trap a Navigation menu overlay, as
 * a fixed-shape object of primitives (GH #27):
 *
 *   - `scope`: 'self' when the block is a Navigation with an overlay,
 *     'inside' when such a Navigation is nested in it, else ''.
 *   - `targetsSkipped`: settleTargets() would skip the block for a
 *     nested animated block — an animated Stagger child
 *     (`checkChildren`) or any animated descendant, which may own the
 *     image an img-target block animates (`checkDescendants`).
 *
 * The navigation lookup uses the memoized `getBlocksByName` list (which
 * includes template-part and synced-pattern inner blocks) and walks
 * only each nav's parents, never the whole subtree.
 *
 * @param {Object}   sel              `select( blockEditorStore )`.
 * @param {string}   clientId         The block with the animation.
 * @param {string}   blockName        Its block type name.
 * @param {boolean}  checkChildren    Look for animated direct children.
 * @param {boolean}  checkDescendants Look for animated descendants.
 * @param {Function} isAnimated       Whether attributes render animated.
 * @return {{ scope: string, targetsSkipped: boolean }} Result.
 */
export function selectMenuOverlayInfo(
	sel,
	clientId,
	blockName,
	checkChildren,
	checkDescendants,
	isAnimated = hasAnimationMode
) {
	let scope = '';
	if ( clientId ) {
		if ( blockName === 'core/navigation' ) {
			if ( navHasOverlay( sel.getBlockAttributes( clientId ) ) ) {
				scope = 'self';
			}
		} else {
			const getByName =
				sel.getBlocksByName || sel.__experimentalGetGlobalBlocksByName;
			const navIds = getByName
				? getByName( 'core/navigation' ) || EMPTY_IDS
				: EMPTY_IDS;
			for ( const id of navIds ) {
				if (
					navHasOverlay( sel.getBlockAttributes( id ) ) &&
					sel.getBlockParents( id ).includes( clientId )
				) {
					scope = 'inside';
					break;
				}
			}
		}
	}
	let targetsSkipped = false;
	if ( scope ) {
		const animated = ( id ) => isAnimated( sel.getBlockAttributes( id ) );
		if ( checkChildren ) {
			targetsSkipped = sel.getBlockOrder( clientId ).some( animated );
		}
		if ( ! targetsSkipped && checkDescendants ) {
			targetsSkipped = sel
				.getClientIdsOfDescendants( [ clientId ] )
				.some( animated );
		}
	}
	return { scope, targetsSkipped };
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

/**
 * Post types whose whole block tree is the document being edited: a
 * template, a template part or a synced pattern. Everything else (pages,
 * posts, custom post types) can be shown inside its template.
 */
const WHOLE_TREE_POST_TYPES = new Set( [
	'wp_template',
	'wp_template_part',
	'wp_block',
] );

/**
 * Where the page-level tools ("Auto-animate this page", "Remove all
 * animations") should look. With "Show template" on, the post editor's
 * block tree is the whole template, with the page's own blocks inside
 * its Post Content block; the tools must stay inside that block, or they
 * would change the shared template.
 *
 * Returns a string, or null, so the result is stable between runs:
 *
 *   - `''`: the whole tree (the block editor's root), when the tree is
 *     the document (a template, or a page shown on its own);
 *   - the Post Content block's client id, when the page is shown inside
 *     its template;
 *   - `null`: the template shows no Post Content, so the page's blocks
 *     aren't in the tree.
 *
 * A Post Content block inside a Query Loop renders other posts, not this
 * one, and is ignored.
 *
 * @param {Object}  sel           `select( blockEditorStore )`.
 * @param {string}  postType      The current post type.
 * @param {?string} renderingMode `getRenderingMode()`, when the editor has it.
 * @return {?string} Root client id, `''` for the whole tree, or null.
 */
export function selectPageContentRoot( sel, postType, renderingMode ) {
	if (
		WHOLE_TREE_POST_TYPES.has( postType ) ||
		! renderingMode ||
		renderingMode === 'post-only'
	) {
		return '';
	}
	const getByName =
		sel.getBlocksByName || sel.__experimentalGetGlobalBlocksByName;
	const ids = getByName
		? getByName( 'core/post-content' ) || EMPTY_IDS
		: EMPTY_IDS;
	const inQuery = ( id ) =>
		sel
			.getBlockParents( id )
			.some( ( parent ) => sel.getBlockName( parent ) === 'core/query' );
	return ids.find( ( id ) => ! inQuery( id ) ) ?? null;
}

/**
 * Every block id below a root from selectPageContentRoot: the whole tree
 * for `''`, the root's descendants for a block id, none for null.
 *
 * @param {Object}  sel    `select( blockEditorStore )`.
 * @param {?string} rootId Root client id, `''` or null.
 * @return {string[]} Client ids, nested ones included.
 */
export function clientIdsUnder( sel, rootId ) {
	if ( rootId === null ) {
		return EMPTY_IDS;
	}
	if ( rootId === '' ) {
		return sel.getClientIdsWithDescendants();
	}
	return sel.getClientIdsOfDescendants( [ rootId ] );
}
