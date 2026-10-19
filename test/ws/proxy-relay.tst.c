/*
    proxy-relay.tst.c - A proxied WebSocket relays the backend's messages to the client

    Copyright (c) All Rights Reserved. See details at the end of the file.
 */

#include "wsclient.h"

#define PROXY_FIXED_PATH "/proxy/ws/echo"

int main(int argc, char **argv)
{
#if ME_UNIX_LIKE
    MprSocket *sp;
    uchar     *frame;
    ssize     len;
    int       round;

    mprCreate(argc, argv, 0);
    mprStart();
    wsInit();
    frame = malloc(WS_MAX_RESPONSE);

    sp = wsOpen(PROXY_FIXED_PATH);
    ttrue(sp != 0, "the proxied websocket must upgrade");

    for (round = 0; sp && round < 2; round++) {
        wsText(sp, "hello");
        len = wsRead(sp, frame, WS_MAX_RESPONSE);
        ttrue(len > 0, "round %d: the backend's reply must reach the client", round);
        teqi(wsOpcode(frame, len), WS_MSG_TEXT, "round %d: the reply must be a text frame", round);
        ttrue(scontains((char*) frame, WS_FIXED_MARKER) != 0, "round %d: the reply must carry the document", round);
    }
    wsCloseSocket(sp);

    free(frame);
    mprDestroy();
#else
    tskip("the proxy handler is not built on Windows, so the /proxy/ route does not exist");
#endif
    return 0;
}

/*
    Copyright (c) Embedthis Pty Ltd. All Rights Reserved.
    This software is distributed under a commercial license. Consult the LICENSE.md
    distributed with this software for full details and copyrights.
 */
