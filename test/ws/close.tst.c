/*
    close.tst.c - The WebSocket close handshake

    Nothing in the suite had ever sent a close frame. frames.tst.c opens connections and drops them;
    websockets.tst.ts drives the Ejscript client, whose close() closes the socket rather than
    completing the handshake. So the entire WS_MSG_CLOSE arm of webSockFilter.c was unexercised: the
    status validation, the UTF-8 check on the reason, and the acknowledgement itself.

    The status validation is the substance. RFC 6455 7.4.1 reserves several ranges, and the filter
    refuses "1004, 1005, 1006, 1012-1016, 2000-2999" plus anything below 1000 or at 5000 and above --
    its own comment calls the specification hideous, which is a fair reason to want the ranges pinned
    rather than re-derived by the next reader.

    A refusal here is observable: processWebSocketFrame returns a status, the filter sends a close
    carrying it and finalizes. So each case asserts the close status the server chose, not merely
    that something went wrong.

    Copyright (c) All Rights Reserved. See details at the end of the file.
 */

#include "wsclient.h"

/*
    Send a close and return the status of the close the server sends back, or -1 if it sent nothing
    or sent something other than a close.
 */
static int closeWith(cchar *path, int status, cchar *reason)
{
    MprSocket *sp;
    uchar     *frame;
    ssize     len;
    int       replyStatus;

    frame = malloc(WS_MAX_RESPONSE);
    sp = wsOpen(path);
    wsCloseFrame(sp, status, reason);
    len = wsRead(sp, frame, WS_MAX_RESPONSE);
    replyStatus = (len > 0) ? wsCloseStatus(frame, len) : -1;
    if (len > 0 && wsOpcode(frame, len) != WS_MSG_CLOSE) {
        replyStatus = -2;
    }
    wsCloseSocket(sp);
    free(frame);
    return replyStatus;
}


int main(int argc, char **argv)
{
    MprSocket *sp;
    uchar     *frame;
    ssize     len, offset, payloadLen;
    int       i, status, valid[] = {1000, 1001, 1002, 1003, 1007, 1008, 1009, 1010, 1011, 3000, 4999, 0};
    int       invalid[] = {1, 999, 1004, 1005, 1006, 1012, 1013, 1016, 1100, 2000, 2999, 5000, 65535, 0};

    mprCreate(argc, argv, 0);
    mprStart();
    wsInit();
    frame = malloc(WS_MAX_RESPONSE);

    /*
        An empty close -- no status at all -- is legal (RFC 6455 5.5.1) and must be acknowledged. The
        filter records WS_STATUS_OK for it and answers with its own close.
     */
    teqi(closeWith(WS_ECHO_PATH, 0, 0), WS_STATUS_OK, "an empty close must be acknowledged with 1000");

    /*
        A close carrying a valid status and a reason. The server echoes its own OK rather than the
        client's status -- httpSendClose(stream, WS_STATUS_OK, "OK") -- which is worth pinning because
        it looks like an echo and is not one.
     */
    teqi(closeWith(WS_ECHO_PATH, WS_STATUS_OK, "done"), WS_STATUS_OK,
         "a close with a status and reason must be acknowledged");

    /*
        RFC 6455 5.5.1: a close payload is either empty or at least two bytes. One byte cannot carry a
        status and must be a protocol error rather than a truncated read.
     */
    sp = wsOpen(WS_ECHO_PATH);
    wsWriteFrame(sp, WS_MSG_CLOSE, 1, 0, 1, WS_LEN_AUTO, 0, "\x03", 1);
    len = wsRead(sp, frame, WS_MAX_RESPONSE);
    ttrue(len > 0, "a one-byte close must be answered");
    teqi(wsOpcode(frame, len), WS_MSG_CLOSE, "a one-byte close must be answered with a close");
    teqi(wsCloseStatus(frame, len), WS_STATUS_PROTOCOL_ERROR, "a one-byte close is a protocol error");
    wsCloseSocket(sp);

    /*
        Every status the filter accepts is acknowledged with 1000.
     */
    for (i = 0; valid[i]; i++) {
        status = closeWith(WS_ECHO_PATH, valid[i], "bye");
        if (status != WS_STATUS_OK) {
            tinfo("close status %d was answered with %d", valid[i], status);
        }
        teqi(status, WS_STATUS_OK, "close status %d must be accepted", valid[i]);
    }

    /*
        And every status it reserves is refused with 1002. Below 1000, the four reserved codes the RFC
        forbids on the wire, the 1012-1016 range, 1100-2999, and 5000 and above.
     */
    for (i = 0; invalid[i]; i++) {
        status = closeWith(WS_ECHO_PATH, invalid[i], 0);
        if (status != WS_STATUS_PROTOCOL_ERROR) {
            tinfo("close status %d was answered with %d", invalid[i], status);
        }
        teqi(status, WS_STATUS_PROTOCOL_ERROR, "close status %d must be refused", invalid[i]);
    }

    /*
        The close reason is text and must be valid UTF-8. 0xC3 begins a two-byte sequence and 0x28 is
        not a continuation byte, so this is a truncated sequence rather than a byte that is merely
        non-ASCII -- the distinction a validator has to make.
     */
    sp = wsOpen(WS_ECHO_PATH);
    wsCloseFrame(sp, WS_STATUS_OK, "bad \xC3\x28 utf8");
    len = wsRead(sp, frame, WS_MAX_RESPONSE);
    ttrue(len > 0, "a close with an invalid reason must be answered");
    teqi(wsCloseStatus(frame, len), WS_STATUS_INVALID_UTF8, "an invalid UTF-8 close reason must be 1007");
    wsCloseSocket(sp);

    /*
        A close reason that is valid multi-byte UTF-8 must be accepted, so the case above is about the
        encoding being broken and not about the bytes being above ASCII.
     */
    teqi(closeWith(WS_ECHO_PATH, WS_STATUS_OK, "\xC3\xA9t\xC3\xA9"), WS_STATUS_OK,
         "a valid UTF-8 close reason must be accepted");

    /*
        The acknowledgement is a well-formed server frame: FIN set, unmasked, and carrying a two-byte
        status. Asserted once rather than in every case above, which only read the status out of it.
     */
    sp = wsOpen(WS_ECHO_PATH);
    wsCloseFrame(sp, WS_STATUS_GOING_AWAY, "leaving");
    len = wsRead(sp, frame, WS_MAX_RESPONSE);
    ttrue(len >= 4, "the close acknowledgement must carry a status");
    teqi(frame[0] & 0x80, 0x80, "the close acknowledgement must have FIN set");
    teqi(frame[1] & 0x80, 0, "server frames must not be masked");
    payloadLen = wsPayload(frame, len, &offset);
    ttrue(payloadLen >= 2, "the close acknowledgement payload must hold a status");
    wsCloseSocket(sp);

    /*
        After all of that the route still serves. A close handshake that left the filter's state
        machine wedged would show up here and nowhere else.
     */
    sp = wsOpen(WS_ECHO_PATH);
    wsText(sp, "still alive");
    len = wsRead(sp, frame, WS_MAX_RESPONSE);
    ttrue(len > 0, "the route must still serve after the close ratchet");
    teqi(wsOpcode(frame, len), WS_MSG_TEXT, "the echo must still answer with text");
    wsCloseSocket(sp);

    free(frame);
    mprDestroy();
    return 0;
}

/*
    Copyright (c) Embedthis Software. All Rights Reserved.
    This software is distributed under a commercial license. Consult the LICENSE.md
    distributed with this software for full details and copyrights.
 */
