/*
    close-on-error.tst.c - HTTP_CLOSE connection close ratchet

    RFC 9112 6.1 requires a server that rejects a request over ambiguous framing to close the
    connection: server and front-end have provably disagreed about where the message ends, so the
    connection can no longer carry another message. Appweb raises every such rejection with
    HTTP_CLOSE, which zeroes keepAliveCount and puts "Connection: close" in the response, but the
    completion path only ever closed the socket for HTTP/1.0. An HTTP/1.1 connection was announced
    as closing and then held open until the inactivity timeout.

    Verifies that a request rejected with HTTP_CLOSE closes the connection on both HTTP/1.1 and
    HTTP/1.0, that the wire behaviour matches the announced Connection header, and -- the guard
    against over-closing -- that a request answered normally still keeps the connection alive and
    can be followed by another request on the same socket.

    Requests target /index.html. These are all header-parse verdicts, reached before routing, so any
    route observes them.

    Copyright (c) All Rights Reserved. See details at the end of the file.
 */

/********************************* Includes ***********************************/

#include "testme.h"
#include "appweb.h"

/*********************************** Locals ***********************************/

#define MAX_RESPONSE 8192
#define FIRST_WAIT   5000               /* Wait for the response to start */
#define CLOSE_WAIT   2000               /* Wait for the close once a response has arrived */
#define TAIL_WAIT    300                /* Wait for more of a response already begun */

static cchar *host = "127.0.0.1";
static int   port;

/*
    A response and whether the peer closed the connection after it.
 */
typedef struct Result {
    char response[MAX_RESPONSE];
    int  closed;
} Result;

/************************************ Code ************************************/

/*
    Read from sp into result until the peer closes or nothing more arrives within tailWait. Wait up
    to FIRST_WAIT for the response to start so a slow first byte is not read as a close.
 */
static void readResult(MprSocket *sp, Result *result, MprTicks tailWait)
{
    MprTicks wait;
    ssize    len, nbytes;

    len = slen(result->response);
    while (len < (ssize) sizeof(result->response) - 1) {
        wait = (len == 0) ? FIRST_WAIT : tailWait;
        if (mprWaitForSingleIO((int) sp->fd, MPR_READABLE, wait) <= 0) {
            break;
        }
        if ((nbytes = mprReadSocket(sp, &result->response[len], sizeof(result->response) - 1 - len)) <= 0) {
            result->closed = mprIsSocketEof(sp) ? 1 : 0;
            break;
        }
        len += nbytes;
    }
    result->response[len] = '\0';
}


/*
    Send one request and read the response. A server that honours the close ends the read at EOF
    immediately; one that does not costs CLOSE_WAIT before the assertion fails.
 */
static Result *probe(cchar *request)
{
    static Result result;
    MprSocket     *sp;

    memset(&result, 0, sizeof(result));
    if ((sp = mprCreateSocket()) == 0) {
        return &result;
    }
    mprAddRoot(sp);
    if (mprConnectSocket(sp, host, port, 0) < 0) {
        mprRemoveRoot(sp);
        return &result;
    }
    mprSetSocketBlockingMode(sp, 1);
    mprWriteSocket(sp, (char*) request, slen(request));

    readResult(sp, &result, CLOSE_WAIT);
    mprCloseSocket(sp, 0);
    mprRemoveRoot(sp);
    return &result;
}


/*
    Send two requests on one connection, reading between them. Both must be answered, which they can
    only be if the connection survived the first response.
 */
static Result *converse(cchar *first, cchar *second)
{
    static Result result;
    MprSocket     *sp;

    memset(&result, 0, sizeof(result));
    if ((sp = mprCreateSocket()) == 0) {
        return &result;
    }
    mprAddRoot(sp);
    if (mprConnectSocket(sp, host, port, 0) < 0) {
        mprRemoveRoot(sp);
        return &result;
    }
    mprSetSocketBlockingMode(sp, 1);

    mprWriteSocket(sp, (char*) first, slen(first));
    readResult(sp, &result, TAIL_WAIT);

    if (!result.closed) {
        mprWriteSocket(sp, (char*) second, slen(second));
        readResult(sp, &result, TAIL_WAIT);
    }
    mprCloseSocket(sp, 0);
    mprRemoveRoot(sp);
    return &result;
}


/*
    Count HTTP response status lines, over both protocol versions -- an HTTP/1.1 request that fails
    on the request line is answered as HTTP/1.0.
 */
static int responses(cchar *text)
{
    cchar *cp;
    int   count;

    for (count = 0, cp = text; (cp = scontains(cp, "HTTP/1.")) != 0; count++) {
        cp += 7;
    }
    return count;
}


/*
    A request carrying more header lines than LimitRequestHeaderLines.
 */
