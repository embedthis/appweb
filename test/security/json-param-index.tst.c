/*
    json-param-index.tst.c - JSON object insert lookup must stay indexed

    Request parameters are stored in an MprJson object. Distinct-name inserts must not regress to
    repeated full-list scans as the object grows.
 */

/********************************* Includes ***********************************/

#include "testme.h"
#include "appweb.h"

/************************************ Code ************************************/

static uint64 insertProperties(int count, int reps)
{
    MprJson *params;
    uint64  start;
    int     i, r;

    start = mprGetHiResTicks();
    for (r = 0; r < reps; r++) {
        params = mprCreateJson(MPR_JSON_OBJ);
        for (i = 0; i < count; i++) {
            mprWriteJson(params, sfmt("p%d", i), "1", MPR_JSON_STRING);
        }
    }
    return mprGetHiResTicks() - start;
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

    insertProperties(16, 10);
    smallDoc = insertProperties(51, 200);
    largeDoc = insertProperties(512, 200);

    /*
        512 is 10x 51. The indexed path should be close to that order. Leave generous headroom for
        allocator noise while still catching the old O(N^2) insertion shape.
     */
    ttrue(largeDoc < max(smallDoc, 1) * 35, "512 inserts took %llu ticks vs 51 inserts %llu ticks",
          largeDoc, smallDoc);

    mprDestroy();
    return 0;
}
