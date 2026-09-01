/*
    fuzz-request.tst.c - Protocol-level request mutation

    test/sec holds in-process ASan/UBSan harnesses over the URL decoder and the chunk-size parser
    (10042). Those take a byte string into one function. This covers the layer above: a whole
    request -- request line, header block, framing -- mutated against the running server, so the
    interactions *between* those parsers are exercised. 10002 (Content-Length leniency), 10003
    (TE+CL) and 10017 (Digest quoted-pair) all live in that space rather than inside a single
    primitive. See the correction on 10068.

    The oracle is not "no crash". A crash is caught by the liveness check at the end. What is
    asserted per case is the property a smuggling primitive violates:

      - a response arrives, so no input wedges the connection holding it open having decided
        nothing -- a slow-loris primitive whether or not anything ever crashes
      - exactly one response line, so the mutated bytes were never framed as a second request,
        which is CWE-444 by definition

    Native rather than TypeScript: 70 socket round-trips through the Ejscript shim exceed the
    per-test timeout, and each mutated request must go on the wire byte for byte.

    Deterministic. Fixed seed, fixed seed corpus, fixed mutator order, so a failure names a
    reproducible input rather than "it failed once". Depth scales the campaign.

    Copyright (c) All Rights Reserved. See details at the end of the file.
 */

/********************************* Includes ***********************************/

#include "testme.h"
#include "appweb.h"

/*********************************** Locals ***********************************/

#define MAX_REQUEST  2048
#define MAX_RESPONSE 16384
#define FIRST_WAIT   2000
#define TAIL_WAIT    200

/*
    The held-open baseline is a set of shapes, not a count.

    It used to be a count -- HELD_BASELINE * rounds, with HELD_BASELINE 16 -- and that model is
    wrong, because the number is not a constant. Two of the mutators pick a byte position from the
    shared generator, whose state carries across rounds, so each round mutates differently and the
    number of positions that happen to wedge the server is a draw. The count was measured at depth
    0, where one round gives 16, and generalised to 16 per round. It survives depth 1 by luck (32)
    and fails at depth 2, which yields 63 rather than 64 -- reproducibly, since the campaign is
    deterministic. Asserting that a random variable equals a constant fails for a reason that says
    nothing about the server.

    What is actually invariant is which (seed, mutator) shapes wedge it:

      - mutator 3, the NUL injection, on every seed. A NUL anywhere in the request line or header
        block wedges the server, so where the random position lands does not change the outcome.
        Ten shapes, held in every round.
      - seed 6, the SIP request line, under every mutator. Five more shapes, held in every round --
        six less the one already counted above.

    Fifteen shapes, every round, at every depth. Everything else held is mutator 0, the bit flip,
    whose effect genuinely does depend on which byte it lands on; observed once at depth 0, twice at
    depth 1, three times at depth 2, and never more than once per round.

    So the gate below asserts three things: every core shape wedges in every round, nothing outside
    the core wedges under any mutator but the bit flip, and the bit flip does not suddenly start
    wedging far more often. That is a stronger ratchet than the count ever was -- a new wedging
    shape now fails even when the total happens to match -- and it does not fail on a draw.

    FIRST_WAIT is 2000ms rather than something tighter because the classification must not depend on
    load: at 600ms one slow-but-valid response was miscounted as held.
 */
#define MAX_SEEDS    16
#define MUTATORS     6

/*
    True for a shape that must wedge the server in every round. When the underlying hold-open
    defects are fixed this function returns 0 for everything and the gate becomes "nothing is held".
 */
static int coreShape(int seed, int op)
{
    return (op == 3 || seed == 6) ? 1 : 0;
}

static cchar *host = "127.0.0.1";
static int   port;

//  How many rounds each (seed, mutator) shape was held open. File scope so the collector cannot reach it.
static int   heldShape[MAX_SEEDS][MUTATORS];

/*
    Park-Miller. Adequate for shuffling bytes, and reproducible in one line on every platform.
 */
static uint32 seed = 0x5eed;

static uint32 nextRand(uint32 n)
{
    seed = (uint32) (((uint64) seed * 48271) % 2147483647);
    return n ? seed % n : 0;
}

