/*
    gateway-length.tst.c - A gateway's Content-Length must match the body the gateway produces

    Appweb took a CGI or FastCGI program's Content-Length at face value, installed it as the response
    content length and disabled chunking -- then forwarded however many bytes the program actually
    wrote. The response on the wire did not match its own framing statement.

    Declaring more than is sent leaves the client waiting at the declared length, so the next response
    on the connection is read as the tail of this one. Declaring less leaves the excess at the head of
    the client's buffer, where it is parsed as the start of the next response -- gateway output injected
    into a later response, and behind a connection pooling proxy, into a different client's response.
    The declared value was also read with a lenient conversion, so "5abc" meant 5 and a 20 digit value
    wrapped.

    Each probe reads the gateway's response, then issues a second request for /alive.html on the same
    keep-alive connection -- the connection a desync would poison. The mismatch cases must not answer it:
    the fix ends the connection. The well formed cases must still answer it, and so must a refused
    Content-Length, which is caught before any header is committed and needs no connection closed.

    Copyright (c) All Rights Reserved. See details at the end of the file.
 */

/********************************* Includes ***********************************/

#include "testme.h"
#include "appweb.h"

/*********************************** Locals ***********************************/

#define MAX_RESPONSE 8192
#define FIRST_WAIT   5000               /* Wait for the response to start */
#define TAIL_WAIT    1000               /* Wait for more of a response already begun, or a second one */

static cchar *host = "127.0.0.1";
static int   port;

/************************************ Code ************************************/

/*
    Read from sp into response[len..] until it goes quiet or closes, and return the new length.

    Wait up to FIRST_WAIT for a response to start, then TAIL_WAIT for anything more. Do not rely on the
    close to end the read: whether an errored connection closes promptly varies with the server trace
    level, and a stalled read would only ever be seen as a test timeout.
 */
static ssize drain(MprSocket *sp, char *response, ssize len)
{
    MprTicks wait;
    ssize    started, nbytes;

    for (started = len; len < MAX_RESPONSE - 1; len += nbytes) {
        wait = (len == started) ? FIRST_WAIT : TAIL_WAIT;
        if (mprWaitForSingleIO((int) sp->fd, MPR_READABLE, wait) <= 0) {
            break;
        }
        if ((nbytes = mprReadSocket(sp, &response[len], MAX_RESPONSE - 1 - len)) <= 0) {
            break;
        }
    }
    response[len] = '\0';
    return len;
}


/*
    Request uri, read the response, then request /alive.html on the same keep-alive connection, and
    return everything the server wrote. A connection the gateway desynced must not answer the second
    request.
 */
static cchar *probe(cchar *uri)
{
    static char response[MAX_RESPONSE];
    MprSocket   *sp;
    char        request[1024];
    ssize       len;

    response[0] = '\0';
    if ((sp = mprCreateSocket()) == 0) {
        return response;
    }
    mprAddRoot(sp);
    if (mprConnectSocket(sp, host, port, 0) < 0) {
        mprRemoveRoot(sp);
        return response;
    }
    mprSetSocketBlockingMode(sp, 1);

    fmt(request, sizeof(request), "GET %s HTTP/1.1\r\nHost: x\r\n\r\n", uri);
    mprWriteSocket(sp, request, slen(request));
    len = drain(sp, response, 0);

    fmt(request, sizeof(request), "GET /alive.html HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n");
    if (mprWriteSocket(sp, request, slen(request)) > 0) {
        drain(sp, response, len);
    }
    mprCloseSocket(sp, 0);
    mprRemoveRoot(sp);
    return response;
}


/*
    Count HTTP response status lines. More than one means the connection carried the second request's
    response as well, which a desynced connection must never do.
 */
static int responses(cchar *text)
{
    cchar *cp;
    int   count;

    for (count = 0, cp = text; (cp = scontains(cp, "HTTP/1.1 ")) != 0; count++) {
        cp += 9;
    }
    return count;
}


