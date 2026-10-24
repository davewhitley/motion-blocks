<?php
/**
 * Animation recipes: the agent-readable JSON format for one block's
 * animation.
 *
 * A block stores its animation as ~96 flat attributes in three shapes
 * (shared keys for Page Load / Scroll Interactive, Entry / Exit slot
 * keys for Scroll Appear, and a legacy shape), with defaults left out
 * and units mixed. A recipe says the same thing in one small,
 * versioned, documented shape:
 *
 *     {
 *       "version": 1,
 *       "mode": "scroll-appear",
 *       "entry": { "type": "slide", "direction": "btt", "duration": 0.6,
 *                  "delay": 0, "easing": "ease-out", "replay": "once" },
 *       "exit": null
 *     }
 *
 * The JSON Schema is motion_blocks_recipe_schema() (also published as
 * schema/animation-recipe.v1.json). Conversion runs both ways:
 * motion_blocks_attributes_to_recipe() and
 * motion_blocks_recipe_to_attributes(), which also validates and
 * reports every problem with a path, so an agent can fix its input.
 * The abilities in includes/abilities.php are built on these.
 *
 * @package MotionBlocks
 */

defined( 'ABSPATH' ) || exit;

/** Current recipe format version. */
const MOTION_BLOCKS_RECIPE_FORMAT = 1;

/**
 * Custom From / To properties: recipe key → attribute suffix, and the
 * unit a bare number gets (null: unitless).
 *
 * @return array<string, array{0: string, 1: string|null}>
 */
function motion_blocks_recipe_custom_props() {
    return array(
        'opacity'    => array( 'Opacity', null ),
        'translateX' => array( 'TranslateX', 'px' ),
        'translateY' => array( 'TranslateY', 'px' ),
        'scale'      => array( 'Scale', null ),
        'rotate'     => array( 'Rotate', 'deg' ),
        'rotateX'    => array( 'RotateX', 'deg' ),
        'rotateY'    => array( 'RotateY', 'deg' ),
        'blur'       => array( 'Blur', 'px' ),
        'clipPath'   => array( 'ClipPath', null ),
    );
}

/**
 * Named easings an agent can use. Each maps to the value stored in the
 * Acceleration attribute (the spring curves are stored as their
 * `linear()` string, exactly as the panel stores them).
 *
 * @return array<string, string> Name → stored acceleration value.
 */
function motion_blocks_recipe_easings() {
    $shared  = motion_blocks_shared_constants();
    $presets = isset( $shared['easingPresets'] ) && is_array( $shared['easingPresets'] )
        ? $shared['easingPresets']
        : array();
    return array_merge(
        array(
            'ease'        => 'ease',
            'linear'      => 'linear',
            'ease-in'     => 'ease-in',
            'ease-out'    => 'ease-out',
            'ease-in-out' => 'ease-in-out',
        ),
        $presets
    );
}

/**
 * Is this a CSS timing function the plugin will emit? Named easings
 * are handled separately; this accepts cubic-bezier(), steps() and
 * linear() lists.
 *
 * @param mixed $value Candidate.
 * @return bool
 */
function motion_blocks_recipe_valid_timing_function( $value ) {
    if ( ! is_string( $value ) || strlen( $value ) > 500 ) {
        return false;
    }
    $v   = trim( strtolower( $value ) );
    $num = '-?(?:\d+(?:\.\d+)?|\.\d+)';
    if ( preg_match( "/^cubic-bezier\(\s*({$num})\s*,\s*{$num}\s*,\s*({$num})\s*,\s*{$num}\s*\)$/", $v, $m ) ) {
        // x values must be within [0, 1].
        return (float) $m[1] >= 0 && (float) $m[1] <= 1 && (float) $m[2] >= 0 && (float) $m[2] <= 1;
    }
    if ( preg_match( '/^steps\(\s*\d+\s*(?:,\s*(?:jump-start|jump-end|jump-none|jump-both|start|end)\s*)?\)$/', $v ) ) {
        return true;
    }
    $stop = "{$num}(?:\s+{$num}%){0,2}";
    return 1 === preg_match( "/^linear\(\s*{$stop}(?:\s*,\s*{$stop})*\s*\)$/", $v );
}

/**
 * Which effect types each part of a recipe accepts.
 *
 * @param string $part 'page-load' | 'scroll-interactive' | 'entry' | 'exit'.
 * @return string[]
 */
function motion_blocks_recipe_types_for( $part ) {
    $shared = motion_blocks_shared_constants();
    if ( 'entry' === $part ) {
        return $shared['entryTypes'];
    }
    if ( 'exit' === $part ) {
        return $shared['exitTypes'];
    }
    return $shared['animationTypes'];
}

