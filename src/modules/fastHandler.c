/*
    fastHandler.c -- FastCGI handler

    This handler supports the FastCGI spec: https://github.com/fast-cgi/spec/blob/master/spec.md

    It supports launching FastCGI applications and connecting to pre-existing FastCGI applications.
    It will multiplex multiple simultaneous requests to one or more FastCGI apps.

    <Route /fast>
        LoadModule fastHandler libmod_fast
        Action application/x-php /usr/local/bin/php-cgi
        AddHandler fastHandler php
        FastConnect 127.0.0.1:9991 launch min=1 max=2 count=500 timeout=5mins multiplex=1
    </Route>

    Copyright (c) All Rights Reserved. See copyright notice at the bottom of the file.
 */

/*********************************** Includes *********************************/

#include    "appweb.h"

#if ME_COM_FAST && ME_UNIX_LIKE
/************************************ Locals ***********************************/

#define FAST_VERSION            1
#define FAST_DEBUG              0           //  For debugging (keeps filedes open in FastCGI for debug output)

/*
    FastCGI spec packet types
 */
#define FAST_REAP               0           //  Proxy has been reaped (not part of spec)
#define FAST_BEGIN_REQUEST      1           //  Start new request - sent to FastCGI
#define FAST_ABORT_REQUEST      2           //  Abort request - sent to FastCGI
#define FAST_END_REQUEST        3           //  End request - received from FastCGI
#define FAST_PARAMS             4           //  Send params to FastCGI
#define FAST_STDIN              5           //  Post body data
#define FAST_STDOUT             6           //  Response body
#define FAST_STDERR             7           //  FastCGI app errors
#define FAST_DATA               8           //  Additional data to application (unused)
#define FAST_GET_VALUES         9           //  Query FastCGI app (unused)
#define FAST_GET_VALUES_RESULT  10          //  Query result
#define FAST_UNKNOWN_TYPE       11          //  Unknown management request
#define FAST_MAX                11          //  Max type

/*
    Pseudo types
 */
 #define FAST_COMMS_ERROR       12          //  Communications error

static cchar *fastTypes[FAST_MAX + 1] = {
    "invalid", "begin", "abort", "end", "params", "stdin", "stdout", "stderr",
    "data", "get-values", "get-values-result", "unknown",
};

/*
    FastCGI app types
 */
#define FAST_RESPONDER          1           //  Supported web request responder
#define FAST_AUTHORIZER         2           //  Not supported
#define FAST_FILTER             3           //  Not supported

#define FAST_MAGIC              0x2671825C

/*
    Default constants. WARNING: this code does not yet support multiple requests per app
 */
#define FAST_MAX_APPS           1           //  Max of one app
#define FAST_MIN_APPS           0           //  Min of zero apps to keep running if idle
#define FAST_MAX_REQUESTS       MAXINT64    //  Max number of requests per app instance
#define FAST_MAX_MULTIPLEX      1           //  Max number of concurrent requests per app instance
#define FAST_MAX_ID             0x10000     //  Maximum request ID
#define FAST_PACKET_SIZE        8           //  Size of minimal FastCGI packet
#define FAST_KEEP_CONN          1           //  Flag to app to keep connection open

#define FAST_Q_SIZE             ((FAST_PACKET_SIZE + 65535 + 8) * 2)

#define FAST_REQUEST_COMPLETE   0           //  End Request response status for request complete
#define FAST_CANT_MPX_CONN      1           //  Request rejected -- FastCGI app cannot multiplex requests
#define FAST_OVERLOADED         2           //  Request rejected -- app server is overloaded
#define FAST_UNKNOWN_ROLE       3           //  Request rejected -- unknown role

#ifndef FAST_WAIT_TIMEOUT
#define FAST_WAIT_TIMEOUT       (10 * TPS)  //  Time to wait for a app
#endif

#ifndef FAST_CONNECT_TIMEOUT
#define FAST_CONNECT_TIMEOUT    (10 * TPS)  //  Time to wait for FastCGI to respond to a connect
#endif

#ifndef FAST_APP_TIMEOUT
#define FAST_APP_TIMEOUT        (300 * TPS) //  Default inactivity time to preserve idle app
#endif

#ifndef FAST_WATCHDOG_TIMEOUT
#define FAST_WATCHDOG_TIMEOUT   (60 * TPS)  //  Frequency to check on idle apps and then prune them
#endif

/*
    Top level FastCGI structure per route
 */
typedef struct Fast {
    uint            magic;                  //  Magic identifier
    cchar           *endpoint;              //  Proxy listening endpoint
    cchar           *launch;                //  Launch command
    int             multiplex;              //  Maximum number of requests to send to each FastCGI app
    int             minApps;                //  Minumum number of apps to maintain
    int             maxApps;                //  Maximum number of apps to spawn
    uint64          keep;                   //  Keep alive
    uint64          maxRequests;            //  Maximum number of requests for launched apps before respawning
    MprTicks        appTimeout;             //  Timeout for an idle app to be maintained
    MprList         *apps;                  //  List of active apps
    MprList         *idleApps;              //  Idle apps
    MprMutex        *mutex;                 //  Multithread sync
    MprCond         *cond;                  //  Condition to wait for available app
    MprEvent        *timer;                 //  Timer to check for idle apps
    cchar           *ip;                    //  Listening IP address
    int             port;                   //  Listening port
} Fast;

/*
    Per FastCGI app instance
 */
typedef struct FastApp {
    Fast            *fast;                  // Parent pointer
    HttpTrace       *trace;                 // Default tracing configuration
    MprTicks        lastActive;             // When last active
    MprSignal       *signal;                // Mpr signal handler for child death
    bool            destroy;                // Must destroy app
    bool            destroyed;              // App has been destroyed
    int             inUse;                  // In use counter
    int             pid;                    // Process ID of the FastCGI app
    uint64          nextID;                 // Next request ID for this app
    MprList         *sockets;               // Open sockets to apps
    MprList         *requests;              // Requests
    cchar           *ip;                    // Bound IP address
    int             port;                   // Bound listening port
    MprTicks        lastActivity;           // Last I/O activity
} FastApp;

/*
    Per FastCGI request instance. This is separate from the FastApp properties because the
    FastRequest executes on a different dispatcher.
 */
typedef struct FastRequest {
    Fast            *fast;                  // Parent pointer
    FastApp         *app;                   // Owning app
    MprSocket       *socket;                // I/O socket
    HttpStream      *stream;                // Owning client request stream
    HttpQueue       *connWriteq;            // Queue to write to the FastCGI app
    HttpQueue       *connReadq;             // Queue to hold read data from the FastCGI app
    HttpTrace       *trace;                 // Default tracing configuration
    int             id;                     // FastCGI request ID - assigned from FastApp.nextID % FAST_MAX_ID
    bool            eof;                    // Socket is closed
    bool            parsedHeaders;          // Parsed the FastCGI app header response
    bool            writeBlocked;           // Socket is full of write data
    int             eventMask;              // Socket eventMask
    uint64          bytesRead;              // Bytes read in response
} FastRequest;

/*********************************** Forwards *********************************/

