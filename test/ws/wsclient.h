/*
    wsclient.h - A raw WebSocket client for the frame-level tests

    These tests must control the exact bytes of a frame, so they drive an MPR socket rather than a
    client library. The Ejscript shim cannot do it at all: a frame header carries octets above 0x7f
    and the shim UTF-8 encodes them, corrupting the header before it reaches the wire.

    Header-resident because TestMe compiles each .tst.c as a standalone translation unit. There is no
    link step that could pick up a shared .c, so shared C between tests has to be static functions in
    a header. Everything here is static and unused ones cost nothing.

    ONE RULE FOR CALLERS: allocate test buffers with malloc, never mprAlloc.

    MPR's collector does not scan the C stack, and both mprReadSocket and mprWriteSocket yield to it.
    An mprAlloc'd buffer referenced only by a local variable is therefore eligible for collection
    while a socket call is reading into or writing out of it. The failure is not a null dereference
    but heap corruption discovered later: the run segfaults inside sweeperThread after every assertion
    has already passed, and the overwritten block header holds bytes of whatever the test was moving.
    frames.tst.c was doing exactly this with a 64KB payload.

    AFTER EDITING THIS HEADER, RUN "rm -rf test/ws/.testme".

    TestMe keys its compile cache on the .tst.c alone, so a change here does not trigger a rebuild and
    the previous binary is silently reused -- a green run that did not test the code. Verified by
    appending "#error" to this file and watching frames.tst.c pass. Filed as testme #10003; delete
    this paragraph when that is fixed.

    Copyright (c) All Rights Reserved. See details at the end of the file.
 */

#ifndef _h_WSCLIENT
#define _h_WSCLIENT 1

#include "testme.h"
#include "appweb.h"

/*********************************** Defines **********************************/

#define WS_MAX_RESPONSE 65536

/*
    First read waits for the server to do something; later reads only mop up what followed. A long
    tail wait would add itself to the run time of every test that reads a single frame.
 */
#define WS_FIRST_WAIT   5000
#define WS_TAIL_WAIT    500

/*
    A fixed 16-byte key, base64 encoded. Fixed rather than random so a failure reproduces exactly;
    the server derives the accept token from it either way.
 */
#define WS_TEST_KEY     "AQIDBAUGBwgJCgsMDQ4PEA=="

//  Length forms for wsWriteFrame. WS_LEN_AUTO picks the shortest that fits.
#define WS_LEN_AUTO     0
#define WS_LEN_7        7
#define WS_LEN_16       16
#define WS_LEN_64       64

//  The echo route: an actionHandler bound to the testBench echo callback. Returns what it is sent.
#define WS_ECHO_PATH    "/wsecho"

//  The same, with LimitWebSocketsMessage 4K and LimitWebSocketsPacket 1K
#define WS_LIMIT_PATH   "/wslimit"

//  testWebSocketsHandler: answers any message with a fixed document, ignoring the payload
#define WS_FIXED_PATH   "/ws/echo"

//  What the fixed handler's document ends with
#define WS_FIXED_MARKER "END OF DOCUMENT"

static cchar *wsHost = "127.0.0.1";
static int   wsPort = 4100;

/************************************ Code ************************************/

static void wsInit(void)
{
    wsPort = tgeti("TM_HTTP_PORT", 4100);
}


/*
    Return the numeric status from the response line, or 0 if there is no response line.

    Searching the whole response for "101" is not a status check. The response to a request the
    upgrade was correctly refused for is an ordinary 200 whose ETag, Content-Length, Date and body
    are all digits, and ETag is inode + size + mtime, so whether those digits happen to spell 101 is
    decided by the machine the test runs on. It did on a CI runner.
 */
static int wsStatus(cchar *response)
{
    cchar *cp;

    if (!sstarts(response, "HTTP/")) {
        return 0;
    }
    if ((cp = schr(response, ' ')) == 0) {
        return 0;
    }
    return (int) stoi(cp + 1);
}


/*
    Open a connection and send a handshake. Returns the connected socket with the handshake response
    already read into response, or NULL if the connection could not be made. A null key or version
    omits that header, which is how the negative handshake cases are expressed.
 */
static MprSocket *wsHandshake(cchar *path, cchar *key, cchar *version, char *response, ssize size)
{
    MprSocket *sp;
    char      request[1024];
    ssize     len;

    response[0] = '\0';
    if ((sp = mprCreateSocket()) == 0) {
        return 0;
    }
    mprAddRoot(sp);
    if (mprConnectSocket(sp, wsHost, wsPort, 0) < 0) {
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
        path, wsHost, wsPort,
        key ? sfmt("Sec-WebSocket-Key: %s\r\n", key) : "",
        version ? sfmt("Sec-WebSocket-Version: %s\r\n", version) : "");

    mprWriteSocket(sp, request, slen(request));

    len = 0;
    if (mprWaitForSingleIO((int) sp->fd, MPR_READABLE, WS_FIRST_WAIT) > 0) {
        len = mprReadSocket(sp, response, size - 1);
        if (len < 0) {
            len = 0;
        }
    }
    response[len] = '\0';
    return sp;
}