/**
 * The JSON Schema of a recipe. Uses only the keywords WordPress's REST
 * validator understands (no $ref), because abilities validate their
 * input with it; the semantic rules (directions per effect, image-only
 * blocks, Custom values) are checked by motion_blocks_recipe_to_attributes().
 *
 * @return array JSON Schema.
 */
function motion_blocks_recipe_schema() {
    $shared     = motion_blocks_shared_constants();
    $directions = array();
    foreach ( $shared['directions'] as $list ) {
        $directions = array_merge( $directions, $list );
    }
    $directions = array_values( array_unique( array_merge( array( '', 'none' ), $directions ) ) );

    $side = array(
        'type'                 => 'object',
        'description'          => 'Custom effect values. Numbers get the default unit (px for translate and blur, deg for rotations); strings may carry their own (24px, 50%, 2rem, 45deg, 0.5turn). clipPath takes inset(), circle(), ellipse(), polygon(), rect(), xywh() or path().',
        'properties'           => array(
            'opacity'    => array( 'type' => 'number', 'minimum' => 0, 'maximum' => 1 ),
            'translateX' => array( 'type' => array( 'number', 'string' ) ),
            'translateY' => array( 'type' => array( 'number', 'string' ) ),
            'scale'      => array( 'type' => 'number', 'minimum' => 0, 'maximum' => 10 ),
            'rotate'     => array( 'type' => array( 'number', 'string' ) ),
            'rotateX'    => array( 'type' => array( 'number', 'string' ) ),
            'rotateY'    => array( 'type' => array( 'number', 'string' ) ),
            'blur'       => array( 'type' => array( 'number', 'string' ) ),
            'clipPath'   => array( 'type' => 'string', 'maxLength' => 2000 ),
        ),
        'additionalProperties' => false,
    );

    $effect = function ( $types, $description, $with_replay = null ) use ( $directions, $side ) {
        $props = array(
            'type'      => array(
                'type'        => 'string',
                'enum'        => array_values( $types ),
                'description' => 'Effect. "custom" uses `from` / `to`; "image-move" and "image-zoom" only work on a Cover with an image background.',
            ),
            'direction' => array(
                'type'        => 'string',
                'enum'        => $directions,
                'description' => 'Where the motion comes from: btt (bottom to top), ttb, ltr, rtl; horizontal / vertical for curtain. Optional; each effect has a sensible default.',
            ),
            'duration'  => array(
                'type'        => 'number',
                'minimum'     => 0.05,
                'maximum'     => 60,
                'description' => 'Seconds. Default 0.6.',
            ),
            'delay'     => array(
                'type'        => 'number',
                'minimum'     => 0,
                'maximum'     => 60,
                'description' => 'Seconds before it starts. Default 0.',
            ),
            'easing'    => array(
                'type'        => 'string',
                'maxLength'   => 500,
                'description' => 'ease, linear, ease-in, ease-out, ease-in-out, spring, bouncy, snappy, or any CSS cubic-bezier() / steps() / linear() function. Default ease.',
            ),
            'blur'      => array(
                'type'        => 'number',
                'minimum'     => 0,
                'maximum'     => 200,
                'description' => 'Blur effects only: blur in px. Default 8.',
            ),
            'rotate'    => array(
                'type'        => 'number',
                'minimum'     => -3600,
                'maximum'     => 3600,
                'description' => 'Rotate effects only: angle in degrees. Default 90.',
            ),
            'from'      => $side,
            'to'        => $side,
        );
        if ( $with_replay ) {
            $props['replay'] = array(
                'type'        => 'string',
                'enum'        => array( 'once', 'repeat', 'reverse' ),
                'description' => $with_replay,
            );
        }
        return array(
            'type'                 => 'object',
            'description'          => $description,
            'properties'           => $props,
            'required'             => array( 'type' ),
            'additionalProperties' => false,
        );
    };

    $nullable = function ( $schema ) {
        $schema['type'] = array( 'object', 'null' );
        return $schema;
    };

    return array(
        'title'                => 'Motion Blocks animation recipe',
        'description'          => 'One block\'s animation. Page Load and Scroll Interactive use `effect`; Scroll Appear uses `entry` and/or `exit`. Omitted fields take their documented defaults.',
        'type'                 => 'object',
        'properties'           => array(
            'version'        => array(
                'type'        => 'integer',
                'enum'        => array( MOTION_BLOCKS_RECIPE_FORMAT ),
                'description' => 'Recipe format version.',
            ),
            'mode'           => array(
                'type'        => 'string',
                'enum'        => array( 'page-load', 'scroll-appear', 'scroll-interactive' ),
                'description' => 'page-load: plays once the page loads. scroll-appear: plays as the block scrolls into (entry) and out of (exit) view. scroll-interactive: progress follows the scroll position.',
            ),
            'effect'         => $effect(
                motion_blocks_recipe_types_for( 'page-load' ),
                'Page Load / Scroll Interactive: the effect.'
            ),
            'entry'          => $nullable(
                $effect(
                    motion_blocks_recipe_types_for( 'entry' ),
                    'Scroll Appear: what plays as the block enters the view (null for none).',
                    'once (default): plays the first time only. repeat: every time it enters. reverse: plays backwards as it leaves at the bottom.'
                )
            ),
            'exit'           => $nullable(
                $effect(
                    motion_blocks_recipe_types_for( 'exit' ),
                    'Scroll Appear: what plays as the block leaves the view upwards (null for none).',
                    'reverse (default): plays backwards when scrolled back. repeat: every time. once: only the first time.'
                )
            ),
            'repeat'         => array(
                'type'        => 'string',
                'enum'        => array( 'once', 'loop', 'alternate' ),
                'description' => 'Page Load only. Default once.',
            ),
            'pauseOffscreen' => array(
                'type'        => 'boolean',
                'description' => 'Page Load loops only: pause while off screen. Default true.',
            ),
            'range'          => array(
                'type'                 => 'object',
                'description'          => 'Scroll Interactive only: where in the block\'s pass through the view the animation runs, e.g. "entry 0%" to "exit 100%" (the default).',
                'properties'           => array(
                    'start' => array( 'type' => 'string', 'pattern' => '^(entry|exit|cover|contain|entry-crossing|exit-crossing) -?\\d+(\\.\\d+)?%$' ),
                    'end'   => array( 'type' => 'string', 'pattern' => '^(entry|exit|cover|contain|entry-crossing|exit-crossing) -?\\d+(\\.\\d+)?%$' ),
                ),
                'additionalProperties' => false,
            ),
            'target'         => array(
                'type'        => 'string',
                'enum'        => array( 'block', 'image' ),
                'description' => '"image" animates only a Cover block\'s background image. Default block.',
            ),
            'stagger'        => array(
                'type'                 => array( 'object', 'null' ),
                'description'          => 'Cascade the block\'s direct children one after another (Group, Columns, Buttons, Gallery, List; not Scroll Interactive).',
                'properties'           => array(
                    'step' => array(
                        'type'        => 'number',
                        'minimum'     => 0,
                        'maximum'     => 5,
                        'description' => 'Seconds between children. Default 0.1.',
                    ),
                ),
                'additionalProperties' => false,
            ),
        ),
        'required'             => array( 'version', 'mode' ),
        'additionalProperties' => false,
    );
}

