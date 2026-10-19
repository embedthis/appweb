/**
    mask.tst.c - A client frame must be masked

    Copyright (c) All Rights Reserved. See details at the end of the file.
 */

/********************************* Includes ***********************************/

#include "wsclient.h"

/************************************ Code ************************************/

int main(int argc, char **argv)
{
    MprSocket *sp;
    uchar     *frame;
    ssize     len;

    mprCreate(argc, argv, 0);
    mprStart();
    wsInit();
    frame = malloc(WS_MAX_RESPONSE);
    ttrue(frame != 0, "test buffer must allocate");

    sp = wsOpen(WS_FIXED_PATH);
    wsWriteFrame(sp, WS_MSG_TEXT, 1, 0, 0, WS_LEN_AUTO, 0, "hello", 5);
    len = wsRead(sp, frame, WS_MAX_RESPONSE);
    ttrue(len > 0, "an unmasked frame must be answered with a close frame");
    teqi(wsOpcode(frame, len), WS_MSG_CLOSE, "an unmasked client frame must close the connection");
    teqi(wsCloseStatus(frame, len), 1002, "the close must carry a protocol error status");
    ttrue(scontains((char*) frame, WS_FIXED_MARKER) == 0, "an unmasked frame must not be answered");
    wsCloseSocket(sp);

    sp = wsOpen(WS_FIXED_PATH);
    wsWriteFrame(sp, WS_MSG_PING, 1, 0, 0, WS_LEN_AUTO, 0, "", 0);
    len = wsRead(sp, frame, WS_MAX_RESPONSE);
    ttrue(len > 0, "an unmasked ping must be answered with a close frame");
    teqi(wsOpcode(frame, len), WS_MSG_CLOSE, "an unmasked ping must close the connection");
    teqi(wsCloseStatus(frame, len), 1002);
    wsCloseSocket(sp);

    sp = wsOpen(WS_FIXED_PATH);
    wsWriteFrame(sp, WS_MSG_TEXT, 1, 0, 1, WS_LEN_AUTO, 0, "hello", 5);
    len = wsRead(sp, frame, WS_MAX_RESPONSE);
    ttrue(len > 0, "a masked frame must be answered");
    teqi(wsOpcode(frame, len), WS_MSG_TEXT, "a masked frame must be answered with the document");
    ttrue(scontains((char*) frame, WS_FIXED_MARKER) != 0);
    wsCloseSocket(sp);

    free(frame);
    mprDestroy();
    return 0;
}

/*
    Copyright (c) Embedthis Pty Ltd. All Rights Reserved.
    This software is distributed under a commercial license. Consult the LICENSE.md
    distributed with this software for full details and copyrights.
 */