static void addFastPacket(HttpNet *net, HttpPacket *packet);
static void addToFastVector(HttpNet *net, char *ptr, ssize bytes);
static void adjustFastVec(HttpNet *net, ssize written);
static Fast *allocFast(void);
static FastRequest *allocFastRequest(FastApp *app, HttpStream *stream, MprSocket *socket);
static FastApp *allocFastApp(Fast *fast, HttpStream *stream);
static void closeAppSockets(FastApp *app);
static cchar *buildFastArgs(FastApp *app, HttpStream *stream, int *argcp, cchar ***argvp);
static MprOff buildFastVec(HttpQueue *q);
static void fastCloseRequest(HttpQueue *q);
static void fastMaintenance(Fast *fast);
static MprSocket *getFastSocket(FastApp *app);
static void copyFastInner(HttpPacket *packet, cchar *key, cchar *value, cchar *prefix);
static void copyFastParams(HttpPacket *packet, MprJson *params, cchar *prefix);
static void copyFastVars(HttpPacket *packet, MprHash *vars, cchar *prefix);
static HttpPacket *createFastPacket(HttpQueue *q, int type, HttpPacket *packet);
static MprSocket *createListener(FastApp *app, HttpStream *stream);
static void enableFastConnector(FastRequest *req);
static int fastConnectDirective(MaState *state, cchar *key, cchar *value);
static void fastConnectorIO(FastRequest *req, MprEvent *event);
static void fastConnectorIncoming(HttpQueue *q, HttpPacket *packet);
static void fastConnectorIncomingService(HttpQueue *q);
static void fastConnectorOutgoingService(HttpQueue *q);
static void fastHandlerReapResponse(FastRequest *req);
static void fastHandlerResponse(FastRequest *req, int type, HttpPacket *packet);
static void fastIncomingRequestPacket(HttpQueue *q, HttpPacket *packet);
static void freeFastPackets(HttpQueue *q, ssize bytes);
static Fast *getFast(HttpRoute *route);
static char *getFastToken(MprBuf *buf, cchar *delim);
static FastApp *getFastApp(Fast *fast, HttpStream *stream);
static int getListenPort(MprSocket *socket);
static void fastOutgoingService(HttpQueue *q);
static void idleSocketIO(MprSocket *sp, MprEvent *event);
static void killFastApp(FastApp *app);
static void manageFast(Fast *fast, int flags);
static void manageFastApp(FastApp *app, int flags);
static void manageFastRequest(FastRequest *fastConnector, int flags);
static int fastOpenRequest(HttpQueue *q);
static bool parseFastHeaders(HttpPacket *packet);
static bool parseFastResponseLine(HttpPacket *packet);
static void prepFastRequestStart(HttpQueue *q);
static void prepFastRequestParams(HttpQueue *q);
static void reapSignalHandler(FastApp *app, MprSignal *sp);
static FastApp *startFastApp(Fast *fast, HttpStream *stream);

#if ME_DEBUG
    static void fastInfo(void *ignored, MprSignal *sp);
#endif

/************************************* Code ***********************************/
/*
    Loadable module initialization
 */
PUBLIC int httpFastInit(Http *http, MprModule *module)
{
    HttpStage   *handler, *connector;

    /*
        Add configuration file directives
     */
    maAddDirective("FastConnect", fastConnectDirective);

    /*
        Create FastCGI handler to respond to client requests
     */
    if ((handler = httpCreateHandler("fastHandler", module)) == 0) {
        return MPR_ERR_CANT_CREATE;
    }
    http->fastHandler = handler;
    handler->close = fastCloseRequest;
    handler->open = fastOpenRequest;
    handler->incoming = fastIncomingRequestPacket;
    handler->outgoingService = fastOutgoingService;

    /*
        Create FastCGI connector. The connector manages communication to the FastCGI application.
        The Fast handler is the head of the pipeline while the Fast connector is
        after the Http protocol and tailFilter.
    */
    if ((connector = httpCreateConnector("fastConnector", NULL)) == 0) {
        return MPR_ERR_CANT_CREATE;
    }
    http->fastConnector = connector;
    connector->incoming = fastConnectorIncoming;
    connector->incomingService = fastConnectorIncomingService;
    connector->outgoingService = fastConnectorOutgoingService;

#if ME_DEBUG
    mprAddRoot(mprAddSignalHandler(ME_SIGINFO, fastInfo, 0, 0, MPR_SIGNAL_AFTER));
#endif
    return 0;
}


/*
    Open the fastHandler for a new client request
 */
static int fastOpenRequest(HttpQueue *q)
{
    HttpStream  *stream;
    MprSocket   *socket;
    Fast        *fast;
    FastApp     *app;
    FastRequest *req;

    stream = q->stream;

    httpTrimExtraPath(stream);
    httpMapFile(stream);
    httpCreateCGIParams(stream);

    /*
        Get a Fast instance for this route. First time, this will allocate a new Fast instance. Second and
        subsequent times, will reuse the existing instance.
     */
    fast = getFast(stream->rx->route);

    /*
        Get a FastApp instance. This will reuse an existing FastCGI app if possible. Otherwise,
        it will launch a new FastCGI app if within limits. Otherwise it will wait until one becomes available.
     */
    if ((app = getFastApp(fast, stream)) == 0) {
        httpError(stream, HTTP_CODE_NOT_FOUND, "Cannot allocate FastCGI app for route %s", stream->rx->route->pattern);
        return MPR_ERR_CANT_OPEN;
    }

    /*
        Open a dedicated client socket to the FastCGI app
     */
    if ((socket = getFastSocket(app)) == NULL) {
        httpError(stream, HTTP_CODE_INTERNAL_SERVER_ERROR, "Cannot connect to fast app: %d", errno);
        return MPR_ERR_CANT_CONNECT;
    }

    req = allocFastRequest(app, stream, socket);
    mprAddItem(app->requests, req);
    q->queueData = q->pair->queueData = req;

    /*
        Send a start request followed by the request parameters
     */
    prepFastRequestStart(q);
    prepFastRequestParams(q);
    httpServiceQueue(req->connWriteq);
    enableFastConnector(req);
    return 0;
}


/*
    Release an app and req when the request completes. This closes the connection to the FastCGI app.
    It will destroy the FastCGI app on errors.
 */
static void fastCloseRequest(HttpQueue *q)
{
    Fast            *fast;
    FastRequest     *req;
    FastApp         *app;
    cchar           *msg;

    req = q->queueData;
    fast = req->fast;
    app = req->app;

    lock(fast);

    if (req->socket) {
        if (!fast->keep) {
            mprCloseSocket(req->socket, 1);
        } else if (!(req->socket->flags & (MPR_SOCKET_EOF | MPR_SOCKET_DISCONNECTED))) {
            mprRemoveSocketHandler(req->socket);
            mprPushItem(app->sockets, req->socket);
            if (fast->keep) {
                mprAddSocketHandler(req->socket, MPR_READABLE, NULL, idleSocketIO, req->socket, 0);
            }
        }
    }
    mprRemoveItem(app->requests, req);

    if (--app->inUse <= 0) {
        if (mprRemoveItem(fast->apps, app) < 0) {
            httpLog(app->trace, "fast", "error", "msg:Cannot find app in list");
        }
        msg = "Release FastCGI app";
        if (app->pid) {
            if (fast->maxRequests < MAXINT64 && app->nextID >= fast->maxRequests) {
                app->destroy = 1;
            }
            if (app->destroy) {
                msg = "Kill FastCGI app";
                killFastApp(app);
            }
        }
        if (app->destroy) {
            closeAppSockets(app);
        } else {
            mprAddItem(fast->idleApps, app);
            app->lastActive = mprGetTicks();
        }
        httpLog(app->trace, "fast", "context",
            "msg:%s, pid:%d, idle:%d, active:%d, id:%d, destroy:%d, nextId:%lld",
            msg, app->pid, mprGetListLength(fast->idleApps), mprGetListLength(fast->apps),
            req->id, app->destroy, app->nextID);
        mprSignalCond(fast->cond);
    }
    unlock(fast);
}


static Fast *allocFast(void)
{
    Fast    *fast;

    fast = mprAllocObj(Fast, manageFast);
    fast->magic = FAST_MAGIC;
    fast->apps = mprCreateList(0, 0);
    fast->idleApps = mprCreateList(0, 0);
    fast->mutex = mprCreateLock();
    fast->cond = mprCreateCond();
    fast->multiplex = FAST_MAX_MULTIPLEX;
    fast->maxRequests = FAST_MAX_REQUESTS;
    fast->minApps = FAST_MIN_APPS;
    fast->maxApps = FAST_MAX_APPS;
    fast->ip = sclone("127.0.0.1");
    fast->port = 0;
    fast->keep = 1;
    fast->appTimeout = FAST_APP_TIMEOUT;
    fast->timer = mprCreateTimerEvent(NULL, "fast-watchdog", FAST_WATCHDOG_TIMEOUT, fastMaintenance, fast, MPR_EVENT_QUICK);
    return fast;
}


