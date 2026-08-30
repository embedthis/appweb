/*
    bench-test.h - Benchmark test helpers for Appweb

    Copyright (c) All Rights Reserved. See details at the end of the file.
 */

/********************************** Includes **********************************/

#include    "mpr.h"
#include    "http.h"
#include    "testme.h"

/*********************************** Locals ***********************************/

/*
    Helper to setup HTTP and HTTPS endpoints
    For Appweb benchmarks, we hard-code the endpoints since we control appweb.conf
 */
/*
    Resolve the benchmark endpoints from the harness, falling back to the values in
    bench/appweb.conf.

    These were hard-coded here, which made them a third copy of a port number that
    bench/appweb.conf and bench/setup.sh already carry -- and the copies drifted the moment
    anything moved the ports, with the benchmark failing to connect and nothing saying why.
    TM_BENCH_HTTP and TM_BENCH_HTTPS are set in bench/testme.json5 alongside every other
    endpoint the suite uses.
 */
PUBLIC bool benchSetup(char **httpEp, char **httpsEp)
{
    cchar *ep;

    if (httpEp) {
        ep = getenv("TM_BENCH_HTTP");
        *httpEp = sclone(ep ? ep : "http://localhost:4200");
        mprHold(*httpEp);
    }
    if (httpsEp) {
        ep = getenv("TM_BENCH_HTTPS");
        *httpsEp = sclone(ep ? ep : "https://localhost:4201");
        mprHold(*httpsEp);
    }
    return 1;
}

/*
    Copyright (c) Embedthis Software. All Rights Reserved.
    This software is distributed under a commercial license. Consult the LICENSE.md
    distributed with this software for full details and copyrights.
 */
