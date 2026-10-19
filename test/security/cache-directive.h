/*
    cache-directive.h - Compile the actual config parser in both cache feature modes.
    Renaming its entry points keeps the linked product parser separate on every platform.
 */
#include "testme.h"
/* Match the generated product build: these switches affect the Http structure layout. */
#define ME_HTTP_HTTP2 1
#define ME_HTTP_WEB_SOCKETS 1
#define maLoadModules cacheTest_maLoadModules
#define configureHandlers cacheTest_configureHandlers
#define maConfigureServer cacheTest_maConfigureServer
#define maParseConfig cacheTest_maParseConfig
#define maParseFile cacheTest_maParseFile
#define maTraceDirective cacheTest_maTraceDirective
#define maTraceLogDirective cacheTest_maTraceLogDirective
#define maTokenize cacheTest_maTokenize
#define maPushState cacheTest_maPushState
#define maPopState cacheTest_maPopState
#define maGetNextArg cacheTest_maGetNextArg
#define maWriteAuthFile cacheTest_maWriteAuthFile
#define maAddDirective cacheTest_maAddDirective
#define maLoadModule cacheTest_maLoadModule
#include "appweb.h"
#if defined(__GNUC__)
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wsign-conversion"
#endif
#include "../../src/config.c"
#if defined(__GNUC__)
#pragma GCC diagnostic pop
#endif

static int unsupported;

static void captureLog(cchar *tags, int level, cchar *message)
{
    if (level == 0 && scontains(message, "Cache directive not built in binary")) {
        unsupported++;
    }
}

int main(int argc, char **argv)
{
    MaState state = {0};
#if !ME_HTTP_CACHE
    MprTicks before;
#endif
    int rc;

    mprCreate(argc, argv, 0);
    httpCreate(HTTP_SERVER_SIDE | HTTP_CLIENT_SIDE);
    state.route = httpCreateRoute(0);
#if !ME_HTTP_CACHE
    before = state.route->lifespan;
#endif
    mprSetLogHandler(captureLog);
    rc = cacheDirective(&state, "Cache", "1hour");
#if ME_HTTP_CACHE
    teqi(rc, 0, "bare Cache directive succeeds when compiled in");
    teqi(state.route->lifespan, 3600000, "bare Cache sets the route lifespan");
#else
    teqi(rc, MPR_ERR_BAD_SYNTAX, "bare Cache must reject an unsupported feature");
    teqi(state.route->lifespan, before, "unsupported Cache must not mutate route lifespan");
    teqi(unsupported, 1, "bare Cache names the unavailable feature at level zero");
#endif
    rc = cacheDirective(&state, "Cache", "server=1hour methods=POST");
#if ME_HTTP_CACHE
    teqi(rc, 0, "qualified Cache succeeds when compiled in");
    teqi(mprGetListLength(state.route->caching), 1, "qualified Cache installs its rule");
    teqi(unsupported, 0, "supported Cache does not emit an unsupported warning");
#else
    teqi(rc, MPR_ERR_BAD_SYNTAX, "qualified Cache rejects an unsupported feature");
    teqi(mprGetListLength(state.route->caching), 0, "unsupported Cache does not install a rule");
    teqi(unsupported, 2, "qualified Cache names the unavailable feature at level zero");
#endif
    mprSetLogHandler(0);
    mprDestroy();
    return 0;
}