/**
 * Every animation attribute key the plugin registers, with the value
 * that means "unset" (its schema default, or null for Custom values).
 *
 * @return array<string, mixed>
 */
function motion_blocks_recipe_cleared_attributes() {
    $out = motion_blocks_schema_defaults();
    foreach ( array( 'animation', 'animationEntry', 'animationExit' ) as $prefix ) {
        foreach ( motion_blocks_recipe_custom_props() as $prop ) {
            $out[ "{$prefix}From{$prop[0]}" ] = null;
            $out[ "{$prefix}To{$prop[0]}" ]   = null;
        }
    }
    return $out;
}

/**
 * Turn a recipe effect into attributes under `$prefix`, validating it.
 *
 * @param mixed  $effect     The effect object.
 * @param string $prefix     'animation' | 'animationEntry' | 'animationExit'.
 * @param string $part       'page-load' | 'scroll-interactive' | 'entry' | 'exit'.
 * @param string $path       Error path prefix ("effect", "entry", "exit").
 * @param array  $errors     Errors, appended to.
 * @return array Attributes.
 */
function motion_blocks_recipe_effect_to_attrs( $effect, $prefix, $part, $path, &$errors ) {
    $out = array();
    if ( ! is_array( $effect ) ) {
        $errors[] = array( 'path' => $path, 'message' => 'Must be an object with at least a "type".' );
        return $out;
    }
    $shared = motion_blocks_shared_constants();
    $type   = isset( $effect['type'] ) ? $effect['type'] : null;
    $types  = motion_blocks_recipe_types_for( $part );
    if ( ! is_string( $type ) || ! in_array( $type, $types, true ) ) {
        $errors[] = array(
            'path'    => "{$path}.type",
            'message' => 'Unknown effect. Allowed here: ' . implode( ', ', $types ) . '.',
        );
        return $out;
    }
    $out[ "{$prefix}Type" ] = $type;

    $known = array( 'type', 'direction', 'duration', 'delay', 'easing', 'blur', 'rotate', 'from', 'to', 'replay' );
    foreach ( array_keys( $effect ) as $key ) {
        if ( ! in_array( $key, $known, true ) || ( 'replay' === $key && 'animation' === $prefix ) ) {
            $errors[] = array( 'path' => "{$path}.{$key}", 'message' => 'Unknown field.' );
        }
    }

    // Direction.
    $direction = isset( $effect['direction'] ) ? $effect['direction'] : '';
    $base      = preg_replace( '/-out$/', '', $type );
    $allowed   = isset( $shared['directions'][ $type ] )
        ? $shared['directions'][ $type ]
        : ( isset( $shared['directions'][ $base ] ) ? $shared['directions'][ $base ] : array() );
    if ( 'scale' === $base ) {
        $allowed[] = 'none';
    }
    if ( '' !== $direction ) {
        if ( ! is_string( $direction ) || ! in_array( $direction, $allowed, true ) ) {
            $errors[] = array(
                'path'    => "{$path}.direction",
                'message' => $allowed
                    ? 'Not a direction for "' . $type . '". Allowed: ' . implode( ', ', $allowed ) . '.'
                    : '"' . $type . '" has no direction.',
            );
        } else {
            $out[ "{$prefix}Direction" ] = $direction;
        }
    }

    // Timing.
    foreach ( array( 'duration' => array( 0.05, 60 ), 'delay' => array( 0, 60 ) ) as $key => $range ) {
        if ( ! array_key_exists( $key, $effect ) ) {
            continue;
        }
        $v = $effect[ $key ];
        if ( ! is_int( $v ) && ! is_float( $v ) || $v < $range[0] || $v > $range[1] ) {
            $errors[] = array(
                'path'    => "{$path}.{$key}",
                'message' => "Must be a number of seconds from {$range[0]} to {$range[1]}.",
            );
            continue;
        }
        $out[ "{$prefix}" . ucfirst( $key ) ] = round( (float) $v, 2 );
    }
    // Omitted delay means 0 in a recipe (the attribute's own default
    // is 0.4 for historical reasons).
    if ( ! array_key_exists( 'delay', $effect ) ) {
        $out[ "{$prefix}Delay" ] = 0;
    }

    // Easing.
    if ( array_key_exists( 'easing', $effect ) ) {
        $easing  = $effect['easing'];
        $named   = motion_blocks_recipe_easings();
        if ( is_string( $easing ) && isset( $named[ strtolower( $easing ) ] ) ) {
            $out[ "{$prefix}Acceleration" ] = $named[ strtolower( $easing ) ];
        } elseif ( motion_blocks_recipe_valid_timing_function( $easing ) ) {
            $out[ "{$prefix}Acceleration" ]           = 'custom';
            $out[ "{$prefix}CustomTimingFunction" ] = trim( $easing );
        } else {
            $errors[] = array(
                'path'    => "{$path}.easing",
                'message' => 'Use ' . implode( ', ', array_keys( $named ) ) . ', or a CSS cubic-bezier(), steps() or linear() function.',
            );
        }
    }

    // Blur / rotate amounts.
    if ( array_key_exists( 'blur', $effect ) ) {
        $v = $effect['blur'];
        if ( 'blur' !== $base ) {
            $errors[] = array( 'path' => "{$path}.blur", 'message' => 'Only for blur effects (use from / to with "custom").' );
        } elseif ( ! is_numeric( $v ) || $v < 0 || $v > 200 ) {
            $errors[] = array( 'path' => "{$path}.blur", 'message' => 'Must be a number of px from 0 to 200.' );
        } else {
            $out[ "{$prefix}BlurAmount" ] = $v + 0;
        }
    }
    if ( array_key_exists( 'rotate', $effect ) ) {
        $v = $effect['rotate'];
        if ( 'rotate' !== $base ) {
            $errors[] = array( 'path' => "{$path}.rotate", 'message' => 'Only for rotate effects (use from / to with "custom").' );
        } elseif ( ! is_numeric( $v ) || $v < -3600 || $v > 3600 ) {
            $errors[] = array( 'path' => "{$path}.rotate", 'message' => 'Must be a number of degrees from -3600 to 3600.' );
        } else {
            $out[ "{$prefix}RotateAngle" ] = $v + 0;
        }
    }

    // Replay (Scroll Appear slots).
    if ( array_key_exists( 'replay', $effect ) && 'animation' !== $prefix ) {
        if ( in_array( $effect['replay'], array( 'once', 'repeat', 'reverse' ), true ) ) {
            $out[ "{$prefix}Replay" ] = $effect['replay'];
        } else {
            $errors[] = array( 'path' => "{$path}.replay", 'message' => 'Must be once, repeat or reverse.' );
        }
    }

    // Custom From / To.
    $has_sides = isset( $effect['from'] ) || isset( $effect['to'] );
    if ( 'custom' !== $type && $has_sides ) {
        $errors[] = array( 'path' => "{$path}.from", 'message' => '`from` / `to` are only for the "custom" effect.' );
    }
    if ( 'custom' === $type ) {
        $count = 0;
        foreach ( array( 'from' => 'From', 'to' => 'To' ) as $side => $side_key ) {
            if ( ! isset( $effect[ $side ] ) ) {
                continue;
            }
            if ( ! is_array( $effect[ $side ] ) ) {
                $errors[] = array( 'path' => "{$path}.{$side}", 'message' => 'Must be an object of properties.' );
                continue;
            }
            $props = motion_blocks_recipe_custom_props();
            foreach ( $effect[ $side ] as $id => $value ) {
                if ( ! isset( $props[ $id ] ) ) {
                    $errors[] = array(
                        'path'    => "{$path}.{$side}.{$id}",
                        'message' => 'Unknown property. Use ' . implode( ', ', array_keys( $props ) ) . '.',
                    );
                    continue;
                }
                list( $suffix, $unit ) = $props[ $id ];
                // Canonical storage: unit-bearing strings for lengths and
                // angles, numbers for opacity and scale.
                if ( $unit && ( is_int( $value ) || is_float( $value ) ) ) {
                    $value = ( $value + 0 ) . $unit;
                }
                if ( ! motion_blocks_valid_from_to_value( $id, $value ) ) {
                    $errors[] = array(
                        'path'    => "{$path}.{$side}.{$id}",
                        'message' => 'Not a valid value for ' . $id . '.',
                    );
                    continue;
                }
                $out[ "{$prefix}{$side_key}{$suffix}" ] = $unit || 'clipPath' === $id ? (string) $value : $value + 0;
                $count++;
            }
        }
        if ( 0 === $count ) {
            $errors[] = array( 'path' => "{$path}.from", 'message' => 'A "custom" effect needs at least one property in `from` or `to`.' );
        }
    }
    return $out;
}

