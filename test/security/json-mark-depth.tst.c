/*
    json-mark-depth.tst.c - Collecting a wide JSON tree must not recurse once per sibling

    MprJson children are a circular sibling list, and manageJson used to mark it by marking its own
    "next". mprMark invokes the manager directly, with no work queue and no depth bound, so marking a
    chain of N cost N stack frames: a wide document killed the marking thread with SIGBUS long before
    any memory ceiling engaged. Measured at 20,000 properties against a default 512KB thread stack, and
    the embedded targets this runtime exists for have smaller stacks again.

    The children are now marked iteratively from the parent, so marking depth follows the depth of the
    tree rather than the width of any one level. Surviving the collection is the assertion; reading the
    tree back afterwards is the other half, because marking from the parent is only correct if every
    child is reached and a missed child is freed under the caller.
 */

/********************************* Includes ***********************************/

#include "testme.h"
#include "appweb.h"

/*********************************** Locals ***********************************/

#define WIDTH 200000

/************************************ Code ************************************/

int main(int argc, char **argv)
{
    MprJson *obj;
    int     i;

    mprCreate(argc, argv, 0);
    mprStart();

    obj = mprCreateJson(MPR_JSON_OBJ);
    mprAddRoot(obj);
    for (i = 0; i < WIDTH; i++) {
        mprWriteJson(obj, sfmt("p%d", i), "1", MPR_JSON_STRING);
    }
    mprGC(MPR_GC_FORCE | MPR_GC_COMPLETE);

    ttrue(obj->length == WIDTH, "expected %d properties, have %d", WIDTH, obj->length);
    ttrue(smatch(mprGetJson(obj, "p0"), "1"), "the first property must survive collection");
    ttrue(smatch(mprGetJson(obj, sfmt("p%d", WIDTH / 2)), "1"), "a middle property must survive collection");
    ttrue(smatch(mprGetJson(obj, sfmt("p%d", WIDTH - 1)), "1"), "the last property must survive collection");

    mprRemoveRoot(obj);
    mprDestroy();
    return 0;
}