/*
    Seed corpus: bodyless requests only.

    That is a deliberate scope, not an omission. This campaign targets the request line and the
    header block, where "complete message" means the header terminator and the oracle below is
    therefore decidable. A request with a body cannot be completed that way -- a chunked message
    needs its own terminator, a Content-Length message needs that many bytes -- so a mutated
    bodied request that draws no response is a server correctly awaiting the rest of it, which the
    oracle would have to report as a wedge.

    Body framing is not left uncovered by that choice. It has three dedicated ratchets with exact
    oracles: security/framing.tst.ts for Transfer-Encoding, security/content-length.tst.ts for
    Content-Length, and conn/chunk-size.tst.c for the chunk-size grammar including the 2^32 case.

    Each seed below is a shape that has produced a real defect in this server, or is one line from
    one, so this is a regression corpus first and a fuzz corpus second.
 */
static cchar *seeds[] = {
    "GET / HTTP/1.1\r\nHost: %s\r\n\r\n",
    "GET /%%2e%%2e%%2f%%2e%%2e%%2fetc%%2fpasswd HTTP/1.1\r\nHost: %s\r\n\r\n",
    "GET / HTTP/1.1\r\nHost: %s\r\nAuthorization: Digest username=\"a\\\", realm=\"r\"\r\n\r\n",
    "GET / HTTP/1.1\r\nHost: %s\r\nConnection: keep-alive, close\r\n\r\n",
    "GET / HTTP/1.1\r\nHost: %s\r\nIf-Modified-Since: not-a-date\r\n\r\n",
    "GET / HTTP/1.1\r\nHost: %s\r\nIf-None-Match: \"a\", \"b\", *\r\n\r\n",
    "OPTIONS sip:nm SIP/2.0\r\nHost: %s\r\n\r\n",
    "GET http://evil.example/ HTTP/1.1\r\nHost: %s\r\n\r\n",
    "HEAD / HTTP/1.1\r\nHost: %s\r\nRange: bytes=0-1,2-3,4-5\r\n\r\n",
    "GET / HTTP/1.0\r\nHost: %s\r\nTransfer-Encoding: chunked\r\n\r\n",
    0
};

/************************************ Code ************************************/

/*
    Mutation operators, applied one per case. Each writes into out and returns its length, so a
    mutation may legitimately introduce a NUL and the length must travel with the buffer.

    Truncation is deliberately absent. Cutting a request at a random point produces shapes that
    are indistinguishable, from the wire, from a request still arriving -- so the oracle below
    would have to report a server correctly awaiting the rest as a wedge. Truncation is exactly
    the right mutation for an in-process harness, where the oracle sees the function rather than
    the connection, and sec/harness-appweb-url.c and sec/harness-appweb-chunk.c already do it
    against the two primitives that matter.
 */