/**
 * Convert a recipe to block attributes, validating it on the way.
 *
 * `null` (or an empty mode) means "no animation": every animation
 * attribute is cleared.
 *
 * @param array|null $recipe     The recipe (decoded JSON).
 * @param string     $block_name Block it's for ('' when unknown). Used
 *                               for the image-only and Stagger rules.
 * @param array      $block_attrs The block's current attributes, for the
 *                               Cover background checks. Optional.
 * @return array{attributes: array, errors: array} `attributes` holds
 *               only values that differ from the registered defaults
 *               (what the editor would save); apply it over a cleared
 *               block. Empty `errors` means valid.
 */
function motion_blocks_recipe_to_attributes( $recipe, $block_name = '', $block_attrs = array() ) {
    $errors = array();
    $attrs  = array();
    if ( null === $recipe ) {
        return array( 'attributes' => array(), 'errors' => array() );
    }
    if ( ! is_array( $recipe ) ) {
        return array(
            'attributes' => array(),
            'errors'     => array( array( 'path' => '', 'message' => 'A recipe must be a JSON object, or null for no animation.' ) ),
        );
    }
    $shared = motion_blocks_shared_constants();

    $version = isset( $recipe['version'] ) ? $recipe['version'] : null;
    if ( MOTION_BLOCKS_RECIPE_FORMAT !== $version ) {
        $errors[] = array( 'path' => 'version', 'message' => 'Must be ' . MOTION_BLOCKS_RECIPE_FORMAT . '.' );
    }
    $mode  = isset( $recipe['mode'] ) ? $recipe['mode'] : null;
    $modes = array( 'page-load', 'scroll-appear', 'scroll-interactive' );
    if ( ! in_array( $mode, $modes, true ) ) {
        $errors[] = array( 'path' => 'mode', 'message' => 'Must be ' . implode( ', ', $modes ) . '.' );
        return array( 'attributes' => array(), 'errors' => $errors );
    }
    if ( $block_name && ! motion_blocks_can_animate_block_name( $block_name ) ) {
        $errors[] = array( 'path' => '', 'message' => $block_name . ' blocks can\'t be animated (they have no wrapper element of their own).' );
    }
    $attrs['animationMode'] = $mode;

    $allowed_top = array( 'version', 'mode', 'target', 'stagger' );
    if ( 'scroll-appear' === $mode ) {
        $allowed_top = array_merge( $allowed_top, array( 'entry', 'exit' ) );
        $entry       = array_key_exists( 'entry', $recipe ) ? $recipe['entry'] : null;
        $exit        = array_key_exists( 'exit', $recipe ) ? $recipe['exit'] : null;
        if ( null === $entry && null === $exit ) {
            $errors[] = array( 'path' => 'entry', 'message' => 'Scroll Appear needs an `entry`, an `exit`, or both.' );
        }
        if ( null !== $entry ) {
            $attrs += motion_blocks_recipe_effect_to_attrs( $entry, 'animationEntry', 'entry', 'entry', $errors );
        }
        if ( null !== $exit ) {
            $attrs += motion_blocks_recipe_effect_to_attrs( $exit, 'animationExit', 'exit', 'exit', $errors );
            // Exit delay defaults to 0 in the schema too; drop the forced 0.
        }
    } else {
        $allowed_top[] = 'effect';
        if ( 'page-load' === $mode ) {
            $allowed_top = array_merge( $allowed_top, array( 'repeat', 'pauseOffscreen' ) );
        } else {
            $allowed_top[] = 'range';
        }
        if ( ! isset( $recipe['effect'] ) ) {
            $errors[] = array( 'path' => 'effect', 'message' => 'Required for ' . $mode . '.' );
        } else {
            $attrs += motion_blocks_recipe_effect_to_attrs( $recipe['effect'], 'animation', $mode, 'effect', $errors );
            // Shared-key Page Load blocks: the panel writes no -out type
            // for Page Load; allow it anyway (front end supports it).
        }
        if ( isset( $recipe['repeat'] ) ) {
            if ( in_array( $recipe['repeat'], array( 'once', 'loop', 'alternate' ), true ) ) {
                $attrs['animationRepeat'] = $recipe['repeat'];
            } else {
                $errors[] = array( 'path' => 'repeat', 'message' => 'Must be once, loop or alternate.' );
            }
        }
        if ( array_key_exists( 'pauseOffscreen', $recipe ) ) {
            if ( is_bool( $recipe['pauseOffscreen'] ) ) {
                $attrs['animationPauseOffscreen'] = $recipe['pauseOffscreen'];
            } else {
                $errors[] = array( 'path' => 'pauseOffscreen', 'message' => 'Must be true or false.' );
            }
        }
        if ( isset( $recipe['range'] ) ) {
            $pattern = '/^(entry|exit|cover|contain|entry-crossing|exit-crossing) -?\d+(\.\d+)?%$/';
            foreach ( array( 'start' => 'animationRangeStart', 'end' => 'animationRangeEnd' ) as $key => $attr ) {
                if ( ! isset( $recipe['range'][ $key ] ) ) {
                    continue;
                }
                if ( is_string( $recipe['range'][ $key ] ) && preg_match( $pattern, $recipe['range'][ $key ] ) ) {
                    $attrs[ $attr ] = $recipe['range'][ $key ];
                } else {
                    $errors[] = array( 'path' => "range.{$key}", 'message' => 'Use a range name and a percentage, e.g. "entry 20%" or "exit 80%".' );
                }
            }
        }
    }
    foreach ( array_keys( $recipe ) as $key ) {
        if ( ! in_array( $key, $allowed_top, true ) ) {
            $errors[] = array( 'path' => $key, 'message' => 'Not used by ' . $mode . '.' );
        }
    }

    // Target: the Cover's background image.
    $types       = array_filter(
        array(
            isset( $attrs['animationType'] ) && 'scroll-appear' !== $mode ? $attrs['animationType'] : '',
            isset( $attrs['animationEntryType'] ) ? $attrs['animationEntryType'] : '',
            isset( $attrs['animationExitType'] ) ? $attrs['animationExitType'] : '',
        )
    );
    $image_types = array_intersect( $types, $shared['imageEffectTypes'] );
    $target      = isset( $recipe['target'] ) ? $recipe['target'] : 'block';
    if ( ! in_array( $target, array( 'block', 'image' ), true ) ) {
        $errors[] = array( 'path' => 'target', 'message' => 'Must be block or image.' );
    } elseif ( 'image' === $target || $image_types ) {
        if ( $block_name && 'core/cover' !== $block_name ) {
            $errors[] = array(
                'path'    => 'image' === $target ? 'target' : 'effect',
                'message' => 'Only a Cover block\'s background image can be animated on its own (image-move, image-zoom, target "image").',
            );
        } elseif ( $block_name && motion_blocks_is_image_target_unavailable( $block_name, $block_attrs ) ) {
            $errors[] = array(
                'path'    => 'target',
                'message' => 'This Cover uses a fixed or repeated background, which has no image to animate. Turn those off or animate the whole block.',
            );
        }
        if ( 'image' === $target ) {
            $attrs['animationFromToTarget'] = 'img';
        }
    }

    // Stagger.
    if ( isset( $recipe['stagger'] ) ) {
        $stagger = $recipe['stagger'];
        if ( 'scroll-interactive' === $mode ) {
            $errors[] = array( 'path' => 'stagger', 'message' => 'Scroll Interactive can\'t stagger.' );
        } elseif ( $block_name && ! in_array( $block_name, $shared['staggerParentBlocks'], true ) ) {
            $errors[] = array(
                'path'    => 'stagger',
                'message' => 'Only ' . implode( ', ', $shared['staggerParentBlocks'] ) . ' blocks can stagger their children.',
            );
        } elseif ( $image_types ) {
            $errors[] = array( 'path' => 'stagger', 'message' => 'Image Move / Image Zoom can\'t stagger.' );
        } elseif ( ! is_array( $stagger ) ) {
            $errors[] = array( 'path' => 'stagger', 'message' => 'Must be an object like {"step": 0.1}, or null.' );
        } else {
            $attrs['animationStaggerEnabled'] = true;
            if ( isset( $stagger['step'] ) ) {
                if ( is_numeric( $stagger['step'] ) && $stagger['step'] >= 0 && $stagger['step'] <= 5 ) {
                    $attrs['animationStaggerStep'] = round( $stagger['step'] + 0, 2 );
                } else {
                    $errors[] = array( 'path' => 'stagger.step', 'message' => 'Must be a number of seconds from 0 to 5.' );
                }
            }
        }
    }

    // Keep only what differs from the registered defaults: exactly what
    // the editor would write into the block comment.
    $cleared = motion_blocks_recipe_cleared_attributes();
    $compact = array();
    foreach ( $attrs as $key => $value ) {
        if ( ! array_key_exists( $key, $cleared ) || $cleared[ $key ] !== $value ) {
            $compact[ $key ] = $value;
        }
    }
    return array(
        'attributes' => $errors ? array() : $compact,
        'errors'     => $errors,
    );
}