static void wsCloseSocket(MprSocket *sp)
{
    if (sp) {
        mprCloseSocket(sp, 0);
        mprRemoveRoot(sp);
    }
}


/*
    Open an upgraded WebSocket on "path", asserting the upgrade succeeded. The usual starting point:
    a test about frames should fail on its frame assertion, not silently proceed from a connection
    that was never upgraded.
 */
static MprSocket *wsOpen(cchar *path)
{
    MprSocket *sp;
    char      response[WS_MAX_RESPONSE];

    sp = wsHandshake(path, WS_TEST_KEY, "13", response, sizeof(response));
    ttrue(sp != 0, "must connect to %s", path);
    if (wsStatus(response) != 101) {
        /*
            Print what came back. A bare "must upgrade" failure is the least informative thing this
            file can say: the interesting cases are a 503 from LimitWebSockets and a 406 from a
            monitor ban, and they are indistinguishable without the response.
         */
        tinfo("Upgrade of %s failed. Response:\n%s", path, response);
    }
    teqi(wsStatus(response), 101, "%s must upgrade before a frame test can mean anything", path);
    return sp;
}


/*
    Write one frame.

    Every parameter that a conforming client would not vary is a parameter here, because the point of
    these tests is to send what a conforming client would not: a control frame without FIN, a
    reserved opcode, a 64-bit length with the high bit set, an unmasked client frame.

    declaredLen overrides the length written into the header while len stays the number of payload
    bytes actually sent. That separation is what lets a test declare a length it does not intend to
    honour -- otherwise the header and the body could never disagree, and disagreement is the whole
    class of defect being probed.
 */
static void wsWriteFrame(MprSocket *sp, int opcode, int fin, int rsv, int masked, int lenForm,
                         uint64 declaredLen, cchar *payload, ssize len)
{
    uchar  *frame;
    uchar  mask[4];
    uint64 declared;
    ssize  i, n;
    int    form;

    declared = declaredLen ? declaredLen : (uint64) len;

    form = lenForm;
    if (form == WS_LEN_AUTO) {
        form = (declared < 126) ? WS_LEN_7 : (declared <= 0xffff ? WS_LEN_16 : WS_LEN_64);
    }
    /*
        malloc, not mprAlloc. The frame buffer is not reachable from any GC root, and mprWriteSocket
        can yield -- so a collection during the write is free to reclaim it underneath us. That is
        not theoretical: allocating this with mprAlloc segfaulted the run after every assertion had
        already passed, which is the most confusing possible way for it to fail.
     */
    if ((frame = malloc((size_t) len + 32)) == 0) {
        ttrue(0, "test frame allocation must succeed");
        return;
    }
    mask[0] = 0x37; mask[1] = 0xfa; mask[2] = 0x21; mask[3] = 0x3d;

    n = 0;
    frame[n++] = (uchar) ((fin ? 0x80 : 0) | ((rsv & 0x7) << 4) | (opcode & 0x0f));

    if (form == WS_LEN_7) {
        frame[n++] = (uchar) ((masked ? 0x80 : 0) | (declared & 0x7f));
    } else if (form == WS_LEN_16) {
        frame[n++] = (uchar) ((masked ? 0x80 : 0) | 126);
        frame[n++] = (uchar) ((declared >> 8) & 0xff);
        frame[n++] = (uchar) (declared & 0xff);
    } else {
        frame[n++] = (uchar) ((masked ? 0x80 : 0) | 127);
        for (i = 7; i >= 0; i--) {
            frame[n++] = (uchar) ((declared >> (i * 8)) & 0xff);
        }
    }
    if (masked) {
        for (i = 0; i < 4; i++) {
            frame[n++] = mask[i];
        }
    }
    for (i = 0; i < len; i++) {
        frame[n++] = (uchar) (masked ? ((uchar) payload[i] ^ mask[i % 4]) : (uchar) payload[i]);
    }
    mprWriteSocket(sp, (char*) frame, n);
    free(frame);
}


//  A well-formed masked client text frame, which is what a conforming client sends
static void wsText(MprSocket *sp, cchar *payload)
{
    wsWriteFrame(sp, WS_MSG_TEXT, 1, 0, 1, WS_LEN_AUTO, 0, payload, slen(payload));
}


