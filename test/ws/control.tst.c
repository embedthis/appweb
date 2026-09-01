/*
    control.tst.c - WebSocket control frames: ping, pong and the rules that bind them

    Nothing in the suite had ever sent a ping. The filter answers one itself, without the handler ever
    seeing it, so the whole PING arm of processWebSocketFrame -- and the two constraints RFC 6455 5.5
    puts on control frames -- ran only in production.

    Those two constraints are why control frames get their own file. A control frame may carry at most
    125 bytes and may not be fragmented, and both rules exist so that a peer can always handle a
    control frame immediately, without buffering and without interrupting a message in flight. A
    server that let either slide would let a client interleave unbounded state into the middle of
    someone else's message.

    Copyright (c) All Rights Reserved. See details at the end of the file.
 */

#include "wsclient.h"

/*
    Send a frame the filter must refuse, and return the close status it answered with. -1 if it sent
    nothing, -2 if it sent something that was not a close.
 */
static int refuse(int opcode, int fin, cchar *payload, ssize len)
{
    MprSocket *sp;
    uchar     *frame;
    ssize     n;
    int       status;

    frame = malloc(WS_MAX_RESPONSE);
    sp = wsOpen(WS_ECHO_PATH);
    wsWriteFrame(sp, opcode, fin, 0, 1, WS_LEN_AUTO, 0, payload, len);
    n = wsRead(sp, frame, WS_MAX_RESPONSE);
    if (n <= 0) {
        status = -1;
    } else if (wsOpcode(frame, n) != WS_MSG_CLOSE) {
        status = -2;
    } else {
        status = wsCloseStatus(frame, n);
    }
    wsCloseSocket(sp);
    free(frame);
    return status;
}


