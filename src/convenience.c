/*
    convenience.c -- High level convenience API

    This module provides simple high-level APIs.
    Copyright (c) All Rights Reserved. See copyright notice at the bottom of the file.
 */

/********************************** Includes **********************************/

#include    "appweb.h"

/************************************ Code ************************************/

static int runServer(cchar *configFile, cchar *ip, int port, cchar *home, cchar *documents)
{
    if (mprStart() < 0) {
        mprLog("error appweb", 0, "Cannot start the web server runtime");
        return MPR_ERR_CANT_CREATE;
    }
    if (httpCreate(HTTP_CLIENT_SIDE | HTTP_SERVER_SIDE) == 0) {
        mprLog("error http", 0, "Cannot create http services");
        return MPR_ERR_CANT_CREATE;
    }
    if (maConfigureServer(configFile, home, documents, ip, port) < 0) {
        mprLog("error appweb", 0, "Cannot create the web server");
        return MPR_ERR_BAD_STATE;
    }
    if (httpStartEndpoints() < 0) {
        mprLog("error appweb", 0, "Cannot start the web server");
        return MPR_ERR_CANT_COMPLETE;
    }
    mprServiceEvents(-1, 0);
    httpStopEndpoints();
    return 0;
}


/*  
    Create a web server described by a config file. 
 */
PUBLIC int maRunWebServer(cchar *configFile)
{
    Mpr         *mpr;
    int         rc;

    if ((mpr = mprCreate(0, NULL, MPR_USER_EVENTS_THREAD)) == 0) {
        mprLog("error appweb", 0, "Cannot create the web server runtime");
        return MPR_ERR_CANT_CREATE;
    }
    rc = runServer(configFile, 0, 0, 0, 0);
    mprDestroy();
    return rc;
}


/*
    Run a web server not based on a config file.
 */
PUBLIC int maRunSimpleWebServer(cchar *ip, int port, cchar *home, cchar *documents)
{
    Mpr         *mpr;
    int         rc;

    if ((mpr = mprCreate(0, NULL, MPR_USER_EVENTS_THREAD)) == 0) {
        mprLog("error appweb", 0, "Cannot create the web server runtime");
        return MPR_ERR_CANT_CREATE;
    }
    rc = runServer(0, ip, port, home, documents);
    mprDestroy();
    return rc;
}


/*
    Copyright (c) Embedthis Software. All Rights Reserved.
    This software is distributed under a commercial license. Consult the LICENSE.md
    distributed with this software for full details and copyrights.
 */
