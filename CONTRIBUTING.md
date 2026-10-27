# Contributing to Motion Blocks

Thanks for helping. This page covers how the project fits together and the checklists that keep its parts in step. The README covers what the plugin does, how to build it and how to run the tests.

## How the pieces fit

A block's animation is stored as `animation*` block attributes. Several places read them, and they must agree:

| Where | What it does |
|---|---|
| `shared-constants.json` | The single source for effect lists, directions, labels and descriptions (`effectCatalog`), Custom property units and attribute defaults. Read by the editor (JS) and PHP. |
| `src/index.js` | Registers the attributes in the editor and renders the editor preview. |
| `src/components/` | The Motion Effects panel. |
| `animation-plugin.php` → `motion_blocks_render_block()` | The **only** place front-end markup is written (classes and `data-mb-*`). |
| `src/frontend.js`, `css/animations.css` | Play the animations on the front end. |
| `includes/recipe.php`, `includes/abilities.php` | The agent-readable JSON format ("recipes") and the WordPress abilities AI agents use. Documented in [`schema/README.md`](schema/README.md) (generated) and `schema/animation-recipe.v1.json` (JSON Schema). |

## Checklists

### Adding an effect

1. Add its value to `animationTypes` and/or `entryTypes` / `exitTypes` in `shared-constants.json`, and its directions to `directions` if it has any.
2. Add an `effectCatalog` entry: `label` (shown in the panel), `description` (one or two plain sentences for people and AI agents), `exitLabel` if the Exit slot words it differently, and `defaultDirection` (what plays with no direction set).
3. Add the keyframes and the `mb-enter-{type}` / `mb-exit-{type}` rules in `css/animations.css`, and any direction variables in `src/frontend.js` (`DIRECTION_VARS`) and `src/components/constants.js`.
4. Regenerate the agent reference: `wp eval-file tests/recipe/check.php schema` (writes `schema/README.md` and the schema).

Agents pick the new effect up automatically. `tests/unit/recipe-coverage.test.js` fails if the catalog entry is missing.

### Adding an animation setting (a new attribute)

1. Add its default to `schemaDefaults` in `shared-constants.json` (skip `null` defaults) and register it in `addAnimationAttributes` in `src/index.js`. For a Scroll Appear slot setting, add both `animationEntry*` and `animationExit*`.
2. Emit it in `motion_blocks_render_block()` in `animation-plugin.php`, and read it in `src/frontend.js` / the CSS as needed.
3. Add a case to `tests/schema-defaults/cases.php`.
4. **Wire it into agent recipes.**
   - Map it in `tests/recipe/coverage.json`, or list it under `notInRecipes` with the reason.
   - Handle it in both `motion_blocks_recipe_to_attributes()` and `motion_blocks_attributes_to_recipe()` in `includes/recipe.php`.
   - Describe it in `motion_blocks_recipe_schema()`.
   - Run `wp eval-file tests/recipe/check.php schema`.

`tests/unit/recipe-coverage.test.js` fails until step 4 is done. The round trip in `tests/recipe/check.php` then proves the new setting survives a recipe.

### Adding a Custom From / To property

1. Add it to `PROPERTY_DEFINITIONS` in `src/components/constants.js`, to `propertyCssVar` and `propertyDefaultUnits` in `shared-constants.json`, and to `motion_blocks_valid_from_to_value()` in `animation-plugin.php` and `isValidFromToValue()` in `src/css-values.js`.
2. Register its `animation`, `animationEntry` and `animationExit` `From*` / `To*` attributes.
3. Run `wp eval-file tests/recipe/check.php schema`.

Recipes read the property list from `propertyDefaultUnits`, so no recipe code changes are needed.

### Changing the recipe format

Recipes are a public format that agents and other tools (such as Motion Studio) depend on.

- **Adding an optional field is fine.**
- **Breaking changes need a new version.** That means renaming or removing a field, or changing what a value means. Bump `MOTION_BLOCKS_RECIPE_FORMAT` and publish a new `schema/animation-recipe.vN.json`. Keep reading the old version.

## Before opening a pull request

```bash
npm run build          # and commit build/
npm run test:unit
```

From a WordPress site with the plugin active (WordPress 6.9+ for the abilities):

```bash
wp eval-file <path-to>/motion-blocks/tests/schema-defaults/check.php
wp eval-file <path-to>/motion-blocks/tests/recipe/check.php
```

Then run the page and editor checks as described under **Tests** in the README. CI runs all of these on every pull request.

## Releases

The release zip holds `LICENSE`, `README.md`, `animation-plugin.php`, `uninstall.php`, `shared-constants.json`, `css/`, `build/`, `includes/` and `schema/` under a top-level `motion-blocks/` folder. The exact command is in the README's Development section.