/**
 * Turn the block-attribute side of an effect into a recipe effect.
 *
 * @param array  $a      Attributes (defaults merged, migrated).
 * @param string $prefix 'animation' | 'animationEntry' | 'animationExit'.
 * @return array|null Effect, or null when the slot is empty.
 */
function motion_blocks_recipe_effect_from_attrs( $a, $prefix ) {
    $type = isset( $a[ "{$prefix}Type" ] ) ? (string) $a[ "{$prefix}Type" ] : '';
    if ( '' === $type ) {
        return null;
    }
    $effect = array( 'type' => $type );
    if ( ! empty( $a[ "{$prefix}Direction" ] ) ) {
        $effect['direction'] = (string) $a[ "{$prefix}Direction" ];
    }
    $effect['duration'] = (float) $a[ "{$prefix}Duration" ];
    $effect['delay']    = (float) $a[ "{$prefix}Delay" ];

    $accel = (string) $a[ "{$prefix}Acceleration" ];
    if ( 'custom' === $accel ) {
        $tf               = isset( $a[ "{$prefix}CustomTimingFunction" ] ) && is_string( $a[ "{$prefix}CustomTimingFunction" ] )
            ? trim( $a[ "{$prefix}CustomTimingFunction" ] )
            : '';
        $effect['easing'] = '' !== $tf ? $tf : motion_blocks_attr_default( "{$prefix}CustomTimingFunction" );
    } else {
        $name             = array_search( $accel, motion_blocks_recipe_easings(), true );
        $effect['easing'] = false !== $name ? $name : $accel;
    }

    $base = preg_replace( '/-out$/', '', $type );
    if ( 'blur' === $base ) {
        $effect['blur'] = $a[ "{$prefix}BlurAmount" ] + 0;
    }
    if ( 'rotate' === $base ) {
        $effect['rotate'] = $a[ "{$prefix}RotateAngle" ] + 0;
    }
    if ( 'animation' !== $prefix ) {
        $effect['replay'] = (string) $a[ "{$prefix}Replay" ];
    }
    if ( 'custom' === $type ) {
        foreach ( array( 'from' => 'From', 'to' => 'To' ) as $side => $side_key ) {
            $values = array();
            foreach ( motion_blocks_recipe_custom_props() as $id => $prop ) {
                $key = "{$prefix}{$side_key}{$prop[0]}";
                if ( isset( $a[ $key ] ) && motion_blocks_valid_from_to_value( $id, $a[ $key ] ) ) {
                    $values[ $id ] = is_numeric( $a[ $key ] ) && null === $prop[1] && 'clipPath' !== $id
                        ? $a[ $key ] + 0
                        : (string) $a[ $key ];
                }
            }
            if ( $values ) {
                $effect[ $side ] = $values;
            }
        }
    }
    return $effect;
}