static void manageFast(Fast *fast, int flags)
{
    if (flags & MPR_MANAGE_MARK) {
        mprMark(fast->cond);
        mprMark(fast->endpoint);
        mprMark(fast->idleApps);
        mprMark(fast->ip);
        mprMark(fast->launch);
        mprMark(fast->mutex);
        mprMark(fast->apps);
        mprMark(fast->timer);
    }
}


static void fastMaintenance(Fast *fast)
{
    FastApp         *app;
    MprTicks        now;
    int             count, next;

    lock(fast);
    now = mprGetTicks();
    count = mprGetListLength(fast->apps) + mprGetListLength(fast->idleApps);

    /*
        Prune idle apps. Rely on the HTTP service timer to prune inactive requests, then the app will be returned to idleApps.
     */
    for (ITERATE_ITEMS(fast->idleApps, app, next)) {
        if (app->pid && app->destroy) {
            killFastApp(app);

        } else if (app->pid && ((now - app->lastActive) > fast->appTimeout)) {
            if (count-- > fast->minApps) {
                killFastApp(app);
            }
        }
    }
    unlock(fast);
}


/*
    Get the fast structure for a route and save in "extended". Allocate if required.
    One Fast instance is shared by all using the route.
 */
static Fast *getFast(HttpRoute *route)
{
    Fast        *fast;

    if ((fast = route->extended) == 0) {
        mprGlobalLock();
        if ((fast = route->extended) == 0) {
            fast = route->extended = allocFast();
        }
        mprGlobalUnlock();
    }
    return fast;
}


/*
    POST/PUT incoming body data from the client destined for the CGI gateway. : For POST "form" requests,
    this will be called before the command is actually started.
 */
static void fastIncomingRequestPacket(HttpQueue *q, HttpPacket *packet)
{
    HttpStream      *stream;
    FastRequest     *req;

    assert(q);
    assert(packet);
    stream = q->stream;

    if ((req = q->queueData) == 0) {
        return;
    }
    if (packet->flags & HTTP_PACKET_END) {
        /* End of input */
        httpFinalizeInput(stream);
        if (stream->rx->remainingContent > 0) {
            httpError(stream, HTTP_CODE_BAD_REQUEST, "Client supplied insufficient body data");
            packet = createFastPacket(q, FAST_ABORT_REQUEST, httpCreateDataPacket(0));
        }
    }
    createFastPacket(q, FAST_STDIN, packet);
    httpPutForService(req->connWriteq, packet, HTTP_SCHEDULE_QUEUE);
}


static void fastOutgoingService(HttpQueue *q)
{
    HttpPacket      *packet;
    FastRequest     *req;

    req = q->queueData;

    for (packet = httpGetPacket(q); packet; packet = httpGetPacket(q)) {
        if (!httpWillNextQueueAcceptPacket(q, packet)) {
            httpPutBackPacket(q, packet);
            return;
        }
        httpPutPacketToNext(q, packet);
    }
    if (!(req->eventMask & MPR_READABLE)) {
        enableFastConnector(req);
    }
}


static void fastHandlerReapResponse(FastRequest *req)
{
    fastHandlerResponse(req, FAST_REAP, NULL);
}


/*
    Handle response messages from the FastCGI app
 */
static void fastHandlerResponse(FastRequest *req, int type, HttpPacket *packet)
{
    HttpStream  *stream;
    HttpRx      *rx;
    MprBuf      *buf;
    int         status, protoStatus;

    stream = req->stream;

    if (stream->state <= HTTP_STATE_BEGIN || stream->rx->route == NULL) {
        /* Request already complete and stream has been recycled (prepared for next request) */
        return;
    }
    if (type == FAST_COMMS_ERROR) {
        httpError(stream, HTTP_ABORT | HTTP_CODE_COMMS_ERROR, "FastRequest: comms error");

    } else if (type == FAST_REAP) {
        httpError(stream, HTTP_ABORT | HTTP_CODE_COMMS_ERROR, "FastRequest: process killed error");

    } else if (type == FAST_END_REQUEST && packet) {
        if (httpGetPacketLength(packet) < 8) {
            httpError(stream, HTTP_CODE_BAD_GATEWAY, "FastCGI bad request end packet");
            return;
        }
        buf = packet->content;
        rx = stream->rx;

        status = mprGetCharFromBuf(buf) << 24 | mprGetCharFromBuf(buf) << 16 |
                 mprGetCharFromBuf(buf) << 8  | mprGetCharFromBuf(buf);
        protoStatus = mprGetCharFromBuf(buf);
        mprAdjustBufStart(buf, 3);

        if (protoStatus == FAST_REQUEST_COMPLETE) {
            httpLog(stream->trace, "rx.fast", "context", "msg:Request complete, id:%d, status:%d", req->id, status);

        } else if (protoStatus == FAST_CANT_MPX_CONN) {
            httpError(stream, HTTP_CODE_BAD_GATEWAY, "FastCGI cannot multiplex requests %s", rx->uri);
            return;

        } else if (protoStatus == FAST_OVERLOADED) {
            httpError(stream, HTTP_CODE_SERVICE_UNAVAILABLE, "FastCGI overloaded %s", rx->uri);
            return;

        } else if (protoStatus == FAST_UNKNOWN_ROLE) {
            httpError(stream, HTTP_CODE_BAD_GATEWAY, "FastCGI unknown role %s", rx->uri);
            return;
        }
        httpLog(stream->trace, "rx.fast.eof", "detail", "msg:FastCGI end request, id:%d", req->id);
        httpFinalizeOutput(stream);

    } else if (type == FAST_STDOUT && packet) {
        if (!req->parsedHeaders) {
            if (!parseFastHeaders(packet)) {
                return;
            }
            req->parsedHeaders = 1;
        }
        if (httpGetPacketLength(packet) > 0) {
            // httpPutPacketToNext(stream->writeq, packet);
            httpPutForService(stream->writeq, packet, HTTP_SCHEDULE_QUEUE);
            httpServiceQueue(stream->writeq);
        }
    }
}


/*
    Parse the FastCGI app output headers. Sample FastCGI program output:
        Content-type: text/html
        <html.....
 */
static bool parseFastHeaders(HttpPacket *packet)
{
    FastRequest *req;
    HttpStream  *stream;
    MprBuf      *buf;
    char        *endHeaders, *headers, *key, *value;
    ssize       blen, len;

    stream = packet->stream;
    req = packet->data;
    buf = packet->content;
    headers = mprGetBufStart(buf);
    value = 0;

    headers = mprGetBufStart(buf);
    blen = mprGetBufLength(buf);
    len = 0;

    if ((endHeaders = sncontains(headers, "\r\n\r\n", blen)) == NULL) {
        if ((endHeaders = sncontains(headers, "\n\n", blen)) == NULL) {
            if (slen(headers) < ME_MAX_HEADERS) {
                // Not EOF and less than max headers and have not yet seen an end of headers delimiter
                httpLog(stream->trace, "rx.fast", "detail", "msg:FastCGI incomplete headers, id:%d", req->id);
                return 0;
            }
        }
        len = 2;
    } else {
        len = 4;
    }
    /*
        Split the headers from the body. Add null to ensure we can search for line terminators.
     */
    if (endHeaders) {
        endHeaders[len - 1] = '\0';
        endHeaders += len;
    }

    /*
        Want to be tolerant of FastCGI programs that omit the status line.
     */
    if (strncmp((char*) buf->start, "HTTP/1.", 7) == 0) {
        if (!parseFastResponseLine(packet)) {
            /* httpError already called */
            return 0;
        }
    }
    if (endHeaders && strchr(mprGetBufStart(buf), ':')) {
        while (mprGetBufLength(buf) > 0 && buf->start[0] && (buf->start[0] != '\r' && buf->start[0] != '\n')) {
            if ((key = getFastToken(buf, ":")) == 0) {
                key = "Bad Header";
            }
            value = getFastToken(buf, "\n");
            while (isspace((uchar) *value)) {
                value++;
            }
            len = (int) strlen(value);
            while (len > 0 && (value[len - 1] == '\r' || value[len - 1] == '\n')) {
                value[len - 1] = '\0';
                len--;
            }
            httpLog(stream->trace, "rx.fast", "detail", "key:%s, value: %s", key, value);

            if (scaselesscmp(key, "location") == 0) {
                httpRedirect(stream, HTTP_CODE_MOVED_TEMPORARILY, value);

            } else if (scaselesscmp(key, "status") == 0) {
                httpSetStatus(stream, atoi(value));

            } else if (scaselesscmp(key, "content-type") == 0) {
                if (stream->tx->charSet && !scaselesscontains(value, "charset")) {
                    httpSetHeader(stream, "Content-Type", "%s; charset=%s", value, stream->tx->charSet);
                } else {
                    httpSetHeaderString(stream, "Content-Type", value);
                }

            } else if (scaselesscmp(key, "content-length") == 0) {
                httpSetContentLength(stream, (MprOff) stoi(value));
                httpSetChunkSize(stream, 0);

            } else {
                /* Now pass all other headers back to the client */
                key = ssplit(key, ":\r\n\t ", NULL);
                httpSetHeaderString(stream, key, value);
            }
        }
        buf->start = endHeaders;
    }
    return 1;
}


