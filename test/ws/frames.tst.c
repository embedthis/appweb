/*
    frames.tst.c - WebSocket handshake and frame ratchet

    test/appweb.conf configures <Route ^/ws/> with the webSocketFilter and testWebSocketsHandler,
    and no test targeted it (10065). The only WebSocket tests in the suite reach that handler
    through the proxy backend in proxy.conf, so the upgrade and framing paths on the primary
    endpoint were unexercised. http/src/webSockFilter.c is 1,243 lines.

    Native rather than TypeScript because the subject is bytes on the wire. The Ejscript client
    cannot write a binary frame -- a frame header carries octets above 0x7f, which the shim
    UTF-8 encodes and thereby corrupts -- and never delivers onmessage, which is why
    proxy/websockets-1.tst.ts asserts only open and close and proxy/websockets-2.tst.ts, the one
    that reads, is disabled outright.

    src/modules/testWebSocketsHandler.c replies to any inbound message with a fixed document of
    digit lines terminated by "END OF DOCUMENT", so the reply is a known quantity.

    Copyright (c) All Rights Reserved. See details at the end of the file.
 */

/********************************* Includes ***********************************/

#include "testme.h"
#include "appweb.h"

/*********************************** Locals ***********************************/

#define MAX_RESPONSE 65536
#define FIRST_WAIT   5000
#define TAIL_WAIT    500
#define LARGE_64_LEN 65536

/*
    A fixed 16-byte key, base64 encoded. Fixed rather than random so a failure reproduces exactly;
    the server derives the accept token from it either way.
 */
#define WS_KEY "AQIDBAUGBwgJCgsMDQ4PEA=="

static cchar *host = "127.0.0.1";
static int   port;

/************************************ Code ************************************/

/*
    Open a connection and send a handshake. Returns the connected socket with the handshake
    response already read into response, or NULL if the connection could not be made.
 */
static MprSocket *handshake(cchar *path, cchar *key, cchar *version, char *response, ssize size)
{
    MprSocket *sp;
    char      request[1024];
    ssize     len;

    response[0] = '\0';
    if ((sp = mprCreateSocket()) == 0) {
        return 0;
    }
    mprAddRoot(sp);
    if (mprConnectSocket(sp, host, port, 0) < 0) {
        mprRemoveRoot(sp);
        return 0;
    }
    mprSetSocketBlockingMode(sp, 1);

    fmt(request, sizeof(request),
        "GET %s HTTP/1.1\r\n"
        "Host: %s:%d\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        "%s%s"
        "\r\n",
        path, host, port,
        key ? sfmt("Sec-WebSocket-Key: %s\r\n", key) : "",
        version ? sfmt("Sec-WebSocket-Version: %s\r\n", version) : "");

    mprWriteSocket(sp, request, slen(request));

    len = 0;
    if (mprWaitForSingleIO((int) sp->fd, MPR_READABLE, FIRST_WAIT) > 0) {
        len = mprReadSocket(sp, response, size - 1);
        if (len < 0) {
            len = 0;
        }
    }
    response[len] = '\0';
    return sp;
}


static void closeSocket(MprSocket *sp)
{
    if (sp) {
        mprCloseSocket(sp, 0);
        mprRemoveRoot(sp);
    }
}


/*
    Write a masked client text frame. RFC 6455 5.2 requires every client-to-server frame be
    masked; a server accepting an unmasked one would itself be defective.
 */
static void writeTextFrame(MprSocket *sp, cchar *payload)
{
    uchar frame[512];
    uchar mask[4];
    ssize len, i, n;

    len = slen(payload);
    mask[0] = 0x37; mask[1] = 0xfa; mask[2] = 0x21; mask[3] = 0x3d;

    n = 0;
    frame[n++] = 0x81;                          /* FIN + opcode 1 (text) */
    frame[n++] = (uchar) (0x80 | len);          /* MASK + 7-bit length */
    for (i = 0; i < 4; i++) {
        frame[n++] = mask[i];
    }
    for (i = 0; i < len; i++) {
        frame[n++] = (uchar) (payload[i] ^ mask[i % 4]);
    }
    mprWriteSocket(sp, frame, n);
}


/*
    Write a masked client text frame using the 16-bit extended payload length form.
 */
static void writeExtendedTextFrame(MprSocket *sp, cchar *payload, ssize len)
{
    uchar frame[512];
    uchar mask[4];
    ssize i, n;

    ttrue(len >= 126 && len <= 0xffff, "test payload must use the 16-bit extended length form");
    ttrue(len + 8 < (ssize) sizeof(frame), "test payload must fit the local frame buffer");

    mask[0] = 0x37; mask[1] = 0xfa; mask[2] = 0x21; mask[3] = 0x3d;

    n = 0;
    frame[n++] = 0x81;                          /* FIN + opcode 1 (text) */
    frame[n++] = (uchar) (0x80 | 126);          /* MASK + 16-bit extended length */
    frame[n++] = (uchar) ((len >> 8) & 0xff);
    frame[n++] = (uchar) (len & 0xff);
    for (i = 0; i < 4; i++) {
        frame[n++] = mask[i];
    }
    for (i = 0; i < len; i++) {
        frame[n++] = (uchar) (payload[i] ^ mask[i % 4]);
    }
    mprWriteSocket(sp, frame, n);
}


