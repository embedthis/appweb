/*
    CGI response parsing must stay within the buffer length. FastCGI padding containing "777" after status "200"
    must not change the parsed status.
 */

/********************************* Includes ***********************************/

#include "testme.h"
#define ME_COM_FAST 1
#define ME_HTTP_HTTP2 1
#define ME_HTTP_WEB_SOCKETS 1
#include "appweb.h"

/************************************ Code ************************************/

int main(int argc, char **argv)
{
    HttpNet    *net;
    HttpStream *stream;
    MprBuf     *buf;
    MprOff     declared;
    bool       rc;

    mprCreate(argc, argv, 0);
    httpCreate(HTTP_SERVER_SIDE | HTTP_CLIENT_SIDE);
    net = httpCreateNet(0, 0, 1, 0);
    net->ip = sclone("127.0.0.1");
    stream = httpCreateStream(net, 0);
    httpCreateRx(stream);
    httpCreateTx(stream, 0);
    mprAddRoot(net);
    mprAddRoot(stream);

    //  Record content followed by its padding, as left by fastConnectorIncomingService
    buf = mprCreateBuf(64, -1);
    mprAddRoot(buf);
    mprPutStringToBuf(buf, "HTTP/1.1 200777");
    mprAdjustBufEnd(buf, -3);
    teqz(mprGetBufLength(buf), 12, "content is the record without its padding");

    declared = -1;
    rc = maParseCgiResponse(stream, buf, "FastCGI", 1, NULL, &declared);
    tinfo("parse rc %d, status %d, error %s", rc, stream->tx->status, stream->errorMsg ? stream->errorMsg : "none");
    ttrue(rc, "a status line ending at the record end must parse");
    ttrue(!stream->error, "the status must not include bytes past the buffer length");
    teqi(stream->tx->status, 200, "the status line sets the response status");

    httpDestroyNet(net);
    mprRemoveRoot(buf);
    mprRemoveRoot(stream);
    mprRemoveRoot(net);
    mprDestroy();
    return 0;
}
