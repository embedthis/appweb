/*
    cgi-allocation.tst.c - Failed handler allocation must release its process-limit reservation.

    Include the real handler with only its object allocator intercepted. The monitor, queues and
    error handling use the linked library. No production fault-injection interface is needed.
 */

#include "testme.h"
#define ME_COM_CGI 1
/* Match the generated product build: these switches affect the Http structure layout. */
#define ME_HTTP_HTTP2 1
#define ME_HTTP_WEB_SOCKETS 1
#include "appweb.h"

static int failAllocation;

static void *allocateCgi(size_t size, MprManager manager)
{
    if (failAllocation) {
        return 0;
    }
    return mprSetManager(mprAllocMem(size, MPR_ALLOC_ZERO | MPR_ALLOC_MANAGER), manager);
}

#undef mprAllocObj
#define mprAllocObj(type, manager) ((type*) allocateCgi(sizeof(type), (MprManager) manager))
#define httpCgiInit allocationTestCgiInit
#if defined(__GNUC__)
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wsign-conversion"
#endif
#include "../../src/modules/cgiHandler.c"
#if defined(__GNUC__)
#pragma GCC diagnostic pop
#endif
#undef mprAllocObj

int main(int argc, char **argv)
{
    HttpNet    *net;
    HttpStream *stream;
    HttpQueue  *q, *pair;
    int        i, rc;
    int64      count;

    mprCreate(argc, argv, 0);
    httpCreate(HTTP_SERVER_SIDE | HTTP_CLIENT_SIDE);
    allocationTestCgiInit(HTTP, 0);
    net = httpCreateNet(0, 0, 1, 0);
    net->ip = sclone("127.0.0.1");
    stream = httpCreateStream(net, 0);
    httpCreateRx(stream);
    httpCreateTx(stream, 0);
    stream->limits->processMax = 2;
    stream->tx->filename = sclone("allocation-test.cgi");
    q = httpCreateQueue(net, stream, HTTP->cgiHandler, HTTP_QUEUE_TX, 0);
    pair = httpCreateQueue(net, stream, HTTP->cgiHandler, HTTP_QUEUE_RX, 0);
    q->pair = pair;
    pair->pair = q;
    //  The collector does not scan the C stack, so objects held only in these locals must be rooted
    mprAddRoot(net);
    mprAddRoot(stream);
    mprAddRoot(q);
    mprAddRoot(pair);

    failAllocation = 1;
    for (i = 0; i < stream->limits->processMax + 1; i++) {
        rc = openCgi(q);
        teqi(rc, MPR_ERR_MEMORY, "injected allocation failure");
        closeCgi(q);
        count = httpMonitorEvent(stream, HTTP_COUNTER_ACTIVE_PROCESSES, 0);
        teqi(count, 0, "failed allocation must release its reservation");
    }
    failAllocation = 0;
    rc = openCgi(q);
    teqi(rc, 0, "CGI opens again after allocation recovers");
    if (rc == 0) {
        closeCgi(q);
        q->queueData = pair->queueData = 0;
    }
    count = httpMonitorEvent(stream, HTTP_COUNTER_ACTIVE_PROCESSES, 0);
    teqi(count, 0, "successful open and close balance");

    httpMonitorEvent(stream, HTTP_COUNTER_ACTIVE_PROCESSES, stream->limits->processMax);
    rc = openCgi(q);
    teqi(rc, MPR_ERR_CANT_OPEN, "concurrent process limit is still enforced");
    count = httpMonitorEvent(stream, HTTP_COUNTER_ACTIVE_PROCESSES, 0);
    teqi(count, stream->limits->processMax, "refused open does not consume another slot");
    httpMonitorEvent(stream, HTTP_COUNTER_ACTIVE_PROCESSES, -count);
    //  Http's list of networks does not retain them, so the net must be destroyed before it is released
    httpDestroyNet(net);
    mprRemoveRoot(pair);
    mprRemoveRoot(q);
    mprRemoveRoot(stream);
    mprRemoveRoot(net);
    mprDestroy();
    return 0;
}