static ssize mutate(int op, cchar *in, ssize inlen, char *out, ssize outsize)
{
    ssize i, n;

    if (inlen > outsize - 4) {
        inlen = outsize - 4;
    }
    memcpy(out, in, inlen);
    n = inlen;

    switch (op) {
    case 0:
        //  Flip a bit in one byte
        i = nextRand((uint32) inlen);
        out[i] = (char) (out[i] ^ 0x20);
        break;

    case 1:
        //  Drop a CR, so a header line ends bare-LF
        for (i = 0; i < n - 1; i++) {
            if (out[i] == '\r' && out[i + 1] == '\n') {
                memmove(&out[i], &out[i + 1], n - i - 1);
                n--;
                break;
            }
        }
        break;

    case 2:
        //  Terminate the header block early by doubling a CRLF
        for (i = 0; i < n - 1; i++) {
            if (out[i] == '\r' && out[i + 1] == '\n') {
                memmove(&out[i + 4], &out[i + 2], n - i - 2);
                out[i + 2] = '\r';
                out[i + 3] = '\n';
                n += 2;
                break;
            }
        }
        break;

    case 3:
        //  Inject a NUL
        i = nextRand((uint32) inlen);
        out[i] = '\0';
        break;

    case 4:
        //  Repeat the second line, so a single-valued field arrives twice
        for (i = 0; i < n - 1; i++) {
            if (out[i] == '\r' && out[i + 1] == '\n') {
                ssize j;
                for (j = i + 2; j < n - 1; j++) {
                    if (out[j] == '\r' && out[j + 1] == '\n') {
                        ssize linelen = j + 2 - (i + 2);
                        if (n + linelen < outsize) {
                            memmove(&out[j + 2 + linelen], &out[j + 2], n - j - 2);
                            memcpy(&out[j + 2], &out[i + 2], linelen);
                            n += linelen;
                        }
                        break;
                    }
                }
                break;
            }
        }
        break;

    case 5:
        //  Whitespace before the colon, which RFC 9112 5.1 forbids outright
        for (i = 0; i < n - 1; i++) {
            if (out[i] == ':' && out[i + 1] == ' ') {
                out[i] = ' ';
                out[i + 1] = ':';
                break;
            }
        }
        break;
    }

    /*
        Every mutated request is terminated before it goes on the wire.

        Without this the oracle cannot do its job. A mutation that damages the CRLFCRLF -- a
        truncation, a bit flip in a terminator, a dropped CR -- leaves an *incomplete* request,
        and a server that waits for the rest of it is behaving correctly, not wedging. "No
        response" would then mean two entirely different things and the campaign would report
        conformant behaviour as a defect.

        Terminating keeps every interesting shape (a header block ending mid-field, a corrupt
        field name, a bare-LF line) while guaranteeing the server has a complete message it must
        decide about. After this, no response really does mean the connection was wedged.
     */
    if (n + 4 < outsize) {
        memcpy(&out[n], "\r\n\r\n", 4);
        n += 4;
    }
    return n;
}


/*
    Send request and read whatever comes back. Returns the response length, or -1 if the connection
    could never be established. Response is always NUL terminated for the scontains below.

    The -1 matters as much as the oracle below it. A connection that cannot be established has
    tested nothing, and it is not evidence about the server's framing: the campaign is the heaviest
    client in the suite and can reach LimitConnectionsPerClient on its own, at which point the
    server refuses the connect. Returning 0 for that -- an empty response with the connection never
    opened, indistinguishable here from one held open having decided nothing -- made every refused
    connect increment the held count. That is how a connection limit came to be reported as 112
    wedged requests against a baseline of 16, sending the diagnosis after a server that wedges
    rather than after a campaign that had run out of connections.
 */
static ssize probe(cchar *request, ssize len, char *response, ssize size, int *closed)
{
    MprSocket *sp;
    MprTicks  wait;
    ssize     rlen, nbytes;

    response[0] = '\0';
    *closed = 0;
    if ((sp = mprCreateSocket()) == 0) {
        return -1;
    }
    mprAddRoot(sp);
    if (mprConnectSocket(sp, host, port, 0) < 0) {
        mprRemoveRoot(sp);
        return -1;
    }
    mprSetSocketBlockingMode(sp, 1);
    mprWriteSocket(sp, (char*) request, len);

    rlen = 0;
    while (rlen < size - 1) {
        wait = (rlen == 0) ? FIRST_WAIT : TAIL_WAIT;
        if (mprWaitForSingleIO((int) sp->fd, MPR_READABLE, wait) <= 0) {
            //  Timed out with the connection still open
            break;
        }
        if ((nbytes = mprReadSocket(sp, &response[rlen], size - 1 - rlen)) <= 0) {
            /*
                Zero is EOF: the server closed. That distinction is the whole oracle -- refusing a
                malformed request by closing without a response is a defensible choice this server
                makes elsewhere too (regress/bad-path), whereas holding the connection open having
                decided nothing is a slow-loris primitive.
             */
            if (nbytes == 0) {
                *closed = 1;
            }
            break;
        }
        rlen += nbytes;
    }
    response[rlen] = '\0';
    mprCloseSocket(sp, 0);
    mprRemoveRoot(sp);
    return rlen;
}


/*
    Count response status lines. More than one means the mutated bytes were framed as a further
    request.
 */
