/**
 * Motion Blocks — Tools page (Tools → Motion Blocks).
 *
 * Drives the "Run migration" button on the legacy-migration tool. The
 * heavy lifting (parsing posts, stripping legacy markup, re-saving)
 * happens server-side via the `motion-blocks/v1/migrate-batch` REST
 * endpoint; this script just loops that endpoint until the remaining
 * count reaches zero, updating the on-page status as it goes.
 *
 * Plain JS (no React / no JSX) so the plugin's webpack entries don't
 * need to learn about it. Dependencies: `wp-api-fetch` for REST calls
 * with the cookie nonce automatically attached, and `wp-i18n` for
 * translatable strings.
 */
( function ( wp ) {
    if ( ! wp || ! wp.apiFetch ) {
        return;
    }
    const apiFetch = wp.apiFetch;
    const __ = ( wp.i18n && wp.i18n.__ ) || function ( s ) { return s; };
    const sprintf = ( wp.i18n && wp.i18n.sprintf ) || function ( s ) { return s; };

    const btn = document.getElementById( 'mb-migrate-run' );
    const statusEl = document.getElementById( 'mb-migrate-status' );
    const countEl = document.getElementById( 'mb-migrate-count' );
    if ( ! btn || ! statusEl || ! countEl ) {
        return;
    }

    const setStatus = ( msg ) => {
        statusEl.textContent = msg;
    };
    const setCount = ( n ) => {
        countEl.textContent = String( n );
    };

    btn.addEventListener( 'click', async () => {
        if ( btn.disabled ) {
            return;
        }
        btn.disabled = true;
        setStatus( __( 'Starting…', 'motion-blocks' ) );

        let totalMigrated = 0;
        let totalProcessed = 0;
        // Hard cap as a safety net (~25 000 posts at batch=25). If we
        // ever exceed this something is wrong with the server-side
        // termination — bail rather than spin forever.
        const MAX_ITERATIONS = 1000;

        try {
            for ( let i = 0; i < MAX_ITERATIONS; i++ ) {
                const res = await apiFetch( {
                    path: '/motion-blocks/v1/migrate-batch',
                    method: 'POST',
                    data: { batch: 25 },
                } );
                totalMigrated += Number( res.migrated ) || 0;
                totalProcessed += Number( res.processed ) || 0;
                setCount( Number( res.remaining ) || 0 );
                setStatus(
                    sprintf(
                        /* translators: %1$d: posts migrated so far, %2$d: posts remaining. */
                        __( 'Working… %1$d migrated, %2$d remaining.', 'motion-blocks' ),
                        totalMigrated,
                        Number( res.remaining ) || 0
                    )
                );
                // Done when the server has nothing left, or when a pass
                // returned zero processed (e.g. all remaining posts
                // matched the LIKE but didn't actually need cleaning —
                // protects against an infinite loop on false positives).
                if ( ! res.remaining || ! res.processed ) {
                    break;
                }
            }
            setStatus(
                sprintf(
                    /* translators: %1$d: posts migrated, %2$d: posts scanned. */
                    __( 'Done. %1$d posts migrated (scanned %2$d).', 'motion-blocks' ),
                    totalMigrated,
                    totalProcessed
                )
            );
        } catch ( err ) {
            const msg = ( err && ( err.message || err.code ) ) || 'unknown error';
            setStatus(
                sprintf(
                    /* translators: %s: error message. */
                    __( 'Error: %s', 'motion-blocks' ),
                    msg
                )
            );
            btn.disabled = false;
        }
    } );
} )( window.wp );