/*
    Parse the FCGI output first line
 */
static bool parseFastResponseLine(HttpPacket *packet)
{
    MprBuf      *buf;
    char        *protocol, *status, *msg;

    buf = packet->content;
    protocol = getFastToken(buf, " ");
    if (protocol == 0 || protocol[0] == '\0') {
        httpError(packet->stream, HTTP_CODE_BAD_GATEWAY, "Bad FCGI HTTP protocol response");
        return 0;
    }
    if (strncmp(protocol, "HTTP/1.", 7) != 0) {
        httpError(packet->stream, HTTP_CODE_BAD_GATEWAY, "Unsupported FCGI protocol");
        return 0;
    }
    status = getFastToken(buf, " ");
    if (status == 0 || *status == '\0') {
        httpError(packet->stream, HTTP_CODE_BAD_GATEWAY, "Bad FCGI header response");
        return 0;
    }
    msg = getFastToken(buf, "\n");
    mprLog("http cgi", 4, "FCGI response status: %s %s %s", protocol, status, msg);
    return 1;
}


/*
    Get the next input token. The content buffer is advanced to the next token. This routine always returns a
    non-zero token. The empty string means the delimiter was not found.
 */
static char *getFastToken(MprBuf *buf, cchar *delim)
{
    char    *token, *nextToken;
    ssize   len;

    len = mprGetBufLength(buf);
    if (len == 0) {
        return "";
    }
    token = mprGetBufStart(buf);
    nextToken = sncontains(mprGetBufStart(buf), delim, len);
    if (nextToken) {
        *nextToken = '\0';
        len = (int) strlen(delim);
        nextToken += len;
        buf->start = nextToken;

    } else {
        buf->start = mprGetBufEnd(buf);
    }
    return token;
}


/************************************************ FastApp ***************************************************************/
/*
    The FastApp represents the connection to a single FastCGI app instance
 */
static FastApp *allocFastApp(Fast *fast, HttpStream *stream)
{
    FastApp   *app;

    app = mprAllocObj(FastApp, manageFastApp);
    app->fast = fast;
    app->trace = stream->net->trace;
    app->requests = mprCreateList(0, 0);
    app->sockets = mprCreateList(0, 0);
    app->port = fast->port;
    app->ip = fast->ip;

    /*
        The requestID must start at 1 by spec
     */
    app->nextID = 1;
    return app;
}


static void closeAppSockets(FastApp *app)
{
    MprSocket   *socket;
    int         next;

    for (ITERATE_ITEMS(app->sockets, socket, next)) {
        mprCloseSocket(socket, 1);
    }
}


static void manageFastApp(FastApp *app, int flags)
{
    if (flags & MPR_MANAGE_MARK) {
        mprMark(app->fast);
        mprMark(app->signal);
        mprMark(app->sockets);
        mprMark(app->requests);
        mprMark(app->trace);
        mprMark(app->ip);
    }
}


static FastApp *getFastApp(Fast *fast, HttpStream *stream)
{
    FastApp     *app;
    MprTicks    timeout;
    int         next;

    lock(fast);
    app = NULL;
    timeout = mprGetTicks() +  FAST_WAIT_TIMEOUT;

    /*
        Locate a FastApp to serve the request. Use an idle app first. If none available, start a new app
        if under the limits. Otherwise, wait for one to become available.
     */
    while (!app && mprGetTicks() < timeout) {
        for (ITERATE_ITEMS(fast->idleApps, app, next)) {
            if (app->destroy || app->destroyed) {
                continue;
            }
            mprRemoveItemAtPos(fast->idleApps, next - 1);
            mprAddItem(fast->apps, app);
            break;
        }
        if (!app) {
            if (mprGetListLength(fast->apps) < fast->maxApps) {
                if ((app = startFastApp(fast, stream)) != 0) {
                    mprAddItem(fast->apps, app);
                }
                break;

            } else {
                for (ITERATE_ITEMS(fast->apps, app, next)) {
                    if (mprGetListLength(app->requests) < fast->multiplex) {
                        break;
                    }
                }
                if (app) {
                    break;
                }
                unlock(fast);
                mprYield(MPR_YIELD_STICKY);

                mprWaitForCond(fast->cond, TPS);

                mprResetYield();
                lock(fast);
                mprLog("fast", 0, "Waiting for fastCGI app to become available, running %d", mprGetListLength(fast->apps));
#if ME_DEBUG
                fastInfo(NULL, NULL);
#endif
            }
        }
    }
    if (app) {
        app->lastActive = mprGetTicks();
        app->inUse++;
    } else {
        mprLog("fast", 0, "Cannot acquire available fastCGI app, running %d", mprGetListLength(fast->apps));
    }
    unlock(fast);
    return app;
}


/*
    Start a new FastCGI app process. Called with lock(fast)
 */
static FastApp *startFastApp(Fast *fast, HttpStream *stream)
{
    FastApp     *app;
    MprSocket   *listen;
    cchar       **argv, *command;
    int         argc, i;
#if KEEP
    cchar       **envv;
    int         count;
#endif

    app = allocFastApp(fast, stream);

    if (fast->launch) {
        argc = 1;
        if ((command = buildFastArgs(app, stream, &argc, &argv)) == 0) {
            httpError(stream, HTTP_CODE_NOT_FOUND, "Cannot find Fast app command");
            return NULL;
        }
#if KEEP
        /*
            Build environment variables. Currently use only the server env vars.
         */
        count = mprGetHashLength(stream->rx->svars);
        if ((envv = mprAlloc((count + 2) * sizeof(char*))) != 0) {
            count = prepFastEnv(stream, envv, stream->rx->svars);
        }
#endif
        httpLog(app->trace, "fast", "context", "msg:Start FastCGI app, command:%s", command);

        if ((listen = createListener(app, stream)) == NULL) {
            return NULL;
        }
        if (!app->signal) {
            app->signal = mprAddSignalHandler(SIGCHLD, reapSignalHandler, app, NULL, MPR_SIGNAL_BEFORE);
        }
        if ((app->pid = fork()) < 0) {
            fprintf(stderr, "Fork failed for FastCGI");
            return NULL;

        } else if (app->pid == 0) {
            // Child 
            dup2(listen->fd, 0);

            /*
                When debugging, keep stdout/stderr open so printf/fprintf from the FastCGI app will show in the console.
             */
            for (i = FAST_DEBUG ? 3 : 1; i < 128; i++) {
                close(i);
            }
            if (execve(command, (char**) argv, (char**) NULL) < 0) {
                printf("Cannot exec fast app: %s\n", command);
            }
            return NULL;
        } else {
            //  Close without a shutdown as this is duped for the child
            close(listen->fd);
            listen->fd = -1;
            httpLog(app->trace, "fast", "context", "msg:FastCGI started app, command:%s, pid:%d", command, app->pid);
        }
    }
    return app;
}


