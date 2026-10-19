/*
    message.tst.c - WebSocket message framing: fragmentation, opcodes, UTF-8 and size limits

    Everything above a single unfragmented frame. frames.tst.c covers one frame at a time and the
    length encodings; this covers what happens when a message spans several, when the opcode sequence
    is wrong, when the text is not text, and when the message is bigger than the route allows.

    Fragmentation is the part with real state behind it. The filter has to remember the type of the
    message in progress, refuse a continuation with nothing to continue, refuse a new data frame while
    a message is open, and reassemble the payload across frames -- four rules, no test.

    The /wsecho route echoes what it receives, so reassembly can be checked against the bytes rather
    than inferred from the fact that something came back. /ws/echo answers a fixed document regardless
    of the payload, which is why the older tests could not check this.

    Copyright (c) All Rights Reserved. See details at the end of the file.
 */

#include "wsclient.h"

/*
    Read one reply and return its close status, or -1 if it was not a close.
 */
static int closeStatusOf(MprSocket *sp, uchar *frame, ssize size)
{
    ssize len;

    if ((len = wsRead(sp, frame, size)) <= 0) {
        return -1;
    }
    if (wsOpcode(frame, len) != WS_MSG_CLOSE) {
        return -2;
    }
    return wsCloseStatus(frame, len);
}


/*
    Assert the echoed reply carries exactly "expected".
 */
static void expectEcho(MprSocket *sp, uchar *frame, ssize size, cchar *expected, cchar *what)
{
    ssize len, offset, payloadLen;

    len = wsRead(sp, frame, size);
    ttrue(len > 0, "%s must be answered", what);
    teqi(wsOpcode(frame, len), WS_MSG_TEXT, "%s must be answered with a text frame", what);
    payloadLen = wsPayload(frame, len, &offset);
    teqi((int) payloadLen, (int) slen(expected), "%s must echo %d bytes", what, (int) slen(expected));
    ttrue(payloadLen == (ssize) slen(expected) &&
          sncmp((char*) &frame[offset], expected, payloadLen) == 0, "%s must echo its payload", what);
}