static int responses(cchar *text)
{
    cchar *cp;
    int   count;

    /*
        "HTTP/1." rather than "HTTP/1.1 ": a request sent as HTTP/1.0 is answered on that version,
        and counting only 1.1 reported such a reply as zero responses -- which the caller then read
        as a framing anomaly rather than a perfectly ordinary answer.
     */
    for (count = 0, cp = text; (cp = scontains(cp, "HTTP/1.")) != 0; count++) {
        cp += 7;
    }
    return count;
}


int main(int argc, char **argv)
{
    char  *request, *mutated, *response;
    char  hostHeader[64];
    char  missingAt[128], unexpectedAt[128];
    ssize len;
    int   depth, rounds, round, cases, held, doubled, refused, closed, i, op;
    int   missing, unexpected, extra, n;

    static int scale[] = {1, 2, 4, 8, 16, 24, 32, 40, 48, 64};

    mprCreate(argc, argv, 0);
    port = tgeti("TM_HTTP_PORT", 4100);
    depth = tdepth();
    rounds = scale[(depth >= 0 && depth < 10) ? depth : 0];

    request = mprAlloc(MAX_REQUEST);
    mutated = mprAlloc(MAX_REQUEST);
    response = mprAlloc(MAX_RESPONSE);
    fmt(hostHeader, sizeof(hostHeader), "%s:%d", host, port);

    cases = held = doubled = refused = 0;

    //  The shape tally is indexed by seed, so a corpus that outgrows it would write past the array
    for (i = 0; seeds[i]; i++) { }
    ttrue(i <= MAX_SEEDS, "the seed corpus has %d entries, more than MAX_SEEDS %d", i, MAX_SEEDS);

    for (round = 0; round < rounds; round++) {
        for (i = 0; seeds[i]; i++) {
            fmt(request, MAX_REQUEST, seeds[i], hostHeader);

            for (op = 0; op < MUTATORS; op++) {
                len = mutate(op, request, slen(request), mutated, MAX_REQUEST);
                cases++;

                if (probe(mutated, len, response, MAX_RESPONSE, &closed) < 0) {
                    /*
                        The connection was never established, so this case tested nothing. Counted
                        separately and asserted zero below, never folded into held.
                     */
                    refused++;
                    continue;
                }

                if (scontains(response, "HTTP/1.") == 0) {
                    /*
                        No response. Acceptable if the server closed -- refusing a malformed
                        request by hanging up is a choice this server makes elsewhere, and
                        regress/bad-path.tst.ts asserts it. Holding the connection open having
                        decided nothing is not: that is a connection slot consumed by one
                        malformed request, against LimitConnectionsPerClient, with no counter
                        incremented that the monitor would notice.

                        Counted rather than failed on sight. The campaign finds several inputs in
                        this class and they need individual triage; 10165 is the one confirmed and
                        filed so far. The gate below is that the count must not grow -- which
                        keeps the campaign's power to detect a new one without blocking on the
                        triage of the ones already known.
                     */
                    if (!closed) {
                        held++;
                        heldShape[i][op]++;
                        tinfo("held open: seed %d mutator %d", i, op);
                    }
                    continue;
                }
                if (responses(response) != 1) {
                    /*
                        Two status lines means the mutated bytes were framed as a second request.
                     */
                    doubled++;
                    ttrue(0, "seed %d mutator %d yielded %d responses", i, op, responses(response));
                }
            }
        }
    }

    tinfo("protocol fuzz: %d cases over %d seeds and 6 mutators at depth %d", cases, i, depth);
    ttrue(cases > 0, "the campaign must run at least one case");

    /*
        Two responses is never acceptable and has no baseline: the mutated bytes being framed as a
        further request is CWE-444 by definition, so any occurrence fails outright.
     */
    teqi(doubled, 0, "no input may yield a second response");

    /*
        Every case must have reached the server. A refused connect is not a finding about framing,
        it is the campaign having run out of connections, and it means the cases it was counted
        against were never actually sent. Asserted separately from held so the two can never be
        confused again, and stated in terms of the limit it will be, so the next person reads the
        message rather than re-deriving it.

        If this fires, the campaign is exceeding LimitConnectionsPerClient in appweb.conf. That
        should not be reachable: the campaign holds about one stranded connection at a time, because
        probe() closes every socket and the server releases a held-open connection the instant the
        client does. Measured directly -- forty-five simultaneous strays exhaust the limit, and the
        server is usable again 0.0s after they are closed. So this firing means either something has
        changed about that release, or another client is consuming the same budget: on the shared
        test server that is most often a leftover appweb from an earlier run, which reuses the port
        and carries the previous run's state.
     */
    teqi(refused, 0,
         "%d of %d connections were refused: the campaign exceeded the server's connection limit "
         "and those cases never reached it", refused, cases);

    /*
        The held-open gate, over shapes rather than over the total. The reasoning is with
        coreShape() above.

        Held-open connections are gated on a recorded baseline rather than on zero because the class
        is real and unfixed: a NUL anywhere in the request line or header block is the confirmed
        instance, and the rest are variants awaiting individual triage. Failing on sight would block
        this file on that triage, and a fuzzer blocked on triage of what it has already found stops
        finding anything new. Same shape as the scoped exemption test/sec's Makefile carries for the
        one known unfixed stoiradix overflow.

        When those defects are fixed, coreShape() returns 0 for everything and this becomes
        "nothing may be held" with no edit to the gate itself.
     */
    missing = unexpected = extra = 0;
    missingAt[0] = unexpectedAt[0] = '\0';

    for (i = 0; seeds[i]; i++) {
        for (op = 0; op < MUTATORS; op++) {
            n = heldShape[i][op];
            if (coreShape(i, op)) {
                /*
                    A core shape that stops wedging is as much a finding as a new one that starts:
                    either the server was fixed, in which case this baseline is stale and must be
                    retightened, or the campaign stopped reaching it.
                 */
                if (n != rounds) {
                    missing++;
                    if (!missingAt[0]) {
                        fmt(missingAt, sizeof(missingAt), "seed %d mutator %d held in %d of %d round(s)",
                            i, op, n, rounds);
                    }
                }
            } else if (n > 0) {
                if (op == 0) {
                    //  The bit flip picks its byte at random, so which seeds it wedges is a draw
                    extra += n;
                } else {
                    unexpected++;
                    if (!unexpectedAt[0]) {
                        fmt(unexpectedAt, sizeof(unexpectedAt), "seed %d mutator %d held in %d of %d round(s)",
                            i, op, n, rounds);
                    }
                }
            }
        }
    }

    teqi(missing, 0, "%d known held-open shape(s) stopped wedging the server; first: %s",
         missing, missingAt);

    teqi(unexpected, 0, "%d shape(s) wedged the server that are not known; first: %s",
         unexpected, unexpectedAt);

    /*
        The bit flip is allowed to wedge, because where it lands is a draw -- but at most once per
        round. Observed once at depth 0, twice at depth 1 and three times at depth 2. A jump here
        means many more byte positions began wedging, which is a finding even though any single one
        of them is expected.
     */
    ttrue(extra <= rounds,
          "the bit-flip mutator wedged %d time(s) over %d round(s), more than one per round",
          extra, rounds);

    tinfo("held open: %d total -- %d from core shapes over %d round(s), %d from the bit flip",
          held, held - extra, rounds, extra);

    /*
        The server is still serving. Without this the campaign could pass against a server that
        died early, since every later connection would simply return nothing -- counted above as
        wedged, but a crash mid-campaign deserves its own statement.
     */
    fmt(request, MAX_REQUEST, "GET /index.html HTTP/1.1\r\nHost: %s\r\nConnection: close\r\n\r\n",
        hostHeader);
    probe(request, slen(request), response, MAX_RESPONSE, &closed);
    tcontains(response, "200 OK", "the server must still serve after the campaign");

    mprDestroy();
    return 0;
}

/*
    Copyright (c) Embedthis Software. All Rights Reserved.
    This software is distributed under a commercial license. Consult the LICENSE.md
    distributed with this software for full details and copyrights.
 */
