/**
    appwebMonitor.c  -- Windows Appweb Monitor program

    The Appweb Monitor is a windows monitor program that interacts with the Appweb angel program.

    Copyright (c) All Rights Reserved. See copyright notice at the bottom of the file.
 */

/********************************* Includes ***********************************/

#include    "mpr.h"

    #include    "appwebMonitor.h"
    #include    "monitorResources.h"

#include    <winUser.h>

#if ME_WIN_LIKE
/*********************************** Locals ***********************************/

typedef struct App {
    cchar        *company;              /* Company name */
    cchar        *serviceName;          /* Name of appweb service */
    int          taskBarIcon;           /* Icon in the task bar */
    HINSTANCE    appInst;               /* Current application instance */
    HWND         hwnd;                  /* Application window handle */
    HMENU        subMenu;               /* As the name says */
    HMENU        monitorMenu;           /* As the name says */
} App;

static App *app;

#define APPWEB_ICON             "appwebMonitor.ico"
#define APPWEB_MONITOR_ID       0x100

#ifndef MIIM_STRING
#define MIIM_STRING             0x00000040
#define MIIM_BITMAP             0x00000080
#define MIIM_FTYPE              0x00000100
#endif

static SERVICE_STATUS           svcStatus;
static SERVICE_STATUS_HANDLE    svcHandle;
static SERVICE_TABLE_ENTRY      svcTable[] = {
    { "default",    0   },
    { 0,            0   }
};

/***************************** Forward Declarations ***************************/

static void     closeMonitorIcon();
static int      getAppwebPort();
static char     *getBrowserPath(int size);
static int      findInstance();
static int      initWindow();
static void     logHandler(cchar *tags, int level, cchar *msg);
static void     manageApp(App *app, int flags);
static long     msgProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp);
static int      openMonitorIcon();
static uint     queryService();
static int      runBrowser(char *page);
static void     stopMonitor();
static int      startService();
static int      stopService();
static int      monitorEvent(HWND hwnd, WPARAM wp, LPARAM lp);
static void     updateMenu(int id, char *text, int enable, int check);

/*********************************** Code *************************************/

APIENTRY WinMain(HINSTANCE inst, HINSTANCE junk, char *command, int junk2)
{
    char    *argv[ME_MAX_ARGC], *argp;
    int     argc, err, nextArg, manage, stop;

	argv[0] = ME_NAME "Monitor";
    argc = mprParseArgs(command, &argv[1], ME_MAX_ARGC - 1) + 1;

    if (mprCreate(argc, argv, MPR_USER_EVENTS_THREAD | MPR_NO_WINDOW) == NULL) {
        exit(1);
    }
    if ((app = mprAllocObj(App, manageApp)) == NULL) {
        exit(2);
    }
    mprAddRoot(app);

    err = 0;
    stop = 0;
    manage = 0;
    app->appInst = inst;
    app->company = sclone(ME_COMPANY);
    app->serviceName = sclone(ME_NAME);
    mprSetLogHandler(logHandler);

    chdir(mprGetAppDir());

    /*
        Parse command line arguments
     */
    for (nextArg = 1; nextArg < argc; nextArg++) {
        argp = argv[nextArg];
        if (*argp != '-') {
            break;
        }
        if (strcmp(argp, "--manage") == 0) {
            manage++;
        } else if (strcmp(argp, "--stop") == 0) {
            stop++;
        } else {
            err++;
        }
        if (err) {
            mprLog("error", 0, "Bad command line: %s\n"
                "  Usage: %s [options]\n"
                "  Switches:\n"
                "    --manage             # Launch browser to manage",
                "    --stop               # Stop a running monitor",
                command, mprGetAppName());
            return -1;
        }
    }
    if (stop) {
        stopMonitor();
        return 0;
    }
    if (findInstance()) {
        mprLog("error", 0, "Application %s is already active.", mprGetAppTitle());
        return MPR_ERR_BUSY;
    }
    app->hwnd = mprSetWindowsThread(0);
    mprSetWinMsgCallback(msgProc);

    if (app->taskBarIcon > 0) {
        ShowWindow(app->hwnd, SW_MINIMIZE);
        UpdateWindow(app->hwnd);
    }
    if (manage) {
        /*
            Launch the browser
         */
        runBrowser("/index.html");

    } else {
        if (openMonitorIcon() < 0) {
            mprLog("error", 0, "Cannot open %s tray", mprGetAppName());
        } else {
            mprServiceEvents(-1, 0);
            closeMonitorIcon();
        }
    }
    mprDestroy();
    return 0;
}


