<?php
/**
 * Motion Blocks abilities: what AI agents and other tools can do with
 * animations, through the WordPress Abilities API (WordPress 6.9+).
 *
 * Every ability is public, so it's listed and runnable over REST
 * (`/wp-json/wp-abilities/v1/…`) and offered to MCP clients through
 * WordPress's MCP Adapter. Each one runs as the signed-in user and
 * checks the same capability the editor would.
 *
 *   motion-blocks/get-effects            What's available, plus the recipe schema.
 *   motion-blocks/get-animations         Every block of a post, with its path and recipe.
 *   motion-blocks/validate-recipe        Check a recipe; get each problem with its path.
 *   motion-blocks/set-animations         Set (or clear) animations on blocks of a post.
 *   motion-blocks/list-saved-animations  The saved library and theme recipes.
 *   motion-blocks/save-animation         Add a recipe to the saved library.
 *
 * Recipes are the format in includes/recipe.php. Changes made with
 * set-animations are saved straight to the post (published or not),
 * which stores a revision, so any change can be rolled back from the
 * editor's Revisions screen.
 *
 * @package MotionBlocks
 */

defined( 'ABSPATH' ) || exit;

/**
 * Register the ability category.
 */
function motion_blocks_register_ability_category() {
    wp_register_ability_category(
        'motion-blocks',
        array(
            'label'       => __( 'Motion Blocks', 'motion-blocks' ),
            'description' => __( 'Read and change block animations (Motion Blocks).', 'motion-blocks' ),
        )
    );
}

/**
 * A post the current user may edit, or a WP_Error.
 *
 * @param mixed $post_id Post ID.
 * @return WP_Post|WP_Error
 */
function motion_blocks_ability_post( $post_id ) {
    $post = get_post( absint( $post_id ) );
    if ( ! $post ) {
        return new WP_Error( 'motion_blocks_no_post', __( 'No post with that ID.', 'motion-blocks' ), array( 'status' => 404 ) );
    }
    return $post;
}

/**
 * Short readable text of a block, to help an agent tell blocks apart.
 *
 * @param array $block Parsed block.
 * @return string
 */
function motion_blocks_block_excerpt( $block ) {
    $html = isset( $block['innerHTML'] ) ? (string) $block['innerHTML'] : '';
    $text = trim( preg_replace( '/\s+/', ' ', wp_strip_all_tags( $html ) ) );
    if ( function_exists( 'mb_substr' ) && mb_strlen( $text ) > 80 ) {
        return mb_substr( $text, 0, 79 ) . '…';
    }
    return strlen( $text ) > 80 ? substr( $text, 0, 79 ) . '…' : $text;
}

/**
 * Flatten parsed blocks into a list an agent can read. A block's `path`
 * is its index among real blocks at each nesting level ([0] is the
 * first top-level block, [0, 2] its third inner block).
 *
 * @param array $blocks Parsed blocks.
 * @param array $prefix Path so far.
 * @param array $out    List, appended to.
 */
function motion_blocks_collect_blocks( $blocks, $prefix, &$out ) {
    $index = 0;
    foreach ( $blocks as $block ) {
        if ( empty( $block['blockName'] ) ) {
            continue;
        }
        $path  = array_merge( $prefix, array( $index ) );
        $entry = array(
            'path'        => $path,
            'block_name'  => $block['blockName'],
            'text'        => motion_blocks_block_excerpt( $block ),
            'can_animate' => motion_blocks_can_animate_block_name( $block['blockName'] ),
            'recipe'      => motion_blocks_attributes_to_recipe( isset( $block['attrs'] ) ? $block['attrs'] : array() ),
        );
        if ( ! empty( $block['attrs']['metadata']['name'] ) ) {
            $entry['label'] = (string) $block['attrs']['metadata']['name'];
        }
        $out[] = $entry;
        if ( ! empty( $block['innerBlocks'] ) ) {
            motion_blocks_collect_blocks( $block['innerBlocks'], $path, $out );
        }
        $index++;
    }
}

/**
 * Apply `$callback` to the block at `$path` (see motion_blocks_collect_blocks()).
 *
 * @param array    $blocks   Parsed blocks (modified in place).
 * @param int[]    $path     Path.
 * @param callable $callback fn( array &$block ): true|WP_Error.
 * @return true|WP_Error
 */
