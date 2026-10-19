/*
    fast-idle-socket.tst.c - A pooled FastCGI connection whose app has exited is not reused.

    An app that exits after answering leaves its keep-alive connection on the idle pool until its EOF event runs.
    A request that selects the app before then must not be sent down that connection.
 */

#include "testme.h"
#define ME_COM_FAST 1
/* Match the generated product build: these switches affect the Http structure layout. */
#define ME_HTTP_HTTP2 1
#define ME_HTTP_WEB_SOCKETS 1
#include "appweb.h"

#if ME_UNIX_LIKE
#define httpFastInit idleTestFastInit
#if defined(__GNUC__)
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wsign-conversion"
#endif
#include "../../src/modules/fastHandler.c"
#if defined(__GNUC__)
#pragma GCC diagnostic pop
#endif

/*
    Return a connected socket for the app's pool and set *peer to the app's end of the connection
 */
static MprSocket *pooledSocket(int *peer)
{
    MprSocket *listen, *sp;
    int       port;

    listen = mprCreateSocket();
    mprListenOnSocket(listen, "127.0.0.1", 0, MPR_SOCKET_BLOCK | MPR_SOCKET_NODELAY);
    port = getListenPort(listen);
    sp = mprCreateSocket();
    mprConnectSocket(sp, "127.0.0.1", port, MPR_SOCKET_NODELAY);
    *peer = accept(listen->fd, NULL, NULL);
    mprCloseSocket(listen, 0);
    return sp;
}

static FastApp *createApp(void)
{
    FastApp *app;

    app = mprAllocObj(FastApp, manageFastApp);
    app->fast = allocFast();
    app->sockets = mprCreateList(0, 0);
    app->exitStatus = -1;
    // No listener to fall back to: getFastSocket returns only a pooled connection
    app->destroyed = 1;
    mprAddRoot(app);
    return app;
}

static void exitedPeer(void)
{
    FastApp   *app;
    MprSocket *sp, *got;
    int       peer;

    app = createApp();
    sp = pooledSocket(&peer);
    ttrue(peer >= 0, "accept pooled connection");
    mprPushItem(app->sockets, sp);
    close(peer);
    mprSleep(20);

    got = getFastSocket(app);
    tnull(got, "connection closed by the app is not reused");
    ttrue(sp->flags & MPR_SOCKET_CLOSED, "dead pooled connection is closed");
    mprRemoveRoot(app);
}

static void livePeer(void)
{
    FastApp   *app;
    MprSocket *sp, *got;
    int       peer;

    app = createApp();
    sp = pooledSocket(&peer);
    ttrue(peer >= 0, "accept pooled connection");
    mprPushItem(app->sockets, sp);

    got = getFastSocket(app);
    teqp(got, sp, "live idle connection is reused");
    mprCloseSocket(sp, 0);
    close(peer);
    mprRemoveRoot(app);
}
#endif

int main(int argc, char **argv)
{
#if ME_UNIX_LIKE
    mprCreate(argc, argv, 0);
    httpCreate(HTTP_SERVER_SIDE | HTTP_CLIENT_SIDE);
    idleTestFastInit(HTTP, 0);
    exitedPeer();
    livePeer();
    mprDestroy();
#else
    tskip("FastCGI is ME_UNIX_LIKE only");
#endif
    return 0;
}