int main(int argc, char **argv)
{
    MprSocket *sp;
    uchar     *frame;
    char      *big;
    ssize     len;
    int       i, status;

    mprCreate(argc, argv, 0);
    mprStart();
    wsInit();
    frame = malloc(WS_MAX_RESPONSE);

    /*
        The baseline: an unfragmented message is echoed byte for byte. Without this the fragmentation
        cases below could not distinguish "reassembly is broken" from "the echo route does not echo".
     */
    sp = wsOpen(WS_ECHO_PATH);
    wsText(sp, "unfragmented");
    expectEcho(sp, frame, WS_MAX_RESPONSE, "unfragmented", "an unfragmented message");
    wsCloseSocket(sp);

    /*
        Two fragments: a text frame with FIN clear, then a continuation with FIN set. The reply must
        be the whole message, once -- not two replies, and not the last fragment.
     */
    sp = wsOpen(WS_ECHO_PATH);
    wsWriteFrame(sp, WS_MSG_TEXT, 0, 0, 1, WS_LEN_AUTO, 0, "one-", 4);
    wsWriteFrame(sp, WS_MSG_CONT, 1, 0, 1, WS_LEN_AUTO, 0, "two", 3);
    expectEcho(sp, frame, WS_MAX_RESPONSE, "one-two", "a two-fragment message");
    wsCloseSocket(sp);

    //  Three fragments, so the middle continuation is a case and not just the terminating one
    sp = wsOpen(WS_ECHO_PATH);
    wsWriteFrame(sp, WS_MSG_TEXT, 0, 0, 1, WS_LEN_AUTO, 0, "alpha-", 6);
    wsWriteFrame(sp, WS_MSG_CONT, 0, 0, 1, WS_LEN_AUTO, 0, "beta-", 5);
    wsWriteFrame(sp, WS_MSG_CONT, 1, 0, 1, WS_LEN_AUTO, 0, "gamma", 5);
    expectEcho(sp, frame, WS_MAX_RESPONSE, "alpha-beta-gamma", "a three-fragment message");
    wsCloseSocket(sp);

    //  An empty final fragment is legal and must terminate the message rather than be dropped
    sp = wsOpen(WS_ECHO_PATH);
    wsWriteFrame(sp, WS_MSG_TEXT, 0, 0, 1, WS_LEN_AUTO, 0, "body", 4);
    wsWriteFrame(sp, WS_MSG_CONT, 1, 0, 1, WS_LEN_AUTO, 0, "", 0);
    expectEcho(sp, frame, WS_MAX_RESPONSE, "body", "a message ending in an empty continuation");
    wsCloseSocket(sp);

    /*
        A continuation with no message in progress. RFC 6455 5.4: there is nothing to continue, and a
        receiver that accepted it would be inventing a message the sender never framed.
     */
    sp = wsOpen(WS_ECHO_PATH);
    wsWriteFrame(sp, WS_MSG_CONT, 1, 0, 1, WS_LEN_AUTO, 0, "orphan", 6);
    teqi(closeStatusOf(sp, frame, WS_MAX_RESPONSE), WS_STATUS_PROTOCOL_ERROR,
         "a continuation with no prior message must be refused");
    wsCloseSocket(sp);

    /*
        And the other way round: a new data frame while a message is still open. The sender has
        abandoned a message mid-flight, and the two ends would disagree about where it ended.
     */
    sp = wsOpen(WS_ECHO_PATH);
    wsWriteFrame(sp, WS_MSG_TEXT, 0, 0, 1, WS_LEN_AUTO, 0, "open", 4);
    wsWriteFrame(sp, WS_MSG_TEXT, 1, 0, 1, WS_LEN_AUTO, 0, "interrupt", 9);
    teqi(closeStatusOf(sp, frame, WS_MAX_RESPONSE), WS_STATUS_PROTOCOL_ERROR,
         "a data frame during an open message must be refused");
    wsCloseSocket(sp);

    /*
        RFC 6455 5.2: RSV1, RSV2 and RSV3 must be zero unless an extension negotiated them, and no
        extension is negotiated here. A receiver that ignored them could not later add an extension
        without ambiguity.
     */
    for (i = 1; i <= 7; i++) {
        sp = wsOpen(WS_ECHO_PATH);
        wsWriteFrame(sp, WS_MSG_TEXT, 1, i, 1, WS_LEN_AUTO, 0, "rsv", 3);
        status = closeStatusOf(sp, frame, WS_MAX_RESPONSE);
        if (status != WS_STATUS_PROTOCOL_ERROR) {
            tinfo("reserved bits %d were answered with %d", i, status);
        }
        teqi(status, WS_STATUS_PROTOCOL_ERROR, "reserved bits %d must be refused", i);
        wsCloseSocket(sp);
    }

    /*
        Text must be valid UTF-8 (RFC 6455 5.6). 0xC3 opens a two-byte sequence that 0x28 does not
        complete -- a broken encoding rather than merely a non-ASCII byte, which is the distinction a
        validator exists to make.
     */
    sp = wsOpen(WS_ECHO_PATH);
    wsWriteFrame(sp, WS_MSG_TEXT, 1, 0, 1, WS_LEN_AUTO, 0, "bad \xC3\x28 utf8", 13);
    teqi(closeStatusOf(sp, frame, WS_MAX_RESPONSE), WS_STATUS_INVALID_UTF8,
         "invalid UTF-8 in a text message must be refused with 1007");
    wsCloseSocket(sp);

    //  Valid multi-byte UTF-8 must be echoed, so the case above is about the encoding and not the bytes
    sp = wsOpen(WS_ECHO_PATH);
    wsWriteFrame(sp, WS_MSG_TEXT, 1, 0, 1, WS_LEN_AUTO, 0, "caf\xC3\xA9", 5);
    expectEcho(sp, frame, WS_MAX_RESPONSE, "caf\xC3\xA9", "a valid UTF-8 text message");
    wsCloseSocket(sp);

    /*
        A binary message carries no such constraint: the same bytes that are invalid as text are
        ordinary data. A filter that validated binary payloads would break every binary protocol.
     */
    sp = wsOpen(WS_ECHO_PATH);
    wsWriteFrame(sp, WS_MSG_BINARY, 1, 0, 1, WS_LEN_AUTO, 0, "bad \xC3\x28 bytes", 14);
    len = wsRead(sp, frame, WS_MAX_RESPONSE);
    ttrue(len > 0, "a binary message must be answered");
    teqi(wsOpcode(frame, len), WS_MSG_BINARY, "invalid UTF-8 must be legal in a binary message");
    wsCloseSocket(sp);

    /*
        RFC 6455 requires masking on all client frames.
     */
    sp = wsOpen(WS_ECHO_PATH);
    wsWriteFrame(sp, WS_MSG_TEXT, 1, 0, 0, WS_LEN_AUTO, 0, "unmasked", 8);
    teqi(closeStatusOf(sp, frame, WS_MAX_RESPONSE), WS_STATUS_PROTOCOL_ERROR,
         "an unmasked client frame must be refused");
    wsCloseSocket(sp);

    /*
        LimitWebSocketsMessage. /wslimit caps a message at 4K, so this costs kilobytes rather than the
        2MB the echo route allows.

        Under the cap is echoed; over it is refused with 1009. The two together are what make this a
        test of the limit rather than of large messages.
     */
    big = malloc(8192 + 1);
    memset(big, 'm', 8192);
    big[8192] = '\0';

    sp = wsOpen(WS_LIMIT_PATH);
    wsWriteFrame(sp, WS_MSG_BINARY, 1, 0, 1, WS_LEN_AUTO, 0, big, 2048);
    len = wsRead(sp, frame, WS_MAX_RESPONSE);
    ttrue(len > 0, "a message under LimitWebSocketsMessage must be answered");
    teqi(wsOpcode(frame, len), WS_MSG_BINARY, "a message under the limit must be echoed");
    wsCloseSocket(sp);

    sp = wsOpen(WS_LIMIT_PATH);
    wsWriteFrame(sp, WS_MSG_BINARY, 1, 0, 1, WS_LEN_AUTO, 0, big, 8192);
    status = closeStatusOf(sp, frame, WS_MAX_RESPONSE);
    if (status != WS_STATUS_MESSAGE_TOO_LARGE) {
        tinfo("a message over LimitWebSocketsMessage was answered with %d", status);
    }
    teqi(status, WS_STATUS_MESSAGE_TOO_LARGE, "a message over LimitWebSocketsMessage must be refused");
    wsCloseSocket(sp);

    /*
        Fragments must respect the total message limit. Earlier packets may be echoed before rejection,
        so require a close and an incomplete echo rather than requiring close as the first frame.
     */
    sp = wsOpen(WS_LIMIT_PATH);
    wsWriteFrame(sp, WS_MSG_BINARY, 0, 0, 1, WS_LEN_AUTO, 0, big, 2048);
    wsWriteFrame(sp, WS_MSG_CONT, 0, 0, 1, WS_LEN_AUTO, 0, big, 2048);
    wsWriteFrame(sp, WS_MSG_CONT, 1, 0, 1, WS_LEN_AUTO, 0, big, 2048);
    len = wsRead(sp, frame, WS_MAX_RESPONSE);
    ttrue(len > 0, "the fragmented over-limit message must be answered");
    status = wsScanClose(frame, len);
    if (status != WS_STATUS_MESSAGE_TOO_LARGE) {
        tinfo("fragments totalling over LimitWebSocketsMessage were answered with %d in %zd bytes",
              status, len);
    }
    teqi(status, WS_STATUS_MESSAGE_TOO_LARGE,
         "fragments totalling over LimitWebSocketsMessage must be refused");
    ttrue(len < 6144, "the over-limit message must be refused before all of it is echoed back");
    wsCloseSocket(sp);


    sp = wsOpen(WS_LIMIT_PATH);
    wsWriteFrame(sp, WS_MSG_BINARY, 0, 0, 1, WS_LEN_AUTO, 0, big, 1024);
    wsWriteFrame(sp, WS_MSG_CONT, 1, 0, 1, WS_LEN_AUTO, 0, big, 1024);
    len = wsRead(sp, frame, WS_MAX_RESPONSE);
    ttrue(len > 0, "fragments under LimitWebSocketsMessage must be answered");
    teqi(wsOpcode(frame, len), WS_MSG_BINARY, "fragments under LimitWebSocketsMessage must be accepted");
    wsCloseSocket(sp);

    //  And the route still serves afterwards
    sp = wsOpen(WS_ECHO_PATH);
    wsText(sp, "still here");
    expectEcho(sp, frame, WS_MAX_RESPONSE, "still here", "the echo route after the message ratchet");
    wsCloseSocket(sp);

    free(big);
    free(frame);
    mprDestroy();
    return 0;
}

/*
    Copyright (c) Embedthis Pty Ltd. All Rights Reserved.
    This software is distributed under a commercial license. Consult the LICENSE.md
    distributed with this software for full details and copyrights.
 */
