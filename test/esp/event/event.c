/*
    event.c - Test mprCreateEvent from foreign threads
 */
#include "appweb.h"
#include "esp.h"

static void callback(char *message, MprEvent *event);
static void serviceRequest();
static void foreignThread();


/*
    Create a URL action to respond to HTTP requests.
    We use an ESP module just to make it easier to dynamically load this test module.
 */
ESP_EXPORT int esp_controller_app_event(HttpRoute *route)
{
    espAction(route, "request", serviceRequest);
    return 0;
}


static void serviceRequest(HttpStream *stream)
{
    httpWrite(stream->writeq, "done\n");
    mprStartOsThread("foreign", foreignThread, NULL, NULL);
}


static void foreignThread()
{
    char    *message;

    assert(mprGetCurrentThread() == NULL);

    message = strdup("Hello World");
    if (mprCreateEvent(NULL, "foreign", 0, (MprEventProc) callback, message, MPR_EVENT_STATIC_DATA) < 0) {
        free(message);
    }
}


/*
    Finalize a response to the Http request. This runs on the stream's dispatcher, thread-safe inside Appweb.
 */
static void callback(char *message, MprEvent *event)
{
    assert(message && *message);

    if (event) {
        assert(event->proc);
        assert(event->timestamp);
        assert(event->data == message);
        assert(event->dispatcher);
        assert(event->sock == NULL);
        assert(event->proc == (MprEventProc) callback);
        assert(smatch(message, "Hello World"));
    }
    // printf("Got \"%s\" from event \"%s\"\n", message, event->name);
    free(message);
}
