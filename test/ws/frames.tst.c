/*
    frames.tst.c - WebSocket handshake and frame-length ratchet

    test/appweb.conf configures <Route ^/ws/> with the webSocketFilter and testWebSocketsHandler, and
    no test targeted it (10065). The only WebSocket tests in the suite reached that handler through
    the proxy backend in proxy.conf, so the upgrade and framing paths on the primary endpoint were
    unexercised. http/src/webSockFilter.c is 1,243 lines.

    Native rather than TypeScript because the subject is bytes on the wire. The Ejscript client cannot
    write a binary frame -- a frame header carries octets above 0x7f, which the shim UTF-8 encodes and
    thereby corrupts -- and never delivers onmessage, which is why proxy/websockets-1.tst.ts asserts
    only open and close.

    The socket helpers this used to carry are now in wsclient.h, shared with close.tst.c,
    control.tst.c, message.tst.c and flow.tst.c. Nothing about the assertions below changed in the
    move, which is the only way to know the extraction was faithful.

    src/modules/testWebSocketsHandler.c replies to any inbound message with a fixed document of digit
    lines terminated by "END OF DOCUMENT", so the reply is a known quantity.

    Copyright (c) All Rights Reserved. See details at the end of the file.
 */

/********************************* Includes ***********************************/

#include "wsclient.h"

/*********************************** Locals ***********************************/

#define LARGE_64_LEN 65536

/************************************ Code ************************************/