static void wsBinary(MprSocket *sp, cchar *payload, ssize len)
{
    wsWriteFrame(sp, WS_MSG_BINARY, 1, 0, 1, WS_LEN_AUTO, 0, payload, len);
}


static void wsPing(MprSocket *sp, cchar *payload)
{
    wsWriteFrame(sp, WS_MSG_PING, 1, 0, 1, WS_LEN_AUTO, 0, payload, slen(payload));
}


/*
    A close frame carrying a status and an optional reason, in the RFC 6455 5.5.1 layout: two bytes
    of network-order status followed by the reason text. Pass status 0 for an empty close.
 */
static void wsCloseFrame(MprSocket *sp, int status, cchar *reason)
{
    char  payload[256];
    ssize len;

    if (status == 0) {
        wsWriteFrame(sp, WS_MSG_CLOSE, 1, 0, 1, WS_LEN_AUTO, 0, "", 0);
        return;
    }
    payload[0] = (char) ((status >> 8) & 0xff);
    payload[1] = (char) (status & 0xff);
    len = 2;
    if (reason) {
        len += scopy(&payload[2], sizeof(payload) - 2, reason);
    }
    wsWriteFrame(sp, WS_MSG_CLOSE, 1, 0, 1, WS_LEN_AUTO, 0, payload, len);
}


/*
    Read whatever the server sends next, up to size bytes. Returns the byte count.
 */
static ssize wsRead(MprSocket *sp, uchar *buf, ssize size)
{
    MprTicks wait;
    ssize    len, nbytes;

    len = 0;
    while (len < size - 1) {
        wait = (len == 0) ? WS_FIRST_WAIT : WS_TAIL_WAIT;
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


//  Opcode of the first frame in a reply buffer, or -1 if there is no frame
static int wsOpcode(uchar *buf, ssize len)
{
    return (len >= 2) ? (buf[0] & 0x0f) : -1;
}


/*
    Payload offset and length of the first frame in a reply buffer. Server frames are never masked,
    so there is no mask key to step over -- which is itself asserted where it matters.
 */
static ssize wsPayload(uchar *buf, ssize len, ssize *offset)
{
    ssize  payloadLen;
    ssize  n;
    int    i;

    *offset = 0;
    if (len < 2) {
        return -1;
    }
    payloadLen = buf[1] & 0x7f;
    n = 2;
    if (payloadLen == 126) {
        if (len < 4) {
            return -1;
        }
        payloadLen = ((ssize) buf[2] << 8) | (ssize) buf[3];
        n = 4;
    } else if (payloadLen == 127) {
        if (len < 10) {
            return -1;
        }
        payloadLen = 0;
        for (i = 2; i < 10; i++) {
            payloadLen = (payloadLen << 8) | (ssize) buf[i];
        }
        n = 10;
    }
    if (buf[1] & 0x80) {
        n += 4;
    }
    *offset = n;
    return payloadLen;
}


/*
    Scan a reply buffer of concatenated frames for a close, and return its status. -1 if there is none.

    Needed because a refusal is not always the first thing to arrive. A route with a small
    LimitWebSocketsPacket hands the handler each packet as it is reassembled, so a handler that echoes
    has already answered some of a message by the time a later frame is refused: the stream reads
    data, data, data, close. Reading only the first frame there tests nothing -- it sees an echo
    whether the refusal happens or not.

    Use this where partial delivery before the refusal is correct. Where nothing at all should have
    been delivered, read the first frame and require it to be the close, which is a stronger claim.
 */
static int wsScanClose(uchar *buf, ssize len)
{
    ssize offset, payloadLen;
    ssize i;

    for (i = 0; i + 2 <= len; ) {
        if ((payloadLen = wsPayload(&buf[i], len - i, &offset)) < 0) {
            break;
        }
        if ((i + offset + payloadLen) > len) {
            break;
        }
        if ((buf[i] & 0x0f) == WS_MSG_CLOSE) {
            return (payloadLen >= 2) ? (((int) buf[i + offset] << 8) | (int) buf[i + offset + 1]) : 0;
        }
        i += offset + payloadLen;
    }
    return -1;
}


/*
    The close status carried by a close frame, or -1 if the frame is not a close or carries none.
 */
static int wsCloseStatus(uchar *buf, ssize len)
{
    ssize offset, payloadLen;

    if (wsOpcode(buf, len) != WS_MSG_CLOSE) {
        return -1;
    }
    if ((payloadLen = wsPayload(buf, len, &offset)) < 2 || len < offset + 2) {
        return -1;
    }
    return ((int) buf[offset] << 8) | (int) buf[offset + 1];
}


#endif /* _h_WSCLIENT */

/*
    Copyright (c) Embedthis Software. All Rights Reserved.
    This software is distributed under a commercial license. Consult the LICENSE.md
    distributed with this software for full details and copyrights.
 */

