/*
    fast-record-type.tst.c - Reject wire record types before trace-table lookup or dispatch.

    Feed the real connector queues with packet tracing enabled, the configuration in which a bad
    type previously indexed beyond the trace-name table. No backend process or socket is required.
 */

#include "testme.h"
#define ME_COM_FAST 1
/* Match the generated product build: these switches affect the Http structure layout. */
#define ME_HTTP_HTTP2 1
#define ME_HTTP_WEB_SOCKETS 1
#include "appweb.h"

#if ME_UNIX_LIKE
#define httpFastInit recordTestFastInit
#if defined(__GNUC__)
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wsign-conversion"
#endif
#include "../../src/modules/fastHandler.c"
#if defined(__GNUC__)
#pragma GCC diagnostic pop
#endif

static void probe(int version, int type, bool rejected)
{
    HttpNet     *net;
    HttpStream  *stream;
    HttpPacket  *packet;
    FastApp     *app;
    FastRequest *req;
    uchar       header[8] = {1, 0, 0, 1, 0, 0, 0, 0};

    net = httpCreateNet(0, httpCreateEndpoint("127.0.0.1", 0, 0), 1, 0);
    net->ip = sclone("127.0.0.1");
    stream = httpCreateStream(net, 0);
    httpCreateRx(stream);
    httpCreateTx(stream, 0);
    stream->rx->route = httpCreateRoute(0);
    stream->rx->uri = sclone("/record-test");
    stream->state = HTTP_STATE_RUNNING;
    app = mprAllocStruct(FastApp);
    app->fast = mprAllocStruct(Fast);
    app->trace = stream->trace;
    req = allocFastRequest(app, stream, 0);
    header[0] = (uchar) version;
    header[1] = (uchar) type;
    if (version == FAST_VERSION && (type == FAST_PARAMS || type == FAST_STDOUT)) {
        header[5] = 1; /* Only a valid type may wait for the rest of its body. */
    }
    packet = httpCreateDataPacket(sizeof(header));
    mprPutBlockToBuf(packet->content, (cchar*) header, sizeof(header));
    httpPutForService(req->connReadq, packet, 0);
    fastConnectorIncomingService(req->connReadq);

    if (rejected) {
        teqi(stream->tx->status, HTTP_CODE_BAD_GATEWAY, "invalid type %d returns 502", type);
        ttrue(app->destroy, "invalid record must retire its backend");
    } else {
        tfalse(stream->error, "valid record must not fail the request");
        tfalse(app->destroy, "valid record leaves backend usable");
    }
    httpDestroyNet(net);
}
#endif

int main(int argc, char **argv)
{
#if ME_UNIX_LIKE
    int type;

    mprCreate(argc, argv, 0);
    httpCreate(HTTP_SERVER_SIDE | HTTP_CLIENT_SIDE);
    recordTestFastInit(HTTP, 0);
    httpSetTraceLevel(HTTP->trace, 6);
    probe(FAST_VERSION, FAST_STDERR, 0);
    probe(FAST_VERSION, FAST_STDOUT, 0);
    probe(FAST_VERSION, 0, 1);
    probe(0, FAST_STDERR, 1);
    probe(2, FAST_STDERR, 1);
    for (type = FAST_BEGIN_REQUEST; type <= FAST_MAX; type++) {
        if (type != FAST_STDOUT && type != FAST_STDERR && type != FAST_END_REQUEST) {
            probe(FAST_VERSION, type, 1);
        }
    }
    for (type = FAST_MAX + 1; type <= 255; type++) {
        probe(FAST_VERSION, type, 1);
    }
    probe(FAST_VERSION, FAST_STDERR, 0);
    mprDestroy();
#endif
    return 0;
}