/*
    Build the command arguments for the FastCGI app
 */
static cchar *buildFastArgs(FastApp *app, HttpStream *stream, int *argcp, cchar ***argvp)
{
    Fast        *fast;
    HttpRx      *rx;
    HttpTx      *tx;
    cchar       *actionProgram, *cp, *fileName, *query;
    char        **argv, *tok;
    ssize       len;
    int         argc, argind;

    fast = app->fast;
    rx = stream->rx;
    tx = stream->tx;
    fileName = tx->filename;

    actionProgram = 0;
    argind = 0;
    argc = *argcp;

    if (fast->launch && fast->launch[0]) {
        if (mprMakeArgv(fast->launch, (cchar***) &argv, 0) != 1) {
            mprLog("fast error", 0, "Cannot parse FastCGI launch command %s", fast->launch);
            return 0;
        }
        actionProgram = argv[0];
        argc++;

    } else if (tx->ext) {
        actionProgram = mprGetMimeProgram(rx->route->mimeTypes, tx->ext);
        if (actionProgram != 0) {
            argc++;
        }
    }
    /*
        Count the args for ISINDEX queries. Only valid if there is not a "=" in the query.
        If this is so, then we must not have these args in the query env also?
     */
    query = (char*) rx->parsedUri->query;
    if (query && !schr(query, '=')) {
        argc++;
        for (cp = query; *cp; cp++) {
            if (*cp == '+') {
                argc++;
            }
        }
    } else {
        query = 0;
    }
    len = (argc + 1) * sizeof(char*);
    argv = mprAlloc(len);

    if (actionProgram) {
        argv[argind++] = sclone(actionProgram);
    }
    argv[argind++] = sclone(fileName);
    if (query) {
        cp = stok(sclone(query), "+", &tok);
        while (cp) {
            argv[argind++] = mprEscapeCmd(mprUriDecode(cp), 0);
            cp = stok(NULL, "+", &tok);
        }
    }
    assert(argind <= argc);
    argv[argind] = 0;
    *argcp = argc;
    *argvp = (cchar**) argv;
    return argv[0];
}


/*
    Proxy process has died, so reap the status and inform relevant streams.
    WARNING: this may be called before all the data has been read from the socket, so we must not set eof = 1 here.
    WARNING: runs on the MPR dispatcher. Everyting must be "fast" locked.
 */
static void reapSignalHandler(FastApp *app, MprSignal *sp)
{
    Fast            *fast;
    FastRequest     *req;
    int             next, status;

    fast = app->fast;

    lock(fast);
    if (app->pid && waitpid(app->pid, &status, WNOHANG) == app->pid) {
        httpLog(app->trace, "fast", WEXITSTATUS(status) == 0 ? "context" : "error",
            "msg:FastCGI exited, pid:%d, status:%d", app->pid, WEXITSTATUS(status));
        if (app->signal) {
            mprRemoveSignalHandler(app->signal);
            app->signal = 0;
        }
        if (mprLookupItem(app->fast->idleApps, app) >= 0) {
            mprRemoveItem(app->fast->idleApps, app);
        }
        app->destroyed = 1;
        app->pid = 0;
        closeAppSockets(app);

        /*
            Notify all requests on their relevant dispatcher
            Introduce a short delay (1) in the unlikely event that a FastCGI program witout keep alive exits and we
            get notified before the I/O response is received.
         */
        for (ITERATE_ITEMS(app->requests, req, next)) {
            mprCreateLocalEvent(req->stream->dispatcher, "fast-reap", 0, fastHandlerReapResponse, req, 10);
        }
    }
    unlock(fast);
}


/*
    Kill the FastCGI app due to error or maxRequests limit being exceeded
 */
static void killFastApp(FastApp *app)
{
    lock(app->fast);
    if (app->pid) {
        httpLog(app->trace, "fast", "context", "msg:Kill FastCGI process, pid:%d", app->pid);
        if (app->pid) {
            kill(app->pid, SIGTERM);
            app->destroyed = 1;
        }
    }
    unlock(app->fast);
}


/*
    Create a socket connection to the FastCGI app. Retry if the FastCGI is not yet ready.
 */
static MprSocket *getFastSocket(FastApp *app)
{
    MprSocket   *socket;
    MprTicks    timeout;
    int         backoff, connected;

    connected = 0;
    backoff = 1;

    while ((socket = mprPopItem(app->sockets)) != 0) {
        mprRemoveSocketHandler(socket);
        if (socket->flags & (MPR_SOCKET_EOF | MPR_SOCKET_DISCONNECTED)) {
            continue;
        }
        return socket;
    }
    timeout = mprGetTicks() + FAST_CONNECT_TIMEOUT;
    while (!app->destroyed) {
        httpLog(app->trace, "fast.rx", "request", "FastCGI connect, ip:%s, port:%d", app->ip, app->port);
        socket = mprCreateSocket();
        if (mprConnectSocket(socket, app->ip, app->port, MPR_SOCKET_NODELAY) == 0) {
            connected = 1;
            break;
        }
        if (mprGetTicks() >= timeout) {
            break;
        }
        //  WARNING: yields
        mprSleep(backoff);
        backoff = backoff * 2;
        if (backoff > 50) {
            mprLog("fast", 2, "FastCGI retry connect to %s:%d", app->ip, app->port);
            if (backoff > 2000) {
                backoff = 2000;
            }
        }
    }
    if (!connected) {
        mprLog("fast error", 0, "Cannot connect to FastCGI at %s port %d", app->ip, app->port);
        socket = 0;
    }
    return socket;
}


/*
    Add the FastCGI spec packet header to the packet->prefix
    See the spec at https://github.com/fast-cgi/spec/blob/master/spec.md
 */
static HttpPacket *createFastPacket(HttpQueue *q, int type, HttpPacket *packet)
{
    FastRequest *req;
    uchar       *buf;
    ssize       len, pad;

    req = q->queueData;
    if (!packet) {
        packet = httpCreateDataPacket(0);
    }
    len = httpGetPacketLength(packet);

    packet->prefix = mprCreateBuf(16, 16);
    buf = (uchar*) packet->prefix->start;
    *buf++ = FAST_VERSION;
    *buf++ = type;

    assert(req->id);
    *buf++ = (uchar) (req->id >> 8);
    *buf++ = (uchar) (req->id & 0xFF);

    *buf++ = (uchar) (len >> 8);
    *buf++ = (uchar) (len & 0xFF);

    /*
        Use 8 byte padding alignment
     */
    pad = (len % 8) ? (8 - (len % 8)) : 0;
    assert(pad < 8);

    if (pad > 0) {
        if (mprGetBufSpace(packet->content) < pad) {
            mprGrowBuf(packet->content, pad);
        }
        mprAdjustBufEnd(packet->content, pad);
    }
    *buf++ = (uchar) pad;
    mprAdjustBufEnd(packet->prefix, 8);

    httpLog(req->trace, "tx.fast", "packet", "msg:FastCGI tx packet, type:%s, id:%d, lenth:%ld", fastTypes[type], req->id, len);
    return packet;
}


static void prepFastRequestStart(HttpQueue *q)
{
    HttpPacket  *packet;
    FastRequest *req;
    uchar       *buf;

    req = q->queueData;
    packet = httpCreateDataPacket(16);
    buf = (uchar*) packet->content->start;
    *buf++= 0;
    *buf++= FAST_RESPONDER;
    *buf++ = req->fast->keep ? FAST_KEEP_CONN : 0;

    // Reserved bytes 
    buf += 5;
    mprAdjustBufEnd(packet->content, 8);
    httpPutForService(req->connWriteq, createFastPacket(q, FAST_BEGIN_REQUEST, packet), HTTP_SCHEDULE_QUEUE);
}


