/*
    json-param-index.tst.c - JSON object insert lookup must stay indexed

    Request parameters are stored in an MprJson object. Distinct-name inserts must not regress to
    repeated full-list scans as the object grows.
 */

/********************************* Includes ***********************************/

#include "testme.h"
#include "appweb.h"

/************************************ Code ************************************/

/*
    Time one batch of inserts. Returns 0 if the clock ran backwards over the measurement, in which
    case *elapsed is not set.

    mprGetHiResTicks reads a per-core counter on some platforms -- RDTSC on x86 -- so a thread that
    migrates between cores mid-measurement can read an end value below its start value. Subtracting
    those as uint64 wraps, and the ratchet below then failed reporting a figure that cannot be true:
    "512 inserts took 18446744069544298419 ticks vs 51 inserts 15806347 ticks", on a Linux CI runner.
    That is 2^64 minus a small number, which is the signature of exactly this and not of a slow
    insert.
 */
static bool insertProperties(int count, int reps, uint64 *elapsed)
{
    MprJson *params;
    uint64  start, end;
    int     i, r;

    start = mprGetHiResTicks();
    for (r = 0; r < reps; r++) {
        params = mprCreateJson(MPR_JSON_OBJ);
        for (i = 0; i < count; i++) {
            mprWriteJson(params, sfmt("p%d", i), "1", MPR_JSON_STRING);
        }
    }
    end = mprGetHiResTicks();
    if (end < start) {
        return 0;
    }
    *elapsed = end - start;
    return 1;
}


/*
    Measure, retrying a backwards clock. A run that cannot produce one monotonic pair in five attempts
    has a broken clock rather than a slow insert, and the assertion says so rather than reporting a
    nonsense duration.
 */
static uint64 measure(int count, int reps)
{
    uint64  elapsed;
    int     attempt;

    for (attempt = 0; attempt < 5; attempt++) {
        if (insertProperties(count, reps, &elapsed)) {
            return elapsed;
        }
    }
    ttrue(0, "the high-resolution clock ran backwards on all 5 attempts at %d inserts", count);
    return 0;
}


int main(int argc, char **argv)
{
    /*
        Not "small" and "large": rpcndr.h, which windows.h includes, defines "small" as char, so the
        declaration expanded to "uint64 char, large" and the test could not be compiled on Windows.
     */
    uint64  smallDoc, largeDoc;

    mprCreate(argc, argv, 0);
    mprStart();

    measure(16, 10);
    smallDoc = measure(51, 200);
    largeDoc = measure(512, 200);

    /*
        512 is 10x 51. The indexed path should be close to that order. Leave generous headroom for
        allocator noise while still catching the old O(N^2) insertion shape.
     */
    ttrue(largeDoc < max(smallDoc, 1) * 35, "512 inserts took %llu ticks vs 51 inserts %llu ticks",
          largeDoc, smallDoc);

    mprDestroy();
    return 0;
}