function motion_blocks_with_block_at( &$blocks, $path, $callback ) {
    $want  = (int) array_shift( $path );
    $index = 0;
    foreach ( $blocks as &$block ) {
        if ( empty( $block['blockName'] ) ) {
            continue;
        }
        if ( $index === $want ) {
            if ( ! $path ) {
                return $callback( $block );
            }
            if ( empty( $block['innerBlocks'] ) ) {
                break;
            }
            return motion_blocks_with_block_at( $block['innerBlocks'], $path, $callback );
        }
        $index++;
    }
    unset( $block );
    return new WP_Error( 'motion_blocks_no_block', __( 'No block at that path.', 'motion-blocks' ), array( 'status' => 404 ) );
}

/**
 * Error for invalid recipes, carrying every problem.
 *
 * @param array $errors List of { change?, path, message }.
 * @return WP_Error
 */
function motion_blocks_recipe_error( $errors ) {
    $lines = array();
    foreach ( $errors as $e ) {
        $where   = isset( $e['change'] ) ? 'changes[' . $e['change'] . '].recipe' : 'recipe';
        $lines[] = $where . ( '' !== $e['path'] ? '.' . $e['path'] : '' ) . ': ' . $e['message'];
    }
    return new WP_Error(
        'motion_blocks_invalid_recipe',
        __( 'The recipe is not valid. Nothing was changed.', 'motion-blocks' ) . ' ' . implode( ' ', $lines ),
        array(
            'status' => 400,
            'errors' => $errors,
        )
    );
}

/**
 * motion-blocks/get-effects.
 *
 * @return array
 */
function motion_blocks_ability_get_effects() {
    $shared = motion_blocks_shared_constants();
    return array(
        'recipe_version'   => MOTION_BLOCKS_RECIPE_FORMAT,
        'modes'            => array(
            'page-load'          => 'Plays once the page loads.',
            'scroll-appear'      => 'Plays as the block scrolls into view (entry) and out of view (exit).',
            'scroll-interactive' => 'Progress follows the scroll position.',
        ),
        'effects'          => array(
            'page-load'          => array_values( $shared['animationTypes'] ),
            'scroll-interactive' => array_values( $shared['animationTypes'] ),
            'entry'              => array_values( $shared['entryTypes'] ),
            'exit'               => array_values( $shared['exitTypes'] ),
        ),
        'directions'       => $shared['directions'],
        'easings'          => array_keys( motion_blocks_recipe_easings() ),
        'image_only_block' => 'core/cover',
        'stagger_blocks'   => array_values( $shared['staggerParentBlocks'] ),
        'no_animation'     => array_values( $shared['nonAnimatableBlocks'] ),
        'recipe_schema'    => motion_blocks_recipe_schema(),
        'examples'         => array(
            array(
                'version' => 1,
                'mode'    => 'scroll-appear',
                'entry'   => array( 'type' => 'slide', 'direction' => 'btt', 'duration' => 0.6, 'easing' => 'ease-out' ),
            ),
            array(
                'version' => 1,
                'mode'    => 'page-load',
                'effect'  => array(
                    'type'     => 'custom',
                    'duration' => 0.8,
                    'easing'   => 'cubic-bezier(0.16, 1, 0.3, 1)',
                    'from'     => array( 'opacity' => 0, 'translateY' => 24 ),
                    'to'       => array( 'opacity' => 1, 'translateY' => 0 ),
                ),
            ),
            array(
                'version' => 1,
                'mode'    => 'scroll-appear',
                'entry'   => array( 'type' => 'fade', 'duration' => 0.5 ),
                'stagger' => array( 'step' => 0.1 ),
            ),
        ),
    );
}

/**
 * motion-blocks/get-animations.
 *
 * @param array $input { post_id }.
 * @return array|WP_Error
 */
function motion_blocks_ability_get_animations( $input ) {
    $post = motion_blocks_ability_post( $input['post_id'] );
    if ( is_wp_error( $post ) ) {
        return $post;
    }
    $list = array();
    motion_blocks_collect_blocks( parse_blocks( $post->post_content ), array(), $list );
    return array(
        'post_id' => $post->ID,
        'title'   => get_the_title( $post ),
        'status'  => $post->post_status,
        'url'     => (string) get_permalink( $post ),
        'blocks'  => $list,
    );
}

/**
 * motion-blocks/validate-recipe.
 *
 * @param array $input { recipe, block_name? }.
 * @return array
 */
function motion_blocks_ability_validate_recipe( $input ) {
    $block_name = isset( $input['block_name'] ) ? (string) $input['block_name'] : '';
    $result     = motion_blocks_recipe_to_attributes( $input['recipe'], $block_name );
    return array(
        'valid'      => ! $result['errors'],
        'errors'     => $result['errors'],
        'attributes' => (object) $result['attributes'],
    );
}

