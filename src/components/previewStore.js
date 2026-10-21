/**
 * Registers the editor-only preview state store (GH #29).
 *
 * Imported once from src/index.js, which only loads in the block
 * editor. Registered on the default registry; block-editor
 * sub-registries (site editor, template parts, synced patterns) reach
 * it through their parent. See previewState.js for what it holds.
 */
import { createReduxStore, register } from '@wordpress/data';

import { reducer, actions, selectors } from './previewState';

export const STORE_NAME = 'motion-blocks/editor-preview';

export const store = createReduxStore( STORE_NAME, {
	reducer,
	actions,
	selectors,
} );

register( store );
