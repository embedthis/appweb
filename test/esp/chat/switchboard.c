/*
    switchboard.c - WebSockets chat server
 */
#include "esp.h"

/*
    List of clients. Stores the stream IDs.
 */
static MprList  *clients;

static void chat(HttpStream *stream, char *msg);
static void chat_action();
static void chat_callback(HttpStream *stream, int event, int arg);

/*
    Initialize the "chat" loadable module
 */
ESP_EXPORT int esp_controller_chat_switchboard(HttpRoute *route)
{
    /*
        Create a list of clients holding the stream sequence number. Preserve the list from GC by adding as route data.
     */
    clients = mprCreateList(0, MPR_LIST_STATIC_VALUES);
    httpSetRouteData(route, "clients", clients);

    /*
        Define the "chat" action that will run when the "test/chat" URI is invoked
     */
    espAction(route, "test/chat", NULL, chat_action);
    return 0;
}


/*
    Action to run in response to the "test/chat" URI
 */
static void chat_action(HttpStream *stream)
{
    mprAddItem(clients, LTOP(stream->seqno));

    /*
        Establish the event callback that will be called for I/O events of interest for all clients.
     */
    espSetNotifier(stream, chat_callback);
}


/*
    Event callback. Invoked for incoming web socket messages and other events of interest.
    Running on the stream event dispatcher using an Mpr worker thread.
 */
static void chat_callback(HttpStream *stream, int event, int arg)
{
    HttpPacket  *packet;
    void        *client;
    int         next;

    if (event == HTTP_EVENT_READABLE) {
        packet = httpGetPacket(stream->readq);
        if (packet && (packet->type == WS_MSG_TEXT || packet->type == WS_MSG_BINARY)) {
            for (ITERATE_ITEMS(clients, client, next)) {
                /*
                    Send the message to each stream using the stream sequence number captured earlier.
                    This must be done using each stream event dispatcher to ensure we don't conflict with
                    other activity on the stream that may happen on another worker thread at the same time.
                    The "chat" callback will be invoked on the releveant stream's event dispatcher.
                    The data ("packet") is unmanaged.
                 */
                char *msg = strdup(packet->content->start);
                //  The client is the stream->seqno
                httpCreateEvent(PTOL(client), (HttpEventProc) chat, msg);
            }
        }

    } else if (event == HTTP_EVENT_APP_CLOSE) {
        /*
            This event is in response to a web sockets close event
         */
        // mprLog("chat info", 0, "Close event. Status status %d, orderly closed %d, reason %s", arg,
        //      httpWebSocketOrderlyClosed(stream), httpGetWebSocketCloseReason(stream));

    } else if (event == HTTP_EVENT_DESTROY) {
        /*
            This is invoked when the client is closed. This API is thread safe.
         */
        mprRemoveItem(clients, LTOP(stream->seqno));
    }
}


/*
    Send message to a client
 */
static void chat(HttpStream *stream, char *msg)
{
    if (stream) {
        httpSendBlock(stream, WS_MSG_TEXT, msg, slen(msg), HTTP_BLOCK);
    }
    free(msg);
}