static void prepFastRequestParams(HttpQueue *q)
{
    FastRequest *req;
    HttpStream  *stream;
    HttpPacket  *packet;
    HttpRx      *rx;

    req = q->queueData;
    stream = q->stream;
    rx = stream->rx;

    packet = httpCreateDataPacket(stream->limits->headerSize);
    packet->data = req;

    //  This is an Apache compatible hack for PHP 5.3
    //  mprAddKey(rx->headers, "REDIRECT_STATUS", itos(HTTP_CODE_MOVED_TEMPORARILY));

    copyFastParams(packet, rx->params, rx->route->envPrefix);
    copyFastVars(packet, rx->svars, "");
    copyFastVars(packet, rx->headers, "HTTP_");

    httpPutForService(req->connWriteq, createFastPacket(q, FAST_PARAMS, packet), HTTP_SCHEDULE_QUEUE);
    httpPutForService(req->connWriteq, createFastPacket(q, FAST_PARAMS, 0), HTTP_SCHEDULE_QUEUE);
}


/************************************************ FastRequest ***********************************************************/
/*
    Setup the request. Must be called locked.
 */
static FastRequest *allocFastRequest(FastApp *app, HttpStream *stream, MprSocket *socket)
{
    FastRequest    *req;

    req = mprAllocObj(FastRequest, manageFastRequest);
    req->stream = stream;
    req->socket = socket;
    req->trace = stream->trace;
    req->fast = app->fast;
    req->app = app;

    if (app->nextID >= MAXINT64) {
        app->nextID = 1;
    }
    req->id = app->nextID++ % FAST_MAX_ID;
    if (req->id == 0) {
        req->id = app->nextID++ % FAST_MAX_ID;
    }
    assert(req->id);

    req->connReadq = httpCreateQueue(stream->net, stream, HTTP->fastConnector, HTTP_QUEUE_RX, 0);
    req->connWriteq = httpCreateQueue(stream->net, stream, HTTP->fastConnector, HTTP_QUEUE_TX, 0);

    req->connReadq->max = FAST_Q_SIZE;
    req->connWriteq->max = FAST_Q_SIZE;

    req->connReadq->queueData = req;
    req->connWriteq->queueData = req;
    req->connReadq->pair = req->connWriteq;
    req->connWriteq->pair = req->connReadq;
    return req;
}


static void manageFastRequest(FastRequest *req, int flags)
{
    if (flags & MPR_MANAGE_MARK) {
        mprMark(req->fast);
        mprMark(req->app);
        mprMark(req->connReadq);
        mprMark(req->socket);
        mprMark(req->stream);
        mprMark(req->trace);
        mprMark(req->connWriteq);
    }
}


static void fastConnectorIncoming(HttpQueue *q, HttpPacket *packet)
{
    FastRequest    *req;

    req = q->queueData;
    httpPutForService(req->connWriteq, packet, HTTP_SCHEDULE_QUEUE);
}


/*
    Parse an incoming response packet from the FastCGI app
 */
static void fastConnectorIncomingService(HttpQueue *q)
{
    FastRequest     *req;
    FastApp         *app;
    HttpPacket      *packet, *tail;
    MprBuf          *buf;
    ssize           contentLength, len, padLength;
    int             requestID, type, version;

    req = q->queueData;
    app = req->app;
    app->lastActive = mprGetTicks();

    while ((packet = httpGetPacket(q)) != 0) {
        buf = packet->content;

        if (mprGetBufLength(buf) < FAST_PACKET_SIZE) {
            // Insufficient data
            httpPutBackPacket(q, packet);
            break;
        }
        version = mprGetCharFromBuf(buf);
        type = mprGetCharFromBuf(buf);
        requestID = (mprGetCharFromBuf(buf) << 8) | (mprGetCharFromBuf(buf) & 0xFF);

        contentLength = (mprGetCharFromBuf(buf) << 8) | (mprGetCharFromBuf(buf) & 0xFF);
        padLength = mprGetCharFromBuf(buf);
        /* reserved */ (void) mprGetCharFromBuf(buf);
        len = contentLength + padLength;

        if (version != FAST_VERSION) {
            httpLog(app->trace, "fast", "error", "msg:Bad FastCGI response version");
            break;
        }
        if (contentLength < 0 || contentLength > 65535) {
            httpLog(app->trace, "fast", "error", "msg:Bad FastCGI content length, length:%ld", contentLength);
            break;
        }
        if (padLength < 0 || padLength > 255) {
            httpLog(app->trace, "fast", "error", "msg:Bad FastCGI pad length, padding:%ld", padLength);
            break;
        }
        if (mprGetBufLength(buf) < len) {
            // Insufficient data
            mprAdjustBufStart(buf, -FAST_PACKET_SIZE);
            httpPutBackPacket(q, packet);
            break;
        }
        packet->type = type;

        httpLog(req->trace, "rx.fast", "packet", "msg:FastCGI rx packet, type:%s, id:%d, length:%ld, padding %ld",
            fastTypes[type], requestID, len, padLength);

        /*
            Split extra data off this packet
         */
        if ((tail = httpSplitPacket(packet, len)) != 0) {
            httpPutBackPacket(q, tail);
        }
        if (padLength) {
            // Discard padding
            mprAdjustBufEnd(packet->content, -padLength);
        }
        if (type == FAST_STDOUT || type == FAST_END_REQUEST) {
            fastHandlerResponse(req, type, packet);

        } else if (type == FAST_STDERR) {
            // Log and discard stderr
            httpLog(app->trace, "fast", "error", "msg:FastCGI stderr, uri:%s, error:%s",
                req->stream->rx->uri, mprBufToString(packet->content));

        } else {
            httpLog(app->trace, "fast", "error", "msg:FastCGI invalid packet, command:%s, type:%d", req->stream->rx->uri, type);
            app->destroy = 1;
        }
    }
}


/*
    Handle IO events on the network
 */
static void fastConnectorIO(FastRequest *req, MprEvent *event)
{
    Fast        *fast;
    HttpNet     *net;
    HttpPacket  *packet;
    ssize       nbytes;

    fast = req->fast;
    net = req->stream->net;

    if (req->eof) {
        // Network connection to client has been destroyed
        return;
    }
    if (event->mask & MPR_WRITABLE) {
        httpServiceQueue(req->connWriteq);
    }
    if (event->mask & MPR_READABLE) {
        lock(fast);
        if (req->socket) {
            packet = httpCreateDataPacket(ME_PACKET_SIZE);
            nbytes = mprReadSocket(req->socket, mprGetBufEnd(packet->content), ME_PACKET_SIZE);
            req->eof = mprIsSocketEof(req->socket);
            if (nbytes > 0) {
                req->bytesRead += nbytes;
                mprAdjustBufEnd(packet->content, nbytes);
                httpJoinPacketForService(req->connReadq, packet, 0);
                httpServiceQueue(req->connReadq);
            }
        }
        unlock(fast);
    }
    req->app->lastActivity = net->http->now;

    httpServiceNetQueues(net, 0);

    if (!req->eof) {
        enableFastConnector(req);
    }
}


/*
    Detect FastCGI closing the idle socket
 */
static void idleSocketIO(MprSocket *sp, MprEvent *event)
{
    mprCloseSocket(sp, 0);
}