static void manageApp(App *app, int flags)
{
    if (flags & MPR_MANAGE_MARK) {
        mprMark(app->company);
        mprMark(app->serviceName);
    }
}


/*
    See if an instance of this product is already running
 */
static int findInstance()
{
    HWND    hwnd;

    hwnd = FindWindow(mprGetAppName(), mprGetAppName());
    if (hwnd) {
        if (IsIconic(hwnd)) {
            ShowWindow(hwnd, SW_RESTORE);
        }
        SetForegroundWindow(hwnd);
        return 1;
    }
    return 0;
}


static void stopMonitor()
{
    HWND    hwnd;

    hwnd = FindWindow(mprGetAppName(), mprGetAppName());
    if (hwnd) {
        PostMessage(hwnd, WM_QUIT, 0, 0L);
    }
}


/*
    Windows message processing loop
 */
BOOL CALLBACK dialogProc(HWND hwnd, UINT Message, WPARAM wParam, LPARAM lParam)
{
    switch(Message) {
    default:
        return FALSE;
    }
    return TRUE;
}


static long msgProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp)
{
    MprThread   *tp;
    char        buf[ME_MAX_FNAME];

    switch (msg) {
    case WM_DESTROY:
    case WM_QUIT:
        mprShutdown(0, -1, 0);
        break;

    case APPWEB_MONITOR_MESSAGE:
        return monitorEvent(hwnd, wp, lp);

    case WM_COMMAND:
        switch (LOWORD(wp)) {
        case MA_MENU_STATUS:
            break;

        case MA_MENU_DOC:
            runBrowser("https://www.embedthis.com/appweb/doc/index.html");
            break;

        case MA_MENU_START:
            tp = mprCreateThread("startService", startService, 0, 0);
            mprStartThread(tp);
            break;

        case MA_MENU_STOP:
            tp = mprCreateThread("stopService", stopService, 0, 0);
            mprStartThread(tp);
            break;

        case MA_MENU_ABOUT:
            /*
                Single-threaded users beware. This blocks !!
             */
            fmt(buf, sizeof(buf), "%s %s", ME_TITLE, ME_VERSION);
            MessageBoxEx(hwnd, buf, mprGetAppTitle(), MB_OK, 0);
            break;

        case MA_MENU_EXIT:
            PostMessage(hwnd, WM_QUIT, 0, 0L);
            break;

        default:
            return (long) DefWindowProc(hwnd, msg, wp, lp);
        }
        break;

    default:
        return (long) DefWindowProc(hwnd, msg, wp, lp);
    }
    return 0;
}


/*
    Can be called multiple times
 */
static int openMonitorIcon()
{
    NOTIFYICONDATA  data;
    HICON           iconHandle;
    HBITMAP         go, stop;
    static int      doOnce = 0;
    int             rc;

    if (app->monitorMenu == NULL) {
        app->monitorMenu = LoadMenu(app->appInst, "monitorMenu");
        if (! app->monitorMenu) {
            mprLog("error", 0, "Can't locate monitorMenu");
            return MPR_ERR_CANT_OPEN;
        }
    }
    if (app->subMenu == NULL) {
        app->subMenu = GetSubMenu(app->monitorMenu, 0);
        go = LoadBitmap(app->appInst, MAKEINTRESOURCE(IDB_GO));
        rc = GetLastError();
        stop = LoadBitmap(app->appInst, MAKEINTRESOURCE(IDB_STOP));
        SetMenuItemBitmaps(app->subMenu, MA_MENU_STATUS, MF_BYCOMMAND, stop, go);
    }
    iconHandle = (HICON) LoadImage(app->appInst, APPWEB_ICON, IMAGE_ICON, 0, 0, LR_LOADFROMFILE | LR_DEFAULTSIZE);
    if (iconHandle == 0) {
        mprLog("error", 0, "Cannot load icon %s", APPWEB_ICON);
        return MPR_ERR_CANT_INITIALIZE;
    }
    data.uID = APPWEB_MONITOR_ID;
    data.hWnd = app->hwnd;
    data.hIcon = iconHandle;
    data.cbSize = sizeof(NOTIFYICONDATA);
    data.uCallbackMessage = APPWEB_MONITOR_MESSAGE;
    data.uFlags = NIF_ICON | NIF_TIP | NIF_MESSAGE;

    scopy(data.szTip, sizeof(data.szTip), mprGetAppTitle());
    Shell_NotifyIcon(NIM_ADD, &data);
    if (iconHandle) {
        DestroyIcon(iconHandle);
    }
    return 0;
}