/**
 * motion-blocks/set-animations. All changes are checked first; if any
 * is invalid nothing is saved. Valid changes are saved in one update
 * (one revision).
 *
 * @param array $input { post_id, changes: [ { path, block_name?, recipe } ] }.
 * @return array|WP_Error
 */
function motion_blocks_ability_set_animations( $input ) {
    $post = motion_blocks_ability_post( $input['post_id'] );
    if ( is_wp_error( $post ) ) {
        return $post;
    }
    $blocks  = parse_blocks( $post->post_content );
    $errors  = array();
    $updated = array();

    foreach ( array_values( $input['changes'] ) as $i => $change ) {
        $recipe = array_key_exists( 'recipe', $change ) ? $change['recipe'] : null;
        $result = motion_blocks_with_block_at(
            $blocks,
            $change['path'],
            function ( &$block ) use ( $change, $recipe, $i, &$errors, &$updated ) {
                if ( ! empty( $change['block_name'] ) && $change['block_name'] !== $block['blockName'] ) {
                    return new WP_Error(
                        'motion_blocks_block_mismatch',
                        sprintf(
                            /* translators: 1: expected block name, 2: actual block name */
                            __( 'Expected a %1$s block at that path but found %2$s. Read the post again with get-animations.', 'motion-blocks' ),
                            $change['block_name'],
                            $block['blockName']
                        ),
                        array( 'status' => 409 )
                    );
                }
                $attrs     = isset( $block['attrs'] ) && is_array( $block['attrs'] ) ? $block['attrs'] : array();
                $converted = motion_blocks_recipe_to_attributes( $recipe, $block['blockName'], $attrs );
                if ( $converted['errors'] ) {
                    foreach ( $converted['errors'] as $e ) {
                        $errors[] = array_merge( array( 'change' => $i ), $e );
                    }
                    return true;
                }
                $block['attrs'] = motion_blocks_apply_animation_attributes( $attrs, $converted['attributes'] );
                $updated[]      = array(
                    'path'       => array_values( $change['path'] ),
                    'block_name' => $block['blockName'],
                    'recipe'     => motion_blocks_attributes_to_recipe( $block['attrs'] ),
                );
                return true;
            }
        );
        if ( is_wp_error( $result ) ) {
            $result->add_data( array_merge( (array) $result->get_error_data(), array( 'change' => $i ) ) );
            return $result;
        }
    }
    if ( $errors ) {
        return motion_blocks_recipe_error( $errors );
    }

    $saved = wp_update_post(
        array(
            'ID'           => $post->ID,
            'post_content' => wp_slash( serialize_blocks( $blocks ) ),
        ),
        true
    );
    if ( is_wp_error( $saved ) ) {
        return $saved;
    }
    $revisions = wp_get_post_revisions( $post->ID, array( 'numberposts' => 1 ) );
    $revision  = $revisions ? reset( $revisions ) : null;
    return array(
        'post_id'     => $post->ID,
        'status'      => get_post_status( $post->ID ),
        'url'         => (string) get_permalink( $post->ID ),
        'revision_id' => $revision ? $revision->ID : null,
        'updated'     => $updated,
    );
}

/**
 * motion-blocks/list-saved-animations.
 *
 * @return array
 */
function motion_blocks_ability_list_saved() {
    $out     = array();
    $library = get_option( 'mb_saved_animations', array() );
    foreach ( is_array( $library ) ? $library : array() as $id => $entry ) {
        if ( empty( $entry['attributes'] ) || ! is_array( $entry['attributes'] ) ) {
            continue;
        }
        $out[] = array(
            'id'     => (string) $id,
            'name'   => isset( $entry['name'] ) ? (string) $entry['name'] : (string) $id,
            'source' => 'library',
            'recipe' => motion_blocks_attributes_to_recipe( $entry['attributes'] ),
        );
    }
    $theme = function_exists( 'wp_get_global_settings' )
        ? wp_get_global_settings( array( 'custom', 'motionBlocks', 'savedAnimations' ) )
        : array();
    foreach ( is_array( $theme ) ? $theme : array() as $id => $entry ) {
        if ( empty( $entry['attributes'] ) || ! is_array( $entry['attributes'] ) ) {
            continue;
        }
        $out[] = array(
            'id'     => (string) $id,
            'name'   => isset( $entry['name'] ) ? (string) $entry['name'] : (string) $id,
            'source' => 'theme',
            'recipe' => motion_blocks_attributes_to_recipe( $entry['attributes'] ),
        );
    }
    return array( 'animations' => $out );
}

/**
 * motion-blocks/save-animation.
 *
 * @param array $input { name, recipe }.
 * @return array|WP_Error
 */
