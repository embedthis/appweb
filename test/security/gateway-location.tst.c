/*
    gateway-location.tst.c - A gateway's Location response must carry only the server's redirect body

    A CGI or FastCGI program that writes a Location header is answered with a server generated 302 whose
    Content-Length covers the redirect page. Any body the program writes after its headers must be dropped:
    forwarded, it follows the declared length on a keep-alive connection and is read as the start of the
    next response.

    Each probe reads the redirect, then requests /alive.html on the same connection and checks that the
    connection carries exactly the two responses and none of the program's output.

    Copyright (c) All Rights Reserved. See details at the end of the file.
 */

/********************************* Includes ***********************************/

#include "testme.h"
#include "appweb.h"

/*********************************** Locals ***********************************/

#define MAX_RESPONSE 16384
#define FIRST_WAIT   5000               /* Wait for the response to start */
#define TAIL_WAIT    1000               /* Wait for more of a response already begun */

static cchar *host = "127.0.0.1";
static int   port;

/************************************ Code ************************************/

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


static cchar *probe(cchar *uri, cchar *switches)
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

    fmt(request, sizeof(request), "GET %s HTTP/1.1\r\nHost: x\r\nSWITCHES: %s\r\n\r\n", uri, switches);
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
    The redirect body must end where its Content-Length says, so the next response starts right after it
*/
static void checkLocation(cchar *uri, cchar *output, cchar *what)
{
    cchar *r, *body, *next;
    int64 length;

    r = probe(uri, "-l /index.html");
    tcontains(r, "302 Moved Temporarily", "%s must redirect", what);
    tcontains(r, "Location: http://127.0.0.1", "%s must carry the Location", what);
    ttrue(scontains(r, output) == 0, "%s must not forward the program body", what);
    tcontains(r, "ALIVE", "%s must leave the connection usable", what);
    teqi(responses(r), 2, "%s must yield exactly one response per request", what);

    body = scontains(r, "\r\n\r\n");
    next = scontains(r + 9, "HTTP/1.1 ");
    length = stoi(scontains(r, "Content-Length: ") ? scontains(r, "Content-Length: ") + 16 : "-1");
    ttrue(body && next && (next - body - 4) == length, "%s must end at its Content-Length", what);
}


int main(int argc, char **argv)
{
    int i;

    mprCreate(argc, argv, 0);
    mprStart();
    port = tgeti("TM_HTTP_PORT", 4100);

    //  How the program's output is split into reads varies, so repeat
    for (i = 0; i < 5; i++) {
        checkLocation("/cgi-bin/cgiProgram", "cgiProgram: Output", "CGI Location");
#if ME_UNIX_LIKE
        checkLocation("/fast-bin/fastProgram", "fastProgram: Output", "FastCGI Location");
#endif
    }
    mprDestroy();
    return 0;
}

/*
    Copyright (c) Embedthis Pty Ltd. All Rights Reserved.
    This software is distributed under a commercial license. Consult the LICENSE.md
    distributed with this software for full details and copyrights.
 */