/**
 * Read a block's animation as a recipe.
 *
 * Resolves omitted attributes to their defaults and migrates the legacy
 * Scroll Appear shape first, exactly as the render filter does, so the
 * recipe describes what the front end actually plays.
 *
 * @param array $attrs Saved block attributes.
 * @return array|null Recipe, or null when the block isn't animated.
 */
function motion_blocks_attributes_to_recipe( $attrs ) {
    if ( ! is_array( $attrs ) || empty( $attrs['animationMode'] ) ) {
        return null;
    }
    $a = array_merge( motion_blocks_schema_defaults(), $attrs );
    if ( 'scroll-appear' === $a['animationMode'] ) {
        $a = motion_blocks_migrate_scroll_appear_attrs( $a );
    }
    $recipe = array(
        'version' => MOTION_BLOCKS_RECIPE_FORMAT,
        'mode'    => (string) $a['animationMode'],
    );
    if ( 'scroll-appear' === $a['animationMode'] ) {
        $recipe['entry'] = motion_blocks_recipe_effect_from_attrs( $a, 'animationEntry' );
        $recipe['exit']  = motion_blocks_recipe_effect_from_attrs( $a, 'animationExit' );
    } else {
        $recipe['effect'] = motion_blocks_recipe_effect_from_attrs( $a, 'animation' );
        if ( 'page-load' === $a['animationMode'] ) {
            $recipe['repeat'] = (string) $a['animationRepeat'];
            if ( 'once' !== $recipe['repeat'] ) {
                $recipe['pauseOffscreen'] = (bool) $a['animationPauseOffscreen'];
            }
        } else {
            $recipe['range'] = array(
                'start' => (string) $a['animationRangeStart'],
                'end'   => (string) $a['animationRangeEnd'],
            );
        }
    }
    // Nothing would play (the render filter emits nothing for it).
    if ( empty( $recipe['entry'] ) && empty( $recipe['exit'] ) && empty( $recipe['effect'] ) ) {
        return null;
    }
    if ( 'img' === $a['animationFromToTarget'] ) {
        $recipe['target'] = 'image';
    }
    if ( ! empty( $a['animationStaggerEnabled'] ) && 'scroll-interactive' !== $a['animationMode'] ) {
        $recipe['stagger'] = array( 'step' => (float) $a['animationStaggerStep'] );
    }
    return $recipe;
}