static void enableFastConnector(FastRequest *req)
{
    MprSocket   *sp;
    HttpStream  *stream;
    int         eventMask;

    lock(req->fast);
    sp = req->socket;
    stream = req->stream;

    if (sp && !req->eof && !(sp->flags & MPR_SOCKET_CLOSED)) {
        eventMask = 0;
        if (req->connWriteq->count > 0) {
            eventMask |= MPR_WRITABLE;
        }
        /*
            We always ingest from the connector and packets are queued at the fastHandler head writeq.
         */
        if (stream->writeq->count < stream->writeq->max) {
            eventMask |= MPR_READABLE;
        }
        if (eventMask) {
            if (sp->handler == 0) {
                mprAddSocketHandler(sp, eventMask, stream->dispatcher, fastConnectorIO, req, 0);
            } else {
                mprWaitOn(sp->handler, eventMask);
            }
        } else if (sp->handler) {
            mprWaitOn(sp->handler, eventMask);
        }
        req->eventMask = eventMask;
    }
    unlock(req->fast);
}


/*
    Send request and post body data to the fastCGI app
 */
static void fastConnectorOutgoingService(HttpQueue *q)
{
    Fast            *fast;
    FastApp         *app;
    FastRequest     *req, *cp;
    HttpNet         *net;
    ssize           written;
    int             errCode, next;

    req = q->queueData;
    app = req->app;
    fast = app->fast;
    app->lastActive = mprGetTicks();
    net = q->net;

    if (req->eof || req->socket == 0) {
        return;
    }
    lock(fast);
    req->writeBlocked = 0;

    while (q->first || net->ioIndex) {
        if (net->ioIndex == 0 && buildFastVec(q) <= 0) {
            freeFastPackets(q, 0);
            break;
        }
        written = mprWriteSocketVector(req->socket, net->iovec, net->ioIndex);
        if (written < 0) {
            errCode = mprGetError();
            if (errCode == EAGAIN || errCode == EWOULDBLOCK) {
                /*  Socket full, wait for an I/O event */
                req->writeBlocked = 1;
                break;
            }
            mprSetSocketEof(req->socket, 1);
            req->eof = 1;
            app->destroy = 1;
            httpLog(req->app->trace, "fast", "error", "msg:Write error, errno:%d", errCode);

            for (ITERATE_ITEMS(app->requests, cp, next)) {
                fastHandlerResponse(cp, FAST_COMMS_ERROR, NULL);
            }
            break;

        } else if (written > 0) {
            freeFastPackets(q, written);
            adjustFastVec(net, written);

        } else {
            /* Socket full */
            break;
        }
    }
    req->app->lastActivity = q->net->http->now;
    enableFastConnector(req);
    unlock(fast);
}


/*
    Build the IO vector. Return the count of bytes to be written. Return -1 for EOF.
 */
static MprOff buildFastVec(HttpQueue *q)
{
    HttpNet     *net;
    HttpPacket  *packet;

    net = q->net;
    /*
        Examine each packet and accumulate as many packets into the I/O vector as possible. Leave the packets on
        the queue for now, they are removed after the IO is complete for the entire packet.
     */
     for (packet = q->first; packet; packet = packet->next) {
        if (net->ioIndex >= (ME_MAX_IOVEC - 2)) {
            break;
        }
        if (httpGetPacketLength(packet) > 0 || packet->prefix) {
            addFastPacket(net, packet);
        }
    }
    return net->ioCount;
}


/*
    Add a packet to the io vector. Return the number of bytes added to the vector.
 */
static void addFastPacket(HttpNet *net, HttpPacket *packet)
{
    assert(net->ioIndex < (ME_MAX_IOVEC - 2));

    if (packet->prefix && mprGetBufLength(packet->prefix) > 0) {
        addToFastVector(net, mprGetBufStart(packet->prefix), mprGetBufLength(packet->prefix));
    }
    if (packet->content && mprGetBufLength(packet->content) > 0) {
        addToFastVector(net, mprGetBufStart(packet->content), mprGetBufLength(packet->content));
    }
}


/*
    Add one entry to the io vector
 */
static void addToFastVector(HttpNet *net, char *ptr, ssize bytes)
{
    assert(bytes > 0);

    net->iovec[net->ioIndex].start = ptr;
    net->iovec[net->ioIndex].len = bytes;
    net->ioCount += bytes;
    net->ioIndex++;
}


static void freeFastPackets(HttpQueue *q, ssize bytes)
{
    HttpPacket  *packet;
    ssize       len;

    assert(q->count >= 0);
    assert(bytes >= 0);

    while ((packet = q->first) != 0) {
        if (packet->flags & HTTP_PACKET_END) {
            ;
        } else if (bytes > 0) {
            if (packet->prefix) {
                len = mprGetBufLength(packet->prefix);
                len = min(len, bytes);
                mprAdjustBufStart(packet->prefix, len);
                bytes -= len;
                /* Prefixes don't count in the q->count. No need to adjust */
                if (mprGetBufLength(packet->prefix) == 0) {
                    /* Ensure the prefix is not resent if all the content is not sent */
                    packet->prefix = 0;
                }
            }
            if (packet->content) {
                len = mprGetBufLength(packet->content);
                len = min(len, bytes);
                mprAdjustBufStart(packet->content, len);
                bytes -= len;
                q->count -= len;
                assert(q->count >= 0);
            }
        }
        if ((packet->flags & HTTP_PACKET_END) || (httpGetPacketLength(packet) == 0 && !packet->prefix)) {
            /* Done with this packet - consume it */
            httpGetPacket(q);
        } else {
            /* Packet still has data to be written */
            break;
        }
    }
}


/*
    Clear entries from the IO vector that have actually been transmitted. Support partial writes.
 */
static void adjustFastVec(HttpNet *net, ssize written)
{
    MprIOVec    *iovec;
    ssize       len;
    int         i, j;

    if (written == net->ioCount) {
        net->ioIndex = 0;
        net->ioCount = 0;
    } else {
        /*
            Partial write of an vector entry. Need to copy down the unwritten vector entries.
         */
        net->ioCount -= written;
        assert(net->ioCount >= 0);
        iovec = net->iovec;
        for (i = 0; i < net->ioIndex; i++) {
            len = iovec[i].len;
            if (written < len) {
                iovec[i].start += written;
                iovec[i].len -= written;
                break;
            } else {
                written -= len;
            }
        }
        /*
            Compact the vector
         */
        for (j = 0; i < net->ioIndex; ) {
            iovec[j++] = iovec[i++];
        }
        net->ioIndex = j;
    }
}


/*
    FastCGI encoding of strings
 */
static void encodeFastLen(MprBuf *buf, cchar *s)
{
    ssize   len;

    len = slen(s);
    if (len <= 127) {
        mprPutCharToBuf(buf, (uchar) len);
    } else {
        mprPutCharToBuf(buf, (uchar) (((len >> 24) & 0x7f) | 0x80));
        mprPutCharToBuf(buf, (uchar) ((len >> 16) & 0xff));
        mprPutCharToBuf(buf, (uchar) ((len >> 8) & 0xff));
        mprPutCharToBuf(buf, (uchar) (len & 0xff));
    }
}


/*
    FastCGI encoding of names and values. Used to send params.
 */
static void encodeFastName(HttpPacket *packet, cchar *name, cchar *value)
{
    MprBuf      *buf;

    buf = packet->content;
    encodeFastLen(buf, name);
    encodeFastLen(buf, value);
    mprPutStringToBuf(buf, name);
    mprPutStringToBuf(buf, value);
}


static void copyFastInner(HttpPacket *packet, cchar *key, cchar *value, cchar *prefix)
{
    FastRequest    *req;

    req = packet->data;
    if (prefix) {
        key = sjoin(prefix, key, NULL);
    }
    httpLog(req->trace, "tx.fast", "detail", "msg:FastCGI env, key:%s, value:%s", key, value);
    encodeFastName(packet, key, value);
}


static void copyFastVars(HttpPacket *packet, MprHash *vars, cchar *prefix)
{
    MprKey  *kp;

    for (ITERATE_KEYS(vars, kp)) {
        if (kp->data) {
            copyFastInner(packet, kp->key, kp->data, prefix);
        }
    }
}


static void copyFastParams(HttpPacket *packet, MprJson *params, cchar *prefix)
{
    MprJson     *param;
    int         i;

    for (ITERATE_JSON(params, param, i)) {
        copyFastInner(packet, param->name, param->value, prefix);
    }
}


