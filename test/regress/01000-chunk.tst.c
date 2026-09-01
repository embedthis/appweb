/*
    01000-chunk.tst.c - Chunked multipart upload framing, whole and split across writes

    A multipart/form-data body carrying two files, sent with Transfer-Encoding: chunked. The
    original defect was a trailing "\r\n" in the upload content that the chunk parser mis-framed.
    The property asserted is only that the server frames the message and answers it: it must not
    hang holding the connection, and it must not reset. What it answers is beside the point -- the
    fixture posts to /upload.ejs, which no longer exists here since ESP is a separate add-on, so
    the reply is a 404. A 404 is a complete answer and satisfies the framing oracle.

    Two deliveries of the same bytes:

      - one write, so the whole message is available to the parser at once
      - split at the header terminator and again inside the body, with a pause either side, so the
        chunk parser has to carry its state across reads. That is the shape the original defect
        needed, and a single-write test cannot produce it.

    Native, with MPR sockets, rather than TypeScript driving netcat and a hand-rolled C client.
    That is the convention for framing tests here, and it is what the previous version got wrong in
    three independent ways -- none of which could have been noticed, because the whole file was
    gated behind a depth nothing ran:

      - Cmd.sh is asynchronous and none of the four calls was awaited, so the assertions ran
        .includes on a Promise and threw. The test failed in 43ms having sent nothing; the server
        log for a run showed no request arriving at all.
      - The netcat half could not be made to terminate. The server answers and closes -- the
        request carries Connection: close and the response carries it back -- but BSD nc sits on
        the socket regardless, and -w does not stop it. The flags that would (-N, -q) differ across
        BSD nc, netcat-openbsd and nmap ncat, so any version of this that shells out to "nc" is
        one installed netcat away from hanging to the group timeout.
      - The C client it compiled at test time read the response into a buffer and discarded it
        without printing, so the assertion that searched its output for "HTTP/1." could never have
        passed even with the await in place.

    Dropping netcat and the compile-at-test-time client also drops the reason the file was gated to
    depth 1: "requires nc and depth >= 1". Neither dependency exists now, and a regression test for
    a real past defect earns its place in the default run.

    Copyright (c) All Rights Reserved. See details at the end of the file.
 */

/********************************* Includes ***********************************/

#include "testme.h"
#include "appweb.h"

/*********************************** Locals ***********************************/

#define FIXTURE      "01000-chunk.dat"
#define MAX_RESPONSE 8192

/*
    The server must answer a complete message promptly. Generous enough that a loaded machine does
    not fail the run, short enough that a genuine hang is a failure rather than a group timeout --
    which is the failure mode this file is replacing.
 */
#define FIRST_WAIT   10000
#define TAIL_WAIT    250

//  Pause either side of a split so the writes land in separate reads rather than being coalesced
#define SPLIT_PAUSE  200

static cchar *host = "127.0.0.1";
static int   port;

/************************************ Code ************************************/

/*
    Send the fixture and read whatever comes back. When split is set the bytes go out in three
    writes with a pause between them; otherwise in one. Returns the response length, or -1 if the
    connection could not be established -- which is not a framing result and must not be read as
    one.
 */
static ssize drive(cchar *data, ssize len, int split, char *response, ssize size)
{
    MprSocket *sp;
    MprTicks  wait;
    cchar     *hdrEnd;
    ssize     offset, half, rlen, nbytes;

    response[0] = '\0';
    if ((sp = mprCreateSocket()) == 0) {
        return -1;
    }
    mprAddRoot(sp);
    if (mprConnectSocket(sp, host, port, 0) < 0) {
        mprCloseSocket(sp, 0);
        mprRemoveRoot(sp);
        return -1;
    }
    mprSetSocketBlockingMode(sp, 1);

    if (!split) {
        mprWriteSocket(sp, (char*) data, len);

    } else {
        /*
            Split at the header terminator first, so the parser sees a complete header block and
            then must wait for a body that has not arrived. sncontains is bounded rather than
            scanning to a NUL: the body is a JPEG and contains them.
         */
        if ((hdrEnd = sncontains(data, "\r\n\r\n", len)) == 0) {
            mprCloseSocket(sp, 0);
            mprRemoveRoot(sp);
            return -1;
        }
        offset = (hdrEnd - data) + 4;
        half = (len - offset) / 2;

        mprWriteSocket(sp, (char*) data, offset);
        mprSleep(SPLIT_PAUSE);
        mprWriteSocket(sp, (char*) &data[offset], half);
        mprSleep(SPLIT_PAUSE);
        mprWriteSocket(sp, (char*) &data[offset + half], len - offset - half);
    }

    rlen = 0;
    while (rlen < size - 1) {
        wait = (rlen == 0) ? FIRST_WAIT : TAIL_WAIT;
        if (mprWaitForSingleIO((int) sp->fd, MPR_READABLE, wait) <= 0) {
            //  Timed out with the connection still open -- the hang this test exists to catch
            break;
        }
        if ((nbytes = mprReadSocket(sp, &response[rlen], size - 1 - rlen)) <= 0) {
            //  Zero is EOF. The request asks for Connection: close, so this is the normal ending.
            break;
        }
        rlen += nbytes;
    }
    response[rlen] = '\0';
    mprCloseSocket(sp, 0);
    mprRemoveRoot(sp);
    return rlen;
}


int main(int argc, char **argv)
{
    char  *data, *response;
    ssize len, rlen;

    mprCreate(argc, argv, 0);
    port = tgeti("TM_HTTP_PORT", 4100);

    if ((data = mprReadPathContents(FIXTURE, &len)) == 0) {
        ttrue(0, "cannot read %s", FIXTURE);
        mprDestroy();
        return 1;
    }
    /*
        Root both buffers. The collector does not scan the C stack, so a local is not a reference it
        can see, and the split delivery below sleeps between writes -- which is all the opportunity
        the sweeper needs to reclaim a live buffer underneath it. The single-write case never
        yields and passed; the split case segfaulted after every assertion had passed, which is the
        signature of this and not of anything the server did.
     */
    mprAddRoot(data);
    /*
        Assert the fixture is intact before drawing conclusions from what the server does with it.
        A truncated or missing body would produce a server correctly waiting for the rest, and the
        oracle below would report that as a hang.
     */
    ttrue(len > 100000, "fixture must carry the full multipart body, got %zd bytes", len);
    ttrue(sncontains(data, "Transfer-Encoding: chunked", len) != 0, "fixture must be chunked");

    response = mprAlloc(MAX_RESPONSE);
    mprAddRoot(response);

    rlen = drive(data, len, 0, response, MAX_RESPONSE);
    ttrue(rlen >= 0, "the server must accept a connection for the single-write case");
    tcontains(response, "HTTP/1.", "a chunked multipart body sent in one write must be answered");

    rlen = drive(data, len, 1, response, MAX_RESPONSE);
    ttrue(rlen >= 0, "the server must accept a connection for the split-write case");
    tcontains(response, "HTTP/1.", "the same body split across writes must be answered");

    mprDestroy();
    return 0;
}

/*
    Copyright (c) Embedthis Software. All Rights Reserved.
    This software is distributed under a commercial license. Consult the LICENSE.md
    distributed with this software for full details and copyrights.
 */