static void expectCloseAfterDeclaredLength(uint64 declaredLength, cchar *message)
{
    MprSocket *sp;
    uchar     frame[WS_MAX_RESPONSE];
    ssize     len;

    sp = wsOpen(WS_FIXED_PATH);

    /*
        Only the header, with no payload behind the declared length. An invalid declaration must be
        rejected from the control fields alone; a server that waited for the payload it was promised
        would hang here rather than answer.
     */
    wsWriteFrame(sp, WS_MSG_TEXT, 1, 0, 1, WS_LEN_64, declaredLength, "", 0);
    len = wsRead(sp, frame, sizeof(frame));
    ttrue(len > 0, "%s", message);
    teqi(wsOpcode(frame, len), WS_MSG_CLOSE, "invalid frame length must receive a close frame");
    wsCloseSocket(sp);

    sp = wsOpen(WS_FIXED_PATH);
    ttrue(sp != 0, "invalid frame length must not wedge the websocket route");
    wsCloseSocket(sp);
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
    wsInit();
    /*
        malloc, not mprAlloc, for every buffer that outlives a socket call. See wsclient.h: MPR's
        collector does not scan the C stack, and mprReadSocket and mprWriteSocket both yield to it, so
        an mprAlloc'd buffer held only in a local is free to be reclaimed while it is being written
        through. This cost an afternoon: the run segfaulted in sweeperThread after every assertion had
        already passed, and the corrupted block header held the digits of the handler's own document.
     */
    response = malloc(WS_MAX_RESPONSE);
    frame = malloc(WS_MAX_RESPONSE);
    ttrue(response != 0 && frame != 0, "test buffers must allocate");

    /*
        The upgrade completes on the primary endpoint, not only through the proxy.
     */
    sp = wsHandshake(WS_FIXED_PATH, WS_TEST_KEY, "13", response, WS_MAX_RESPONSE);
    ttrue(sp != 0, "must connect to the websocket route");
    teqi(wsStatus(response), 101, "a valid handshake must be upgraded");
    tcontains(response, "Sec-WebSocket-Accept:", "the upgrade must carry an accept token");

    /*
        The accept token is derived from the key, so it must be present and must differ from the key
        echoed back. Its exact value is a SHA1 this test does not recompute: that the server derives
        something from the key is the property under test.
     */
    if ((cp = scontains(response, "Sec-WebSocket-Accept:")) != 0) {
        cp += slen("Sec-WebSocket-Accept:");
        while (*cp == ' ') cp++;
        if ((end = scontains(cp, "\r\n")) != 0) {
            accept = snclone(cp, end - cp);
            ttrue(slen(accept) > 0, "accept token must not be empty");
            ttrue(!smatch(accept, WS_TEST_KEY), "accept token must not be the key echoed back");
        }
    }

    /*
        The handler answers a text message with a well formed, unmasked text frame.
     */
    wsText(sp, "hello");
    len = wsRead(sp, frame, WS_MAX_RESPONSE);
    ttrue(len > 0, "the handler must answer a text frame");
    teqi(wsOpcode(frame, len), WS_MSG_TEXT, "reply opcode must be text");
    teqi(frame[0] & 0x80, 0x80, "reply must have FIN set");
    teqi(frame[1] & 0x80, 0, "server frames must not be masked");
    ttrue(scontains((char*) frame, WS_FIXED_MARKER) != 0, "reply must carry the handler document");
    wsCloseSocket(sp);

    /*
        A valid extended-length frame is accepted and answered.
     */
    for (i = 0; i < (int) sizeof(extendedPayload); i++) {
        extendedPayload[i] = 'a';
    }
    sp = wsOpen(WS_FIXED_PATH);
    wsWriteFrame(sp, WS_MSG_TEXT, 1, 0, 1, WS_LEN_16, 0, extendedPayload, sizeof(extendedPayload));
    len = wsRead(sp, frame, WS_MAX_RESPONSE);
    ttrue(len > 0, "the handler must answer a valid 16-bit extended length frame");
    teqi(wsOpcode(frame, len), WS_MSG_TEXT, "extended-length reply opcode must be text");
    ttrue(scontains((char*) frame, WS_FIXED_MARKER) != 0,
        "extended-length reply must carry the handler document");
    wsCloseSocket(sp);

    /*
        A valid 64-bit extended-length frame above the 16-bit range is accepted and answered.
     */
    largePayload = malloc(LARGE_64_LEN);
    ttrue(largePayload != 0, "test payload allocation must succeed");
    for (i = 0; i < LARGE_64_LEN; i++) {
        largePayload[i] = 'a';
    }
    sp = wsOpen(WS_FIXED_PATH);
    wsWriteFrame(sp, WS_MSG_BINARY, 1, 0, 1, WS_LEN_64, 0, largePayload, LARGE_64_LEN);
    len = wsRead(sp, frame, WS_MAX_RESPONSE);
    ttrue(len > 0, "the handler must answer a valid 64-bit extended length frame");
    teqi(wsOpcode(frame, len), WS_MSG_TEXT, "64-bit extended-length reply opcode must be text");
    ttrue(scontains((char*) frame, WS_FIXED_MARKER) != 0,
        "64-bit extended-length reply must carry the handler document");
    wsCloseSocket(sp);
    free(largePayload);

    /*
        RFC 6455 5.2: the most significant bit of a 64-bit payload length must be zero. The parser
        must also reject lengths wider than ssize before storing frameLength.
     */
    expectCloseAfterDeclaredLength(UINT64(1) << 63, "a 64-bit declared length with the high bit set must be rejected");
    expectCloseAfterDeclaredLength(UINT64(1) << 31, "a declared length above 2GB must be rejected before truncation");

    /*
        The upgrade is confined to the configured route.
     */
    sp = wsHandshake("/index.html", WS_TEST_KEY, "13", response, WS_MAX_RESPONSE);
    tneqi(wsStatus(response), 101, "a path outside /ws/ must not be upgraded");
    wsCloseSocket(sp);

    /*
        A handshake missing the key is not a handshake.
     */
    sp = wsHandshake(WS_FIXED_PATH, 0, "13", response, WS_MAX_RESPONSE);
    tneqi(wsStatus(response), 101, "a handshake without a key must be refused");
    wsCloseSocket(sp);

    /*
        RFC 6455 4.2.1: only version 13 is defined. An older draft version must be refused.
     */
    sp = wsHandshake(WS_FIXED_PATH, WS_TEST_KEY, "7", response, WS_MAX_RESPONSE);
    tneqi(wsStatus(response), 101, "an unsupported websocket version must be refused");
    wsCloseSocket(sp);

    /*
        A second connection succeeds after the first has closed, so the route is not left wedged.
     */
    sp = wsOpen(WS_FIXED_PATH);
    wsText(sp, "again");
    len = wsRead(sp, frame, WS_MAX_RESPONSE);
    ttrue(len > 0, "the second connection must be served too");
    wsCloseSocket(sp);

    free(response);
    free(frame);
    mprDestroy();
    return 0;
}

/*
    Copyright (c) Embedthis Software. All Rights Reserved.
    This software is distributed under a commercial license. Consult the LICENSE.md
    distributed with this software for full details and copyrights.
 */
