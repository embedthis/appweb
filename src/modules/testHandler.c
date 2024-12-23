/*
    testHandler.c -- Test handler to assist when developing handlers and modules

    This handler is a basic file handler without the frills for GET requests.

    Copyright (c) All Rights Reserved. See copyright notice at the bottom of the file.
 */

#include    "appweb.h"

#if ME_COM_TEST

static int test_open(HttpQueue* q)
{
    return 0;
}

static void test_close(HttpQueue *q)
{
}

static void test_incoming(HttpQueue* q, HttpPacket* packet)
{
    // httpFinalizeInput(q->stream);
}

static void test_ready(HttpQueue* q)
{
    httpSetStatus(q->stream, 200);
    httpFinalize(q->stream);
}

PUBLIC int httpTestInit(Http* http, MprModule *module)
{
	HttpStage  *handler;

	handler = httpCreateHandler("test", module);

    handler->open = test_open;
	handler->incoming = test_incoming;
	handler->ready = test_ready;
	handler->close = test_close;
	return 0;
}

#endif

/*
    Copyright (c) Embedthis Software. All Rights Reserved.
    This software is distributed under a commercial license. Consult the LICENSE.md
    distributed with this software for full details and copyrights.
 */