/**
 * Can this block type keep animation settings? Mirrors canAnimateBlock()
 * in src/components/constants.js.
 *
 * @param string $block_name Block type.
 * @return bool
 */
function motion_blocks_can_animate_block_name( $block_name ) {
    $shared = motion_blocks_shared_constants();
    $list   = isset( $shared['nonAnimatableBlocks'] ) ? $shared['nonAnimatableBlocks'] : array();
    return ! in_array( $block_name, $list, true );
}

/**
 * Set a block's animation attributes: clear every animation attribute,
 * then apply the given (compact) ones.
 *
 * @param array $block_attrs Block attributes.
 * @param array $animation   From motion_blocks_recipe_to_attributes().
 * @return array New block attributes.
 */
function motion_blocks_apply_animation_attributes( $block_attrs, $animation ) {
    $block_attrs = is_array( $block_attrs ) ? $block_attrs : array();
    foreach ( array_keys( motion_blocks_recipe_cleared_attributes() ) as $key ) {
        unset( $block_attrs[ $key ] );
    }
    // Editor-only preview state that older posts may carry.
    foreach ( array( 'animationPreviewEnabled', 'animationPreviewPlaying', 'animationPreviewSlot', 'animationScrubPosition', 'animationFromToActiveSide', 'animationFromToPreviewSide' ) as $key ) {
        unset( $block_attrs[ $key ] );
    }
    return array_merge( $block_attrs, $animation );
}
