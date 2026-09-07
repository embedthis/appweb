/*
    testBenchHandler.c - Test handler for benchmark suite

    Provides minimal action handlers for performance benchmarking and for the session tests, which
    need a live server-issued session id obtained without authenticating.

    Gated on ME_COM_TEST, the switch that means "build the test modules", the same one testHandler.c
    uses. A production build turns these off with ME_COM_TEST=0.

    Copyright (c) All Rights Reserved. See copyright notice at the bottom of the file.
 */

#include "appweb.h"

#if ME_COM_TEST || ME_BENCHMARK

/*
    streamAction limits. STREAM_CHUNK is one write; STREAM_MAX caps what a request can ask for.
 */
#define STREAM_CHUNK    4080
#define STREAM_DEFAULT  65536
#define STREAM_MAX      (64 * 1024 * 1024)

/*
    Simple success action - minimal overhead for baseline benchmarking
 */
static void testBenchSuccess(HttpStream *stream)
{
    httpSetStatus(stream, 200);
    httpWrite(stream->writeq, "OK");
    httpFinalize(stream);
}

/*
    WebSocket echo callback - handles incoming WebSocket messages
    Echoes back messages with the same type (text/binary)
 */
static void wsEchoCallback(HttpStream *stream, int event, int arg)
{
    HttpPacket *packet;

    if (event == HTTP_EVENT_READABLE) {
        // Echo back all messages
        for (packet = httpGetPacket(stream->readq); packet; packet = httpGetPacket(stream->readq)) {
            if (packet->type == WS_MSG_TEXT || packet->type == WS_MSG_BINARY) {
                httpSendBlock(stream, packet->type, httpGetPacketStart(packet), httpGetPacketLength(packet), 0);
            }
        }
    } else if (event == HTTP_EVENT_APP_CLOSE) {
        // Connection closed - nothing special needed
    }
}

/*
    WebSocket echo handler - for WebSocket benchmarking
    Sets up the notifier to echo back messages
 */
static void testBenchWs(HttpStream *stream)
{
    httpSetStreamNotifier(stream, wsEchoCallback);
}

/*
    Upload response handler - responds to successful upload tests
 */
static void testBenchUpload(HttpStream *stream)
{
    httpSetStatus(stream, 200);
    httpFinalize(stream);
}


/*
    Report what the upload filter staged, so an upload can be verified behind a handler that is not
    a gateway.

    Prints one line per staged file from rx->files, the filter's own record, then every request
    parameter, which is where the filter's FILE_SIZE_<name> and FILE_CLIENT_FILENAME_<name> land.
    A test can assert the two agree. The FILE_<n>_* spelling is not among them: httpCreateCGIParams
    synthesises those for a gateway, so they appear on the CGI and FastCGI routes and not here.

    ITERATE_ITEMS leaves index advanced past the item it yielded, so index is the 1-based file
    number, the same convention var.c uses for FILE_<n>_*.
 */
static void uploadReportAction(HttpStream *stream)
{
    HttpUploadFile  *file;
    MprJson         *params, *param;
    int             index;

    httpSetStatus(stream, 200);
    httpSetHeaderString(stream, "Content-Type", "text/plain");

    for (ITERATE_ITEMS(stream->rx->files, file, index)) {
        httpWrite(stream->writeq, "FILE %d name=%s client=%s size=%zd type=%s\n",
                  index, file->name ? file->name : "",
                  file->clientFilename ? file->clientFilename : "",
                  file->size, file->contentType ? file->contentType : "");
    }
    if ((params = httpGetParams(stream)) != 0) {
        for (ITERATE_JSON(params, param, index)) {
            httpWrite(stream->writeq, "PARAM %s=%s\n", param->name, param->value ? param->value : "");
        }
    }
    httpWrite(stream->writeq, "FILES %d\n", stream->rx->files ? mprGetListLength(stream->rx->files) : 0);
    httpFinalize(stream);
}


/*
    Write "size" bytes of a repeating printable pattern, for the response flow-control tests.

    HTTP_BLOCK must not be relaxed to a buffering write. An action runs on a worker thread, so
    blocking is legitimate, and only a blocking write stops when the write queue fills and resumes
    when it drains. A buffered write queues the whole body regardless of backpressure, so a
    slow-reader test built on it would pass against a server with flow control removed.

    The size is clamped: unclamped it would be an unauthenticated memory-exhaustion endpoint in
    every ME_COM_TEST build.
 */
