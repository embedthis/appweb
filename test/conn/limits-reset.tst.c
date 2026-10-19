/*
    limits-reset.tst.c - A keep-alive request must not inherit the previous request's route limits

    Copyright (c) All Rights Reserved. See details at the end of the file.
 */

/********************************* Includes ***********************************/

#include "testme.h"
#include "appweb.h"

/*********************************** Locals ***********************************/

#define MAX_RESPONSE 65536
#define FIRST_WAIT   5000
#define TAIL_WAIT    250

/*
    Larger than the server's LimitRequestForm (512K) and smaller than the /limits/large/ route's (4MB)
 */
#define FORM_LENGTH  (1024 * 1024)

static cchar *host = "127.0.0.1";
static int   port;

/************************************ Code ************************************/

/*
    Collect bytes until quiet; this helper does not parse response framing.
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


static cchar *get(cchar *uri)
{
    static char request[512];

    fmt(request, sizeof(request),
        "GET %s HTTP/1.1\r\n"
        "Host: %s:%d\r\n"
        "Connection: keep-alive\r\n"
        "\r\n", uri, host, port);
    return request;
}



static cchar *postForm(cchar *uri)
{
    static char request[512];

    fmt(request, sizeof(request),
        "POST %s HTTP/1.1\r\n"
        "Host: %s:%d\r\n"
        "Content-Type: application/x-www-form-urlencoded\r\n"
        "Content-Length: %d\r\n"
        "\r\n", uri, host, port, FORM_LENGTH);
    return request;
}


int main(int argc, char **argv)
{
    MprSocket *sp;
    cchar     *response;

    mprCreate(argc, argv, 0);
    mprStart();
    port = tgeti("TM_HTTP_PORT", 4100);

    if ((sp = openSocket()) != 0) {
        response = exchange(sp, postForm("/index.html"));
        tcontains(response, " 413 ", "an oversized form must be refused on a new connection");
        closeSocket(sp);
    } else {
        tfail("cannot connect to the server");
    }

    if ((sp = openSocket()) != 0) {
        response = exchange(sp, get("/limits/large/index.html"));
        tcontains(response, "200 OK", "the large-limit route must serve the first request");

        response = exchange(sp, postForm("/index.html"));
        tcontains(response, " 413 ", "the next request must be held to its own limits, not the previous route's");
        closeSocket(sp);
    } else {
        tfail("cannot connect to the server");
    }

    mprDestroy();
    return 0;
}

/*
    Copyright (c) Embedthis Pty Ltd. All Rights Reserved.
    This software is distributed under a commercial license. Consult the LICENSE.md
    distributed with this software for full details and copyrights.
 */
