/*
    fast-record-padding.tst.c - Zero every reserved and padding byte on the FastCGI wire.

    Poison new buffers before calling the real packet builders so allocator reuse cannot hide
    uninitialized bytes. Repeat all padding lengths with warm allocator state.
 */

#include "testme.h"
#define ME_COM_FAST 1
/* Match the generated product build: these switches affect the Http structure layout. */
#define ME_HTTP_HTTP2 1
#define ME_HTTP_WEB_SOCKETS 1
#include "appweb.h"

#if ME_UNIX_LIKE
static MprBuf *poisonBuf(ssize initial, ssize maximum)
{
    MprBuf *buf = mprCreateBuf(initial, maximum);
    memset(buf->data, 0xA5, (size_t) buf->buflen);
    return buf;
}

static HttpPacket *poisonPacket(ssize size)
{
    HttpPacket *packet = httpCreateDataPacket(size);
    if (packet->content) {
        memset(packet->content->data, 0xA5, (size_t) packet->content->buflen);
    }
    return packet;
}

#define mprCreateBuf poisonBuf
#define httpCreateDataPacket poisonPacket
#define httpFastInit paddingTestFastInit
#if defined(__GNUC__)
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wsign-conversion"
#endif
#include "../../src/modules/fastHandler.c"
#if defined(__GNUC__)
#pragma GCC diagnostic pop
#endif

static void probe(int length)
{
    FastRequest req = {0};
    Fast fast = {0};
    HttpQueue queue = {0};
    HttpPacket *packet;
    int i, pad;

    req.id = 1;
    req.fast = &fast;
    req.connWriteq = &queue;
    queue.queueData = &req;
    packet = poisonPacket(length + 8);
    mprPutStringToBuf(packet->content, snclone("abcdefgh", length));
    packet = createFastPacket(&queue, FAST_STDIN, packet);
    teqi(packet->prefix->start[7], 0, "header reserved byte");
    pad = length % 8 ? 8 - length % 8 : 0;
    teqi(packet->prefix->start[6], pad, "padding count");
    for (i = length; i < length + pad; i++) {
        teqi((uchar) packet->content->start[i], 0, "padding byte");
    }
    prepFastRequestStart(&queue);
    packet = httpGetPacket(&queue);
    teqi(packet->content->start[1], FAST_RESPONDER, "responder role");
    for (i = 3; i < 8; i++) {
        teqi((uchar) packet->content->start[i], 0, "begin reserved byte");
    }
}
#endif

int main(int argc, char **argv)
{
#if ME_UNIX_LIKE
    int length, repeat;
    mprCreate(argc, argv, 0);
    httpCreate(HTTP_SERVER_SIDE | HTTP_CLIENT_SIDE);
    for (repeat = 0; repeat < 100; repeat++) {
        for (length = 0; length <= 8; length++) {
            probe(length);
        }
    }
    mprDestroy();
#endif
    return 0;
}