/*
    Can be called multiple times
 */
static void closeMonitorIcon()
{
    NOTIFYICONDATA  data;

    data.uID = APPWEB_MONITOR_ID;
    data.hWnd = app->hwnd;
    data.cbSize = sizeof(NOTIFYICONDATA);
    Shell_NotifyIcon(NIM_DELETE, &data);
    if (app->monitorMenu) {
        DestroyMenu(app->monitorMenu);
        app->monitorMenu = NULL;
    }
    if (app->subMenu) {
        DestroyMenu(app->subMenu);
        app->subMenu = NULL;
    }
}


/*
    Respond to monitor icon events
 */
static int monitorEvent(HWND hwnd, WPARAM wp, LPARAM lp)
{
    RECT            windowRect;
    POINT           p, pos;
    HWND            h;
    char            textBuf[48];
    LPARAM          msg;
    int             state;

    msg = lp;

    /*
        Show the menu on single right click
     */
    if (msg == WM_LBUTTONUP) {
        state = queryService();

        if (state < 0 || state & SERVICE_STOPPED) {
            fmt(textBuf, sizeof(textBuf), "%s Stopped", ME_TITLE);
            updateMenu(MA_MENU_STATUS, textBuf, 0, -1);
            updateMenu(MA_MENU_START, 0, 1, 0);
            updateMenu(MA_MENU_STOP, 0, -1, 0);
        } else {
            fmt(textBuf, sizeof(textBuf), "%s Running", ME_TITLE);
            updateMenu(MA_MENU_STATUS, textBuf, 0, 1);
            updateMenu(MA_MENU_START, 0, -1, 0);
            updateMenu(MA_MENU_STOP, 0, 1, 0);
        }

        /*
            Popup the context menu. Position near the bottom of the screen
         */
        h = GetDesktopWindow();
        GetWindowRect(h, &windowRect);
        GetCursorPos(&pos);

        p.x = pos.x;
        p.y = windowRect.bottom - 20;

        SetForegroundWindow(app->hwnd);
        TrackPopupMenu(app->subMenu, TPM_RIGHTALIGN | TPM_RIGHTBUTTON, p.x, p.y, 0, app->hwnd, NULL);
        /* Required Windows work-around */
        PostMessage(app->hwnd, WM_NULL, 0, 0);
        return 0;
    }

    /*
        Launch browser on a double click to the local home page
     */
    if (msg == WM_LBUTTONDBLCLK) {
        runBrowser("/index.html");
        return 0;
    }
    return 1;
}


/*
    Update menu string if text is non-null
    Update enable / disable if "enable" is non-zero. Positive will enable. Negative will disable.
    Update checked status if "check" is non-zero. Positive will enable, negative will disable.
 */
