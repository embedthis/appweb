/*
    notifier-reset.tst.c - A handler's stream notifier must not survive the keep-alive reset

    A handler may install a stream notifier for the duration of one request; the proxy handler does.
    Every such notifier begins by reading the handler queue's queueData as its own private type. On a
    keep-alive connection the stream is reset and reused, so a notifier left installed runs again for
    the next request -- which may be routed to a different handler that stores a different type in
    that queueData. The notifier then reads another handler's structure through its own pointer, and
    the read is wild: a Cgi has a packet pointer where a ProxyRequest has a stream pointer, and an
    MprFile has a file offset there. The observed failure was a SIGSEGV in the proxy notifier during
    a request the proxy never served, under a load that mixes handlers over pooled connections.

    Verified through the test bench's notifier probe rather than by trying to provoke the misread:
    whether a wild read faults depends on what happens to sit at the offset, so a crash test would be
    a coin toss. The probe counts notifier firings that do not belong to the request that installed
    it. The invariant is that the count never rises.

    The second case runs the real pairing -- proxy, then CGI, then a static file, on one connection --
    and checks each is answered by its own handler and the server survives. Concurrency, which is
    what surfaced this, is covered by test/soak.

    Copyright (c) All Rights Reserved. See details at the end of the file.
 */

/********************************* Includes ***********************************/

#include "testme.h"
#include "appweb.h"

/*********************************** Locals ***********************************/

#define MAX_RESPONSE 65536
#define FIRST_WAIT   5000               /* Wait for a response to start */
#define TAIL_WAIT    250                /* Wait for more of a response already begun */

static cchar *host = "127.0.0.1";
static int   port;

/************************************ Code ************************************/

/*
    Send request on sp and return everything the server writes back. A keep-alive connection is
    silent once the response is complete, so a quiet tail is the response boundary. That avoids
    parsing Content-Length and chunked framing here, which is not what this test is about.
 */
static cchar *exchange(MprSocket *sp, cchar *request)
{
    static char response[MAX_RESPONSE];
    MprTicks    wait;
    ssize       len, nbytes;

    response[0] = '\0';
    if (mprWriteSocket(sp, (char*) request, slen(request)) < 0) {
        return response;
    }
    len = 0;
    while (len < (ssize) sizeof(response) - 1) {
        wait = (len == 0) ? FIRST_WAIT : TAIL_WAIT;
        if (mprWaitForSingleIO((int) sp->fd, MPR_READABLE, wait) <= 0) {
            break;
        }
        if ((nbytes = mprReadSocket(sp, &response[len], sizeof(response) - 1 - len)) <= 0) {
            break;
        }
        len += nbytes;
    }
    response[len] = '\0';
    return response;
}


static MprSocket *openSocket(void)
{
    MprSocket *sp;

    if ((sp = mprCreateSocket()) == 0) {
        return 0;
    }
    mprAddRoot(sp);
    if (mprConnectSocket(sp, host, port, 0) < 0) {
        mprRemoveRoot(sp);
        return 0;
    }
    mprSetSocketBlockingMode(sp, 1);
    return sp;
}


static void closeSocket(MprSocket *sp)
{
    mprCloseSocket(sp, 0);
    mprRemoveRoot(sp);
}


static cchar *get(cchar *uri, bool keepAlive)
{
    static char request[512];

    fmt(request, sizeof(request),
        "GET %s HTTP/1.1\r\n"
        "Host: %s:%d\r\n"
        "Connection: %s\r\n"
        "\r\n", uri, host, port, keepAlive ? "keep-alive" : "close");
    return request;
}


/*
    Read the probe's leak count over a connection of its own, so the measurement cannot be the thing
    it measures. Returns -1 if the fixture is absent.
 */
static int leakCount(void)
{
    MprSocket *sp;
    cchar     *response, *cp;

    if ((sp = openSocket()) == 0) {
        return -1;
    }
    response = exchange(sp, get("/action/notifier-leaks", 0));
    closeSocket(sp);

    if ((cp = scontains(response, "LEAKS ")) == 0) {
        return -1;
    }
    return (int) stoi(cp + 6);
}


int main(int argc, char **argv)
{
    MprSocket *sp;
    cchar     *response;
    int       before, after;

    mprCreate(argc, argv, 0);
    mprStart();
    port = tgeti("TM_HTTP_PORT", 4100);

    if ((before = leakCount()) < 0) {
        tskip("test bench notifier probe is not built in");
        mprDestroy();
        return 0;
    }

    /*
        Install the probe notifier, then serve a second request by another handler on the same
        stream. Before the fix the probe fired for that second request -- and once more for the
        reset itself, where the stream has a fresh rx and no uri at all.
     */
    if ((sp = openSocket()) != 0) {
        response = exchange(sp, get("/action/notifier-probe", 1));
        tcontains(response, "PROBE", "probe route must answer");

        response = exchange(sp, get("/index.html", 0));
        tcontains(response, "200 OK", "reused connection must serve the static file");
        closeSocket(sp);
    } else {
        tfail("cannot connect to the server");
    }

    after = leakCount();
    teqi(after, before, "a handler's stream notifier must not survive into the next keep-alive request");

    /*
        The real pairing. The proxy handler is the notifier's owner, and cgiHandler and fileHandler
        are what follow it on a pooled connection. Skipped where the proxy backend is unavailable --
        the proxy module is not built on Windows.
     */
    if ((sp = openSocket()) != 0) {
        response = exchange(sp, get("/proxy/index.html", 1));
        if (scontains(response, "200 OK")) {
            response = exchange(sp, get("/cgi-bin/cgiProgram", 1));
            tcontains(response, "200 OK", "CGI must be served after a proxy request on one connection");
            tcontains(response, "cgiProgram", "CGI must be answered by the CGI handler");

            response = exchange(sp, get("/index.html", 1));
            tcontains(response, "200 OK", "static file must be served after proxy and CGI");

            response = exchange(sp, get("/proxy/index.html", 0));
            tcontains(response, "200 OK", "the proxy must still be served last on the same connection");
        }
        closeSocket(sp);
    }

    //  The server must still be answering. A notifier misfire took it down mid-suite.
    if ((sp = openSocket()) != 0) {
        response = exchange(sp, get("/index.html", 0));
        tcontains(response, "200 OK", "server must still be alive");
        closeSocket(sp);
    } else {
        tfail("server is not accepting connections");
    }

    mprDestroy();
    return 0;
}

/*
    Copyright (c) Embedthis Software. All Rights Reserved.
    This software is distributed under a commercial license. Consult the LICENSE.md
    distributed with this software for full details and copyrights.
 */