/*
    A gateway whose declared length disagrees with its body must not leave a usable connection behind.
 */
static void checkMismatch(cchar *uri, cchar *what)
{
    cchar *r;

    r = probe(uri);
    ttrue(scontains(r, "ALIVE") == 0, "%s must not answer the next request on the connection", what);
    ttrue(responses(r) <= 1, "%s must not yield a second response", what);
}


/*
    A well formed gateway response is served intact and the connection remains usable.
 */
static void checkOk(cchar *uri, cchar *length, cchar *what)
{
    cchar *r;

    r = probe(uri);
    tcontains(r, "200 OK", "%s must be served", what);
    tcontains(r, length, "%s must carry its declared length", what);
    tcontains(r, "ALIVE", "%s must leave the connection usable", what);
    teqi(responses(r), 2, "%s must yield both responses", what);
}


/*
    A Content-Length that is not a length at all is caught while parsing the header block, before any
    header is committed, so it costs a 502 and nothing else. The connection is still well framed.
 */
static void checkRefused(cchar *uri, cchar *what)
{
    cchar *r;

    r = probe(uri);
    tcontains(r, "502 Bad Gateway", "%s must be refused", what);
    tcontains(r, "ALIVE", "%s must not cost the connection", what);
}


int main(int argc, char **argv)
{
    cchar *r;

    mprCreate(argc, argv, 0);
    mprStart();
    port = tgeti("TM_HTTP_PORT", 4100);

    //  The ordinary cases must not regress: the body arrives and the connection stays usable
    checkOk("/hdrtest.cgi?cl-exact", "Content-Length: 5", "CGI declaring its exact body length");
    checkOk("/hdrtest.cgi?cl-empty", "Content-Length: 0", "CGI declaring an empty body");

    r = probe("/hdrtest.cgi?cl-exact");
    tcontains(r, "SHORT", "CGI body must arrive intact");

    //  Declares 9999 and writes 5. The next response would be read as the remainder of this one
    checkMismatch("/hdrtest.cgi?cl-long", "CGI declaring more than it writes");

    //  Declares 2 and writes 49, the excess being a complete response of its own
    r = probe("/hdrtest.cgi?cl-short");
    ttrue(scontains(r, "INJECTED") == 0, "excess CGI output must not reach the client");
    ttrue(scontains(r, "ALIVE") == 0, "CGI overrun must not answer the next request on the connection");
    ttrue(responses(r) <= 1, "CGI overrun must not yield a second response");

    //  Not 1*DIGIT, and an int64 overflow. Both were read as a length by the lenient conversion
    checkRefused("/hdrtest.cgi?cl-bad", "a non numeric CGI Content-Length");
    checkRefused("/hdrtest.cgi?cl-huge", "an overflowing CGI Content-Length");

#if ME_UNIX_LIKE
    /*
        The FastCGI parser is a copy of the CGI one and carried the same defect, so it needs its own
        coverage rather than an argument by similarity. "-b 1" writes exactly ten body bytes and "-L"
        emits its argument verbatim as the Content-Length. The handler is built for ME_UNIX_LIKE
        targets only, and fastProgram is not built without it.
     */
    checkOk("/fast-bin/fastProgram?SWITCHES=-b%201%20-L%2010", "Content-Length: 10",
            "FastCGI declaring its exact body length");
    checkMismatch("/fast-bin/fastProgram?SWITCHES=-b%201%20-L%209999", "FastCGI declaring more than it writes");
    checkMismatch("/fast-bin/fastProgram?SWITCHES=-b%201%20-L%202", "FastCGI declaring less than it writes");
    checkRefused("/fast-bin/fastProgram?SWITCHES=-b%201%20-L%205abc", "a non numeric FastCGI Content-Length");
#endif

    mprDestroy();
    return 0;
}

/*
    Copyright (c) Embedthis Software. All Rights Reserved.
    This software is distributed under a commercial license. Consult the LICENSE.md
    distributed with this software for full details and copyrights.
 */