static int fastConnectDirective(MaState *state, cchar *key, cchar *value)
{
    Fast    *fast;
    cchar   *endpoint, *args, *ip;
    char    *option, *ovalue, *tok;
    int     port;

    fast = getFast(state->route);

    if (!maTokenize(state, value, "%S ?*", &endpoint, &args)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    fast->endpoint = endpoint;
    if (mprParseSocketAddress(fast->endpoint, &fast->ip, &fast->port, NULL, 0) < 0) {
        mprLog("fast", 0, "Cannot parse listening endpoint");
        return MPR_ERR_BAD_SYNTAX;
    }
    if (args) {
        for (option = maGetNextArg(sclone(args), &tok); option; option = maGetNextArg(tok, &tok)) {
            option = ssplit(option, " =\t,", &ovalue);
            ovalue = strim(ovalue, "\"'", MPR_TRIM_BOTH);

            if (smatch(option, "maxRequests")) {
                fast->maxRequests = httpGetNumber(ovalue);
                if (fast->maxRequests < 1) {
                    fast->maxRequests = 1;
                }
            } else
            if (smatch(option, "launch")) {
                fast->launch = sclone(httpExpandRouteVars(state->route, ovalue));

            } else if (smatch(option, "keep")) {
                if (ovalue == NULL || smatch(ovalue, "true")) {
                    fast->keep = 1;
                } else if (smatch(ovalue, "false")) {
                    fast->keep = 0;
                } else {
                    fast->keep = httpGetNumber(ovalue);
                }

            } else if (smatch(option, "max")) {
                fast->maxApps = httpGetInt(ovalue);
                if (fast->maxApps < 1) {
                    fast->maxApps = 1;
                }

            } else if (smatch(option, "min")) {
                fast->minApps = httpGetInt(ovalue);
                if (fast->minApps < 1) {
                    fast->minApps = 0;
                }

            } else if (smatch(option, "multiplex")) {
                fast->multiplex = httpGetInt(ovalue);
                if (fast->multiplex < 1) {
                    fast->multiplex = 1;
                }

            } else if (smatch(option, "timeout")) {
                fast->appTimeout = httpGetTicks(ovalue);
                if (fast->appTimeout < (30 * TPS)) {
                    fast->appTimeout = 30 * TPS;
                }
            } else {
                mprLog("fast error", 0, "Unknown FastCGI option %s", option);
                return MPR_ERR_BAD_SYNTAX;
            }
        }
    }
    /*
        Pre-test the endpoint
     */
    if (mprParseSocketAddress(fast->endpoint, &ip, &port, NULL, 9128) < 0) {
        mprLog("fast error", 0, "Cannot bind FastCGI app address: %s", fast->endpoint);
        return MPR_ERR_BAD_SYNTAX;
    }
    return 0;
}


/*
    Create listening socket that is passed to the FastCGI app (and then closed after forking)
 */
static MprSocket *createListener(FastApp *app, HttpStream *stream)
{
    Fast        *fast;
    MprSocket   *listen;
    int         flags;

    fast = app->fast;

    listen = mprCreateSocket();

    /*
        Port may be zero in which case a dynamic port number is used. If port specified and max > 1, then must reruse port.
     */
    flags = MPR_SOCKET_BLOCK | MPR_SOCKET_NODELAY | MPR_SOCKET_INHERIT;
    if (fast->multiplex > 1 && fast->port) {
        flags |= MPR_SOCKET_REUSE_PORT;
    }
    if (mprListenOnSocket(listen, fast->ip, fast->port, flags) == SOCKET_ERROR) {
        if (mprGetError() == EADDRINUSE) {
            httpLog(app->trace, "fast", "error",
                "msg:Cannot open listening socket for FastCGI. Already bound, address:%s, port:%d",
                fast->ip ? fast->ip : "*", fast->port);
        } else {
            httpLog(app->trace, "fast", "error", "msg:Cannot open listening socket for FastCGI, address:%s port:%d",
                fast->ip ? fast->ip : "*", fast->port);
        }
        httpError(stream, HTTP_CODE_INTERNAL_SERVER_ERROR, "Cannot create listening endpoint");
        return NULL;
    }
    app->ip = fast->ip;
    if (fast->port == 0) {
        app->port = getListenPort(listen);
    } else {
        app->port = fast->port;
    }
    httpLog(app->trace, "fast", "context", "msg:Listening for FastCGI, endpoint: %s, port:%d", 
        (app->ip && *app->ip) ? app->ip : "*", app->port);
    return listen;
}


static int getListenPort(MprSocket *socket)
{
    struct sockaddr_in sin;
    socklen_t len;

    len = sizeof(sin);
    if (getsockname(socket->fd, (struct sockaddr *)&sin, &len) < 0) {
        return MPR_ERR_CANT_FIND;
    }
    return ntohs(sin.sin_port);
}


#if KEEP
static int prepFastEnv(HttpStream *stream, cchar **envv, MprHash *vars)
{
    HttpRoute   *route;
    MprKey      *kp;
    cchar       *canonical;
    char        *cp;
    int         index = 0;

    route = stream->rx->route;

    for (ITERATE_KEYS(vars, kp)) {
        if (kp->data) {
            cp = sjoin(kp->key, "=", kp->data, NULL);
            if (stream->rx->route->flags & HTTP_ROUTE_ENV_ESCAPE) {
                //  This will escape: "&;`'\"|*?~<>^()[]{}$\\\n" and also on windows \r%
                cp = mprEscapeCmd(cp, 0);
            }
            envv[index] = cp;
            for (; *cp != '='; cp++) {
                if (*cp == '-') {
                    *cp = '_';
                } else {
                    *cp = toupper((uchar) *cp);
                }
            }
            index++;
        }
    }
    canonical = route->canonical ? httpUriToString(route->canonical, 0) : route->host->defaultEndpoint->ip;
    envv[index++] = sfmt("FCGI_WEB_SERVER_ADDRS=%s", canonical);
    envv[index] = 0;
#if UNUSED || 1
    int i;
    for (i = 0; i < index; i++) {
        print("ENV[%d] = %s", i, envv[i]);
    }
#endif
    return index;
}
#endif


#if ME_DEBUG
static void fastInfo(void *ignored, MprSignal *sp)
{
    Fast            *fast;
    FastApp         *app;
    FastRequest     *req;
    Http            *http;
    HttpHost        *host;
    HttpRoute       *route;
    HttpStream      *stream;
    int             nextHost, nextRoute, nextApp, nextReq;

    http = HTTP;
    print("\nFast Report:");
    for (ITERATE_ITEMS(http->hosts, host, nextHost)) {
        for (ITERATE_ITEMS(host->routes, route, nextRoute)) {
            if ((fast = route->extended) == 0 || fast->magic != FAST_MAGIC) {
                continue;
            }
            print("\nRoute %-40s ip %s:%d", route->pattern, fast->ip, fast->port);
            for (ITERATE_ITEMS(fast->apps, app, nextApp)) {
                print("\n    App free sockets %d, requests %d, ip %s:%d\n",
                    app->sockets->length, app->requests->length, app->ip, app->port);
                for (ITERATE_ITEMS(app->requests, req, nextReq)) {
                    stream = req->stream;
                    print("        Req %p ID %d, socket %p flags 0x%x, req eof %d, state %d, finalized output %d, input %d, bytes %d, error %d, netMask 0x%x reqMask 0x%x",
                        req, (int) req->id, req->socket, req->socket->flags, req->eof, stream->state,
                        stream->tx->finalizedOutput, stream->tx->finalizedInput, (int) req->bytesRead, stream->error,
                        stream->net->eventMask, req->eventMask);
                }
            }
        }
    }
}
#endif

#endif /* ME_COM_FAST */

/*
    Copyright (c) Embedthis Software. All Rights Reserved.
    This software is distributed under a commercial license. Consult the LICENSE.md
    distributed with this software for full details and copyrights.
 */
