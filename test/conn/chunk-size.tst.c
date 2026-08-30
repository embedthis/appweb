/*
    chunk-size.tst.c - Chunk-size line grammar ratchet

    RFC 9112 7.1 defines the chunk-size line as 1*HEXDIG optionally followed by a ";" chunk-ext,
    then CRLF. Appweb once delegated this line to a lenient numeric conversion helper and truncated
    the result through an (int) cast, so "0x5", "5junk" and "100000000" (2^32, read as the
    terminating chunk) were all accepted. Each is a request-smuggling primitive when Appweb is an
    origin behind a proxy, CDN or WAF.

    Verifies that only the grammar is accepted, that an oversize chunk is a 413 rather than a wrap,
    and that a truncating chunk size cannot frame the bytes that follow as a second request.

    Requests target /post, which consumes the request body before responding. A static file route
    answers from the handler before the body is framed and so cannot observe the chunk-size verdict.

    Copyright (c) All Rights Reserved. See details at the end of the file.
 */

/********************************* Includes ***********************************/

#include "testme.h"
#include "appweb.h"

/*********************************** Locals ***********************************/

#define MAX_RESPONSE 8192
#define FIRST_WAIT   5000               /* Wait for the response to start */
#define TAIL_WAIT    300                /* Wait for more of a response already begun */
#define SMUGGLE_WAIT 2000               /* Longer, to give a smuggled second response every chance */

static cchar *host = "127.0.0.1";
static int   port;

/*
    A six byte first chunk holding "data=A", then the terminating chunk.
 */
static cchar *body = "data=A\r\n0\r\n\r\n";

/************************************ Code ************************************/

/*
    Send a chunked POST whose first chunk-size line is sizeLine, followed by the trailer bytes,
    and return the response text. Reject cases pass a minimal trailer so the server has little
    unread data to discard when it closes.

    Wait up to FIRST_WAIT for the response to start, then tailWait for anything more. Do not rely
    on the close to end the read: whether an errored connection closes promptly varies with the
    server trace level, and a stalled read would only ever be seen as a test timeout.
 */
static cchar *probe(cchar *sizeLine, cchar *trailer, MprTicks tailWait)
{
    static char response[MAX_RESPONSE];
    MprSocket   *sp;
    char        request[1024];
    MprTicks    wait;
    ssize       len, nbytes;

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

    fmt(request, sizeof(request),
        "POST /post HTTP/1.1\r\n"
        "Host: x\r\n"
        "Transfer-Encoding: chunked\r\n"
        "Content-Type: application/x-www-form-urlencoded\r\n"
        "Connection: close\r\n"
        "\r\n"
        "%s\r\n%s", sizeLine, trailer);
    mprWriteSocket(sp, request, slen(request));

    len = 0;
    while (len < (ssize) sizeof(response) - 1) {
        wait = (len == 0) ? FIRST_WAIT : tailWait;
        if (mprWaitForSingleIO((int) sp->fd, MPR_READABLE, wait) <= 0) {
            break;
        }
        if ((nbytes = mprReadSocket(sp, &response[len], sizeof(response) - 1 - len)) <= 0) {
            break;
        }
        len += nbytes;
    }
    response[len] = '\0';
    mprCloseSocket(sp, 0);
    mprRemoveRoot(sp);
    return response;
}


/*
    Count HTTP response status lines. More than one means the chunk framing let a second request
    through.
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


int main(int argc, char **argv)
{
    cchar *r;
    int   i;

    /*
        Valid chunk-size lines are still accepted, including chunk-ext and leading zeros.
     */
    static cchar *valid[] = {
        "6", "6;ext=1", "6;ext=1;ext2=2", "000000006", "06", 0
    };

    /*
        Not 1*HEXDIG followed by ";" or CRLF. "0x5" and "5junk" were both accepted before the fix.
     */
    static cchar *malformed[] = {
        "0x5", "0X5", "5junk", "5 ", "5:1", "5=1", "5\tx", " 5", "-5", "+5", "5.0", 0
    };

    /*
        Sizes that exceed LimitRequestBody or do not fit in ssize. Before the fix "100000000"
        truncated to zero (the terminating chunk) and "FFFFFFFF00000005" truncated to five.
     */
    static cchar *oversize[] = {
        "100000000", "1000000005", "FFFFFFFF00000005", "ffffffff00000005",
        "FFFFFFFFFFFFFFFF", "FFFFFFFFFFFFFFFFF", "FFFFFFFF", "80000000", 0
    };

    mprCreate(argc, argv, 0);
    mprStart();
    port = tgeti("TM_HTTP_PORT", 4100);

    for (i = 0; valid[i]; i++) {
        r = probe(valid[i], body, TAIL_WAIT);
        tcontains(r, "200 OK", "chunk size %s must be accepted", valid[i]);
    }
    for (i = 0; malformed[i]; i++) {
        r = probe(malformed[i], "", TAIL_WAIT);
        tcontains(r, "400 Bad Request", "chunk size %s must be rejected", malformed[i]);
        teqi(responses(r), 1, "chunk size %s must yield one response", malformed[i]);
    }

    //  An empty chunk-size line is not 1*HEXDIG. Needs a trailer to reach the minimum parse length.
    r = probe("", "x\r\n", TAIL_WAIT);
    tcontains(r, "400 Bad Request", "empty chunk size must be rejected");
    teqi(responses(r), 1, "empty chunk size must yield one response");

    for (i = 0; oversize[i]; i++) {
        r = probe(oversize[i], "", TAIL_WAIT);
        tcontains(r, "413", "chunk size %s must be rejected as too large", oversize[i]);
        teqi(responses(r), 1, "chunk size %s must yield one response", oversize[i]);
    }

    //  A 2^32 chunk size must not truncate to zero and frame the following bytes as a new request
    r = probe("100000000", "\r\nGET /alive.html HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n",
              SMUGGLE_WAIT);
    ttrue(scontains(r, "ALIVE") == 0, "smuggled request must not be served");
    ttrue(responses(r) <= 1, "smuggled request must not yield a second response");

    mprDestroy();
    return 0;
}

/*
    Copyright (c) Embedthis Software. All Rights Reserved.
    This software is distributed under a commercial license. Consult the LICENSE.md
    distributed with this software for full details and copyrights.
 */