static void streamAction(HttpStream *stream)
{
    char    pattern[STREAM_CHUNK + 1];
    cchar   *value;
    ssize   size, remaining, thisWrite;
    int     i;

    value = httpGetParam(stream, "size", 0);
    size = value ? (ssize) stoi(value) : STREAM_DEFAULT;
    if (size < 0) {
        size = STREAM_DEFAULT;
    }
    if (size > STREAM_MAX) {
        size = STREAM_MAX;
    }
    /*
        A 50-digit line plus a newline, so a test can check structure at the tail as well as the
        total. A defect that drops a window mid-body leaves the total wrong; one that duplicates a
        window leaves the structure wrong. Neither check alone catches both.
     */
    for (i = 0; i < STREAM_CHUNK; i++) {
        pattern[i] = (char) (((i + 1) % 51 == 0) ? '\n' : ('0' + (i % 10)));
    }
    pattern[STREAM_CHUNK] = '\0';

    httpSetStatus(stream, 200);
    httpSetHeaderString(stream, "Content-Type", "text/plain");
    httpSetContentLength(stream, size);

    for (remaining = size; remaining > 0; remaining -= thisWrite) {
        thisWrite = min(remaining, STREAM_CHUNK);
        if (httpWriteBlock(stream->writeq, pattern, thisWrite, HTTP_BLOCK) != thisWrite) {
            break;
        }
    }
    httpFinalize(stream);
}

/*
    Session variable read/write, so a test can establish an anonymous session and observe its state.

    This is the only way a test can hold a genuine, live, server-issued session id obtained WITHOUT
    authenticating - which is what the session-fixation and id-rotation tests need. A test that plants
    a fabricated id proves nothing, because an id the server never issued was never going to be
    adopted; the case that matters is a real one presented at the privilege transition.

    Ordering is deliberate and load bearing: a GET reads and must NOT create a session, so an
    unauthenticated client cannot mint server state simply by asking. A POST writes and therefore
    does establish one. Do not "fix" the GET to create a session - see test/session/novel-cookie.
 */
static void sessionTestAction(HttpStream *stream)
{
    cchar   *value;

    if (scaselessmatch(stream->rx->method, "POST")) {
        value = httpGetParam(stream, "number", 0);
        httpSetSessionVar(stream, "number", value);
    } else {
        value = httpGetSessionVar(stream, "number", 0);
    }
    httpSetStatus(stream, 200);
    httpSetHeaderString(stream, "Content-Type", "text/plain");
    httpWrite(stream->writeq, "Number %s\n", value ? value : "null");
    httpFinalize(stream);
}


/*
    Stream-notifier leak probe.

    A handler that installs a stream notifier owns it for one request. On a keep-alive connection
    the stream is reset and reused, so a notifier left installed runs for a request served by a
    different handler, and reads that handler's queueData as its own private type. The proxy
    handler installs one, so the pairing is reachable in an ordinary configuration.

    /action/notifier-probe installs a notifier that counts every firing not belonging to its own
    request; /action/notifier-leaks reports the count. Zero is the invariant. The route is unique to
    the probe, so rx->uri identifies a firing exactly; a firing after the reset sees a fresh rx with
    no uri, which is likewise not the probe's own.
 */
static volatile int notifierLeakCount;

static void probeNotifier(HttpStream *stream, int event, int arg)
{
    cchar   *uri;

    uri = stream->rx ? stream->rx->uri : 0;
    if (!smatch(uri, "/action/notifier-probe")) {
        mprAtomicAdd(&notifierLeakCount, 1);
    }
}

static void notifierProbeAction(HttpStream *stream)
{
    httpSetStreamNotifier(stream, probeNotifier);
    httpSetStatus(stream, 200);
    httpSetHeaderString(stream, "Content-Type", "text/plain");
    httpWrite(stream->writeq, "PROBE\n");
    httpFinalize(stream);
}

static void notifierLeaksAction(HttpStream *stream)
{
    httpSetStatus(stream, 200);
    httpSetHeaderString(stream, "Content-Type", "text/plain");
    httpWrite(stream->writeq, "LEAKS %d\n", notifierLeakCount);
    httpFinalize(stream);
}


/*
    Module initialization - called from config.c maLoadModules()
    Registers action callbacks via httpDefineAction
 */
PUBLIC int httpTestBenchInit(Http *http, MprModule *module)
{
    // Exact match only via hash lookup
    // Register action callbacks - httpDefineAction uses URI path only
    httpDefineAction("/test/bench/", testBenchSuccess);
    httpDefineAction("/test/ws/", testBenchWs);
    httpDefineAction("/test/upload/", testBenchUpload);
    httpDefineAction("/action/sessionTest", sessionTestAction);
    httpDefineAction("/action/sessionCacheTest", sessionTestAction);
    httpDefineAction("/action/sessionCacheCookieTest", sessionTestAction);
    httpDefineAction("/action/sessionXsrfTest", sessionTestAction);

    /*
        Scenario-test fixtures. actionHandler dispatches on an exact rx->pathInfo match, so each
        needs its own entry; a prefix will not do. /wsecho reuses testBenchWs rather than adding a
        second echo.
     */
    httpDefineAction("/action/stream", streamAction);
    httpDefineAction("/action/upload", uploadReportAction);
    httpDefineAction("/wsecho", testBenchWs);
    httpDefineAction("/wslimit", testBenchWs);
    httpDefineAction("/action/notifier-probe", notifierProbeAction);
    httpDefineAction("/action/notifier-leaks", notifierLeaksAction);
    return 0;
}

#endif // ME_COM_TEST || ME_BENCHMARK

/*
    Copyright (c) Embedthis Software. All Rights Reserved.
    This software is distributed under a commercial license. Consult the LICENSE.md
    distributed with this software for full details and copyrights.
 */
