/* Verify PARAMS and STDIN larger than 64 KiB split into correctly framed records and reassemble unchanged. */

#include "testme.h"
#define ME_COM_FAST 1
/* Match the generated product build: these switches affect the Http structure layout. */
#define ME_HTTP_HTTP2 1
#define ME_HTTP_WEB_SOCKETS 1
#include "appweb.h"

#if ME_UNIX_LIKE
#define httpFastInit splitTestFastInit
#if defined(__GNUC__)
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wsign-conversion"
#endif
#include "../../src/modules/fastHandler.c"
#if defined(__GNUC__)
#pragma GCC diagnostic pop
#endif

#define BIG_SIZE 150000


static MprBuf *drainRecords(FastRequest *req, int type, int *count, int *lastFlags)
{
    HttpPacket *packet;
    MprBuf     *stream;
    uchar      *hdr;
    ssize      len, pad;

    stream = mprCreateBuf(BIG_SIZE * 2, 0);
    *count = 0;
    *lastFlags = 0;
    while ((packet = httpGetPacket(req->connWriteq)) != 0) {
        ttrue(packet->prefix && mprGetBufLength(packet->prefix) == 8, "record header present");
        hdr = (uchar*) mprGetBufStart(packet->prefix);
        len = (hdr[4] << 8) | hdr[5];
        pad = hdr[6];
        teqi(hdr[0], FAST_VERSION, "record version");
        teqi(hdr[1], type, "record type");
        teqi((hdr[2] << 8) | hdr[3], req->id, "record id");
        teqz(httpGetPacketLength(packet), len + pad, "record length matches content");
        //  An empty record carries no content buffer
        if (len > 0) {
            mprPutBlockToBuf(stream, mprGetBufStart(packet->content), len);
        }
        *lastFlags = packet->flags;
        (*count)++;
    }
    return stream;
}

static ssize decodeLen(MprBuf *buf)
{
    uchar *cp;

    cp = (uchar*) mprGetBufStart(buf);
    if (cp[0] < 0x80) {
        mprAdjustBufStart(buf, 1);
        return cp[0];
    }
    mprAdjustBufStart(buf, 4);
    return ((ssize) (cp[0] & 0x7f) << 24) | (cp[1] << 16) | (cp[2] << 8) | cp[3];
}

static FastRequest *createRequest(HttpQueue **qp)
{
    HttpNet    *net;
    HttpStream *stream;
    HttpQueue  *q;
    FastApp    *app;

    net = httpCreateNet(0, httpCreateEndpoint("127.0.0.1", 0, 0), 1, 0);
    net->ip = sclone("127.0.0.1");
    stream = httpCreateStream(net, 0);
    httpCreateRx(stream);
    httpCreateTx(stream, 0);
    stream->rx->route = httpCreateRoute(0);
    stream->rx->uri = sclone("/split-test");
    stream->state = HTTP_STATE_RUNNING;
    app = mprAllocStruct(FastApp);
    app->fast = mprAllocStruct(Fast);
    app->trace = stream->trace;

    q = httpCreateQueue(net, stream, HTTP->fastHandler, HTTP_QUEUE_TX, 0);
    q->queueData = allocFastRequest(app, stream, 0);
    *qp = q;
    return q->queueData;
}

static void testParams(void)
{
    FastRequest *req;
    HttpQueue   *q;
    MprBuf      *stream;
    char        *big, *name, *value;
    ssize       nlen, vlen;
    int         count, flags, found;

    req = createRequest(&q);
    big = mprAlloc(BIG_SIZE + 1);
    memset(big, 'p', BIG_SIZE);
    big[BIG_SIZE] = '\0';
    //  Bytes that read as a forged FastCGI PARAMS header if the record were misframed
    memcpy(&big[65536 - 64], "\x01\x04\x01\x01\x01\x20\x01\x01", 8);
    mprWriteJson(httpGetParams(req->stream), "big", big, MPR_JSON_STRING);

    prepFastRequestParams(q);
    stream = drainRecords(req, FAST_PARAMS, &count, &flags);
    ttrue(count >= 4, "params split across records plus terminator, got %d", count);

    found = 0;
    while (mprGetBufLength(stream) > 0) {
        nlen = decodeLen(stream);
        vlen = decodeLen(stream);
        ttrue(nlen + vlen <= mprGetBufLength(stream), "name-value pair within stream");
        if (nlen + vlen > mprGetBufLength(stream)) {
            break;
        }
        name = snclone(mprGetBufStart(stream), nlen);
        value = snclone(mprGetBufStart(stream) + nlen, vlen);
        mprAdjustBufStart(stream, nlen + vlen);
        if (smatch(name, sjoin(req->stream->rx->route->envPrefix, "big", NULL))) {
            ttrue(smatch(value, big), "big param value intact");
            found++;
        }
    }
    teqi(found, 1, "big param received once");
    httpDestroyNet(req->stream->net);
}

static void testStdin(void)
{
    FastRequest *req;
    HttpQueue   *q;
    HttpPacket  *packet;
    MprBuf      *stream;
    char        *body;
    int         count, flags, i;

    req = createRequest(&q);
    body = mprAlloc(BIG_SIZE);
    for (i = 0; i < BIG_SIZE; i++) {
        body[i] = (char) (i % 251);
    }
    packet = httpCreateDataPacket(BIG_SIZE);
    mprPutBlockToBuf(packet->content, body, BIG_SIZE);
    fastIncomingRequestPacket(q, packet);

    stream = drainRecords(req, FAST_STDIN, &count, &flags);
    teqi(count, 3, "body split into three records");
    teqz(mprGetBufLength(stream), BIG_SIZE, "body length");
    ttrue(memcmp(mprGetBufStart(stream), body, BIG_SIZE) == 0, "body bytes intact");
    httpDestroyNet(req->stream->net);
}

/*
    END belongs only to the final split record; earlier END flags skip writes.
 */
static void testEndFlag(void)
{
    FastRequest *req;
    HttpQueue   *q;
    HttpPacket  *packet;
    int         count, flags, ends;

    req = createRequest(&q);
    packet = httpCreateDataPacket(BIG_SIZE);
    memset(mprGetBufStart(packet->content), 's', BIG_SIZE);
    mprAdjustBufEnd(packet->content, BIG_SIZE);
    packet->flags |= HTTP_PACKET_END;
    putFastRecords(q, FAST_STDIN, packet);

    ends = 0;
    for (packet = req->connWriteq->first; packet; packet = packet->next) {
        if (packet->flags & HTTP_PACKET_END) {
            ends++;
            tfalse(packet->next, "END flag only on final record");
        }
    }
    teqi(ends, 1, "one END record");
    drainRecords(req, FAST_STDIN, &count, &flags);
    teqi(count, 3, "end packet split into three records");
    ttrue(flags & HTTP_PACKET_END, "final record keeps END");
    httpDestroyNet(req->stream->net);
}
#endif

int main(int argc, char **argv)
{
#if ME_UNIX_LIKE
    mprCreate(argc, argv, MPR_DISABLE_GC);
    httpCreate(HTTP_SERVER_SIDE | HTTP_CLIENT_SIDE);
    splitTestFastInit(HTTP, 0);
    testParams();
    testStdin();
    testEndFlag();
    mprDestroy();
#endif
    return 0;
}