/*
    Write a masked client binary frame using the 64-bit extended payload length form.
 */
static void writeExtendedBinaryFrame64(MprSocket *sp, cchar *payload, uint64 len)
{
    uchar *frame;
    uchar mask[4];
    uint64 i;
    ssize n;

    ttrue(len > 0xffff, "test payload must use the 64-bit extended length form");
    ttrue(len <= MAXSSIZE - 14, "test payload must fit ssize accounting");

    frame = malloc((ssize) len + 14);
    ttrue(frame != 0, "test frame allocation must succeed");
    mask[0] = 0x37; mask[1] = 0xfa; mask[2] = 0x21; mask[3] = 0x3d;

    n = 0;
    frame[n++] = 0x82;                          /* FIN + opcode 2 (binary) */
    frame[n++] = (uchar) (0x80 | 127);          /* MASK + 64-bit extended length */
    for (i = 7; i != (uint64) -1; i--) {
        frame[n++] = (uchar) ((len >> (i * 8)) & 0xff);
    }
    for (i = 0; i < 4; i++) {
        frame[n++] = mask[i];
    }
    for (i = 0; i < len; i++) {
        frame[n++] = (uchar) (payload[i] ^ mask[i % 4]);
    }
    mprWriteSocket(sp, frame, n);
    free(frame);
}


/*
    Write only the header for a masked client text frame with a 64-bit declared payload length.
    Invalid declarations must be rejected from the control fields without waiting for payload data.
 */
static void writeDeclaredLength64(MprSocket *sp, uint64 declaredLength)
{
    uchar frame[14];
    uchar mask[4];
    ssize i, n;

    mask[0] = 0x37; mask[1] = 0xfa; mask[2] = 0x21; mask[3] = 0x3d;

    n = 0;
    frame[n++] = 0x81;                          /* FIN + opcode 1 (text) */
    frame[n++] = (uchar) (0x80 | 127);          /* MASK + 64-bit extended length */
    for (i = 7; i >= 0; i--) {
        frame[n++] = (uchar) ((declaredLength >> (i * 8)) & 0xff);
    }
    for (i = 0; i < 4; i++) {
        frame[n++] = mask[i];
    }
    mprWriteSocket(sp, frame, n);
}


/*
    Read whatever the server sends next, up to size bytes. Returns the byte count.
 */
static ssize readReply(MprSocket *sp, uchar *buf, ssize size)
{
    MprTicks wait;
    ssize    len, nbytes;

    len = 0;
    while (len < size - 1) {
        wait = (len == 0) ? FIRST_WAIT : TAIL_WAIT;
        if (mprWaitForSingleIO((int) sp->fd, MPR_READABLE, wait) <= 0) {
            break;
        }
        if ((nbytes = mprReadSocket(sp, (char*) &buf[len], size - 1 - len)) <= 0) {
            break;
        }
        len += nbytes;
    }
    buf[len] = '\0';
    return len;
}


static void expectCloseAfterDeclaredLength(uint64 declaredLength, cchar *message)
{
    MprSocket *sp;
    uchar     frame[MAX_RESPONSE];
    char      response[MAX_RESPONSE];
    ssize     len;

    sp = handshake("/ws/echo", WS_KEY, "13", response, sizeof(response));
    tcontains(response, "101", "invalid-length test must start from an upgraded websocket");
    writeDeclaredLength64(sp, declaredLength);
    len = readReply(sp, frame, sizeof(frame));
    ttrue(len > 0, "%s", message);
    teqi(frame[0] & 0x0f, WS_MSG_CLOSE, "invalid frame length must receive a close frame");
    closeSocket(sp);

    sp = handshake("/ws/echo", WS_KEY, "13", response, sizeof(response));
    tcontains(response, "101", "invalid frame length must not wedge the websocket route");
    closeSocket(sp);
}


