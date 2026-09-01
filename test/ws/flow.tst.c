/*
    flow.tst.c - WebSocket flow control: a large echoed message read slowly

    The suite had no WebSocket flow-control test, and could not have had one: testWebSocketsHandler
    answers every message with the same fixed 3K document and ignores the payload, so there was no way
    to ask for a large reply or to check that what came back was what went out.

    /wsecho is an echo, so both are possible. A megabyte goes up in fragments and must come back
    whole while the client reads at a deliberately slow rate -- which is the only way to make the
    server's outgoing WebSocket queue fill and drain rather than being written straight to a socket
    that always accepts it.

    What is asserted is the payload, not just the byte count. httpSendBlock splits an outgoing message
    at limits->webSocketsFrameSize and the route caps a packet at 64K, so a megabyte comes back as
    many frames and every one of them has to be reassembled in the right order. A total-only check
    passes when two frames are transposed.

    Copyright (c) All Rights Reserved. See details at the end of the file.
 */

#include "wsclient.h"

//  Under the route's LimitWebSocketsMessage of 2MB, and well over its 64K packet size
#define ECHO_SIZE   (1024 * 1024)

//  How much the client takes at a time before pausing
#define SIP         (16 * 1024)
#define SIP_PAUSE   5

/*
    Read a whole echoed message, slowly, reassembling across frames.

    Returns the number of payload bytes collected and fills "out" with them. Reads a bounded amount at
    a time with a pause between, so the server's queue has to hold what it cannot yet write. Stops
    when the collected payload reaches "expected" or the connection goes quiet.
 */
static ssize readSlowly(MprSocket *sp, char *out, ssize expected)
{
    uchar    *buf;
    ssize    collected, buffered, offset, payloadLen, nbytes, frameLen;
    int      opcode;

    buf = malloc(expected + 65536);
    collected = 0;
    buffered = 0;

    while (collected < expected) {
        if (mprWaitForSingleIO((int) sp->fd, MPR_READABLE, WS_FIRST_WAIT) <= 0) {
            break;
        }
        if ((nbytes = mprReadSocket(sp, (char*) &buf[buffered], SIP)) <= 0) {
            break;
        }
        buffered += nbytes;

        /*
            Take whole frames out of the buffer as they complete. A frame header can straddle a read,
            so wsPayload returning -1 means "not enough yet", not "malformed".
         */
        for (;;) {
            if ((payloadLen = wsPayload(buf, buffered, &offset)) < 0) {
                break;
            }
            frameLen = offset + payloadLen;
            if (buffered < frameLen) {
                break;
            }
            opcode = wsOpcode(buf, buffered);
            if (opcode == WS_MSG_TEXT || opcode == WS_MSG_BINARY || opcode == WS_MSG_CONT) {
                memcpy(&out[collected], &buf[offset], (size_t) payloadLen);
                collected += payloadLen;
            }
            memmove(buf, &buf[frameLen], (size_t) (buffered - frameLen));
            buffered -= frameLen;
        }
        /*
            Hold off before asking for more. This is what makes the test a flow-control test: without
            it the socket drains as fast as the server writes and the outgoing queue never fills.
         */
        mprSleep(SIP_PAUSE);
    }
    free(buf);
    return collected;
}


int main(int argc, char **argv)
{
    MprSocket *sp;
    char      *payload, *echoed;
    ssize     collected, i;

    mprCreate(argc, argv, 0);
    mprStart();
    wsInit();

    payload = malloc(ECHO_SIZE);
    echoed = malloc(ECHO_SIZE + 65536);

    /*
        A payload that is not uniform, so a reassembly that transposes or repeats a block is visible.
        A megabyte of the same byte would satisfy a byte-for-byte comparison however it was shuffled.
     */
    for (i = 0; i < ECHO_SIZE; i++) {
        payload[i] = (char) ('a' + (i % 26));
    }

    /*
        Send it in one message, fragmented into 64KB pieces -- which is what a browser sending a large
        message does, and which makes the server reassemble on the way in as well as split on the way
        out.
     */
    sp = wsOpen(WS_ECHO_PATH);
    for (i = 0; i < ECHO_SIZE; i += 65536) {
        ssize piece = min(65536, ECHO_SIZE - i);
        int   last = (i + piece >= ECHO_SIZE);
        wsWriteFrame(sp, (i == 0) ? WS_MSG_BINARY : WS_MSG_CONT, last, 0, 1, WS_LEN_AUTO, 0,
                     &payload[i], piece);
    }

    collected = readSlowly(sp, echoed, ECHO_SIZE);
    tinfo("websocket echo returned %zd of %d bytes", collected, ECHO_SIZE);
    teql(collected, ECHO_SIZE, "the whole message must come back under a slow reader");
    ttrue(memcmp(payload, echoed, (size_t) ECHO_SIZE) == 0,
          "the echoed message must be identical to what was sent");
    wsCloseSocket(sp);

    /*
        And the connection is still usable afterwards. A queue that filled and was not resumed leaves
        the stream suspended, which shows up here as silence rather than as wrong data.
     */
    sp = wsOpen(WS_ECHO_PATH);
    wsText(sp, "after-flow");
    collected = readSlowly(sp, echoed, (ssize) slen("after-flow"));
    teql(collected, (ssize) slen("after-flow"), "the route must still serve after a large slow echo");
    ttrue(sncmp(echoed, "after-flow", collected) == 0, "the small message must echo intact");
    wsCloseSocket(sp);

    free(payload);
    free(echoed);
    mprDestroy();
    return 0;
}

/*
    Copyright (c) Embedthis Software. All Rights Reserved.
    This software is distributed under a commercial license. Consult the LICENSE.md
    distributed with this software for full details and copyrights.
 */