function motion_blocks_ability_save_animation( $input ) {
    $converted = motion_blocks_recipe_to_attributes( $input['recipe'] );
    if ( $converted['errors'] ) {
        return motion_blocks_recipe_error( $converted['errors'] );
    }
    $library = get_option( 'mb_saved_animations', array() );
    $library = is_array( $library ) ? $library : array();
    do {
        // 8 lowercase base36 characters, never all digits (#57).
        $uid = 'a' . strtolower( wp_generate_password( 7, false ) );
    } while ( isset( $library[ $uid ] ) );
    // Library entries hold full attribute sets, like the editor saves.
    $attributes      = array_merge( motion_blocks_recipe_cleared_attributes(), $converted['attributes'] );
    $library[ $uid ] = array(
        'name'       => sanitize_text_field( $input['name'] ),
        'createdAt'  => gmdate( 'c' ),
        'attributes' => $attributes,
    );
    update_option( 'mb_saved_animations', $library, false );
    $saved = get_option( 'mb_saved_animations', array() );
    if ( ! isset( $saved[ $uid ] ) ) {
        return new WP_Error( 'motion_blocks_not_saved', __( 'The animation could not be saved.', 'motion-blocks' ), array( 'status' => 500 ) );
    }
    return array(
        'id'     => $uid,
        'name'   => $saved[ $uid ]['name'],
        'recipe' => motion_blocks_attributes_to_recipe( $saved[ $uid ]['attributes'] ),
    );
}

/**
 * Register the abilities.
 */