int main(int argc, char **argv)
{
    MprSocket *sp;
    uchar     *frame;
    char      *big, *maxControl;
    ssize     len, offset, payloadLen;
    int       i, opcode;

    mprCreate(argc, argv, 0);
    mprStart();
    wsInit();
    frame = malloc(WS_MAX_RESPONSE);

    /*
        A ping is answered by a pong carrying the same payload (RFC 6455 5.5.2). The payload equality
        is the assertion that matters: a server that answered every ping with an empty pong would
        satisfy an opcode-only check and break every client that uses the payload to match its pings.
     */
    sp = wsOpen(WS_ECHO_PATH);
    wsPing(sp, "ping-payload");
    len = wsRead(sp, frame, WS_MAX_RESPONSE);
    ttrue(len > 0, "a ping must be answered");
    teqi(wsOpcode(frame, len), WS_MSG_PONG, "a ping must be answered with a pong");
    teqi(frame[1] & 0x80, 0, "server frames must not be masked");
    payloadLen = wsPayload(frame, len, &offset);
    teqi((int) payloadLen, (int) slen("ping-payload"), "the pong must carry the ping's payload length");
    ttrue(sncmp((char*) &frame[offset], "ping-payload", (ssize) payloadLen) == 0,
          "the pong must carry the ping's payload");
    wsCloseSocket(sp);

    //  An empty ping is still a ping
    sp = wsOpen(WS_ECHO_PATH);
    wsPing(sp, "");
    len = wsRead(sp, frame, WS_MAX_RESPONSE);
    ttrue(len > 0, "an empty ping must be answered");
    teqi(wsOpcode(frame, len), WS_MSG_PONG, "an empty ping must be answered with a pong");
    wsCloseSocket(sp);

    /*
        Exactly 125 bytes is the largest legal control payload, so it must be accepted -- otherwise
        the refusal below would be about large payloads rather than about the limit.
     */
    maxControl = malloc(WS_MAX_CONTROL + 1);
    memset(maxControl, 'p', WS_MAX_CONTROL);
    maxControl[WS_MAX_CONTROL] = '\0';

    sp = wsOpen(WS_ECHO_PATH);
    wsWriteFrame(sp, WS_MSG_PING, 1, 0, 1, WS_LEN_AUTO, 0, maxControl, WS_MAX_CONTROL);
    len = wsRead(sp, frame, WS_MAX_RESPONSE);
    ttrue(len > 0, "a 125-byte ping must be answered");
    teqi(wsOpcode(frame, len), WS_MSG_PONG, "a 125-byte ping is legal and must be answered with a pong");
    payloadLen = wsPayload(frame, len, &offset);
    teqi((int) payloadLen, WS_MAX_CONTROL, "the pong must carry all 125 bytes");
    wsCloseSocket(sp);

    /*
        126 bytes is one over, and must be refused. The frame is written with the 16-bit length form
        because that is what a 126-byte payload requires -- which is also how the filter can tell
        without reading the payload.
     */
    big = malloc(200);
    memset(big, 'p', 126);
    big[126] = '\0';
    teqi(refuse(WS_MSG_PING, 1, big, 126), WS_STATUS_PROTOCOL_ERROR,
         "a control frame over 125 bytes must be refused");

    //  And a close frame is a control frame too, so the same limit binds it
    teqi(refuse(WS_MSG_CLOSE, 1, big, 126), WS_STATUS_PROTOCOL_ERROR,
         "an oversized close frame must be refused");

    /*
        RFC 6455 5.5: a control frame may not be fragmented. FIN clear on a ping is the case, and a
        server that allowed it would have to buffer control state indefinitely.
     */
    teqi(refuse(WS_MSG_PING, 0, "frag", 4), WS_STATUS_PROTOCOL_ERROR,
         "a fragmented ping must be refused");
    teqi(refuse(WS_MSG_PONG, 0, "frag", 4), WS_STATUS_PROTOCOL_ERROR,
         "a fragmented pong must be refused");
    teqi(refuse(WS_MSG_CLOSE, 0, "\x03\xe8", 2), WS_STATUS_PROTOCOL_ERROR,
         "a fragmented close must be refused");

    /*
        Opcodes above pong (0xB to 0xF) are reserved for future control frames. RFC 6455 5.2 requires
        a receiver to fail the connection on one, rather than ignore it -- an ignored unknown control
        frame is a place for an intermediary and an endpoint to disagree about the stream.
     */
    for (opcode = 0xB; opcode <= 0xF; opcode++) {
        i = refuse(opcode, 1, "x", 1);
        if (i != WS_STATUS_PROTOCOL_ERROR) {
            tinfo("reserved control opcode 0x%x was answered with %d", opcode, i);
        }
        teqi(i, WS_STATUS_PROTOCOL_ERROR, "reserved control opcode 0x%x must be refused", opcode);
    }

    /*
        An unsolicited pong is legal and must be silently ignored (RFC 6455 5.5.3). Asserted by
        sending one and then a text message: the reply must be the echo of the text and not something
        provoked by the pong.
     */
    sp = wsOpen(WS_ECHO_PATH);
    wsWriteFrame(sp, WS_MSG_PONG, 1, 0, 1, WS_LEN_AUTO, 0, "unsolicited", 11);
    wsText(sp, "after-pong");
    len = wsRead(sp, frame, WS_MAX_RESPONSE);
    ttrue(len > 0, "a message after an unsolicited pong must still be answered");
    teqi(wsOpcode(frame, len), WS_MSG_TEXT, "an unsolicited pong must be ignored, not answered");
    payloadLen = wsPayload(frame, len, &offset);
    ttrue(sncmp((char*) &frame[offset], "after-pong", (ssize) payloadLen) == 0,
          "the reply must echo the text sent after the pong");
    wsCloseSocket(sp);

    /*
        A ping in the middle of a fragmented message must be answered without disturbing the message,
        which is the reason control frames are constrained in the first place. The pong comes back
        first; the echo of the reassembled message follows.
     */
    sp = wsOpen(WS_ECHO_PATH);
    wsWriteFrame(sp, WS_MSG_TEXT, 0, 0, 1, WS_LEN_AUTO, 0, "first-", 6);
    wsPing(sp, "mid");
    len = wsRead(sp, frame, WS_MAX_RESPONSE);
    ttrue(len > 0, "a ping interleaved in a fragmented message must be answered");
    teqi(wsOpcode(frame, len), WS_MSG_PONG, "the interleaved ping must be answered with a pong");

    wsWriteFrame(sp, WS_MSG_CONT, 1, 0, 1, WS_LEN_AUTO, 0, "second", 6);
    len = wsRead(sp, frame, WS_MAX_RESPONSE);
    ttrue(len > 0, "the interrupted message must still be delivered");
    teqi(wsOpcode(frame, len), WS_MSG_TEXT, "the interrupted message must arrive as text");
    payloadLen = wsPayload(frame, len, &offset);
    ttrue(sncmp((char*) &frame[offset], "first-second", (ssize) payloadLen) == 0,
          "the interleaved ping must not have corrupted the message");
    wsCloseSocket(sp);

    free(big);
    free(maxControl);
    free(frame);
    mprDestroy();
    return 0;
}

/*
    Copyright (c) Embedthis Software. All Rights Reserved.
    This software is distributed under a commercial license. Consult the LICENSE.md
    distributed with this software for full details and copyrights.
 */