static void updateMenu(int id, char *text, int enable, int check)
{
    MENUITEMINFO    menuInfo;
    int             rc;

    if (text) {
        memset(&menuInfo, 0, sizeof(menuInfo));
        menuInfo.fMask = MIIM_STRING;
        menuInfo.cbSize = sizeof(menuInfo);
        menuInfo.fType = MFT_STRING;
        menuInfo.dwTypeData = NULL;
        menuInfo.fMask = MIIM_STRING;
        menuInfo.dwTypeData = text;
        menuInfo.cch = (uint) slen(text) + 1;
        rc = SetMenuItemInfo(app->subMenu, id, FALSE, &menuInfo);
    }
    if (enable > 0) {
        rc = EnableMenuItem(app->subMenu, id, MF_BYCOMMAND | MF_ENABLED);
    } else if (enable < 0) {
        rc = EnableMenuItem(app->subMenu, id, MF_BYCOMMAND | MF_GRAYED);
    }
    if (check > 0) {
        rc = CheckMenuItem(app->subMenu, id, MF_BYCOMMAND | MF_CHECKED);
    } else if (check < 0) {
        rc = CheckMenuItem(app->subMenu, id, MF_BYCOMMAND | MF_UNCHECKED);
    }
    rc = DrawMenuBar(app->hwnd);
}


/*
    Default log output is just to the console
 */
static void logHandler(cchar *tags, int level, cchar *msg)
{
    MessageBoxEx(NULL, msg, mprGetAppTitle(), MB_OK, 0);
}


/*
    Gracefull shutdown for Appweb
 */
static void shutdownAppweb()
{
    HWND    hwnd;
    int     i;

    hwnd = FindWindow(MPR->name, MPR->name);
    if (hwnd) {
        PostMessage(hwnd, WM_QUIT, 0, 0L);
        /*
            Wait for up to ten seconds while the service exits
         */
        for (i = 0; hwnd && i < 100; i++) {
            mprSleep(100);
            hwnd = FindWindow(MPR->name, MPR->name);
        }

    } else {
        mprLog("error", 0, "Cannot find %s to kill", MPR->name);
        return;
    }
}


/*
    Get local port used by Appweb
 */
static int getAppwebPort()
{
    char    *path, portBuf[32];
    int     fd;

    path = ".port.log";
    if ((fd = open(path, O_RDONLY, 0666)) < 0) {
        mprLog("error", 0, "Could not read port file %s", path);
        return -1;
    }
    if (read(fd, portBuf, sizeof(portBuf)) < 0) {
        mprLog("error", 0, "Read from port file %s failed", path);
        close(fd);
        return 80;
    }
    close(fd);
    return atoi(portBuf);
}


/*
    Start the user's default browser
 */
static int runBrowser(char *page)
{
    PROCESS_INFORMATION procInfo;
    STARTUPINFO         startInfo;
    char                cmdBuf[ME_MAX_BUFFER];
    char                *path;
    char                *pathArg;
    int                 port;

    port = getAppwebPort();
    if (port < 0) {
        mprLog("error", 0, "Cannot get Appweb listening port");
        return -1;
    }
    path = getBrowserPath(ME_MAX_BUFFER);
    if (path == 0) {
        mprLog("error", 0, "Cannot get browser startup command");
        return -1;
    }
    pathArg = strstr(path, "\"%1\"");
    if (*page == '/') {
        page++;
    }
    if (sstarts(page, "http")) {
        fmt(cmdBuf, ME_MAX_BUFFER, "%s %s", path, page);
    } else if (pathArg == 0) {
        fmt(cmdBuf, ME_MAX_BUFFER, "%s http://localhost:%d/%s", path, port, page);
    } else {
        *pathArg = '\0';
        fmt(cmdBuf, ME_MAX_BUFFER, "%s \"http://localhost:%d/%s\"", path, port, page);
    }
    mprLog("appweb monitor", 4, "Running %s\n", cmdBuf);
    memset(&startInfo, 0, sizeof(startInfo));
    startInfo.cb = sizeof(startInfo);

    if (! CreateProcess(0, cmdBuf, 0, 0, FALSE, 0, 0, 0, &startInfo, &procInfo)) {
        mprLog("error", 0, "Cannot create process: %s, %d", cmdBuf, mprGetOsError());
        return -1;
    }
    CloseHandle(procInfo.hProcess);
    return 0;
}


/*
    Return the path to run the user's default browser. Caller must free the return string.
 */