function motion_blocks_register_abilities() {
    $path           = array(
        'type'        => 'array',
        'items'       => array( 'type' => 'integer', 'minimum' => 0 ),
        'minItems'    => 1,
        'description' => 'Block path from get-animations: index among blocks at each nesting level.',
    );
    $post_id        = array(
        'type'        => 'integer',
        'minimum'     => 1,
        'description' => 'Post, page, template or pattern ID.',
    );
    $readonly       = array(
        'readonly'    => true,
        'destructive' => false,
        'idempotent'  => true,
    );
    $can_edit_posts = function () {
        return current_user_can( 'edit_posts' );
    };
    $can_edit_post  = function ( $input ) {
        return isset( $input['post_id'] ) && current_user_can( 'edit_post', absint( $input['post_id'] ) );
    };
    $meta           = function ( $annotations ) {
        return array(
            'public'       => true,
            'show_in_rest' => true,
            'annotations'  => $annotations,
        );
    };

    wp_register_ability(
        'motion-blocks/get-effects',
        array(
            'label'               => __( 'Get animation effects', 'motion-blocks' ),
            'description'         => __( 'Lists the animation modes, effects, directions and easings Motion Blocks supports, with the JSON Schema of an animation recipe and examples. Read this first.', 'motion-blocks' ),
            'category'            => 'motion-blocks',
            'input_schema'        => array(
                'type'                 => array( 'object', 'null' ),
                'properties'           => (object) array(),
                'additionalProperties' => false,
            ),
            'output_schema'       => array( 'type' => 'object' ),
            'execute_callback'    => 'motion_blocks_ability_get_effects',
            'permission_callback' => $can_edit_posts,
            'meta'                => $meta( $readonly ),
        )
    );

    wp_register_ability(
        'motion-blocks/get-animations',
        array(
            'label'               => __( 'Get a post\'s animations', 'motion-blocks' ),
            'description'         => __( 'Lists every block of a post, page, template or pattern with its path, type, a text excerpt, whether it can be animated, and its animation as a recipe (null when it has none). Use the paths with set-animations.', 'motion-blocks' ),
            'category'            => 'motion-blocks',
            'input_schema'        => array(
                'type'                 => 'object',
                'properties'           => array( 'post_id' => $post_id ),
                'required'             => array( 'post_id' ),
                'additionalProperties' => false,
            ),
            'output_schema'       => array( 'type' => 'object' ),
            'execute_callback'    => 'motion_blocks_ability_get_animations',
            'permission_callback' => $can_edit_post,
            'meta'                => $meta( $readonly ),
        )
    );

    wp_register_ability(
        'motion-blocks/validate-recipe',
        array(
            'label'               => __( 'Validate an animation recipe', 'motion-blocks' ),
            'description'         => __( 'Checks a recipe without changing anything. Returns each problem with its path and a fix hint, and the block attributes it would write. Pass block_name for the block-specific rules (image-only effects, stagger).', 'motion-blocks' ),
            'category'            => 'motion-blocks',
            'input_schema'        => array(
                'type'                 => 'object',
                'properties'           => array(
                    // Loose on purpose: the point is to report what's wrong.
                    'recipe'     => array(
                        'type'        => array( 'object', 'null' ),
                        'description' => 'The recipe to check.',
                    ),
                    'block_name' => array(
                        'type'        => 'string',
                        'description' => 'Block type it is for, e.g. core/cover.',
                    ),
                ),
                'required'             => array( 'recipe' ),
                'additionalProperties' => false,
            ),
            'output_schema'       => array( 'type' => 'object' ),
            'execute_callback'    => 'motion_blocks_ability_validate_recipe',
            'permission_callback' => $can_edit_posts,
            'meta'                => $meta( $readonly ),
        )
    );

    wp_register_ability(
        'motion-blocks/set-animations',
        array(
            'label'               => __( 'Set animations on a post', 'motion-blocks' ),
            'description'         => __( 'Sets or removes the animation of one or more blocks of a post, page, template or pattern, and saves it straight away (also when published). All changes are validated first; if any is invalid nothing is saved and every problem is reported. The save stores a revision, so it can be rolled back. Pass block_name with each change to guard against the content having changed since get-animations.', 'motion-blocks' ),
            'category'            => 'motion-blocks',
            'input_schema'        => array(
                'type'                 => 'object',
                'properties'           => array(
                    'post_id' => $post_id,
                    'changes' => array(
                        'type'     => 'array',
                        'minItems' => 1,
                        'maxItems' => 500,
                        'items'    => array(
                            'type'                 => 'object',
                            'properties'           => array(
                                'path'       => $path,
                                'block_name' => array(
                                    'type'        => 'string',
                                    'description' => 'Expected block type at that path (recommended).',
                                ),
                                'recipe'     => array(
                                    'type'        => array( 'object', 'null' ),
                                    'description' => 'The animation recipe (see get-effects), or null to remove the animation.',
                                ),
                            ),
                            'required'             => array( 'path', 'recipe' ),
                            'additionalProperties' => false,
                        ),
                    ),
                ),
                'required'             => array( 'post_id', 'changes' ),
                'additionalProperties' => false,
            ),
            'output_schema'       => array( 'type' => 'object' ),
            'execute_callback'    => 'motion_blocks_ability_set_animations',
            'permission_callback' => $can_edit_post,
            'meta'                => $meta(
                array(
                    'readonly'    => false,
                    'destructive' => false,
                    'idempotent'  => true,
                )
            ),
        )
    );

    wp_register_ability(
        'motion-blocks/list-saved-animations',
        array(
            'label'               => __( 'List saved animations', 'motion-blocks' ),
            'description'         => __( 'Lists the site\'s saved animation library and the animations the theme ships, each as a recipe ready for set-animations.', 'motion-blocks' ),
            'category'            => 'motion-blocks',
            'input_schema'        => array(
                'type'                 => array( 'object', 'null' ),
                'properties'           => (object) array(),
                'additionalProperties' => false,
            ),
            'output_schema'       => array( 'type' => 'object' ),
            'execute_callback'    => 'motion_blocks_ability_list_saved',
            'permission_callback' => $can_edit_posts,
            'meta'                => $meta( $readonly ),
        )
    );

    wp_register_ability(
        'motion-blocks/save-animation',
        array(
            'label'               => __( 'Save an animation to the library', 'motion-blocks' ),
            'description'         => __( 'Adds a recipe to the site\'s saved animation library under a name, so editors can apply it from the Motion Effects panel. Needs a user who can manage site settings.', 'motion-blocks' ),
            'category'            => 'motion-blocks',
            'input_schema'        => array(
                'type'                 => 'object',
                'properties'           => array(
                    'name'   => array(
                        'type'      => 'string',
                        'minLength' => 1,
                        'maxLength' => 100,
                    ),
                    // Loose here; the recipe is checked in full below, so
                    // every problem comes back with its path.
                    'recipe' => array(
                        'type'        => 'object',
                        'description' => 'The animation recipe (see get-effects).',
                    ),
                ),
                'required'             => array( 'name', 'recipe' ),
                'additionalProperties' => false,
            ),
            'output_schema'       => array( 'type' => 'object' ),
            'execute_callback'    => 'motion_blocks_ability_save_animation',
            'permission_callback' => function () {
                return current_user_can( 'manage_options' );
            },
            'meta'                => $meta(
                array(
                    'readonly'    => false,
                    'destructive' => false,
                    'idempotent'  => false,
                )
            ),
        )
    );
}

if ( function_exists( 'wp_register_ability' ) ) {
    add_action( 'wp_abilities_api_categories_init', 'motion_blocks_register_ability_category' );
    add_action( 'wp_abilities_api_init', 'motion_blocks_register_abilities' );
}