int main(int argc, char **argv)
{
    MprSocket *sp;
    uchar     *frame;
    char      *response, *accept, *cp, *end;
    char      extendedPayload[130], *largePayload;
    ssize     len;
    int       i;

    mprCreate(argc, argv, 0);
    mprStart();
    port = tgeti("TM_HTTP_PORT", 4100);
    response = mprAlloc(MAX_RESPONSE);
    frame = mprAlloc(MAX_RESPONSE);

    /*
        The upgrade completes on the primary endpoint, not only through the proxy.
     */
    sp = handshake("/ws/echo", WS_KEY, "13", response, MAX_RESPONSE);
    ttrue(sp != 0, "must connect to the websocket route");
    tcontains(response, "101", "a valid handshake must be upgraded");
    tcontains(response, "Sec-WebSocket-Accept:", "the upgrade must carry an accept token");

    /*
        The accept token is derived from the key, so it must be present and must differ from the
        key echoed back. Its exact value is a SHA1 this test does not recompute: that the server
        derives something from the key is the property under test.
     */
    if ((cp = scontains(response, "Sec-WebSocket-Accept:")) != 0) {
        cp += slen("Sec-WebSocket-Accept:");
        while (*cp == ' ') cp++;
        if ((end = scontains(cp, "\r\n")) != 0) {
            accept = snclone(cp, end - cp);
            ttrue(slen(accept) > 0, "accept token must not be empty");
            ttrue(!smatch(accept, WS_KEY), "accept token must not be the key echoed back");
        }
    }

    /*
        The handler answers a text message with a well formed, unmasked text frame.
     */
    writeTextFrame(sp, "hello");
    len = readReply(sp, frame, MAX_RESPONSE);
    ttrue(len > 0, "the handler must answer a text frame");
    teqi(frame[0] & 0x0f, 1, "reply opcode must be text");
    teqi(frame[0] & 0x80, 0x80, "reply must have FIN set");
    teqi(frame[1] & 0x80, 0, "server frames must not be masked");
    ttrue(scontains((char*) frame, "END OF DOCUMENT") != 0, "reply must carry the handler document");
    closeSocket(sp);

    /*
        A valid extended-length frame is accepted and answered.
     */
    for (i = 0; i < (int) sizeof(extendedPayload); i++) {
        extendedPayload[i] = 'a';
    }
    sp = handshake("/ws/echo", WS_KEY, "13", response, MAX_RESPONSE);
    tcontains(response, "101", "extended-length test must start from an upgraded websocket");
    writeExtendedTextFrame(sp, extendedPayload, sizeof(extendedPayload));
    len = readReply(sp, frame, MAX_RESPONSE);
    ttrue(len > 0, "the handler must answer a valid 16-bit extended length frame");
    teqi(frame[0] & 0x0f, 1, "extended-length reply opcode must be text");
    ttrue(scontains((char*) frame, "END OF DOCUMENT") != 0, "extended-length reply must carry the handler document");
    closeSocket(sp);

    /*
        A valid 64-bit extended-length frame above the 16-bit range is accepted and answered.
     */
    largePayload = mprAlloc(LARGE_64_LEN);
    for (i = 0; i < LARGE_64_LEN; i++) {
        largePayload[i] = 'a';
    }
    sp = handshake("/ws/echo", WS_KEY, "13", response, MAX_RESPONSE);
    tcontains(response, "101", "64-bit extended-length test must start from an upgraded websocket");
    writeExtendedBinaryFrame64(sp, largePayload, LARGE_64_LEN);
    len = readReply(sp, frame, MAX_RESPONSE);
    ttrue(len > 0, "the handler must answer a valid 64-bit extended length frame");
    teqi(frame[0] & 0x0f, 1, "64-bit extended-length reply opcode must be text");
    ttrue(scontains((char*) frame, "END OF DOCUMENT") != 0,
        "64-bit extended-length reply must carry the handler document");
    closeSocket(sp);

    /*
        RFC 6455 5.2: the most significant bit of a 64-bit payload length must be zero.
        The parser must also reject lengths wider than ssize before storing frameLength.
     */
    expectCloseAfterDeclaredLength(UINT64(1) << 63, "a 64-bit declared length with the high bit set must be rejected");
    expectCloseAfterDeclaredLength(UINT64(1) << 31, "a declared length above 2GB must be rejected before truncation");

    /*
        The upgrade is confined to the configured route.
     */
    sp = handshake("/index.html", WS_KEY, "13", response, MAX_RESPONSE);
    ttrue(scontains(response, "101") == 0, "a path outside /ws/ must not be upgraded");
    closeSocket(sp);

    /*
        A handshake missing the key is not a handshake.
     */
    sp = handshake("/ws/echo", 0, "13", response, MAX_RESPONSE);
    ttrue(scontains(response, "101") == 0, "a handshake without a key must be refused");
    closeSocket(sp);

    /*
        RFC 6455 4.2.1: only version 13 is defined. An older draft version must be refused.
     */
    sp = handshake("/ws/echo", WS_KEY, "7", response, MAX_RESPONSE);
    ttrue(scontains(response, "101") == 0, "an unsupported websocket version must be refused");
    closeSocket(sp);

    /*
        A second connection succeeds after the first has closed, so the route is not left wedged.
     */
    sp = handshake("/ws/echo", WS_KEY, "13", response, MAX_RESPONSE);
    tcontains(response, "101", "a second upgrade must succeed after the first closed");
    writeTextFrame(sp, "again");
    len = readReply(sp, frame, MAX_RESPONSE);
    ttrue(len > 0, "the second connection must be served too");
    closeSocket(sp);

    mprDestroy();
    return 0;
}

/*
    Copyright (c) Embedthis Software. All Rights Reserved.
    This software is distributed under a commercial license. Consult the LICENSE.md
    distributed with this software for full details and copyrights.
 */