static char *getBrowserPath(int size)
{
    char    cmd[ME_MAX_BUFFER];
    char    *type, *cp, *path;

    if ((type = mprReadRegistry("HKEY_CLASSES_ROOT\\.htm", "")) == 0) {
        return 0;
    }
    fmt(cmd, ME_MAX_BUFFER, "HKEY_CLASSES_ROOT\\%s\\shell\\open\\command", type);
    if ((path = mprReadRegistry(cmd, "")) == 0) {
        return 0;
    }
    for (cp = path; *cp; cp++) {
        if (*cp == '\\') {
            *cp = '/';
        }
        *cp = tolower(*cp);
    }
    mprLog("appweb monitor", 4, "Browser path: %s\n", path);
    return path;
}


/*
    Start the window's service
 */
static int startService()
{
    SC_HANDLE   svc, mgr;
    int         rc;

    mgr = OpenSCManager(NULL, NULL, SC_MANAGER_ALL_ACCESS);
    if (! mgr) {
        mprLog("error", 0, "Cannot open service manager");
        return MPR_ERR_CANT_ACCESS;
    }
    svc = OpenService(mgr, app->serviceName, SERVICE_ALL_ACCESS);
    if (! svc) {
        mprLog("error", 0, "Cannot open service");
        CloseServiceHandle(mgr);
        return MPR_ERR_CANT_OPEN;
    }
    rc = StartService(svc, 0, NULL);
    if (rc == 0) {
        mprLog("error", 0, "Cannot start %s service: %d", app->serviceName, GetLastError());
        return MPR_ERR_CANT_INITIALIZE;
    }
    CloseServiceHandle(svc);
    CloseServiceHandle(mgr);
    return 0;
}


/*
    Stop the service in the current process.
 */
static int stopService()
{
    SC_HANDLE       svc, mgr;
    SERVICE_STATUS  status;
    int             rc;

    mgr = OpenSCManager(NULL, NULL, SC_MANAGER_ALL_ACCESS);
    if (! mgr) {
        mprLog("error", 0, "Cannot open service manager");
        return MPR_ERR_CANT_ACCESS;
    }
    svc = OpenService(mgr, app->serviceName, SERVICE_ALL_ACCESS);
    if (! svc) {
        mprLog("error", 0, "Cannot open service");
        CloseServiceHandle(mgr);
        return MPR_ERR_CANT_OPEN;
    }
    rc = ControlService(svc, SERVICE_CONTROL_STOP, &status);
    if (rc == 0) {
        mprLog("error", 0, "Cannot stop %s service: %d", app->serviceName, GetLastError());
        return MPR_ERR_CANT_INITIALIZE;
    }
    CloseServiceHandle(svc);
    CloseServiceHandle(mgr);
    return 0;
}


/*
    Query the service. Return the service state:

        SERVICE_CONTINUE_PENDING
        SERVICE_PAUSE_PENDING
        SERVICE_PAUSED
        SERVICE_RUNNING
        SERVICE_START_PENDING
        SERVICE_STOP_PENDING
        SERVICE_STOPPED
 */
static uint queryService()
{
    SC_HANDLE       svc, mgr;
    SERVICE_STATUS  status;
    int             rc;

    mgr = OpenSCManager(NULL, NULL, SC_MANAGER_ALL_ACCESS);
    if (! mgr) {
        mprLog("error", 0, "Cannot open service manager");
        return MPR_ERR_CANT_ACCESS;
    }
    svc = OpenService(mgr, app->serviceName, SERVICE_ALL_ACCESS);
    if (! svc) {
        /* No warnings on error. Makes Monitor more useful */
        CloseServiceHandle(mgr);
        return MPR_ERR_CANT_OPEN;
    }
    rc = QueryServiceStatus(svc, &status);
    if (rc == 0) {
        mprLog("error", 0, "Cannot start %s service: %d", app->serviceName, GetLastError());
        return 0;
    }
    CloseServiceHandle(svc);
    CloseServiceHandle(mgr);
    return status.dwCurrentState;
}

#endif /* WIN */

/*
    Copyright (c) Embedthis Software. All Rights Reserved.
    This software is distributed under a commercial license. Consult the LICENSE.md
    distributed with this software for full details and copyrights.
 */
