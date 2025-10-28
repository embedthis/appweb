/*
    foreign.c - Test httpCreateEvent from a foreign thread
 */
#include "esp.h"

static void finalizeResponse(HttpStream *stream, void *message);
static void serviceRequest();
static void foreignThread(uint64 seqno);

ESP_EXPORT int esp_controller_app_foreign(HttpRoute *route)
{
    espAction(route, "request", NULL, serviceRequest);
    return 0;
}

static void serviceRequest(HttpStream *stream)
{
    uint64      seqno;

    seqno = stream->seqno;
    if (mprStartOsThread("foreign", foreignThread, LTOP(stream->seqno), NULL) < 0) {
        print("No threads available");
    }
}


static void foreignThread(uint64 streamSeqno)
{
    char    *message;

    assert(mprGetCurrentThread() == NULL);

    message = strdup("Hello World");
    if (httpCreateEvent(streamSeqno, finalizeResponse, message) < 0) {
        print("Connection closed");
        free(message);
    }
}


static void finalizeResponse(HttpStream *stream, void *message)
{
    assert(message);

    if (stream) {
        httpWrite(stream->writeq, "message: %s\n", message);
        httpFinalize(stream);
    } else {
        print("Connection closed");
    }
    free(message);
}