static cchar *tooManyHeaders(void)
{
    static char request[MAX_RESPONSE];
    char        *cp;
    int         i;

    cp = request;
    fmt(cp, (ssize) sizeof(request), "GET /index.html HTTP/1.1\r\nHost: x\r\n");
    for (i = 0; i < 70; i++) {
        cp += slen(cp);
        fmt(cp, (ssize) sizeof(request) - (cp - request), "X-Pad-%d: v\r\n", i);
    }
    cp += slen(cp);
    fmt(cp, (ssize) sizeof(request) - (cp - request), "\r\n");
    return request;
}


int main(int argc, char **argv)
{
    Result *r;
    cchar  *status;
    int    i;

    /*
        Every error raised with HTTP_CLOSE while parsing header fields. One case per error site, so a
        regression at any single site is caught. Each pairs a request with the status it must answer.
     */
    static cchar *rejected[] = {
        "501 Not Implemented",
        "POST /index.html HTTP/1.1\r\nHost: x\r\nTransfer-Encoding: identity\r\n\r\n",

        "400 Bad Request",
        "POST /index.html HTTP/1.1\r\nHost: x\r\nTransfer-Encoding: chunked\r\nContent-Length: 5\r\n\r\n0\r\n\r\n",

        "400 Bad Request",
        "GET /index.html HTTP/1.1\r\nHost: x\r\nBadHeader\r\n\r\n",

        "400 Bad Request",
        "POST /index.html HTTP/1.1\r\nHost: x\r\nContent-Length: 5abc\r\n\r\nHELLO",

        "400 Bad Request",
        "POST /index.html HTTP/1.1\r\nHost: x\r\nContent-Length: 5\r\nContent-Length: 5\r\n\r\nHELLO",

        "406 Not Acceptable",
        "GET /index.html HTTP/9.9\r\nHost: x\r\n\r\n",
        0
    };

    /*
        The HTTP/1.0 arm, which closed before the fix and must still close.
     */
    static cchar *rejected10[] = {
        "POST /index.html HTTP/1.0\r\nHost: x\r\nTransfer-Encoding: identity\r\n\r\n",
        "POST /index.html HTTP/1.0\r\nHost: x\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n",
        0
    };

    mprCreate(argc, argv, 0);
    mprStart();
    port = tgeti("TM_HTTP_PORT", 4100);

    for (i = 0; rejected[i]; i += 2) {
        status = rejected[i];
        r = probe(rejected[i + 1]);
        tcontains(r->response, status, "rejected request must answer %s", status);
        tcontains(r->response, "Connection: close", "rejected request must announce close");
        ttrue(r->closed, "rejected request must close the connection, got: %s", r->response);
        teqi(responses(r->response), 1, "rejected request must yield one response");
    }

    //  More header lines than LimitRequestHeaderLines
    r = probe(tooManyHeaders());
    tcontains(r->response, "400 Bad Request", "too many headers must be rejected");
    ttrue(r->closed, "too many headers must close the connection, got: %s", r->response);

    for (i = 0; rejected10[i]; i++) {
        r = probe(rejected10[i]);
        tcontains(r->response, "400 Bad Request", "HTTP/1.0 rejection must answer 400");
        ttrue(r->closed, "HTTP/1.0 rejection must close the connection, got: %s", r->response);
    }

    /*
        The guard against over-closing. A request answered normally must leave the connection alive,
        whatever its status, and a following request on it must be answered.
     */
    r = probe("GET /index.html HTTP/1.1\r\nHost: x\r\n\r\n");
    tcontains(r->response, "200 OK", "a normal request must be served");
    tcontains(r->response, "Connection: Keep-Alive", "a normal request must announce keep-alive");
    tfalse(r->closed, "a normal request must not close the connection");

    r = probe("GET /nope.html HTTP/1.1\r\nHost: x\r\n\r\n");
    tcontains(r->response, "404 Not Found", "a missing document must answer 404");
    tfalse(r->closed, "a 404 must not close the connection");

    r = converse("GET /index.html HTTP/1.1\r\nHost: x\r\n\r\n",
                 "GET /index.html HTTP/1.1\r\nHost: x\r\n\r\n");
    teqi(responses(r->response), 2, "two requests on one connection must both be answered");

    r = converse("GET /nope.html HTTP/1.1\r\nHost: x\r\n\r\n",
                 "GET /index.html HTTP/1.1\r\nHost: x\r\n\r\n");
    teqi(responses(r->response), 2, "a request after a 404 must be answered on the same connection");

    mprDestroy();
    return 0;
}

/*
    Copyright (c) Embedthis Software. All Rights Reserved.
    This software is distributed under a commercial license. Consult the LICENSE.md
    distributed with this software for full details and copyrights.
 */
