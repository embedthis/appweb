/*
    progressive.c - Emit progressive output
 */
#include "appweb.h"
#include "esp.h"

static void callback(HttpStream *stream, MprEvent *event);
static void serviceRequest();
static void secondary(HttpStream *stream, void *data);


ESP_EXPORT int esp_controller_app_progressive(HttpRoute *route)
{
    espAction(route, "request", serviceRequest);
    return 0;
}


static void serviceRequest(HttpStream *stream)
{
    httpWrite(stream->writeq, "starting\n");

    print("START");
    if (mprCreateTimerEvent(stream->dispatcher, "progrssive", 50, (MprEventProc) callback, stream, 0) < 0) {
        ;
    }
}


static void callback(HttpStream *stream, MprEvent *event)
{
    if (stream->error) {
        // print("DISCONNECT");
        mprRemoveEvent(event);
        httpError(stream, HTTP_CODE_COMMS_ERROR, "Disconnected");
    } else {
        // print("Call httpCreate Event %ld", stream->seqno);
        if (httpCreateEvent(stream->seqno, secondary, NULL) < 0) {
            mprRemoveEvent(event);
        }
    }
}

static void secondary(HttpStream *stream, void *data)
{
    static int count = 0;

    // print("IN SECONDARY");
    // print("WRITE %d", count);
    if (stream) {
        httpWrite(stream->writeq, "%s", mprGetDate(NULL));
        httpFlushQueue(stream->writeq, 0);
        if ((count++ % 500) == 0) {
            mprPrintMem(sfmt("Memory at %s", mprGetDate(NULL)), 0);
        }
    }
}
