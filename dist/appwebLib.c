/*
    appwebLib.c -- Appweb Library Source

    This file is a catenation of all the source code. Amalgamating into a
    single file makes embedding simpler and the resulting application faster,
    by using compiler optimization within the Appweb library.

    Prepared by: buildLib.sh
 */

#include "appweb.h"

#if ME_COM_APPWEB


/********* Start of file src/config.c ************/

/**
    config.c - Parse the configuration file.

    Copyright (c) All Rights Reserved. See details at the end of the file.
 */

/********************************* Includes ***********************************/

#include    "appweb.h"

/********************************** Locals *************************************/

static MprHash *directives;

/***************************** Forward Declarations ****************************/

static int addCondition(MaState *state, cchar *name, cchar *condition, int flags);
static int addUpdate(MaState *state, cchar *name, cchar *details, int flags);
static bool conditionalDefinition(MaState *state, cchar *key);
static int configError(MaState *state, cchar *key);
static MaState *createState(void);
static char *getDirective(char *line, char **valuep);
static void manageState(MaState *state, int flags);
static int parseFileInner(MaState *state, cchar *path);
static int parseInit(void);
static int setTarget(MaState *state, cchar *name, cchar *details);

#if ME_COM_SSL
static void checkSsl(MaState *state);
#endif

/******************************************************************************/
/*
    Load modules builtin modules by default. Subsequent calls to the LoadModule directive will have no effect.
 */
PUBLIC int maLoadModules(void)
{
    int rc;

    rc = 0;
#if ME_COM_CGI
    rc += httpCgiInit(HTTP, mprCreateModule("cgi", NULL, NULL, HTTP));
#endif
#if ME_COM_ESP
    rc += httpEspInit(HTTP, mprCreateModule("esp", NULL, NULL, HTTP));
#endif
#if ME_COM_FAST && ME_UNIX_LIKE
    rc += httpFastInit(HTTP, mprCreateModule("fast", NULL, NULL, HTTP));
#endif
#if ME_COM_PROXY && ME_UNIX_LIKE
    rc += httpProxyInit(HTTP, mprCreateModule("proxy", NULL, NULL, HTTP));
#endif
#if ME_COM_TEST
    rc += httpTestInit(HTTP, mprCreateModule("test", NULL, NULL, HTTP));
#endif
#if ME_COM_TEST || ME_BENCHMARK
    rc += httpTestBenchInit(HTTP, mprCreateModule("testBench", NULL, NULL, HTTP));
#endif
#if ME_COM_TEST_WEBSOCKETS
    rc += httpTestWebSocketsInit(HTTP, mprCreateModule("testWebSockets", NULL, NULL, HTTP));
#endif
    return rc;
}


/*
    Configure handlers when an appweb.config is not being used
 */
PUBLIC int configureHandlers(HttpRoute *route)
{
#if ME_COM_CGI
    if (httpLookupStage("cgiHandler")) {
        char *path;
        /*
            Disabled by default so files are not served from the documents directory by default.
            httpAddRouteHandler(route, "cgiHandler", "cgi cgi-nph bat cmd pl py");
         */
        /*
            Add cgi-bin with a route for the /cgi-bin URL prefix.
         */
        path = "cgi-bin";
        if (mprPathExists(path, X_OK)) {
            HttpRoute *cgiRoute;
            cgiRoute = httpCreateAliasRoute(route, "/cgi-bin/", path, 0);
            httpSetRouteHandler(cgiRoute, "cgiHandler");
            httpFinalizeRoute(cgiRoute);
        }
    }
#endif
#if ME_COM_ESP
    if (httpLookupStage("espHandler")) {
        httpAddRouteHandler(route, "espHandler", "esp");
    }
#endif
#if ME_COM_EJS && DEPRECATED
    if (httpLookupStage("ejsHandler")) {
        httpAddRouteHandler(route, "ejsHandler", "ejs");
    }
#endif
#if ME_COM_PHP
    if (httpLookupStage("phpHandler")) {
        httpAddRouteHandler(route, "phpHandler", "php");
    }
#endif
    httpAddRouteHandler(route, "fileHandler", "");
    return 0;
}


PUBLIC int maConfigureServer(cchar *configFile, cchar *home, cchar *documents, cchar *ip, int port)
{
    HttpEndpoint *endpoint;
    HttpRoute    *route;

    route = httpGetDefaultRoute(0);
    if (maLoadModules() < 0) {
        return MPR_ERR_CANT_INITIALIZE;
    }
    if (configFile) {
        if (maParseConfig(configFile) < 0) {
            return MPR_ERR_CANT_INITIALIZE;
        }
    } else {
        if ((endpoint = httpCreateConfiguredEndpoint(0, home, documents, ip, port)) == 0) {
            return MPR_ERR_CANT_OPEN;
        }
        configureHandlers(route);
    }
    return 0;
}


static int openConfig(MaState *state, cchar *path)
{
    assert(state);
    assert(path && *path);

    state->filename = sclone(path);
    state->configDir = mprGetAbsPath(mprGetPathDir(state->filename));
    mprLog("info http", 3, "Parse %s", mprGetAbsPath(state->filename));
    if ((state->file = mprOpenFile(path, O_RDONLY | O_TEXT, 0444)) == 0) {
        mprLog("error http", 0, "Cannot open %s for config directives", path);
        return MPR_ERR_CANT_OPEN;
    }
    parseInit();
    return 0;
}


PUBLIC int maParseConfig(cchar *path)
{
    HttpRoute *route;
    MaState   *state;
    bool      json, yielding;
    int       rc;

    route = httpGetDefaultRoute(0);
    json = smatch(mprGetPathExt(path), "json");

    if (json) {
        rc = httpLoadConfig(route, path);
    } else {
        state = createState();
        yielding = mprSetThreadYield(NULL, 0);
        rc = maParseFile(state, path);
        mprSetThreadYield(NULL, yielding);
    }
    if (rc < 0) {
        return rc;
    }
    httpFinalizeRoute(route);

    if (!json && (rc = httpCheckAuthorization(route)) < 0) {
        return rc;
    }
    if (mprHasMemError()) {
        mprLog("error appweb memory", 0, "Memory allocation error when initializing");
        return MPR_ERR_MEMORY;
    }
    return 0;
}


PUBLIC int maParseFile(MaState *state, cchar *path)
{
    MaState *topState;
    int     rc, lineNumber;

    assert(path && *path);
    if (!state) {
        lineNumber = 0;
        topState = state = createState();
    } else {
        topState = 0;
        lineNumber = state->lineNumber;
        state = maPushState(state);
    }
    rc = parseFileInner(state, path);
    if (!topState) {
        state = maPopState(state);
        state->lineNumber = lineNumber;
    }
    return rc;
}


static int parseFileInner(MaState *state, cchar *path)
{
    MaDirective *directive;
    char        *tok, *key, *line, *value;

    assert(state);
    assert(path && *path);

    if (openConfig(state, path) < 0) {
        return MPR_ERR_CANT_OPEN;
    }
    for (state->lineNumber = 1; state->file && (line = mprReadLine(state->file, 0, NULL)) != 0; state->lineNumber++) {
        for (tok = line; isspace((uchar) * tok); tok++);
        if (*tok == '\0' || *tok == '#') {
            continue;
        }
        state->key = 0;
        if ((key = getDirective(line, &value)) == 0) {
            continue;
        }
        if (!state->enabled) {
            /*
                Skip the directives in a disabled block, but never the <if> and </if> that delimit a
                nested one. </if> always pops a state, so skipping the open without skipping the close
                pops the enclosing block instead. The parser then continues with the wrong state: the
                directives after the block attach to a route that has already been finalized, and the
                rest of the file is silently discarded -- including any authorization it defines. A
                nested <if> still evaluates to disabled here, because maPushState inherits enabled.
             */
            if (sncaselesscmp(key, "<if", 3) != 0 && sncaselesscmp(key, "</if", 4) != 0) {
                continue;
            }
        }
        if ((directive = mprLookupKey(directives, key)) == 0) {
            mprLog("error appweb config", 0, "Unknown directive \"%s\". At line %d in %s",
                   key, state->lineNumber, state->filename);
            return MPR_ERR_BAD_SYNTAX;
        }
        state->key = key;

        if ((*directive)(state, key, value) < 0) {
            mprLog("error appweb config", 0, "Error with directive \"%s\". At line %d in %s",
                   state->key, state->lineNumber, state->filename);
            return MPR_ERR_BAD_SYNTAX;
        }
        state = state->top->current;
    }
    /* EOF */
    if (state->prev && state->file == state->prev->file) {
        mprLog("error appweb config", 0, "Unclosed directives in %s", state->filename);
        while (state->prev && state->file == state->prev->file) {
            state = state->prev;
        }
    }
    mprCloseFile(state->file);
    return 0;
}


/*
    Action mimeType program

    The program is tokenized with %T so ${HOME} and friends expand. %S leaves the text verbatim,
    which made "${HOME}/utils/php.cgi" -- the form every other path directive here takes -- resolve
    to a literal directory named "${HOME}". %P is not used: it would also make the program absolute
    against Home, and a bare program name is legitimately resolved from PATH by mprSearchPath.

    NOTE: the mime table is shared by reference with the parent route (route->mimeTypes), so an
    Action inside a <Route> block writes into the same table every other route reads. Action is
    effectively server-wide wherever it appears, and the last one parsed for a given MIME type wins.
 */
static int actionDirective(MaState *state, cchar *key, cchar *value)
{
    char *mimeType, *program;

    if (!maTokenize(state, value, "%S %T", &mimeType, &program)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    mprSetMimeProgram(state->route->mimeTypes, mimeType, program);
    return 0;
}


/*
    AddFilter filter [ext ext ext ...]
 */
static int addFilterDirective(MaState *state, cchar *key, cchar *value)
{
    char *filter, *extensions;

    if (!maTokenize(state, value, "%S ?*", &filter, &extensions)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    if (httpAddRouteFilter(state->route, filter, extensions, HTTP_STAGE_RX | HTTP_STAGE_TX) < 0) {
        mprLog("error appweb config", 0, "Cannot add filter %s", filter);
        return MPR_ERR_CANT_CREATE;
    }
    return 0;
}


/*
    AddInputFilter filter [ext ext ext ...]
 */
static int addInputFilterDirective(MaState *state, cchar *key, cchar *value)
{
    char *filter, *extensions;

    if (!maTokenize(state, value, "%S ?*", &filter, &extensions)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    if (httpAddRouteFilter(state->route, filter, extensions, HTTP_STAGE_RX) < 0) {
        mprLog("error appweb config", 0, "Cannot add filter %s", filter);
        return MPR_ERR_CANT_CREATE;
    }
    return 0;
}


/*
    AddLanguageSuffix lang ext [position]
    AddLanguageSuffix en .en before
 */
static int addLanguageSuffixDirective(MaState *state, cchar *key, cchar *value)
{
    char *lang, *ext, *position;
    int  flags;

    if (!maTokenize(state, value, "%S %S ?S", &lang, &ext, &position)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    flags = 0;
    if (scaselessmatch(position, "after")) {
        flags |= HTTP_LANG_AFTER;
    } else if (scaselessmatch(position, "before")) {
        flags |= HTTP_LANG_BEFORE;
    }
    httpAddRouteLanguageSuffix(state->route, lang, ext, flags);
    return 0;
}


/*
    AddLanguageDir lang path
 */
static int addLanguageDirDirective(MaState *state, cchar *key, cchar *value)
{
    HttpRoute *route;
    char      *lang, *path;

    route = state->route;
    if (!maTokenize(state, value, "%S %S", &lang, &path)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    if ((path = stemplate(path, route->vars)) == 0) {
        return MPR_ERR_BAD_SYNTAX;
    }
    if (mprIsPathRel(path)) {
        path = mprJoinPath(route->documents, path);
    }
    httpAddRouteLanguageDir(route, lang, mprGetAbsPath(path));
    return 0;
}


/*
    AddOutputFilter filter [ext ext ...]
 */
static int addOutputFilterDirective(MaState *state, cchar *key, cchar *value)
{
    char *filter, *extensions;

    if (!maTokenize(state, value, "%S ?*", &filter, &extensions)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    if (httpAddRouteFilter(state->route, filter, extensions, HTTP_STAGE_TX) < 0) {
        mprLog("error appweb config", 0, "Cannot add filter %s", filter);
        return MPR_ERR_CANT_CREATE;
    }
    return 0;
}


/*
    AddHandler handler [ext ext ...]
 */
static int addHandlerDirective(MaState *state, cchar *key, cchar *value)
{
    char *handler, *extensions;

    if (!maTokenize(state, value, "%S ?*", &handler, &extensions)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    if (!extensions) {
        extensions = "";
    } else if (smatch(extensions, "*")) {
        extensions = "";
    }
    if (httpAddRouteHandler(state->route, handler, extensions) < 0) {
        mprLog("error appweb config", 0, "Cannot add handler %s", handler);
        return MPR_ERR_CANT_CREATE;
    }
    return 0;
}


/*
    AddType mimeType ext
 */
static int addTypeDirective(MaState *state, cchar *key, cchar *value)
{
    char *ext, *mimeType;

    if (!maTokenize(state, value, "%S %S", &mimeType, &ext)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    mprAddMime(state->route->mimeTypes, mimeType, ext);
    return 0;
}


/*
    Alias /uriPrefix /path
 */
static int aliasDirective(MaState *state, cchar *key, cchar *value)
{
    HttpRoute *alias;
    MprPath   info;
    char      *prefix, *path;

    if (!maTokenize(state, value, "%S %P", &prefix, &path)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    mprGetPathInfo(path, &info);
    if (info.isDir) {
        /*
            Match the URI prefix and capture the remainder, which "run $1" maps to a filename.
            A prefix without a trailing "/" absorbs the separator so the capture does not carry
            a leading slash.
         */
        alias = httpCreateAliasRoute(state->route, prefix, path, 0);
        httpSetRouteAliasPattern(alias, prefix);
        httpSetRouteTarget(alias, "run", "$1");
    } else {
        alias = httpCreateAliasRoute(state->route, sjoin("^", prefix, NULL), 0, 0);
        httpSetRouteTarget(alias, "run", path);
    }
    httpFinalizeRoute(alias);
    return 0;
}


/*
    Allow
 */
static int allowDirective(MaState *state, cchar *key, cchar *value)
{
    char *from, *spec;

    if (!maTokenize(state, value, "%S %S", &from, &spec)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    httpSetAuthAllow(state->auth, spec);
    return addCondition(state, "allowDeny", 0, 0);
}


/*
    AuthStore NAME
 */
static int authStoreDirective(MaState *state, cchar *key, cchar *value)
{
    if (httpSetAuthStore(state->auth, value) < 0) {
        mprLog("warn appweb config", 0, "The \"%s\" AuthStore is not available on this platform", value);
        return configError(state, key);
    }
    return 0;
}


/*
    AuthRealm name
 */
static int authRealmDirective(MaState *state, cchar *key, cchar *value)
{
    httpSetAuthRealm(state->auth, strim(value, "\"'", MPR_TRIM_BOTH));
    return 0;
}


/*
    AuthType basic|digest realm
    AuthType form realm login-page [login-service logout-service logged-in-page logged-out-page]
 */
static int authTypeDirective(MaState *state, cchar *key, cchar *value)
{
    char *type, *details, *loginPage, *loginService, *logoutService, *loggedInPage, *loggedOutPage, *realm;

    if (!maTokenize(state, value, "%S ?S ?*", &type, &realm, &details)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    if (httpSetAuthType(state->auth, type, details) < 0) {
        return MPR_ERR_BAD_SYNTAX;
    }
    if (!smatch(type, "none")) {
        if (realm) {
            httpSetAuthRealm(state->auth, strim(realm, "\"'", MPR_TRIM_BOTH));
        } else if (!state->auth->realm) {
            /* Try to detect users forgetting to define a realm */
            mprLog("warn appweb config", 0, "Must define an AuthRealm before defining the AuthType");
        }
        if (details) {
            if (!maTokenize(state, details, "%S ?S ?S ?S ?S", &loginPage, &loginService, &logoutService,
                            &loggedInPage, &loggedOutPage)) {
                return MPR_ERR_BAD_SYNTAX;
            }
            if (loginPage && !*loginPage) {
                loginPage = 0;
            }
            if (loginService && !*loginService) {
                loginService = 0;
            }
            if (logoutService && !*logoutService) {
                logoutService = 0;
            }
            if (loggedInPage && !*loggedInPage) {
                loggedInPage = 0;
            }
            if (loggedOutPage && !*loggedOutPage) {
                loggedOutPage = 0;
            }
            httpSetAuthFormDetails(state->route, loginPage, loginService, logoutService, loggedInPage, loggedOutPage);
        }
        return addCondition(state, "auth", 0, 0);
    }
    return 0;
}


/*
    AuthAutoLogin username
 */
static int authAutoLoginDirective(MaState *state, cchar *key, cchar *value)
{
    cchar *username;

    if (!maTokenize(state, value, "%S", &username)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    httpSetAuthUsername(state->auth, username);
    return 0;
}


/*
    AuthDigestQop none|auth
    Note: auth-int is unsupported
 */
static int authDigestQopDirective(MaState *state, cchar *key, cchar *value)
{
    if (!scaselessmatch(value, "none") && !scaselessmatch(value, "auth")) {
        return MPR_ERR_BAD_SYNTAX;
    }
    httpSetAuthQop(state->auth, value);
    return 0;
}


static int autoFinalize(MaState *state, cchar *key, cchar *value)
{
    httpSetRouteAutoFinalize(state->route, scaselessmatch(value, "true"));
    return 0;
}


/*
    Cache options
    Options:
        lifespan
        server=lifespan
        client=lifespan
        extensions="html,gif,..."
        methods="GET,PUT,*,..."
        types="mime-type,*,..."
        all | only | unique
 */
static int cacheDirective(MaState *state, cchar *key, cchar *value)
{
    MprTicks lifespan, clientLifespan, serverLifespan;
    char     *option, *ovalue, *tok;
    char     *methods, *extensions, *types, *uris;
    int      flags;

    flags = 0;
    lifespan = clientLifespan = serverLifespan = 0;
    methods = uris = extensions = types = 0;

    for (option = stok(sclone(value), " \t", &tok); option; option = stok(0, " \t", &tok)) {
        if (*option == '/') {
            uris = option;
            if (tok) {
                /* Join the rest of the options back into one list of URIs */
                tok[-1] = ',';
            }
            break;
        }
        option = ssplit(option, " =\t,", &ovalue);
        ovalue = strim(ovalue, "\"'", MPR_TRIM_BOTH);
        if ((int) isdigit((uchar) * option)) {
            lifespan = httpGetTicks(option);

        } else if (smatch(option, "client")) {
            flags |= HTTP_CACHE_CLIENT;
            if (ovalue) {
                clientLifespan = httpGetTicks(ovalue);
            }

        } else if (smatch(option, "server")) {
            flags |= HTTP_CACHE_SERVER;
            if (ovalue) {
                serverLifespan = httpGetTicks(ovalue);
            }

        } else if (smatch(option, "extensions")) {
            extensions = ovalue;

        } else if (smatch(option, "types")) {
            types = ovalue;

        } else if (smatch(option, "unique")) {
            flags |= HTTP_CACHE_UNIQUE;

        } else if (smatch(option, "manual")) {
            flags |= HTTP_CACHE_MANUAL;

        } else if (smatch(option, "methods")) {
            methods = ovalue;

        } else {
            mprLog("error appweb config", 0, "Unknown Cache option '%s'", option);
            return MPR_ERR_BAD_SYNTAX;
        }
    }
    if (lifespan > 0 && !uris && !extensions && !types && !methods) {
        state->route->lifespan = lifespan;
    } else {
#if ME_HTTP_CACHE
        httpAddCache(state->route, methods, uris, extensions, types, clientLifespan, serverLifespan, flags);
#endif
    }
    return 0;
}


/*
    CanonicalName URI
 */
static int canonicalNameDirective(MaState *state, cchar *key, cchar *value)
{
    return httpSetRouteCanonicalName(state->route, value);
}


static int charSetDirective(MaState *state, cchar *key, cchar *value)
{
    httpSetRouteCharSet(state->route, value);
    return 0;
}

/*
    Chroot path
 */
static int chrootDirective(MaState *state, cchar *key, cchar *value)
{
#if ME_UNIX_LIKE
    MprKey *kp;
    cchar  *oldConfigDir;
    char   *home;

    home = httpMakePath(state->route, state->configDir, value);
    if (chdir(home) < 0) {
        mprLog("error appweb config", 0, "Cannot change working directory to %s", home);
        return MPR_ERR_CANT_OPEN;
    }
    if (state->route->flags & HTTP_ROUTE_NO_LISTEN) {
        /* Not running a web server */
        mprLog("info appweb config", 2, "Change directory to: \"%s\"", home);
    } else {
        if (chroot(home) < 0) {
            if (errno == EPERM) {
                mprLog("error appweb config", 0, "Must be super user to use chroot");
            } else {
                mprLog("error appweb config", 0, "Cannot change change root directory to %s, errno %d", home, errno);
            }
            return MPR_ERR_BAD_SYNTAX;
        }
        /*
            Remap directories
         */
        oldConfigDir = state->configDir;
        state->configDir = mprGetAbsPath(mprGetRelPath(state->configDir, home));
        state->route->documents = mprGetAbsPath(mprGetRelPath(state->route->documents, home));
        state->route->home = state->route->documents;
        for (ITERATE_KEYS(state->route->vars, kp)) {
            if (sstarts(kp->data, oldConfigDir)) {
                kp->data = mprGetAbsPath(mprGetRelPath(kp->data, oldConfigDir));
            }
        }
        httpSetJail(home);
        mprLog("info appweb config", 2, "Chroot to: \"%s\"", home);
    }
    return 0;
#else
    mprLog("error appweb config", 0, "Chroot directive not supported on this operating system\n");
    return MPR_ERR_BAD_SYNTAX;
#endif
}


/*
    </Route>, </Location>, </Directory>, </VirtualHost>, </If>
 */
static int closeDirective(MaState *state, cchar *key, cchar *value)
{
    /*
        The order of route finalization will be from the inside. Route finalization causes the route to be added
        to the enclosing host. This ensures that nested routes are defined BEFORE outer/enclosing routes.
     */
    if (state->route != state->prev->route) {
        httpFinalizeRoute(state->route);
    }
    maPopState(state);
    return 0;
}


/*
    Condition [!] auth
    Condition [!] condition
    Condition [!] exists string
    Condition [!] directory string
    Condition [!] match string valuePattern
    Condition [!] secure
    Condition [!] unauthorized

    Strings can contain route->pattern and request ${tokens}
 */
static int conditionDirective(MaState *state, cchar *key, cchar *value)
{
    char *name, *details;
    int  not;

    if (!maTokenize(state, value, "%! ?S ?*", &not, &name, &details)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    return addCondition(state, name, details, not ? HTTP_ROUTE_NOT : 0);
}


/*
    CrossOrigin  origin=[client|all|*|NAME] [credentials=[yes|no]] [headers=HDR,...] [age=NN]
 */
static int crossOriginDirective(MaState *state, cchar *key, cchar *value)
{
    HttpRoute *route;
    char      *option, *ovalue, *tok;
    bool      sawOrigin;

    route = state->route;
    tok = sclone(value);
    sawOrigin = 0;
    while ((option = maGetNextArg(tok, &tok)) != 0) {
        option = ssplit(option, " =\t,", &ovalue);
        ovalue = strim(ovalue, "\"'", MPR_TRIM_BOTH);
        if (scaselessmatch(option, "origin")) {
            sawOrigin = 1;
            if (scaselessmatch(ovalue, "client")) {
                route->corsOrigin = MPR->emptyString;
            } else if (scaselessmatch(ovalue, "all")) {
                route->corsOrigin = sclone("*");
            } else {
                route->corsOrigin = sclone(ovalue);
            }

        } else if (scaselessmatch(option, "credentials")) {
            route->corsCredentials = httpGetBoolToken(ovalue);

        } else if (scaselessmatch(option, "headers")) {
            route->corsHeaders = sclone(ovalue);

        } else if (scaselessmatch(option, "age")) {
            route->corsAge = atoi(ovalue);

        } else {
            mprLog("error appweb config", 0, "Unknown CrossOrigin option %s", option);
            return MPR_ERR_BAD_SYNTAX;
        }
    }
    if (!sawOrigin) {
        mprLog("error appweb config", 0, "CrossOrigin: origin= argument is required");
        return MPR_ERR_BAD_SYNTAX;
    }
    if (route->corsCredentials && (!route->corsOrigin || !*route->corsOrigin || smatch(route->corsOrigin, "*"))) {
        mprLog("error appweb config", 0, "CrossOrigin: credentials requires an explicit non-wildcard origin");
        return MPR_ERR_BAD_STATE;
    }
    /*
        Need the options method for pre-flight requests
     */
    httpAddRouteMethods(route, "OPTIONS");
    route->flags |= HTTP_ROUTE_CORS;
    return 0;
}


#if ME_HTTP_DEFENSE
/*
    Defense name [Arg=Value]...

    Remedies: ban, cmd, delay, email, http, log
    Args: CMD, DELAY, FROM, IP, MESSAGE, PERIOD, STATUS, SUBJECT, TO, METHOD, URI
    Examples:
    Examples:
        Defense block REMEDY=ban PERIOD=30mins
        Defense report REMEDY=http URI=http://example.com/report
        Defense alarm REMEDY=cmd CMD="afplay klaxon.mp3"
        Defense slow REMEDY=delay PERIOD=10mins DELAY=1sec
        Defense fix REMEDY=cmd CMD="${MESSAGE} | sendmail admin@example.com"
        Defense notify REMEDY=email TO=info@example.com
        Defense firewall REMEDY=cmd CMD="iptables -A INPUT -s ${IP} -j DROP"
        Defense reboot REMEDY=restart
 */
static int defenseDirective(MaState *state, cchar *key, cchar *value)
{
    cchar *name, *args;

    if (!maTokenize(state, value, "%S ?*", &name, &args)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    httpAddDefense(name, NULL, args);
    return 0;
}
#endif


static int defaultLanguageDirective(MaState *state, cchar *key, cchar *value)
{
    httpSetRouteDefaultLanguage(state->route, value);
    return 0;
}


/*
    Deny "from" address
 */
static int denyDirective(MaState *state, cchar *key, cchar *value)
{
    char *from, *spec;

    if (!maTokenize(state, value, "%S %S", &from, &spec)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    httpSetAuthDeny(state->auth, spec);
    return addCondition(state, "allowDeny", 0, 0);
}


/*
    <Directory path>
 */
static int directoryDirective(MaState *state, cchar *key, cchar *value)
{
    /*
        Directory must be deprecated because Auth directives inside a directory block applied to physical filenames.
        The router and Route directives cannot emulate this. The user needs to migrate such configurations to apply
        Auth directives to route URIs instead.
     */
    mprLog("warn config", 0,
           "The <Directory> directive is deprecated. Use <Route> with a Documents directive instead.");
    return MPR_ERR_BAD_SYNTAX;
}


/*
    DirectoryIndex paths...
 */
static int directoryIndexDirective(MaState *state, cchar *key, cchar *value)
{
    char *path, *tok;

    for (path = stok(sclone(value), " \t,", &tok); path; path = stok(0, " \t,", &tok)) {
        httpAddRouteIndex(state->route, path);
    }
    return 0;
}


/*
    Documents path
    DocumentRoot path
 */
static int documentsDirective(MaState *state, cchar *key, cchar *value)
{
    cchar *path;

    if (!maTokenize(state, value, "%T", &path)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    path = mprJoinPath(state->configDir, httpExpandRouteVars(state->route, path));
    httpSetRouteDocuments(state->route, path);
    return 0;
}


/*
    <else>
 */
static int elseDirective(MaState *state, cchar *key, cchar *value)
{
    state->enabled = !state->enabled;
    return 0;
}


/*
    ErrorDocument status URI
 */
static int errorDocumentDirective(MaState *state, cchar *key, cchar *value)
{
    char *uri;
    int  status;

    if (!maTokenize(state, value, "%N %S", &status, &uri)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    httpAddRouteErrorDocument(state->route, status, uri);
    return 0;
}


/*
    ErrorLog path
        [size=bytes]
        [level=0-5]
        [backup=count]
        [anew]
        [stamp=period]
 */
static int errorLogDirective(MaState *state, cchar *key, cchar *value)
{
    MprTicks stamp;
    cchar    *path;
    char     *option, *ovalue, *tok;
    ssize    size;
    int      level, flags, backup;

    if (mprGetCmdlineLogging()) {
        mprLog("info appweb config", 4, "Already logging. Ignoring ErrorLog directive");
        return 0;
    }
    size = MAXINT;
    stamp = 0;
    level = 0;
    backup = 0;
    path = 0;
    flags = 0;

    for (option = maGetNextArg(sclone(value), &tok); option; option = maGetNextArg(tok, &tok)) {
        if (!path) {
            if ((path = httpGetRouteVar(state->route, "LOG_DIR")) == 0) {
                path = ".";
            }
            path = mprJoinPath(path, httpExpandRouteVars(state->route, option));
        } else {
            option = ssplit(option, " =\t,", &ovalue);
            ovalue = strim(ovalue, "\"'", MPR_TRIM_BOTH);
            if (smatch(option, "size")) {
                size = (ssize) httpGetNumber(ovalue);

            } else if (smatch(option, "level")) {
                level = atoi(ovalue);

            } else if (smatch(option, "backup")) {
                backup = atoi(ovalue);

            } else if (smatch(option, "anew")) {
                flags |= MPR_LOG_ANEW;

            } else if (smatch(option, "stamp")) {
                stamp = httpGetTicks(ovalue);

            } else {
                mprLog("error appweb config", 0, "Unknown ErrorLog option %s", option);
            }
        }
    }
    if (size < (10 * 1000)) {
        mprLog("error appweb config", 0, "Size is too small. Must be larger than 10K");
        return MPR_ERR_BAD_SYNTAX;
    }
    if (path == 0) {
        mprLog("error appweb config", 0, "Missing filename");
        return MPR_ERR_BAD_SYNTAX;
    }
    mprSetLogBackup(size, backup, flags);

    if (!smatch(path, "stdout") && !smatch(path, "stderr")) {
        path = httpMakePath(state->route, state->configDir, path);
    }
    if (mprStartLogging(path, MPR_LOG_DETAILED) < 0) {
        mprLog("error appweb config", 0, "Cannot write to ErrorLog: %s", path);
        return MPR_ERR_BAD_SYNTAX;
    }
    mprSetLogLevel(level);
    mprLogConfig();
    if (stamp) {
        httpSetTimestamp(stamp);
    }
    return 0;
}


/*
    ExitTimeout msec
 */
static int exitTimeoutDirective(MaState *state, cchar *key, cchar *value)
{
    mprSetExitTimeout(httpGetTicks(value));
    return 0;
}


static int fixDotNetDigestAuth(MaState *state, cchar *key, cchar *value)
{
    state->route->flags |= smatch(value, "on") ? HTTP_ROUTE_DOTNET_DIGEST_FIX : 0;
    return 0;
}


/*
    FollowSymlinks on|off
 */
static int followSymlinksDirective(MaState *state, cchar *key, cchar *value)
{
    bool on;

    if (!maTokenize(state, value, "%B", &on)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    httpSetRouteFollowSymlinks(state->route, on);
    return 0;
}


/*
    GroupAccount groupName
 */
static int groupAccountDirective(MaState *state, cchar *key, cchar *value)
{
    if (smatch(value, "_unchanged_")) {
        return 0;
    }
    if (mprGetDebugMode()) {
        mprLog("warn appweb config", 0, "GroupAccount %s ignored: --debugger suppresses the privilege drop. "
               "The server will continue to run as the invoking user.", value);
        return 0;
    }
    return httpSetGroupAccount(value);
}


/*
    Header [add|append|remove|set] name value
 */
static int headerDirective(MaState *state, cchar *key, cchar *value)
{
    char *cmd, *header, *hvalue;
    int  op;

    if (!maTokenize(state, value, "%S %S ?*", &cmd, &header, &hvalue)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    if (scaselessmatch(cmd, "add")) {
        op = HTTP_ROUTE_ADD_HEADER;
    } else if (scaselessmatch(cmd, "append")) {
        op = HTTP_ROUTE_APPEND_HEADER;
    } else if (scaselessmatch(cmd, "remove")) {
        op = HTTP_ROUTE_REMOVE_HEADER;
    } else if (scaselessmatch(cmd, "set")) {
        op = HTTP_ROUTE_SET_HEADER;
    } else {
        mprLog("error appweb config", 0, "Unknown Header directive operation: %s", cmd);
        return MPR_ERR_BAD_SYNTAX;
    }
    httpAddRouteResponseHeader(state->route, op, header, hvalue);
    return 0;
}


/*
    Home path
 */
static int homeDirective(MaState *state, cchar *key, cchar *value)
{
    char *path;

    if (!maTokenize(state, value, "%T", &path)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    httpSetRouteHome(state->route, path);
    return 0;
}


static int http2Directive(MaState *state, cchar *key, cchar *value)
{
    bool on;

    if (!maTokenize(state, value, "%B", &on)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    httpEnableHttp2(on);
    return 0;
}


/*
    IgnoreEncodingErrors [on|off]
 */
static int ignoreEncodingErrorsDirective(MaState *state, cchar *key, cchar *value)
{
    bool on;

    if (!maTokenize(state, value, "%B", &on)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    httpSetRouteIgnoreEncodingErrors(state->route, on);
    return 0;
}


/*
    <Include pattern>
 */
static int includeDirective(MaState *state, cchar *key, cchar *value)
{
    MprList *includes;
    char    *path, *pattern, *include;
    int     next;

    /*
        Must use %S and not %P because the path is relative to the appweb.conf file and not to the route home
     */
    if (!maTokenize(state, value, "%S", &value)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    value = mprGetAbsPath(mprJoinPath(state->configDir, httpExpandRouteVars(state->route, value)));

    if (strpbrk(value, "^$*+?([|{") == 0) {
        if (maParseFile(state, value) < 0) {
            return MPR_ERR_CANT_OPEN;
        }
    } else {
        path = mprGetPathDir(mprJoinPath(state->route->home, value));
        path = stemplate(path, state->route->vars);
        pattern = mprGetPathBase(value);
        includes = mprGlobPathFiles(path, pattern, 0);
        for (ITERATE_ITEMS(includes, include, next)) {
            if (maParseFile(state, include) < 0) {
                return MPR_ERR_CANT_OPEN;
            }
        }
    }
    return 0;
}


#if ME_HTTP_DIR
/*
    IndexOrder ascending|descending name|date|size
 */
static int indexOrderDirective(MaState *state, cchar *key, cchar *value)
{
    HttpDir *dir;
    char    *option;

    dir = httpGetDirObj(state->route);
    if (!maTokenize(state, value, "%S %S", &option, &dir->sortField)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    dir->sortField = 0;
    if (scaselessmatch(option, "ascending")) {
        dir->sortOrder = 1;
    } else {
        dir->sortOrder = -1;
    }
    if (dir->sortField) {
        dir->sortField = sclone(dir->sortField);
    }
    return 0;
}


/*
    IndexOptions FancyIndexing|FoldersFirst ... (set of options)
 */
static int indexOptionsDirective(MaState *state, cchar *key, cchar *value)
{
    HttpDir *dir;
    char    *option, *tok;

    dir = httpGetDirObj(state->route);
    option = stok(sclone(value), " \t", &tok);
    while (option) {
        if (scaselessmatch(option, "FancyIndexing")) {
            dir->fancyIndexing = 1;
        } else if (scaselessmatch(option, "HTMLTable")) {
            dir->fancyIndexing = 2;
        } else if (scaselessmatch(option, "FoldersFirst")) {
            dir->foldersFirst = 1;
        }
        option = stok(tok, " \t", &tok);
    }
    return 0;
}
#endif


/*
    <If DEFINITION>
 */
static int ifDirective(MaState *state, cchar *key, cchar *value)
{
    state = maPushState(state);
    if (state->enabled) {
        state->enabled = conditionalDefinition(state, value);
    }
    return 0;
}


/*
    InactivityTimeout msecs
 */
static int inactivityTimeoutDirective(MaState *state, cchar *key, cchar *value)
{
    if (!mprGetDebugMode()) {
        httpGraduateLimits(state->route, 0);
        state->route->limits->inactivityTimeout = httpGetTicks(value);
    }
    return 0;
}


/*
    LimitPacket bytes
 */
static int limitPacketDirective(MaState *state, cchar *key, cchar *value)
{
    int size;

    httpGraduateLimits(state->route, 0);
    size = httpGetInt(value);
    if (size > (1024 * 1024)) {
        size = (1024 * 1024);
    }
    state->route->limits->packetSize = size;
    return 0;
}


/*
    LimitCache bytes
 */
static int limitCacheDirective(MaState *state, cchar *key, cchar *value)
{
    mprSetCacheLimits(state->host->responseCache, 0, 0, httpGetNumber(value), 0);
    return 0;
}


/*
    LimitCacheItem bytes
 */
static int limitCacheItemDirective(MaState *state, cchar *key, cchar *value)
{
    httpGraduateLimits(state->route, 0);
    state->route->limits->cacheItemSize = httpGetInt(value);
    return 0;
}


/*
    LimitChunk bytes
 */
static int limitChunkDirective(MaState *state, cchar *key, cchar *value)
{
    httpGraduateLimits(state->route, 0);
    state->route->limits->chunkSize = httpGetInt(value);
    return 0;
}


/*
    LimitClients count
 */
static int limitClientsDirective(MaState *state, cchar *key, cchar *value)
{
    httpGraduateLimits(state->route, 0);
    state->route->limits->clientMax = httpGetInt(value);
    return 0;
}


/*
    LimitConnections count
 */
static int limitConnectionsDirective(MaState *state, cchar *key, cchar *value)
{
    httpGraduateLimits(state->route, 0);
    state->route->limits->connectionsMax = httpGetInt(value);
    return 0;
}


/*
    LimitConnectionsPerClient count
 */
static int limitConnectionsPerClientDirective(MaState *state, cchar *key, cchar *value)
{
    httpGraduateLimits(state->route, 0);
    state->route->limits->connectionsPerClientMax = httpGetInt(value);
    return 0;
}

/*
    LimitFiles count
 */
static int limitFilesDirective(MaState *state, cchar *key, cchar *value)
{
#if ME_UNIX_LIKE
    mprSetFilesLimit(httpGetInt(value));
#endif
    return 0;
}


/*
    LimitFrame bytes
 */
static int limitFrameDirective(MaState *state, cchar *key, cchar *value)
{
#if ME_HTTP_HTTP2
    int size;

    httpGraduateLimits(state->route, 0);
    size = httpGetInt(value);
    if (size > (1024 * 1024)) {
        size = (1024 * 1024);
    }
    state->route->limits->frameSize = size;
    return 0;
#else
    mprLog("error appweb config", 0, "HTTP/2 is not enabled");
    return MPR_ERR_CANT_ACCESS;
#endif
}


/*
    LimitKeepAlive count
 */
static int limitKeepAliveDirective(MaState *state, cchar *key, cchar *value)
{
    httpGraduateLimits(state->route, 0);
    state->route->limits->keepAliveMax = httpGetInt(value);
    return 0;
}


/*
    LimitMemory size

    Redline set to 85%
 */
static int limitMemoryDirective(MaState *state, cchar *key, cchar *value)
{
    ssize maxMem;

    maxMem = (ssize) httpGetNumber(value);
    mprSetMemLimits(maxMem / 100 * 85, maxMem, -1);
    return 0;
}


/*
    LimitProcesses count
 */
static int limitProcessesDirective(MaState *state, cchar *key, cchar *value)
{
    httpGraduateLimits(state->route, 0);
    state->route->limits->processMax = httpGetInt(value);
    return 0;
}


/*
    LimitRequestsPerClient count
 */
static int limitRequestsPerClientDirective(MaState *state, cchar *key, cchar *value)
{
    httpGraduateLimits(state->route, 0);
    state->route->limits->requestsPerClientMax = httpGetInt(value);
    return 0;
}


/*
    LimitRequestBody bytes
 */
static int limitRequestBodyDirective(MaState *state, cchar *key, cchar *value)
{
    httpGraduateLimits(state->route, 0);
    state->route->limits->rxBodySize = httpGetNumber(value);
    return 0;
}


/*
    LimitRequestForm bytes
 */
static int limitRequestFormDirective(MaState *state, cchar *key, cchar *value)
{
    httpGraduateLimits(state->route, 0);
    state->route->limits->rxFormSize = httpGetNumber(value);
    return 0;
}


/*
    LimitRequestFormCount count
 */
static int limitRequestFormCountDirective(MaState *state, cchar *key, cchar *value)
{
    httpGraduateLimits(state->route, 0);
    state->route->limits->rxFormCount = httpGetInt(value);
    return 0;
}


/*
    LimitRequestHeaderLines count
 */
static int limitRequestHeaderLinesDirective(MaState *state, cchar *key, cchar *value)
{
    httpGraduateLimits(state->route, 0);
    state->route->limits->headerMax = httpGetInt(value);
    return 0;
}


/*
    LimitRequestHeader bytes
 */
static int limitRequestHeaderDirective(MaState *state, cchar *key, cchar *value)
{
    httpGraduateLimits(state->route, 0);
    state->route->limits->headerSize = httpGetInt(value);
    return 0;
}


/*
    LimitResponseBody bytes
 */
static int limitResponseBodyDirective(MaState *state, cchar *key, cchar *value)
{
    httpGraduateLimits(state->route, 0);
    state->route->limits->txBodySize = httpGetNumber(value);
    return 0;
}


/*
    LimitSessions count
 */
static int limitSessionsDirective(MaState *state, cchar *key, cchar *value)
{
    httpGraduateLimits(state->route, 0);
    state->route->limits->sessionMax = httpGetInt(value);
    return 0;
}


/*
    LimitStreams count
 */
static int limitStreamsDirective(MaState *state, cchar *key, cchar *value)
{
#if ME_HTTP_HTTP2
    httpGraduateLimits(state->route, 0);
    state->route->limits->streamsMax = httpGetInt(value);
    state->route->limits->txStreamsMax = httpGetInt(value);
    return 0;
#else
    mprLog("error appweb config", 0, "HTTP/2 is not enabled");
    return MPR_ERR_CANT_ACCESS;
#endif
}


/*
    LimitUri bytes
 */
static int limitUriDirective(MaState *state, cchar *key, cchar *value)
{
    httpGraduateLimits(state->route, 0);
    state->route->limits->uriSize = httpGetInt(value);
    return 0;
}


/*
    LimitUpload bytes
 */
static int limitUploadDirective(MaState *state, cchar *key, cchar *value)
{
    httpGraduateLimits(state->route, 0);
    state->route->limits->uploadSize = httpGetNumber(value);
    return 0;
}


/*
    LimitWindow bytes
 */
static int limitWindowDirective(MaState *state, cchar *key, cchar *value)
{
#if ME_HTTP_HTTP2
    int size;

    httpGraduateLimits(state->route, 0);
    size = httpGetInt(value);
    if (size > (1024 * 1024)) {
        size = (1024 * 1024);
    }
    state->route->limits->window = size;
    return 0;
#else
    mprLog("error appweb config", 0, "HTTP/2 is not enabled");
    return MPR_ERR_CANT_ACCESS;
#endif
}


/*
    LimitWorkers count
 */
static int limitWorkersDirective(MaState *state, cchar *key, cchar *value)
{
    int count;

    count = atoi(value);
    if (count < 1) {
        count = MAXINT;
    }
    mprSetMaxWorkers(count);
    return 0;
}


/*
    Listen ip:port          Listens only on the specified interface
    Listen ip               Listens only on the specified interface with the default port
    Listen port             Listens on both IPv4 and IPv6
    Listen port [multiple]  Allow multiple binding on the same port

    Where ip may be "::::::" for ipv6 addresses or may be enclosed in "[::]" if appending a port.
    Can provide http:// and https:// prefixes.
 */
static int listenDirective(MaState *state, cchar *key, cchar *value)
{
    HttpEndpoint *endpoint, *dual;
    HttpHost     *host;
    cchar        *ip, *address, *multiple;
    int          port;

    multiple = address = 0;
    if (!maTokenize(state, value, "%S ?S", &address, &multiple)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    if (mprParseSocketAddress(address, &ip, &port, NULL, 80) < 0) {
        mprLog("error appweb config", 0, "Bad Listen directive: %s", address);
        return -1;
    }
    if (port == 0) {
        mprLog("error appweb config", 0, "Bad or missing port %d in Listen directive", port);
        return -1;
    }
    host = state->host;
    endpoint = httpCreateEndpoint(ip, port, NULL);
    if (smatch(multiple, "multiple")) {
        endpoint->multiple = 1;
    }
    if (!host->defaultEndpoint) {
        httpSetHostDefaultEndpoint(host, endpoint);
    }
    httpAddHostToEndpoint(endpoint, host);

    /*
        Single stack networks cannot support IPv4 and IPv6 with one socket. So create a specific IPv6 endpoint.
        This is currently used by VxWorks and Windows versions prior to Vista (i.e. XP)
     */
    if (!schr(address, ':') && mprHasIPv6() && !mprHasDualNetworkStack()) {
        dual = httpCreateEndpoint("::", port, NULL);
        httpAddHostToEndpoint(dual, host);
    }
    return 0;
}


/*
    ListenSecure ip:port
    ListenSecure ip
    ListenSecure port
    ListenSecure port [multiple]

    Where ip may be "::::::" for ipv6 addresses or may be enclosed in "[]" if appending a port.
 */
static int listenSecureDirective(MaState *state, cchar *key, cchar *value)
{
#if ME_COM_SSL
    HttpEndpoint *endpoint, *dual;
    HttpHost     *host;
    cchar        *address, *ip, *multiple;
    int          port;

    address = multiple = 0;
    if (!maTokenize(state, value, "%S ?S", &address, &multiple)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    if (mprParseSocketAddress(address, &ip, &port, NULL, 443) < 0) {
        mprLog("error appweb config", 0, "Bad ListenSecure directive: %s", address);
        return -1;
    }
    if (port == 0) {
        mprLog("error appweb config", 0, "Bad or missing port %d in ListenSecure directive", port);
        return -1;
    }
    endpoint = httpCreateEndpoint(ip, port, NULL);
    if (smatch(multiple, "multiple")) {
        endpoint->multiple = 1;
    }
    checkSsl(state);

    host = state->host;
    httpAddHostToEndpoint(endpoint, host);
    if (!host->secureEndpoint) {
        httpSetHostSecureEndpoint(host, endpoint);
    }
    httpSecureEndpoint(endpoint, state->route->ssl);

    /*
        Single stack networks cannot support IPv4 and IPv6 with one socket. So create a specific IPv6 endpoint.
        This is currently used by VxWorks and Windows versions prior to Vista (i.e. XP)
     */
    if (!schr(address, ':') && mprHasIPv6() && !mprHasDualNetworkStack()) {
        dual = httpCreateEndpoint("::", port, NULL);
        httpAddHostToEndpoint(dual, host);
        httpSecureEndpoint(dual, state->route->ssl);
    }
    return 0;
#else
    mprLog("error appweb config", 0, "Configuration lacks SSL support");
    return -1;
#endif
}


/*
    LogRoutes [full]
    Support two formats line for one line, and multiline with more fields
 */
static int logRoutesDirective(MaState *state, cchar *key, cchar *value)
{
    cchar *full;

    if (!maTokenize(state, value, "?S", &full)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    if (!(state->flags & MA_PARSE_NON_SERVER)) {
        mprLog(0, 1, "HTTP Routes for '%s'", state->host->name ? state->host->name : "default");
        httpLogRoutes(state->host, smatch(full, "full"));
    }
    return 0;
}


/*
    LoadModulePath searchPath
 */
static int loadModulePathDirective(MaState *state, cchar *key, cchar *value)
{
    char *path;

    if (!maTokenize(state, value, "%T", &value)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    /*
         Search path is: USER_SEARCH : exeDir : /usr/lib/appweb/bin
     */
    path = stemplate(value, state->route->vars);
#ifdef ME_VAPP_PREFIX
    {
        char *sep = MPR_SEARCH_SEP;
        path = sjoin(path, sep, mprGetAppDir(), sep, ME_VAPP_PREFIX "/bin", NULL);
    }
#endif
    mprSetModuleSearchPath(path);
    return 0;
}


/*
    LoadModule name path
 */
static int loadModuleDirective(MaState *state, cchar *key, cchar *value)
{
    char *name, *path;

    if (!maTokenize(state, value, "%S %S", &name, &path)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    if (maLoadModule(name, path) < 0) {
        /*  Error messages already done */
        return MPR_ERR_CANT_CREATE;
    }
    return 0;
}


static int userToID(cchar *user)
{
#if ME_UNIX_LIKE
    struct passwd *pp;
    if ((pp = getpwnam(user)) == 0) {
        mprLog("error appweb config", 0, "Bad user: %s", user);
        return 0;
    }
    return pp->pw_uid;
#else
    return 0;
#endif
}


static int groupToID(cchar *group)
{
#if ME_UNIX_LIKE
    struct group *gp;
    if ((gp = getgrnam(group)) == 0) {
        mprLog("error appweb config", 0, "Bad group: %s", group);
        return MPR_ERR_CANT_ACCESS;
    }
    return gp->gr_gid;
#else
    return 0;
#endif
}


/*
    MakeDir owner:group:perms dir, ...
 */
static int makeDirDirective(MaState *state, cchar *key, cchar *value)
{
    MprPath info;
    char    *auth, *dirs, *path, *perms, *tok;
    cchar   *dir, *group, *owner;
    int     gid, mode, uid;

    if (!maTokenize(state, value, "%S ?*", &auth, &dirs)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    uid = gid = 0;
    mode = 0750;
    if (schr(auth, ':')) {
        owner = ssplit(auth, ":", &tok);
        if (owner && *owner) {
            if (snumber(owner)) {
                uid = (int) stoi(owner);
            } else if (smatch(owner, "APPWEB")) {
                uid = HTTP->uid;
            } else {
                uid = userToID(owner);
            }
        }
        group = ssplit(tok, ":", &perms);
        if (group && *group) {
            if (snumber(group)) {
                gid = (int) stoi(group);
            } else if (smatch(group, "APPWEB")) {
                gid = HTTP->gid;
            } else {
                gid = groupToID(group);
            }
        }
        if (perms && snumber(perms)) {
            mode = (int) stoiradix(perms, -1, NULL);
        } else {
            mode = 0;
        }
        if (gid < 0 || uid < 0) {
            return MPR_ERR_BAD_SYNTAX;
        }
    } else {
        dirs = auth;
        auth = 0;
    }
    tok = dirs;
    for (tok = sclone(dirs); (dir = stok(tok, ",", &tok)) != 0; ) {
        path = httpMakePath(state->route, state->configDir, dir);
        if (mprGetPathInfo(path, &info) == 0 && info.isDir) {
            continue;
        }
        if (mprMakeDir(path, mode, uid, gid, 1) < 0) {
            return MPR_ERR_BAD_SYNTAX;
        }
    }
    return 0;
}


/*
    Map "ext,ext,..." "newext, newext, newext"
    Map compressed
    Example: Map "css,html,js,less,xml" min.${1}.gz, min.${1}, ${1}.gz
 */
static int mapDirective(MaState *state, cchar *key, cchar *value)
{
    cchar *extensions, *mappings;

    if (!maTokenize(state, value, "%S ?*", &extensions, &mappings)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    if (smatch(extensions, "compressed")) {
        httpAddRouteMapping(state->route, "css,html,js,less,txt,xml", "${1}.gz, min.${1}.gz, min.${1}");
    } else {
        httpAddRouteMapping(state->route, extensions, mappings);
    }
    return 0;
}


/*
    MemoryPolicy continue|restart
 */
static int memoryPolicyDirective(MaState *state, cchar *key, cchar *value)
{
    cchar *policy;
    int   flags;

    flags = MPR_ALLOC_POLICY_EXIT;

    if (!maTokenize(state, value, "%S", &policy)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    if (scmp(policy, "restart") == 0) {
#if VXWORKS
        flags = MPR_ALLOC_POLICY_RESTART;
#else
        /* Appman will restart */
        flags = MPR_ALLOC_POLICY_EXIT;
#endif

    } else if (scmp(policy, "continue") == 0) {
        flags = MPR_ALLOC_POLICY_PRUNE;

    } else if (scmp(policy, "abort") == 0) {
        flags = MPR_ALLOC_POLICY_ABORT;

    } else {
        mprLog("error appweb config", 0, "Unknown memory depletion policy '%s'", policy);
        return MPR_ERR_BAD_SYNTAX;
    }
    mprSetMemPolicy(flags);
    return 0;
}


/*
    Methods [add|remove|set] method, ...
 */
static int methodsDirective(MaState *state, cchar *key, cchar *value)
{
    cchar *cmd, *methods;

    if (!maTokenize(state, value, "%S %*", &cmd, &methods)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    if (smatch(cmd, "add")) {
        httpAddRouteMethods(state->route, methods);
    } else if (smatch(cmd, "remove")) {
        httpRemoveRouteMethods(state->route, methods);
    } else if (smatch(cmd, "set")) {
        httpSetRouteMethods(state->route, methods);
    }
    return 0;
}


/*
    MinWorkers count
 */
static int minWorkersDirective(MaState *state, cchar *key, cchar *value)
{
    mprSetMinWorkers((int) stoi(value));
    return 0;
}


/*
    Monitor Expression Period Defenses ....
 */
static int monitorDirective(MaState *state, cchar *key, cchar *value)
{
    cchar *counter, *expr, *limit, *period, *relation, *defenses;

    if (!maTokenize(state, value, "%S %S %*", &expr, &period, &defenses)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    expr = strim(expr, "\"", MPR_TRIM_BOTH);
    if (!maTokenize(state, expr, "%S %S %S", &counter, &relation, &limit)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    if (httpAddMonitor(counter, relation, httpGetNumber(limit), httpGetTicks(period), defenses) < 0) {
        return MPR_ERR_BAD_SYNTAX;
    }
    return 0;
}


#if ME_HTTP_DIR
/*
    Options Indexes
 */
static int optionsDirective(MaState *state, cchar *key, cchar *value)
{
    HttpDir *dir;
    char    *option, *tok;

    dir = httpGetDirObj(state->route);
    option = stok(sclone(value), " \t", &tok);
    while (option) {
        if (scaselessmatch(option, "Indexes")) {
            dir->enabled = 1;
        }
        option = stok(tok, " \t", &tok);
    }
    return 0;
}
#endif


/*
    Order Allow,Deny
    Order Deny,Allow
 */
static int orderDirective(MaState *state, cchar *key, cchar *value)
{
    if (scaselesscmp(value, "Allow,Deny") == 0) {
        httpSetAuthOrder(state->auth, HTTP_ALLOW_DENY);
    } else if (scaselesscmp(value, "Deny,Allow") == 0) {
        httpSetAuthOrder(state->auth, HTTP_DENY_ALLOW);
    } else {
        return MPR_ERR_BAD_SYNTAX;
    }
    return 0;
}


/*
    Param [!] name valuePattern
 */
static int paramDirective(MaState *state, cchar *key, cchar *value)
{
    char *field;
    int  not;

    if (!maTokenize(state, value, "?! %S %*", &not, &field, &value)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    httpAddRouteParam(state->route, field, value, not ? HTTP_ROUTE_NOT : 0);
    return 0;
}


/*
    Prefix /URI-PREFIX
    NOTE: For nested routes, the prefix value will be appended out any existing parent route prefix.
    NOTE: Prefixes do append, but route patterns do not.
 */
static int prefixDirective(MaState *state, cchar *key, cchar *value)
{
    httpSetRoutePrefix(state->route, value);
    return 0;
}


/*
    Redirect [status|permanent|temp|seeother|gone] from to
    Redirect secure
 */
static int redirectDirective(MaState *state, cchar *key, cchar *value)
{
    HttpRoute *alias;
    char      *code, *uri, *path, *target;
    int       status;

    status = 0;
    if (smatch(value, "secure")) {
        uri = "/";
        path = "https://";

    } else if (value[0] == '/' || sncmp(value, "http://", 6) == 0) {
        if (!maTokenize(state, value, "%S %S", &uri, &path)) {
            return MPR_ERR_BAD_SYNTAX;
        }
        status = HTTP_CODE_MOVED_TEMPORARILY;
    } else {
        if (!maTokenize(state, value, "%S %S ?S", &code, &uri, &path)) {
            return MPR_ERR_BAD_SYNTAX;
        }
        if (scaselessmatch(code, "permanent")) {
            status = 301;
        } else if (scaselessmatch(code, "temp")) {
            status = 302;
        } else if (scaselessmatch(code, "seeother")) {
            status = 303;
        } else if (scaselessmatch(code, "gone")) {
            status = 410;
        } else if (scaselessmatch(code, "all")) {
            status = 0;
        } else if (snumber(code)) {
            status = atoi(code);
        } else {
            return configError(state, key);
        }
    }
    if (300 <= status && status <= 399 && (!path || *path == '\0')) {
        return configError(state, key);
    }
    if (status < 0 || uri == 0) {
        return configError(state, key);
    }

    if (smatch(value, "secure")) {
        /*
            Redirect "secure" does not need an alias route, just a route condition. Ignores code.
         */
        httpAddRouteCondition(state->route, "secure", path, HTTP_ROUTE_REDIRECT);

    } else {
        alias = httpCreateAliasRoute(state->route, uri, 0, status);
        target = (path) ? sfmt("%d %s", status, path) : code;
        httpSetRouteTarget(alias, "redirect", target);
        httpFinalizeRoute(alias);
    }
    return 0;
}


/*
    RequestParseTimeout msecs
 */
static int requestParseTimeoutDirective(MaState *state, cchar *key, cchar *value)
{
    httpGraduateLimits(state->route, 0);
    state->route->limits->requestParseTimeout = httpGetTicks(value);
    return 0;
}


/*
    RequestTimeout msecs
 */
static int requestTimeoutDirective(MaState *state, cchar *key, cchar *value)
{
    httpGraduateLimits(state->route, 0);
    state->route->limits->requestTimeout = httpGetTicks(value);
    return 0;
}


/*
    Require ability|role|user|valid-user
    Require secure [age=secs] [domains]
 */
static int requireDirective(MaState *state, cchar *key, cchar *value)
{
    char *age, *type, *rest, *option, *ovalue, *tok;
    int  domains;

    if (!maTokenize(state, value, "%S ?*", &type, &rest)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    if (scaselesscmp(type, "ability") == 0) {
        httpSetAuthRequiredAbilities(state->auth, rest);

        /* Support require group for legacy support */
    } else if (scaselesscmp(type, "role") == 0) {
        httpSetAuthRequiredAbilities(state->auth, rest);

    } else if (scaselesscmp(type, "secure") == 0) {
        domains = 0;
        age = 0;
        for (option = stok(sclone(rest), " \t", &tok); option; option = stok(0, " \t", &tok)) {
            option = ssplit(option, " =\t,", &ovalue);
            ovalue = strim(ovalue, "\"'", MPR_TRIM_BOTH);
            if (smatch(option, "age")) {
                age = sfmt("%lld", (int64) httpGetTicks(ovalue));
            } else if (smatch(option, "domains")) {
                domains = 1;
            }
        }
        if (age) {
            if (domains) {
                /* Negative age signifies subdomains */
                age = sjoin("-1", age, NULL);
            }
        }
        addCondition(state, "secure", age, HTTP_ROUTE_STRICT_TLS);

    } else if (scaselesscmp(type, "user") == 0) {
        httpSetAuthPermittedUsers(state->auth, rest);

    } else if (scaselesscmp(type, "valid-user") == 0) {
        httpSetAuthAnyValidUser(state->auth);

    } else {
        return configError(state, key);
    }
    return 0;
}


/*
    <Reroute pattern>
    Open an existing route
 */
static int rerouteDirective(MaState *state, cchar *key, cchar *value)
{
    HttpRoute *route;
    cchar     *pattern;
    int       not;

    state = maPushState(state);
    if (state->enabled) {
        if (!maTokenize(state, value, "%!%S", &not, &pattern)) {
            return MPR_ERR_BAD_SYNTAX;
        }
        if (strstr(pattern, "${")) {
            pattern = sreplace(pattern, "${inherit}", state->route->pattern);
        }
        pattern = httpExpandRouteVars(state->route, pattern);
        if ((route = httpLookupRoute(state->host, pattern)) != 0) {
            state->route = route;
        } else {
            mprLog("error appweb config", 0, "Cannot open route %s", pattern);
            return MPR_ERR_CANT_OPEN;
        }
        /* Routes are added when the route block is closed (see closeDirective) */
        state->auth = state->route->auth;
    }
    return 0;
}


/*
    Reset routes
    Reset pipeline
 */
static int resetDirective(MaState *state, cchar *key, cchar *value)
{
    char *name;

    if (!maTokenize(state, value, "%S", &name)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    if (scaselessmatch(name, "routes")) {
        httpResetRoutes(state->host);

    } else if (scaselessmatch(name, "pipeline")) {
        httpResetRoutePipeline(state->route);

    } else {
        return configError(state, name);
    }
    return 0;
}


/*
    Role name abilities...
 */
static int roleDirective(MaState *state, cchar *key, cchar *value)
{
    char *name, *abilities;

    if (!maTokenize(state, value, "%S ?*", &name, &abilities)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    if (httpAddRole(state->auth, name, abilities) == 0) {
        mprLog("error appweb config", 0, "Cannot add role %s", name);
        return MPR_ERR_BAD_SYNTAX;
    }
    return 0;
}


/*
    <Route pattern>
    NOTE: The route pattern should include the prefix when declared. When compiling the pattern, the prefix is removed.
 */
static int routeDirective(MaState *state, cchar *key, cchar *value)
{
    cchar *pattern;
    int   not;

    state = maPushState(state);
    if (state->enabled) {
        if (!maTokenize(state, value, "%!%S", &not, &pattern)) {
            return MPR_ERR_BAD_SYNTAX;
        }
        if (strstr(pattern, "${")) {
            pattern = sreplace(pattern, "${inherit}", state->route->pattern);
        }
        pattern = httpExpandRouteVars(state->route, pattern);
        state->route = httpCreateInheritedRoute(state->route);
        httpSetRoutePattern(state->route, pattern, not ? HTTP_ROUTE_NOT : 0);
        httpSetRouteHost(state->route, state->host);
        /* Routes are added when the route block is closed (see closeDirective) */
        state->auth = state->route->auth;
    }
    return 0;
}


/*
    RequestHeader [!] name valuePattern

    The given header must [not] be present for the route to match
 */
static int requestHeaderDirective(MaState *state, cchar *key, cchar *value)
{
    char *header;
    int  not;

    if (!maTokenize(state, value, "?! %S %*", &not, &header, &value)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    httpAddRouteRequestHeaderCheck(state->route, header, value, not ? HTTP_ROUTE_NOT : 0);
    return 0;
}


static int scriptAliasDirective(MaState *state, cchar *key, cchar *value)
{
    HttpRoute *route;
    char      *handler, *prefix, *path;

    if (!maTokenize(state, value, "%S %S ?S", &prefix, &path, &handler)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    if (!handler) {
        handler = "cgiHandler";
    }
    route = httpCreateAliasRoute(state->route, prefix, path, 0);
    httpSetRouteHandler(route, handler);
    httpSetRouteAliasPattern(route, prefix);
    httpSetRouteTarget(route, "run", "$1");
    httpFinalizeRoute(route);
    return 0;
}


/*
    ServerName URI
    ServerName *URI
    ServerName URI*
    ServerName /Regular Expression/
 */
static int serverNameDirective(MaState *state, cchar *key, cchar *value)
{
    return httpSetHostName(state->host, value);
}


/*
    SessionCookie [name=NAME] [visible=true] [persist=true]
 */
static int sessionCookieDirective(MaState *state, cchar *key, cchar *value)
{
    char *options, *option, *ovalue, *tok;

    if (!maTokenize(state, value, "%*", &options)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    if (smatch(options, "disable") || smatch(options, "none")) {
        httpSetAuthSession(state->route->auth, 0);
        return 0;
    } else if (smatch(options, "enable")) {
        httpSetAuthSession(state->route->auth, 1);
        return 0;
    }
    for (option = maGetNextArg(options, &tok); option; option = maGetNextArg(tok, &tok)) {
        option = ssplit(option, " =\t,", &ovalue);
        ovalue = strim(ovalue, "\"'", MPR_TRIM_BOTH);
        if (!ovalue || *ovalue == '\0') continue;

        if (smatch(option, "visible")) {
            httpSetRouteSessionVisibility(state->route, scaselessmatch(ovalue, "true"));

        } else if (smatch(option, "name")) {
            httpSetRouteCookie(state->route, ovalue);

        } else if (smatch(option, "persist")) {
            httpSetRouteCookiePersist(state->route, smatch(ovalue, "true"));

        } else if (smatch(option, "same")) {
            httpSetRouteCookieSame(state->route, ovalue);

        } else {
            mprLog("error appweb config", 0, "Unknown SessionCookie option %s", option);
            return MPR_ERR_BAD_SYNTAX;
        }
    }
    return 0;
}


/*
    SessionTimeout msecs
 */
static int sessionTimeoutDirective(MaState *state, cchar *key, cchar *value)
{
    httpGraduateLimits(state->route, 0);
    state->route->limits->sessionTimeout = httpGetTicks(value);
    return 0;
}


/*
    XSRF on|off
 */
static int xsrfDirective(MaState *state, cchar *key, cchar *value)
{
    bool on;

    if (!maTokenize(state, value, "%B", &on)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    httpSetRouteXsrf(state->route, on);
    return 0;
}


/*
    Set var value
 */
static int setDirective(MaState *state, cchar *key, cchar *value)
{
    char *var;

    if (!maTokenize(state, value, "%S %S", &var, &value)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    httpSetRouteVar(state->route, var, value);
    return 0;
}


/*
    SetConnector connector
 */
static int setConnectorDirective(MaState *state, cchar *key, cchar *value)
{
    if (httpSetRouteConnector(state->route, value) < 0) {
        mprLog("error appweb config", 0, "Cannot add handler %s", value);
        return MPR_ERR_CANT_CREATE;
    }
    return 0;
}


/*
    SetHandler handler
 */
static int setHandlerDirective(MaState *state, cchar *key, cchar *value)
{
    char *name;

    if (!maTokenize(state, value, "%S", &name)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    if (httpSetRouteHandler(state->route, name) < 0) {
        mprLog("error appweb config", 0, "Cannot add handler %s", name);
        return MPR_ERR_CANT_CREATE;
    }
    return 0;
}


/*
    ShowErrors on|off
 */
static int showErrorsDirective(MaState *state, cchar *key, cchar *value)
{
    bool on;

    if (!maTokenize(state, value, "%B", &on)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    httpSetRouteShowErrors(state->route, on);
    return 0;
}


/*
    Source path
 */
static int sourceDirective(MaState *state, cchar *key, cchar *value)
{
    httpSetRouteSource(state->route, value);
    return 0;
}


#if ME_COM_SSL

static void checkSsl(MaState *state)
{
    HttpRoute *route, *parent;
    int       server;

    route = state->route;
    parent = route->parent;

    /*
        Inside <ProxyConfig> the object being built is the client side of the connection to the
        backend, so it takes the client defaults -- verify the peer, verify the issuer, and load the
        system root bundle. A proxy client SSL object does not inherit the enclosing route's listener 
        identity.
     */
    server = (state->flags & MA_PARSE_PROXY_CLIENT) ? 0 : 1;

    if (route->ssl == 0) {
        if (server && parent && parent->ssl) {
            route->ssl = mprCloneSsl(parent->ssl);
        } else {
            route->ssl = mprCreateSsl(server);
        }
    } else {
        if (server && parent && route->ssl == parent->ssl) {
            route->ssl = mprCloneSsl(parent->ssl);
        }
    }
}


static int sslCaCertificatePathDirective(MaState *state, cchar *key, cchar *value)
{
    char *path;

    if (!maTokenize(state, value, "%P", &path)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    checkSsl(state);
    path = mprJoinPath(state->configDir, httpExpandRouteVars(state->route, path));
    if (!mprPathExists(path, R_OK)) {
        mprLog("error ssl", 0, "Cannot locate %s", path);
        return MPR_ERR_CANT_FIND;
    }
    mprSetSslCaPath(state->route->ssl, path);
    return 0;
}


static int sslCaCertificateFileDirective(MaState *state, cchar *key, cchar *value)
{
    char *path;

    if (!maTokenize(state, value, "%P", &path)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    checkSsl(state);
    path = mprJoinPath(state->configDir, httpExpandRouteVars(state->route, path));
    if (!mprPathExists(path, R_OK)) {
        mprLog("error ssl", 0, "Cannot locate %s", path);
        return MPR_ERR_CANT_FIND;
    }
    mprSetSslCaFile(state->route->ssl, path);
    return 0;
}


/*
    SSLCARevocationFile path
 */
static int sslCaRevocationFileDirective(MaState *state, cchar *key, cchar *value)
{
    char *path;

    if (!maTokenize(state, value, "%P", &path)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    checkSsl(state);
    path = mprJoinPath(state->configDir, httpExpandRouteVars(state->route, path));
    if (!mprPathExists(path, R_OK)) {
        mprLog("error ssl", 0, "Cannot locate %s", path);
        return MPR_ERR_CANT_FIND;
    }
    mprSetSslRevoke(state->route->ssl, path);
    return 0;
}


/*
    SSLCARevocationCheck [chain|leaf]

    Chain applies the revocation list to every certificate in the peer's chain and requires a revocation list
    for each authority in that chain. Leaf checks only the peer certificate, so a certificate issued under a
    revoked authority is still accepted.
 */
static int sslCaRevocationCheckDirective(MaState *state, cchar *key, cchar *value)
{
    checkSsl(state);
    if (smatch(value, "chain")) {
        mprSetSslRevokeChain(state->route->ssl, 1);
    } else if (smatch(value, "leaf")) {
        mprSetSslRevokeChain(state->route->ssl, 0);
    } else {
        mprLog("error ssl", 0, "Unknown SSLCARevocationCheck value \"%s\". Use chain or leaf.", value);
        return MPR_ERR_BAD_SYNTAX;
    }
    return 0;
}


static int sslCertificateFileDirective(MaState *state, cchar *key, cchar *value)
{
    char *path;

    if (!maTokenize(state, value, "%P", &path)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    checkSsl(state);
    path = mprJoinPath(state->configDir, httpExpandRouteVars(state->route, path));
    if (!mprPathExists(path, R_OK)) {
        mprLog("error ssl", 0, "Cannot locate %s", path);
        return MPR_ERR_CANT_FIND;
    }
    mprSetSslCertFile(state->route->ssl, path);
    return 0;
}


static int sslCertificateKeyFileDirective(MaState *state, cchar *key, cchar *value)
{
    cchar *path;

    if (sstarts(value, "pkcs11:")) {
        path = value;
    } else {
        if (!maTokenize(state, value, "%P", &path)) {
            return MPR_ERR_BAD_SYNTAX;
        }
        path = mprJoinPath(state->configDir, httpExpandRouteVars(state->route, path));
        if (!mprPathExists(path, R_OK)) {
            mprLog("error ssl", 0, "Cannot locate %s", path);
            return MPR_ERR_CANT_FIND;
        }
    }
    checkSsl(state);
    mprSetSslKeyFile(state->route->ssl, path);
    return 0;
}


static int sslCipherSuiteDirective(MaState *state, cchar *key, cchar *value)
{
    checkSsl(state);
    mprAddSslCiphers(state->route->ssl, value);
    return 0;
}


/*
    SSLVerifyClient [none|optional|require]
 */
static int sslVerifyClientDirective(MaState *state, cchar *key, cchar *value)
{
    checkSsl(state);
    if (smatch(value, "on")) {
        value = "require";
    } else if (smatch(value, "off")) {
        value = "none";
    }
    mprVerifySslPeer(state->route->ssl, value);
    return 0;
}


/*
    SSLVerifyDepth N
 */
static int sslVerifyDepthDirective(MaState *state, cchar *key, cchar *value)
{
    checkSsl(state);
    mprVerifySslDepth(state->route->ssl, (int) stoi(value));
    return 0;
}


/*
    SSLVerifyIssuer [on|off]
 */
static int sslVerifyIssuerDirective(MaState *state, cchar *key, cchar *value)
{
    bool on;

    checkSsl(state);
    if (!maTokenize(state, value, "%B", &on)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    mprVerifySslIssuer(state->route->ssl, on);
    return 0;
}


/*
    SSLProtocol [+|-] protocol
 */
static int sslProtocolDirective(MaState *state, cchar *key, cchar *value)
{
    char *word, *tok;
    int  mask, protoMask;

    checkSsl(state);
    protoMask = 0;
    word = stok(sclone(value), " \t", &tok);
    while (word) {
        mask = -1;
        if (*word == '-') {
            word++;
            mask = 0;
        } else if (*word == '+') {
            word++;
        }
        if (scaselesscmp(word, "SSLv2") == 0) {
            protoMask &= ~(MPR_PROTO_SSLV2 & ~mask);
            protoMask |= (MPR_PROTO_SSLV2 & mask);

        } else if (scaselesscmp(word, "SSLv3") == 0) {
            protoMask &= ~(MPR_PROTO_SSLV3 & ~mask);
            protoMask |= (MPR_PROTO_SSLV3 & mask);

        } else if (scaselesscmp(word, "TLSv1") == 0) {
            /* Enable or disable all of TLS 1.X */
            protoMask &= ~(MPR_PROTO_TLSV1 & ~mask);
            protoMask |= (MPR_PROTO_TLSV1 & mask);

        } else if (scaselesscmp(word, "TLSv1.0") == 0) {
            protoMask &= ~(MPR_PROTO_TLSV1_0 & ~mask);
            protoMask |= (MPR_PROTO_TLSV1_0 & mask);

        } else if (scaselesscmp(word, "TLSv1.1") == 0) {
            protoMask &= ~(MPR_PROTO_TLSV1_1 & ~mask);
            protoMask |= (MPR_PROTO_TLSV1_1 & mask);

        } else if (scaselesscmp(word, "TLSv1.2") == 0) {
            protoMask &= ~(MPR_PROTO_TLSV1_2 & ~mask);
            protoMask |= (MPR_PROTO_TLSV1_2 & mask);

        } else if (scaselesscmp(word, "TLSv1.3") == 0) {
            protoMask &= ~(MPR_PROTO_TLSV1_3 & ~mask);
            protoMask |= (MPR_PROTO_TLSV1_3 & mask);

        } else if (scaselesscmp(word, "ALL") == 0) {
            protoMask &= ~(MPR_PROTO_ALL & ~mask);
            protoMask |= (MPR_PROTO_ALL & mask);
        }
        word = stok(0, " \t", &tok);
    }
    mprSetSslProtocols(state->route->ssl, protoMask);
    return 0;
}


static int sslPreload(MaState *state, cchar *key, cchar *value)
{
    if (mprPreloadSsl(state->route->ssl, MPR_SOCKET_SERVER) < 0) {
        mprLog("error appweb config", 0, "Cannot preload SSL configuration");
        return MPR_ERR_BAD_SYNTAX;
    }
    return 0;
}


static int sslEngine(MaState *state, cchar *key, cchar *value)
{
    mprSetSslDevice(state->route->ssl, value);
    return 0;
}
#endif /* ME_COM_SSL */

/*
    Stealth on|off
 */
static int stealthDirective(MaState *state, cchar *key, cchar *value)
{
    bool on;

    if (!maTokenize(state, value, "%B", &on)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    httpSetRouteStealth(state->route, on);
    return 0;
}


/*
    StreamInput [!] mimeType [uri]
 */
static int streamInputDirective(MaState *state, cchar *key, cchar *value)
{
    cchar *mime, *uri;
    int   disable;

    if (!maTokenize(state, value, "%! ?S ?S", &disable, &mime, &uri)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    httpSetStreaming(state->host, mime, uri, !disable);
    return 0;
}


/*
    Target close [immediate]
    Target redirect status URI
    Target run ${DOCUMENT_ROOT}/${request:uri}
    Target run ${controller}-${name}
    Target write [-r] status "Hello World\r\n"
 */
static int targetDirective(MaState *state, cchar *key, cchar *value)
{
    char *name, *details;

    if (!maTokenize(state, value, "%S ?*", &name, &details)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    return setTarget(state, name, details);
}


/*
    Template routeName
 */
static int templateDirective(MaState *state, cchar *key, cchar *value)
{
    httpSetRouteTemplate(state->route, value);
    return 0;
}


/*
    ThreadStack bytes
 */
static int threadStackDirective(MaState *state, cchar *key, cchar *value)
{
    mprSetThreadStackSize(httpGetInt(value));
    return 0;
}

/*
    Trace options
    Options:
        first=NN
        errors=NN
        complete=NN
        connection=NN
        headers=NN
        context=NN
        close=NN
        rx=NN
        tx=NN
        content=MAX_SIZE
 */
static int traceDirective(MaState *state, cchar *key, cchar *value)
{
    state->route->trace = httpCreateTrace(state->route->trace);
    return maTraceDirective(state, state->route->trace, key, value);
}


PUBLIC int maTraceDirective(MaState *state, HttpTrace *trace, cchar *key, cchar *value)
{
    char *option, *ovalue, *tok;

    for (option = stok(sclone(value), " \t", &tok); option; option = stok(0, " \t", &tok)) {
        option = ssplit(option, " =\t,", &ovalue);
        ovalue = strim(ovalue, "\"'", MPR_TRIM_BOTH);
        if (smatch(option, "content")) {
            httpSetTraceContentSize(trace, (ssize) httpGetNumber(ovalue));
        } else {
            httpSetTraceEventLevel(trace, option, atoi(ovalue));
        }
    }
    return 0;
}


/*
    TraceLog path|-
        [size=bytes]
        [level=0-5]
        [backup=count]
        [anew]
        [format="format"]
        [type="common|detail"]
 */
static int traceLogDirective(MaState *state, cchar *key, cchar *value)
{
    state->route->trace = httpCreateTrace(state->route->trace);
    return maTraceLogDirective(state, state->route->trace, key, value);
}


PUBLIC int maTraceLogDirective(MaState *state, HttpTrace *trace, cchar *key, cchar *value)
{
    cchar *path;
    char  *format, *option, *ovalue, *tok, *formatter;
    ssize size;
    int   flags, backup, level;

    size = MAXINT;
    backup = 0;
    flags = 0;
    path = 0;
    format = ME_HTTP_LOG_FORMAT;
    formatter = "detail";
    level = 0;

    if (trace->flags & MPR_LOG_CMDLINE) {
        mprLog("info appweb config", 4, "Already tracing. Ignoring TraceLog directive");
        return 0;
    }
    for (option = maGetNextArg(sclone(value), &tok); option; option = maGetNextArg(tok, &tok)) {
        if (!path) {
            if ((path = httpGetRouteVar(state->route, "LOG_DIR")) == 0) {
                path = ".";
            }
            path = mprJoinPath(path, httpExpandRouteVars(state->route, option));
        } else {
            option = ssplit(option, " =\t,", &ovalue);
            ovalue = strim(ovalue, "\"'", MPR_TRIM_BOTH);
            if (smatch(option, "anew")) {
                flags |= MPR_LOG_ANEW;

            } else if (smatch(option, "backup")) {
                backup = atoi(ovalue);

            } else if (smatch(option, "format")) {
                format = ovalue;

            } else if (smatch(option, "level")) {
                level = (int) stoi(ovalue);

            } else if (smatch(option, "size")) {
                size = (ssize) httpGetNumber(ovalue);

            } else if (smatch(option, "formatter")) {
                formatter = ovalue;

            } else {
                mprLog("error appweb config", 0, "Unknown TraceLog option %s", option);
            }
        }
    }
    if (size < HTTP_TRACE_MIN_LOG_SIZE) {
        size = HTTP_TRACE_MIN_LOG_SIZE;
    }
    if (path == 0) {
        mprLog("error appweb config", 0, "Missing TraceLog filename");
        return MPR_ERR_BAD_SYNTAX;
    }
    if (formatter) {
        httpSetTraceFormatterName(trace, formatter);
    }
    if (!smatch(path, "stdout") && !smatch(path, "stderr")) {
        path = httpMakePath(state->route, state->configDir, path);
    }
    if (httpSetTraceLogFile(trace, path, size, backup, format, flags) < 0) {
        return MPR_ERR_CANT_OPEN;
    }
    httpSetTraceLevel(trace, level);
    return 0;
}


/*
    TypesConfig path
 */
static int typesConfigDirective(MaState *state, cchar *key, cchar *value)
{
    char *path;

    path = httpMakePath(state->route, state->configDir, value);
    if ((state->route->mimeTypes = mprCreateMimeTypes(path)) == 0) {
        mprLog("error appweb config", 0, "Cannot open TypesConfig mime file %s", path);
        state->route->mimeTypes = mprCreateMimeTypes(NULL);
        return MPR_ERR_BAD_SYNTAX;
    }
    return 0;
}


/*
    UnloadModule name [timeout]
 */
static int unloadModuleDirective(MaState *state, cchar *key, cchar *value)
{
    MprModule *module;
    HttpStage *stage;
    char      *name, *timeout;

    timeout = MA_UNLOAD_TIMEOUT;
    if (!maTokenize(state, value, "%S ?S", &name, &timeout)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    if ((module = mprLookupModule(name)) == 0) {
        mprLog("error appweb config", 0, "Cannot find module stage %s", name);
        return MPR_ERR_BAD_SYNTAX;
    }
    if ((stage = httpLookupStage(module->name)) != 0 && stage->match) {
        mprLog("error appweb config", 0, "Cannot unload module %s due to match routine", module->name);
        return MPR_ERR_BAD_SYNTAX;
    } else {
        module->timeout = httpGetTicks(timeout);
    }
    return 0;
}


/*
   Update param var value
   Update cmd commandLine
 */
static int updateDirective(MaState *state, cchar *key, cchar *value)
{
    char *name, *rest;

    if (!maTokenize(state, value, "%S %*", &name, &rest)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    return addUpdate(state, name, rest, 0);
}


/*
    User name password roles...
 */
static int userDirective(MaState *state, cchar *key, cchar *value)
{
    char *name, *password, *roles;

    if (!maTokenize(state, value, "%S %S ?*", &name, &password, &roles)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    if (httpAddUser(state->auth, name, password, roles) == 0) {
        mprLog("error appweb config", 0, "Cannot add user %s", name);
        return MPR_ERR_BAD_SYNTAX;
    }
    return 0;
}


/*
    UserAccount username
 */
static int userAccountDirective(MaState *state, cchar *key, cchar *value)
{
    if (smatch(value, "_unchanged_")) {
        return 0;
    }
    if (mprGetDebugMode()) {
        mprLog("warn appweb config", 0, "UserAccount %s ignored: --debugger suppresses the privilege drop. "
               "The server will continue to run as the invoking user.", value);
        return 0;
    }
    return httpSetUserAccount(value);
}


/*
    <VirtualHost ip[:port] ...>
 */
static int virtualHostDirective(MaState *state, cchar *key, cchar *value)
{
    state = maPushState(state);
    if (state->enabled) {
        /*
            Inherit the current default route configuration (only)
            Other routes are not inherited due to the reset routes below
         */
        state->route = httpCreateInheritedRoute(httpGetHostDefaultRoute(state->host));
        state->auth = state->route->auth;
        state->host = httpCloneHost(state->host);
        httpSetRouteHost(state->route, state->host);
        httpSetHostDefaultRoute(state->host, state->route);

        if (value) {
            httpSetHostName(state->host, ssplit(sclone(value), " \t,", NULL));
            /*
                Save the endpoints until the close of the VirtualHost so closeVirtualHostDirective can
                add the virtual host to the specified endpoints.
             */
            state->endpoints = sclone(value);
        } else {
            mprLog("error appweb config", 0, "Missing virtual host endpoints");
            return MPR_ERR_BAD_SYNTAX;
        }
    }
    return 0;
}


/*
    </VirtualHost>
 */
static int closeVirtualHostDirective(MaState *state, cchar *key, cchar *value)
{
    HttpEndpoint *endpoint;
    cchar        *address, *ip;
    char         *addresses, *tok;
    int          port;

    if (state->enabled) {
        if (state->endpoints && *state->endpoints) {
            for (addresses = sclone(state->endpoints); (address = stok(addresses, " \t,", &tok)) != 0 ;
                 addresses = tok) {
                if (mprParseSocketAddress(address, &ip, &port, NULL, -1) < 0) {
                    mprLog("error appweb config", 0, "Bad virtual host endpoint %s", address);
                    return MPR_ERR_BAD_SYNTAX;
                }
                if ((endpoint = httpLookupEndpoint(ip, port)) == 0) {
                    mprLog("error appweb config", 0, "Cannot find listen directive for virtual host %s", address);
                    return MPR_ERR_BAD_SYNTAX;
                } else {
                    httpAddHostToEndpoint(endpoint, state->host);
                }
            }
        }
    }
    closeDirective(state, key, value);
    return 0;
}


/*
    PreserveFrames [on|off]
 */
static int preserveFramesDirective(MaState *state, cchar *key, cchar *value)
{
    bool on;

    if (!maTokenize(state, value, "%B", &on)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    httpSetRoutePreserveFrames(state->route, on);
    return 0;
}


#if ME_HTTP_WEB_SOCKETS
static int limitWebSocketsDirective(MaState *state, cchar *key, cchar *value)
{
    httpGraduateLimits(state->route, 0);
    state->route->limits->webSocketsMax = httpGetInt(value);
    return 0;
}


static int limitWebSocketsMessageDirective(MaState *state, cchar *key, cchar *value)
{
    httpGraduateLimits(state->route, 0);
    state->route->limits->webSocketsMessageSize = httpGetInt(value);
    return 0;
}


static int limitWebSocketsFrameDirective(MaState *state, cchar *key, cchar *value)
{
    httpGraduateLimits(state->route, 0);
    state->route->limits->webSocketsFrameSize = httpGetInt(value);
    return 0;
}


static int limitWebSocketsPacketDirective(MaState *state, cchar *key, cchar *value)
{
    httpGraduateLimits(state->route, 0);
    state->route->limits->webSocketsPacketSize = httpGetInt(value);
    return 0;
}
#endif


#if ME_HTTP_UPLOAD
/*
    UploadDir path
 */
static int uploadDirDirective(MaState *state, cchar *key, cchar *value)
{
    httpSetRouteUploadDir(state->route, httpMakePath(state->route, state->configDir, value));
    return 0;
}


/*
    UploadAutoDelete on|off
 */
static int uploadAutoDeleteDirective(MaState *state, cchar *key, cchar *value)
{
    bool on;

    if (!maTokenize(state, value, "%B", &on)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    httpSetRouteAutoDelete(state->route, on);
    return 0;
}
#endif


#if ME_HTTP_WEB_SOCKETS
static int webSocketsProtocolDirective(MaState *state, cchar *key, cchar *value)
{
    state->route->webSocketsProtocol = sclone(value);
    return 0;
}


static int webSocketsPingDirective(MaState *state, cchar *key, cchar *value)
{
    state->route->webSocketsPingPeriod = httpGetTicks(value);
    return 0;
}
#endif


static bool conditionalDefinition(MaState *state, cchar *key)
{
    cchar *arch, *os, *platform, *profile;
    int   result, not;

    platform = HTTP->platform;
    result = 0;
    not = (*key == '!') ? 1 : 0;
    if (not) {
        for (++key; isspace((uchar) * key); key++) {
        }
    }
    httpParsePlatform(platform, &os, &arch, &profile);

    if (scaselessmatch(key, arch)) {
        result = 1;

    } else if (scaselessmatch(key, os)) {
        result = 1;

    } else if (scaselessmatch(key, profile)) {
        result = 1;

    } else if (scaselessmatch(key, platform)) {
        result = 1;

#if ME_DEBUG
    } else if (scaselessmatch(key, "ME_DEBUG")) {
        result = ME_DEBUG;
#endif

    } else if (scaselessmatch(key, "dynamic")) {
        result = !HTTP->staticLink;

    } else if (scaselessmatch(key, "static")) {
        result = HTTP->staticLink;

    } else if (scaselessmatch(key, "IPv6")) {
        result = mprHasIPv6();

    } else {
        if (scaselessmatch(key, "CGI_MODULE")) {
            result = ME_COM_CGI;

        } else if (scaselessmatch(key, "DIR_MODULE")) {
            result = ME_HTTP_DIR;

#if DEPRECATED || 1
        } else if (scaselessmatch(key, "EJS_MODULE")) {
            result = ME_COM_EJSCRIPT;
#endif
        } else if (scaselessmatch(key, "ESP_MODULE")) {
            result = ME_COM_ESP;

        } else if (scaselessmatch(key, "FAST_MODULE")) {
#if ME_UNIX_LIKE
            result = ME_COM_FAST;
#else
            /*
                The FastCGI and proxy handlers are on Unix only.
             */
            result = 0;
#endif

        } else if (scaselessmatch(key, "PCRE2")) {
            /*
                Regular expressions require a deployer-supplied PCRE2 library. Literal, Alias
                prefix, {token} segment and literal alternation patterns are matched natively and
                need no engine, so most configurations never need this.
             */
            result = ME_COM_PCRE2;

        } else if (scaselessmatch(key, "PHP_MODULE")) {
            result = ME_COM_PHP;

        } else if (scaselessmatch(key, "PROXY_MODULE")) {
#if ME_UNIX_LIKE
            result = ME_COM_PROXY;
#else
            result = 0;
#endif
        } else if (scaselessmatch(key, "SSL_MODULE")) {
            result = ME_COM_SSL;

        } else if (scaselessmatch(key, "TEST_MODULE")) {
            result = ME_COM_TEST;

        } else if (scaselessmatch(key, "TEST_WEBSOCKETS_MODULE")) {
            result = ME_COM_TEST_WEBSOCKETS;

        } else if (scaselessmatch(key, "BASIC")) {
            result = ME_HTTP_BASIC;
        } else if (scaselessmatch(key, "DIGEST")) {
            result = ME_HTTP_DIGEST;
        } else if (scaselessmatch(key, "DIR")) {
            result = ME_HTTP_DIR;
        } else if (scaselessmatch(key, "HTTP2")) {
            result = ME_HTTP_HTTP2;
        } else if (scaselessmatch(key, "PAM")) {
            result = ME_HTTP_PAM;
        } else if (scaselessmatch(key, "UPLOAD")) {
            result = ME_HTTP_UPLOAD;
        } else if (scaselessmatch(key, "WEB_SOCKETS")) {
            result = ME_HTTP_WEB_SOCKETS;
        }
    }
    return (not) ? !result : result;
}


/*
    Tokenizes a line using %formats. Mandatory tokens can be specified with %. Optional tokens are specified with ?.
    Supported tokens:
        %B - Boolean. Parses: on/off, true/false, yes/no.
        %N - Number. Parses numbers in base 10.
        %S - String. Removes quotes.
        %T - Template String. Removes quotes and expand ${PathVars}
        %P - Path string. Removes quotes and expands ${PathVars}. Resolved relative to route->home.
        %W - Parse words into a list
        %! - Optional negate. Set value to HTTP_ROUTE_NOT present, otherwise zero.
 */
PUBLIC bool maTokenize(MaState *state, cchar *line, cchar *fmt, ...)
{
    va_list ap;

    va_start(ap, fmt);
    if (!httpTokenizev(state->route, line, fmt, ap)) {
        mprLog("error appweb config", 0, "Bad \"%s\" directive at line %d in %s, line: %s %s",
               state->key, state->lineNumber, state->filename, state->key, line);
        va_end(ap);
        return 0;
    }
    va_end(ap);
    return 1;
}


static int addCondition(MaState *state, cchar *name, cchar *details, int flags)
{
    if (httpAddRouteCondition(state->route, name, details, flags) < 0) {
        mprLog("error appweb config", 0, "Bad \"%s\" directive at line %d in %s, line: %s %s",
               state->key, state->lineNumber, state->filename, state->key, details);
        return MPR_ERR_BAD_SYNTAX;
    }
    return 0;
}


static int addUpdate(MaState *state, cchar *name, cchar *details, int flags)
{
    if (httpAddRouteUpdate(state->route, name, details, flags) < 0) {
        mprLog("error appweb config", 0, "Bad \"%s\" directive at line %d in %s, line: %s %s %s",
               state->key, state->lineNumber, state->filename, state->key, name, details);
        return MPR_ERR_BAD_SYNTAX;
    }
    return 0;
}


static int setTarget(MaState *state, cchar *name, cchar *details)
{
    if (httpSetRouteTarget(state->route, name, details) < 0) {
        mprLog("error appweb config", 0, "Bad \"%s\" directive at line %d in %s, line: %s %s %s",
               state->key, state->lineNumber, state->filename, state->key, name, details);
        return MPR_ERR_BAD_SYNTAX;
    }
    return 0;
}


/*
    This is used to create the outermost state only
 */
static MaState *createState(void)
{
    MaState   *state;
    HttpHost  *host;
    HttpRoute *route;

    host = httpGetDefaultHost();
    route = httpGetDefaultRoute(host);

    if ((state = mprAllocObj(MaState, manageState)) == 0) {
        return 0;
    }
    state->top = state;
    state->current = state;
    state->host = host;
    state->route = route;
    state->enabled = 1;
    state->lineNumber = 0;
    state->auth = state->route->auth;
    return state;
}


PUBLIC MaState *maPushState(MaState *prev)
{
    MaState *state;

    if ((state = mprAllocObj(MaState, manageState)) == 0) {
        return 0;
    }
    state->top = prev->top;
    state->prev = prev;
    state->flags = prev->flags;
    state->host = prev->host;
    state->route = prev->route;
    state->lineNumber = prev->lineNumber;
    state->enabled = prev->enabled;
    state->filename = prev->filename;
    state->configDir = prev->configDir;
    state->file = prev->file;
    state->data = prev->data;
    state->auth = state->route->auth;
    state->top->current = state;
    return state;
}


PUBLIC MaState *maPopState(MaState *state)
{
    if (state->prev == 0) {
        mprLog("error appweb config", 0, "Too many closing blocks.\nAt line %d in %s\n\n", state->lineNumber,
               state->filename);
    }
    state->prev->lineNumber = state->lineNumber;
    state = state->prev;
    state->top->current = state;
    return state;
}


static void manageState(MaState *state, int flags)
{
    if (flags & MPR_MANAGE_MARK) {
        mprMark(state->host);
        mprMark(state->auth);
        mprMark(state->route);
        mprMark(state->file);
        mprMark(state->key);
        mprMark(state->configDir);
        mprMark(state->filename);
        mprMark(state->endpoints);
        mprMark(state->prev);
        mprMark(state->top);
        mprMark(state->current);
        mprMark(state->data);
    }
}


static int configError(MaState *state, cchar *key)
{
    mprLog("error appweb config", 0, "Error in directive \"%s\", at line %d in %s", key, state->lineNumber,
           state->filename);
    return MPR_ERR_BAD_SYNTAX;
}


/*
    Get the directive and value details. Return key and *valuep.
 */
static char *getDirective(char *line, char **valuep)
{
    char  *key, *value;
    ssize len;

    assert(line);
    assert(valuep);

    *valuep = 0;
    /*
        Use stok instead of ssplit to skip leading white space
     */
    if ((key = stok(line, " \t", &value)) == 0) {
        return 0;
    }
    key = strim(key, " \t\r\n>", MPR_TRIM_END);
    if (value) {
        value = strim(value, " \t\r\n>", MPR_TRIM_END);
        /*
            Trim quotes if wrapping the entire value and no spaces. Preserve embedded quotes and leading/trailing ""
               etc.
         */
        len = slen(value);
        if (*value == '\"' && value[len - 1] == '"' && len > 2 && value[1] != '\"' && !strpbrk(value, " \t")) {
            /*
                Cannot strip quotes if multiple args are quoted, only if one single arg is quoted
             */
            if (schr(&value[1], '"') == &value[len - 1]) {
                value = snclone(&value[1], len - 2);
            }
        }
        *valuep = value;
    }
    return key;
}


PUBLIC char *maGetNextArg(char *s, char **tok)
{
    char *etok;
    int  quoted;

    if (s == 0) {
        return 0;
    }
    for (; isspace((uchar) * s); s++) {
    }

    for (quoted = 0, etok = s; *etok; etok++) {
        if (*etok == '\'' || *etok == '"') {
            quoted = !quoted;
        } else if (isspace((uchar) * etok) && !quoted && (etok > s && etok[-1] != '\\')) {
            break;
        }
    }
    if (*s == '\'' || *s == '"') {
        s++;
        if (etok > s && (etok[-1] == '\'' || etok[-1] == '"')) {
            etok--;
        }
    }
    if (*etok == '\0') {
        etok = NULL;
    } else {
        *etok++ = '\0';
        for (; isspace((uchar) * etok); etok++) {
        }
    }
    *tok = etok;
    return s;
}


PUBLIC int maWriteAuthFile(HttpAuth *auth, char *path)
{
    MprFile  *file;
    MprKey   *kp, *ap;
    HttpRole *role;
    HttpUser *user;
    char     *tempFile;

    tempFile = mprGetTempPath(mprGetPathDir(path));
    if ((file = mprOpenFile(tempFile, O_CREAT | O_TRUNC | O_WRONLY | O_TEXT, 0444)) == 0) {
        mprLog("error appweb config", 0, "Cannot open %s", tempFile);
        return MPR_ERR_CANT_OPEN;
    }
    mprWriteFileFmt(file, "#\n#   %s - Authorization data\n#\n\n", mprGetPathBase(path));

    for (ITERATE_KEY_DATA(auth->roles, kp, role)) {
        mprWriteFileFmt(file, "Role %s", kp->key);
        for (ITERATE_KEYS(role->abilities, ap)) {
            mprWriteFileFmt(file, " %s", ap->key);
        }
        mprPutFileChar(file, '\n');
    }
    mprPutFileChar(file, '\n');
    for (ITERATE_KEY_DATA(auth->userCache, kp, user)) {
        mprWriteFileFmt(file, "User %s %s %s", user->name, user->password, mprHashKeysToString(user->roles, ", "));
        mprPutFileChar(file, '\n');
    }
    mprCloseFile(file);
    unlink(path);
    if (rename(tempFile, path) < 0) {
        mprLog("error appweb config", 0, "Cannot create new %s", path);
        return MPR_ERR_CANT_WRITE;
    }
    return 0;
}


PUBLIC void maAddDirective(cchar *directive, MaDirective proc)
{
    if (!directives) {
        parseInit();
    }
    mprAddKey(directives, directive, proc);
}


static int parseInit(void)
{
    if (directives) {
        return 0;
    }
    directives = mprCreateHash(-1, MPR_HASH_STATIC_VALUES | MPR_HASH_CASELESS | MPR_HASH_STABLE);
    mprAddRoot(directives);

    maAddDirective("Action", actionDirective);
    maAddDirective("AddLanguageSuffix", addLanguageSuffixDirective);
    maAddDirective("AddLanguageDir", addLanguageDirDirective);
    maAddDirective("AddFilter", addFilterDirective);
    maAddDirective("AddInputFilter", addInputFilterDirective);
    maAddDirective("AddHandler", addHandlerDirective);
    maAddDirective("AddOutputFilter", addOutputFilterDirective);
    maAddDirective("AddType", addTypeDirective);
    maAddDirective("Alias", aliasDirective);
    maAddDirective("Allow", allowDirective);
    maAddDirective("AuthAutoLogin", authAutoLoginDirective);
    maAddDirective("AuthDigestQop", authDigestQopDirective);
    maAddDirective("AuthType", authTypeDirective);
    maAddDirective("AuthRealm", authRealmDirective);
    maAddDirective("AuthStore", authStoreDirective);
    maAddDirective("AutoFinalize", autoFinalize);
    maAddDirective("Cache", cacheDirective);
    maAddDirective("CanonicalName", canonicalNameDirective);
    maAddDirective("CharSet", charSetDirective);
    maAddDirective("Chroot", chrootDirective);
    maAddDirective("Condition", conditionDirective);
    maAddDirective("CrossOrigin", crossOriginDirective);
    maAddDirective("DefaultLanguage", defaultLanguageDirective);
    maAddDirective("Deny", denyDirective);
    maAddDirective("DirectoryIndex", directoryIndexDirective);
    maAddDirective("Documents", documentsDirective);
    maAddDirective("<Directory", directoryDirective);
    maAddDirective("</Directory", closeDirective);
    maAddDirective("<else", elseDirective);
    maAddDirective("ErrorDocument", errorDocumentDirective);
    maAddDirective("ErrorLog", errorLogDirective);
    maAddDirective("ExitTimeout", exitTimeoutDirective);
    maAddDirective("FollowSymlinks", followSymlinksDirective);
    maAddDirective("GroupAccount", groupAccountDirective);
    maAddDirective("Header", headerDirective);
    maAddDirective("Home", homeDirective);
    maAddDirective("Http2", http2Directive);
    maAddDirective("<If", ifDirective);
    maAddDirective("</If", closeDirective);
    maAddDirective("IgnoreEncodingErrors", ignoreEncodingErrorsDirective);
    maAddDirective("InactivityTimeout", inactivityTimeoutDirective);
    maAddDirective("Include", includeDirective);
    maAddDirective("LimitCache", limitCacheDirective);
    maAddDirective("LimitCacheItem", limitCacheItemDirective);
    maAddDirective("LimitChunk", limitChunkDirective);
    maAddDirective("LimitClients", limitClientsDirective);
    maAddDirective("LimitConnections", limitConnectionsDirective);
    maAddDirective("LimitConnectionsPerClient", limitConnectionsPerClientDirective);
    maAddDirective("LimitFiles", limitFilesDirective);
    maAddDirective("LimitFrame", limitFrameDirective);
    maAddDirective("LimitKeepAlive", limitKeepAliveDirective);
    maAddDirective("LimitMemory", limitMemoryDirective);
    maAddDirective("LimitPacket", limitPacketDirective);
    maAddDirective("LimitProcesses", limitProcessesDirective);
    maAddDirective("LimitRequestsPerClient", limitRequestsPerClientDirective);
    maAddDirective("LimitRequestBody", limitRequestBodyDirective);
    maAddDirective("LimitRequestForm", limitRequestFormDirective);
    maAddDirective("LimitRequestFormCount", limitRequestFormCountDirective);
    maAddDirective("LimitRequestHeaderLines", limitRequestHeaderLinesDirective);
    maAddDirective("LimitRequestHeader", limitRequestHeaderDirective);
    maAddDirective("LimitResponseBody", limitResponseBodyDirective);
    maAddDirective("LimitSessions", limitSessionsDirective);
    maAddDirective("LimitStreams", limitStreamsDirective);
    maAddDirective("LimitUri", limitUriDirective);
    maAddDirective("LimitUpload", limitUploadDirective);
    maAddDirective("LimitWindow", limitWindowDirective);
    maAddDirective("LimitWorkers", limitWorkersDirective);
    maAddDirective("Listen", listenDirective);
    maAddDirective("ListenSecure", listenSecureDirective);
    maAddDirective("LogRoutes", logRoutesDirective);
    maAddDirective("LoadModulePath", loadModulePathDirective);
    maAddDirective("LoadModule", loadModuleDirective);
    maAddDirective("MakeDir", makeDirDirective);
    maAddDirective("Map", mapDirective);
    maAddDirective("MemoryPolicy", memoryPolicyDirective);
    maAddDirective("Methods", methodsDirective);
    maAddDirective("MinWorkers", minWorkersDirective);
    maAddDirective("Monitor", monitorDirective);
    maAddDirective("Order", orderDirective);
    maAddDirective("Param", paramDirective);
    maAddDirective("Prefix", prefixDirective);
    maAddDirective("PreserveFrames", preserveFramesDirective);
    maAddDirective("Redirect", redirectDirective);
    maAddDirective("RequestHeader", requestHeaderDirective);
    maAddDirective("RequestParseTimeout", requestParseTimeoutDirective);
    maAddDirective("RequestTimeout", requestTimeoutDirective);
    maAddDirective("Require", requireDirective);
    maAddDirective("<Reroute", rerouteDirective);
    maAddDirective("</Reroute", closeDirective);
    maAddDirective("Reset", resetDirective);
    maAddDirective("Role", roleDirective);
    maAddDirective("<Route", routeDirective);
    maAddDirective("</Route", closeDirective);
    maAddDirective("ScriptAlias", scriptAliasDirective);
    maAddDirective("ServerName", serverNameDirective);
    maAddDirective("SessionCookie", sessionCookieDirective);
    maAddDirective("SessionTimeout", sessionTimeoutDirective);
    maAddDirective("Set", setDirective);
    maAddDirective("SetConnector", setConnectorDirective);
    maAddDirective("SetHandler", setHandlerDirective);
    maAddDirective("ShowErrors", showErrorsDirective);
    maAddDirective("Source", sourceDirective);

#if ME_HTTP_DEFENSE
    maAddDirective("Defense", defenseDirective);
#endif
#if ME_COM_SSL
    maAddDirective("SSLCACertificateFile", sslCaCertificateFileDirective);
    maAddDirective("SSLCACertificatePath", sslCaCertificatePathDirective);
    maAddDirective("SSLCARevocationCheck", sslCaRevocationCheckDirective);
    maAddDirective("SSLCARevocationFile", sslCaRevocationFileDirective);
    maAddDirective("SSLCertificateFile", sslCertificateFileDirective);
    maAddDirective("SSLCertificateKeyFile", sslCertificateKeyFileDirective);
    maAddDirective("SSLCipherSuite", sslCipherSuiteDirective);
    maAddDirective("SSLPreload", sslPreload);
    maAddDirective("SSLProtocol", sslProtocolDirective);
    maAddDirective("SSLVerifyClient", sslVerifyClientDirective);
    maAddDirective("SSLVerifyIssuer", sslVerifyIssuerDirective);
    maAddDirective("SSLVerifyDepth", sslVerifyDepthDirective);
    maAddDirective("SSLEngine", sslEngine);
#endif

    maAddDirective("Stealth", stealthDirective);
    maAddDirective("StreamInput", streamInputDirective);
    maAddDirective("Target", targetDirective);
    maAddDirective("Template", templateDirective);
    maAddDirective("ThreadStack", threadStackDirective);
    maAddDirective("Trace", traceDirective);
    maAddDirective("TraceLog", traceLogDirective);
    maAddDirective("TypesConfig", typesConfigDirective);
    maAddDirective("Update", updateDirective);
    maAddDirective("UnloadModule", unloadModuleDirective);
#if ME_HTTP_UPLOAD
    maAddDirective("UploadAutoDelete", uploadAutoDeleteDirective);
    maAddDirective("UploadDir", uploadDirDirective);
#endif
    maAddDirective("User", userDirective);
    maAddDirective("UserAccount", userAccountDirective);
    maAddDirective("<VirtualHost", virtualHostDirective);
    maAddDirective("</VirtualHost", closeVirtualHostDirective);
    maAddDirective("XSRF", xsrfDirective);

#if ME_HTTP_WEB_SOCKETS
    maAddDirective("LimitWebSockets", limitWebSocketsDirective);
    maAddDirective("LimitWebSocketsMessage", limitWebSocketsMessageDirective);
    maAddDirective("LimitWebSocketsFrame", limitWebSocketsFrameDirective);
    maAddDirective("LimitWebSocketsPacket", limitWebSocketsPacketDirective);
    maAddDirective("WebSocketsProtocol", webSocketsProtocolDirective);
    maAddDirective("WebSocketsPing", webSocketsPingDirective);
#endif

#if ME_HTTP_DIR
    maAddDirective("IndexOrder", indexOrderDirective);
    maAddDirective("IndexOptions", indexOptionsDirective);
    maAddDirective("Options", optionsDirective);
#endif
    /*
        Fixes
     */
    maAddDirective("FixDotNetDigestAuth", fixDotNetDigestAuth);

#if DEPRECATE || 1
    maAddDirective("LimitBuffer", limitPacketDirective);
#endif
    return 0;
}


/*
    Load a module. Returns 0 if the modules is successfully loaded (may have already been loaded).
 */
PUBLIC int maLoadModule(cchar *name, cchar *libname)
{
    MprModule *module;
    cchar     *entry, *path;

    if (smatch(name, "phpHandler")) {
        name = "php";
    }
    if ((module = mprLookupModule(name)) != 0) {
        return 0;
    }
    path = libname ? libname : sjoin("libmod_", name, ME_SHOBJ, NULL);
    entry = sfmt("http%sInit", stitle(name));
    module = mprCreateModule(name, path, entry, HTTP);
    if (mprLoadModule(module) < 0) {
        return MPR_ERR_CANT_CREATE;
    }
    return 0;
}

/*
    Copyright (c) Embedthis Software. All Rights Reserved.
    This software is distributed under a commercial license. Consult the LICENSE.md
    distributed with this software for full details and copyrights.
 */


/********* Start of file src/convenience.c ************/

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
    Mpr *mpr;
    int rc;

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
    Mpr *mpr;
    int rc;

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


/********* Start of file src/rom.c ************/

/*
    romFiles -- Compiled Files
 */
#include "mpr.h"

#if ME_ROM

PUBLIC MprRomInode romFiles[] = {
    { 0, 0, 0, 0 },
};

PUBLIC MprRomInode *mprGetRomFiles()
{
    return romFiles;
}
#else
PUBLIC int appwebRomDummy;
#endif /* ME_ROM */


/********* Start of file src/modules/cgiHandler.c ************/

/*
    cgiHandler.c -- Common Gateway Interface Handler

    Support the CGI/1.1 standard for external gateway programs to respond to HTTP requests.
    This CGI handler uses async-pipes and non-blocking I/O for all communications.

    Copyright (c) All Rights Reserved. See copyright notice at the bottom of the file.
 */

/*********************************** Includes *********************************/

#include    "appweb.h"

#if ME_COM_CGI
/************************************ Locals ***********************************/

typedef struct Cgi {
    HttpStream *stream;                 /**< Client connection object */
    MprCmd *cmd;                        /**< CGI command object */
    HttpQueue *writeq;                  /**< Queue to write to the CGI */
    HttpQueue *readq;                   /**< Queue to read from the CGI */
    HttpPacket *headers;                /**< CGI response headers */
    char *location;                     /**< Redirection location */
    MprOff declaredLength;              /**< Content-Length declared by the CGI, or negative if none */
    MprOff bodyBytes;                   /**< Body bytes forwarded from the CGI to the client */
    int seenHeader;                     /**< Parsed response header from CGI */
} Cgi;

/*********************************** Forwards *********************************/

static void browserToCgiService(HttpQueue *q);
static void buildArgs(HttpStream *stream, int *argcp, cchar ***argvp);
static void cgiCallback(MprCmd *cmd, int channel, void *data);
static void checkCgiLength(Cgi *cgi);
static void cgiToBrowserData(HttpQueue *q, HttpPacket *packet);
static int copyInner(HttpStream *stream, cchar **envv, int index, cchar *key, cchar *value, cchar *prefix);
static int copyParams(HttpStream *stream, cchar **envv, int index, MprJson *params, cchar *prefix);
static int copyVars(HttpStream *stream, cchar **envv, int index, MprHash *vars, cchar *prefix);
static char *getCgiToken(MprBuf *buf, cchar *delim);
static void manageCgi(Cgi *cgi, int flags);
static bool parseFirstCgiResponse(Cgi *cgi, HttpPacket *packet);
static bool parseCgiHeaders(Cgi *cgi, HttpPacket *packet);
static void readFromCgi(Cgi *cgi, int channel);

#if ME_DEBUG
static void traceCGIData(MprCmd *cmd, char *src, ssize size);
    #define traceData(cmd, src, size) traceCGIData(cmd, src, size)
#else
    #define traceData(cmd, src, size)
#endif

#if ME_WIN_LIKE || VXWORKS
static void findExecutable(HttpStream *stream, char **program, char **script, char **bangScript, cchar *fileName);
#endif
#if ME_WIN_LIKE
static void checkCompletion(HttpQueue *q, MprEvent *event);
static void waitForCgi(Cgi *cgi, MprEvent *event);
#endif

/************************************* Code ***********************************/
/*
    Open the handler for a new request
 */
static int openCgi(HttpQueue *q)
{
    HttpStream *stream;
    Cgi        *cgi;
    int        nproc;

    stream = q->stream;
    if ((nproc = (int) httpMonitorEvent(stream, HTTP_COUNTER_ACTIVE_PROCESSES, 1)) > stream->limits->processMax) {
        httpMonitorEvent(q->stream, HTTP_COUNTER_ACTIVE_PROCESSES, -1);
        httpLog(stream->trace, "cgi.limit.error", "error",
                "msg=\"Too many concurrent processes\", activeProcesses=%d, maxProcesses=%d",
                nproc - 1, stream->limits->processMax);
        httpError(stream, HTTP_CODE_SERVICE_UNAVAILABLE, "Server overloaded");
        return MPR_ERR_CANT_OPEN;
    }
    if ((cgi = mprAllocObj(Cgi, manageCgi)) == 0) {
        /* Normal mem handler recovery */
        return MPR_ERR_MEMORY;
    }
    httpTrimExtraPath(stream);
    httpMapFile(stream);
    q->queueData = q->pair->queueData = cgi;
    cgi->stream = stream;
    cgi->declaredLength = -1;
    cgi->readq = httpCreateQueue(stream->net, stream, stream->http->cgiConnector, HTTP_QUEUE_RX, 0);
    cgi->writeq = httpCreateQueue(stream->net, stream, stream->http->cgiConnector, HTTP_QUEUE_TX, 0);
    cgi->readq->pair = cgi->writeq;
    cgi->writeq->pair = cgi->readq;
    cgi->writeq->queueData = cgi->readq->queueData = cgi;
    return 0;
}


static void manageCgi(Cgi *cgi, int flags)
{
    if (flags & MPR_MANAGE_MARK) {
        mprMark(cgi->stream);
        mprMark(cgi->writeq);
        mprMark(cgi->readq);
        mprMark(cgi->cmd);
        mprMark(cgi->headers);
        mprMark(cgi->location);
    }
}


static void closeCgi(HttpQueue *q)
{
    Cgi    *cgi;
    MprCmd *cmd;

    if ((cgi = q->queueData) != 0) {
        cmd = cgi->cmd;
        if (cmd) {
            mprSetCmdCallback(cmd, NULL, NULL);
            mprDestroyCmd(cmd);
            cgi->cmd = 0;
        }
        httpMonitorEvent(q->stream, HTTP_COUNTER_ACTIVE_PROCESSES, -1);
    }
}


/*
    Start the CGI command program. This commences the CGI gateway program. This will be called after content for
    form and upload requests (or if "RunHandler" before specified), otherwise it runs before receiving content data.
 */
static void startCgi(HttpQueue *q)
{
    HttpRx     *rx;
    HttpTx     *tx;
    HttpRoute  *route;
    HttpStream *stream;
    MprCmd     *cmd;
    Cgi        *cgi;
    cchar      *baseName, **argv, *fileName, **envv;
    ssize      varCount;
    int        argc, count;

    argv = 0;
    argc = 0;
    cgi = q->queueData;
    stream = q->stream;
    rx = stream->rx;
    route = rx->route;
    tx = stream->tx;

    /*
        The command uses the stream dispatcher. This serializes all I/O for both the stream and the CGI gateway.
     */
    if ((cmd = mprCreateCmd(stream->dispatcher)) == 0) {
        return;
    }
    cgi->cmd = cmd;

    if (stream->http->forkCallback) {
        cmd->forkCallback = stream->http->forkCallback;
        cmd->forkData = stream->http->forkData;
    }
    argc = 1;                                   /* argv[0] == programName */
    buildArgs(stream, &argc, &argv);
    fileName = argv[0];
    baseName = mprGetPathBase(fileName);

    /*
        nph prefix means non-parsed-header. Don't parse the CGI output for a CGI header
     */
    if (strncmp(baseName, "nph-", 4) == 0 ||
        (strlen(baseName) > 4 && strcmp(&baseName[strlen(baseName) - 4], "-nph") == 0)) {
        /* Pretend we've seen the header for Non-parsed Header CGI programs */
        cgi->seenHeader = 1;
        tx->flags |= HTTP_TX_USE_OWN_HEADERS;
    }
    /*
        Build environment variables
     */
    httpCreateCGIParams(stream);
    varCount = mprGetHashLength(rx->headers) + mprGetHashLength(rx->svars) + mprGetJsonLength(rx->params);
    if ((envv = mprAlloc((varCount + 1) * sizeof(char*))) != 0) {
        //  OPTIONAL
        count = copyParams(stream, envv, 0, rx->params, route->envPrefix);
        count = copyVars(stream, envv, count, rx->svars, "");
        count = copyVars(stream, envv, count, rx->headers, "HTTP_");
        assert(count <= varCount);
    }
#if !VXWORKS
    /*
        This will be ignored on VxWorks because there is only one global current directory for all tasks
     */
    mprSetCmdDir(cmd, mprGetPathDir(fileName));
#endif
    mprSetCmdCallback(cmd, cgiCallback, cgi);

    if (route->callback && route->callback(stream, HTTP_ROUTE_HOOK_CGI, &argc, argv, envv) < 0) {
        httpError(stream, HTTP_CODE_NOT_FOUND, "Route check failed for CGI: %s, URI %s", fileName, rx->uri);
        return;
    }
    if (mprStartCmd(cmd, argc, argv, envv, MPR_CMD_IN | MPR_CMD_OUT | MPR_CMD_ERR) < 0) {
        httpError(stream, HTTP_CODE_NOT_FOUND, "Cannot run CGI process: %s, URI %s", fileName, rx->uri);
        return;
    }
#if ME_WIN_LIKE
    mprCreateLocalEvent(stream->dispatcher, "cgi-win", 10, waitForCgi, cgi, MPR_EVENT_CONTINUOUS);
#endif
}


#if ME_WIN_LIKE
static void waitForCgi(Cgi *cgi, MprEvent *event)
{
    HttpStream *stream;
    MprCmd     *cmd;

    stream = cgi->stream;
    cmd = cgi->cmd;
    if (cmd && !cmd->complete) {
        if (stream->error && cmd->pid) {
            mprStopCmd(cmd, -1);
            mprStopContinuousEvent(event);
        }
    } else {
        mprStopContinuousEvent(event);
    }
}
#endif


/*
    Handler incoming routine.
    Accept incoming body data from the client destined for the CGI gateway. This is typically POST or PUT data.
    Note: For POST "form" requests, this will be called before the command is actually started.
 */
static void browserToCgiData(HttpQueue *q, HttpPacket *packet)
{
    HttpStream *stream;
    Cgi        *cgi;

    assert(q);
    assert(packet);

    if ((cgi = q->queueData) == 0) {
        return;
    }
    stream = q->stream;
    assert(q == stream->readq);

    if (packet->flags & HTTP_PACKET_END) {
        if (stream->rx->remainingContent > 0 && stream->net->protocol < 2) {
            /* Short incoming body data. Just kill the CGI process */
            httpError(stream, HTTP_CODE_BAD_REQUEST, "Client supplied insufficient body data");
            if (cgi->cmd) {
                mprDestroyCmd(cgi->cmd);
                cgi->cmd = 0;
            }
        } else {
            httpFinalizeInput(stream);
        }
    }
    httpPutForService(cgi->writeq, packet, HTTP_SCHEDULE_QUEUE);

    /*
        Body packets are passed to this routine directly, so stream->readq->count never rises and the generic
        room test upstream always finds space no matter how far behind the gateway is. Suspend the read queue
        while the gateway is behind; browserToCgiService resumes it as the gateway drains, once the gateway
        is running.
     */
    if (cgi->cmd && cgi->writeq->count >= cgi->writeq->max) {
        httpSuspendQueue(q);
    }
}


/*
    Connector outgoingService
 */
static void browserToCgiService(HttpQueue *q)
{
    HttpStream *stream;
    HttpPacket *packet;
    Cgi        *cgi;
    MprCmd     *cmd;
    MprBuf     *buf;
    ssize      rc, len;
    int        err;

    if ((cgi = q->queueData) == 0) {
        return;
    }
    assert(q == cgi->writeq);
    if ((cmd = cgi->cmd) == 0) {
        /* CGI not yet started */
        return;
    }
    stream = cgi->stream;

    for (packet = httpGetPacket(q); packet; packet = httpGetPacket(q)) {
        if ((buf = packet->content) == 0) {
            /* End packet */
            continue;
        }
        if (cmd) {
            len = mprGetBufLength(buf);
            rc = mprWriteCmd(cmd, MPR_CMD_STDIN, mprGetBufStart(buf), len);
            if (rc < 0) {
                err = mprGetError();
                if (err == EINTR) {
                    continue;
                } else if (err == EAGAIN || err == EWOULDBLOCK) {
                    httpPutBackPacket(q, packet);
                    httpSuspendQueue(q);
                    break;
                }
                httpLog(stream->trace, "cgi.error", "error", "msg=\"Cannot write to CGI gateway\", errno=%d",
                        mprGetOsError());
                mprCloseCmdFd(cmd, MPR_CMD_STDIN);
                httpDiscardQueueData(q, 1);
                httpError(stream, HTTP_CODE_BAD_GATEWAY, "Cannot write body data to CGI gateway");
                break;
            }
            mprAdjustBufStart(buf, rc);
            if (mprGetBufLength(buf) > 0) {
                httpPutBackPacket(q, packet);
                httpSuspendQueue(q);
                break;
            }
        }
    }
    if (cmd) {
        if (q->count > 0) {
            /* Wait for writable event so cgiCallback can recall this routine */
            mprEnableCmdEvents(cmd, MPR_CMD_STDIN);
        } else if (stream->rx->eof) {
            mprCloseCmdFd(cmd, MPR_CMD_STDIN);
        } else {
            mprDisableCmdEvents(cmd, MPR_CMD_STDIN);
        }
    }
    /*
        Resume reading the request body now the gateway has taken what browserToCgiData queued for it.
     */
    if (q->count < q->max && httpIsQueueSuspended(stream->readq)) {
        httpResumeQueue(stream->readq, 0);
    }
}


static void cgiToBrowserData(HttpQueue *q, HttpPacket *packet)
{
    httpPutForService(q->stream->writeq, packet, HTTP_SCHEDULE_QUEUE);
}


static void cgiToBrowserService(HttpQueue *q)
{
    HttpStream *stream;
    MprCmd     *cmd;
    Cgi        *cgi;

    if ((cgi = q->queueData) == 0) {
        return;
    }
    stream = q->stream;
    assert(q == stream->writeq);
    cmd = cgi->cmd;
    if (cmd == 0) {
        return;
    }
    /*
        This will copy outgoing packets downstream toward the network stream and on to the browser.
        This may disable the CGI queue if the downstream net stream queue overflows because the socket
        is full. In that case, httpEnableConnEvents will setup to listen for writable events. When the
        socket is writable again, the stream will drain its queue which will re-enable this queue
        and schedule it for service again.
     */
    httpDefaultService(q);
    if (q->count < q->low) {
        mprEnableCmdOutputEvents(cmd, 1);
    } else if (q->count > q->max && stream->net->writeBlocked) {
        httpSuspendQueue(stream->writeq);
    }
}


/*
    Read the output data from the CGI script and return it to the client. This is called by the MPR in response to
    I/O events from the CGI process for stdout/stderr data from the CGI script and for EOF from the CGI's stdin.
    IMPORTANT: This event runs on the stream's dispatcher. (ie. single threaded and safe)
 */
static void cgiCallback(MprCmd *cmd, int channel, void *data)
{
    HttpStream *stream;
    Cgi        *cgi;
    int        suspended;

    if ((cgi = data) == 0) {
        return;
    }
    if ((stream = cgi->stream) == 0) {
        return;
    }
    stream->lastActivity = stream->http->now;

    switch (channel) {
    case MPR_CMD_STDIN:
        /* Stdin can absorb more data */
        httpResumeQueue(cgi->writeq, 1);
        break;

    case MPR_CMD_STDOUT:
    case MPR_CMD_STDERR:
        readFromCgi(cgi, channel);
        break;

    default:
        /* Child death notification */
        if (cmd->status != 0) {
            httpError(cgi->stream, HTTP_CODE_BAD_GATEWAY, "Bad CGI process termination");
        }
        break;
    }
    if (cgi->location) {
        httpRedirect(stream, HTTP_CODE_MOVED_TEMPORARILY, cgi->location);
    }
    if (cmd->complete || cgi->location) {
        cgi->location = 0;
        httpFinalize(stream);
    } else {
        suspended = httpIsQueueSuspended(stream->writeq);
        assert(!suspended || stream->net->writeBlocked);
        mprEnableCmdOutputEvents(cmd, !suspended);
    }
    httpServiceNetQueues(stream->net, 0);

    mprCreateLocalEvent(stream->dispatcher, "cgi", 0, httpIOEvent, stream->net, 0);
}


static void readFromCgi(Cgi *cgi, int channel)
{
    HttpStream *stream;
    HttpPacket *packet;
    HttpTx     *tx;
    HttpQueue  *q, *writeq;
    MprCmd     *cmd;
    ssize      nbytes;
    int        err;

    cmd = cgi->cmd;
    stream = cgi->stream;
    tx = stream->tx;
    q = cgi->readq;
    writeq = stream->writeq;

    assert(stream->sock);
    assert(stream->state > HTTP_STATE_BEGIN);

    if (tx->finalized) {
        mprCloseCmdFd(cmd, channel);
    }
    while (mprGetCmdFd(cmd, channel) >= 0 && !tx->finalized && writeq->count < writeq->max) {
        if ((packet = cgi->headers) != 0) {
            if (mprGetBufSpace(packet->content) < ME_BUFSIZE && mprGrowBuf(packet->content, ME_BUFSIZE) < 0) {
                break;
            }
        } else if ((packet = httpCreateDataPacket(ME_BUFSIZE)) == 0) {
            break;
        }
        nbytes = mprReadCmd(cmd, channel, mprGetBufEnd(packet->content), ME_BUFSIZE);
        if (nbytes < 0) {
            err = mprGetError();
            if (err == EINTR) {
                continue;
            } else if (err == EAGAIN || err == EWOULDBLOCK) {
                break;
            }
            mprCloseCmdFd(cmd, channel);
            break;

        } else if (nbytes == 0) {
            mprCloseCmdFd(cmd, channel);
            if (channel == MPR_CMD_STDOUT) {
                checkCgiLength(cgi);
                httpFinalizeOutput(stream);
            }
            break;

        } else {
            traceData(cmd, mprGetBufEnd(packet->content), nbytes);
            mprAdjustBufEnd(packet->content, nbytes);
        }
        if (channel == MPR_CMD_STDERR) {
            httpLog(stream->trace, "cgi.error", "error", "msg:CGI failed, uri:%s, details: %s",
                    stream->rx->uri, mprBufToString(packet->content));
            httpSetContentType(stream, "text/plain");
            httpSetStatus(stream, HTTP_CODE_SERVICE_UNAVAILABLE);
            cgi->seenHeader = 1;
        }
        if (!cgi->seenHeader) {
            if (!parseCgiHeaders(cgi, packet)) {
                cgi->headers = packet;
                return;
            }
            cgi->headers = 0;
            cgi->seenHeader = 1;
        }
        if (!tx->finalizedOutput && httpGetPacketLength(packet) > 0) {
            cgi->bodyBytes += httpGetPacketLength(packet);
            if (cgi->declaredLength >= 0 && cgi->bodyBytes > cgi->declaredLength) {
                /* Overrun. Do not forward bytes the framing statement does not cover */
                checkCgiLength(cgi);
                break;
            }
            /* Put the data to the CGI readq, then cgiToBrowserService will take care of it */
            httpPutPacket(q, packet);
        }
    }
}


/*
    Reconcile the Content-Length the CGI declared against the body bytes it actually produced.
    A mismatch mis-frames the response and lets CGI output be read as the head of the next one
    (request smuggling), so close the connection rather than leave it poisonable.
    Nothing to reconcile if the server has replaced the CGI response with an error document or redirect.
 */
static void checkCgiLength(Cgi *cgi)
{
    HttpStream *stream;

    stream = cgi->stream;
    if (cgi->declaredLength < 0 || cgi->bodyBytes == cgi->declaredLength) {
        return;
    }
    if (stream->error || stream->tx->finalizedOutput || cgi->location) {
        return;
    }
    httpLog(stream->trace, "cgi.error", "error", "msg:CGI Content-Length mismatch, declared:%lld, sent:%lld",
            cgi->declaredLength, cgi->bodyBytes);
    httpError(stream, HTTP_CLOSE | HTTP_CODE_BAD_GATEWAY, "CGI response length mismatch");
}


/*
    Parse the CGI output headers. Sample CGI program output:
        Content-type: text/html

        <html.....
 */
static bool parseCgiHeaders(Cgi *cgi, HttpPacket *packet)
{
    HttpStream *stream;
    MprBuf     *buf;
    char       *endHeaders, *headers, *key, *value;
    int64      length;
    ssize      blen;
    int        len, status;

    stream = cgi->stream;
    value = 0;
    buf = packet->content;
    headers = mprGetBufStart(buf);
    blen = mprGetBufLength(buf);

    /*
        Split the headers from the body. Add null to ensure we can search for line terminators.
     */
    len = 0;
    if ((endHeaders = sncontains(headers, "\r\n\r\n", blen)) == NULL) {
        if ((endHeaders = sncontains(headers, "\n\n", blen)) == NULL) {
            if (mprGetCmdFd(cgi->cmd, MPR_CMD_STDOUT) >= 0 && strlen(headers) < ME_MAX_HEADERS) {
                /* Not EOF and less than max headers and have not yet seen an end of headers delimiter */
                return 0;
            }
        }
        len = 2;
    } else {
        len = 4;
    }
    if (endHeaders) {
        if (endHeaders > buf->end) {
            assert(endHeaders <= buf->end);
            return 0;
        }
    }
    if (endHeaders) {
        endHeaders[len - 1] = '\0';
        endHeaders += len;
    }
    /*
        Want to be tolerant of CGI programs that omit the status line.
     */
    if (strncmp((char*) buf->start, "HTTP/1.", 7) == 0) {
        if (!parseFirstCgiResponse(cgi, packet)) {
            /* httpError already called */
            return 0;
        }
    }
    if (endHeaders && strchr(mprGetBufStart(buf), ':')) {
        while (mprGetBufLength(buf) > 0 && buf->start[0] && (buf->start[0] != '\r' && buf->start[0] != '\n')) {
            if ((key = getCgiToken(buf, ":")) == 0) {
                key = "Bad Header";
            }
            value = getCgiToken(buf, "\n");
            while (isspace((uchar) * value)) {
                value++;
            }
            len = (int) strlen(value);
            while (len > 0 && (value[len - 1] == '\r' || value[len - 1] == '\n')) {
                value[len - 1] = '\0';
                len--;
            }
            /*
                An embedded CR or LF would split the response header block for a downstream client, cache or proxy, 
                so fail the request rather than sanitize it. A CGI emitting a control character here is malfunctioning 
                or compromised.
             */
            if (schr(value, '\r') || schr(value, '\n')) {
                httpError(stream, HTTP_CODE_BAD_GATEWAY, "CGI response header contains a control character");
                return 0;
            }
            if (scaselesscmp(key, "location") == 0) {
                cgi->location = value;

            } else if (scaselesscmp(key, "status") == 0) {
                /*
                    A 1xx is not a final status. It makes the response body-less while the CGI is still
                    writing a body, so only a final status can be relayed to the client.
                 */
                if ((status = httpParseStatus(value)) < HTTP_CODE_OK) {
                    httpError(stream, HTTP_CODE_BAD_GATEWAY, "Bad CGI status: %s", value);
                    return 0;
                }
                httpSetStatus(stream, status);

            } else if (scaselesscmp(key, "content-type") == 0) {
                if (stream->tx->charSet && !scaselesscontains(value, "charset")) {
                    httpSetHeader(stream, "Content-Type", "%s; charset=%s", value, stream->tx->charSet);
                } else {
                    httpSetHeaderString(stream, "Content-Type", value);
                }

            } else if (scaselesscmp(key, "transfer-encoding") == 0) {
                /*
                    A message must not carry both Content-Length and Transfer-Encoding
                 */
                httpError(stream, HTTP_CODE_BAD_GATEWAY,
                          "CGI response declares an unsupported Transfer-Encoding");
                return 0;

            } else if (scaselesscmp(key, "content-length") == 0) {
                if (httpParseDigits(value, &length) < 0) {
                    httpError(stream, HTTP_CODE_BAD_GATEWAY, "Bad CGI Content-Length: %s", value);
                    return 0;
                }
                cgi->declaredLength = (MprOff) length;
                httpSetContentLength(stream, cgi->declaredLength);
                httpSetChunkSize(stream, 0);

            } else {
                /*
                    Now pass all other headers back to the client
                 */
                key = ssplit(key, ":\r\n\t ", NULL);
                httpSetHeaderString(stream, key, value);
            }
        }
        buf->start = endHeaders;
    }
    return 1;
}


/*
    Parse the CGI output first line
 */
static bool parseFirstCgiResponse(Cgi *cgi, HttpPacket *packet)
{
    MprBuf *buf;
    char   *protocol, *status, *msg;

    buf = packet->content;
    protocol = getCgiToken(buf, " ");
    if (protocol == 0 || protocol[0] == '\0') {
        httpError(cgi->stream, HTTP_CODE_BAD_GATEWAY, "Bad CGI HTTP protocol response");
        return 0;
    }
    if (strncmp(protocol, "HTTP/1.", 7) != 0) {
        httpError(cgi->stream, HTTP_CODE_BAD_GATEWAY, "Unsupported CGI protocol");
        return 0;
    }
    status = getCgiToken(buf, " ");
    if (status == 0 || *status == '\0') {
        httpError(cgi->stream, HTTP_CODE_BAD_GATEWAY, "Bad CGI header response");
        return 0;
    }
    msg = getCgiToken(buf, "\n");
    mprNop(msg);
    mprDebug("http cgi", 4, "CGI response status: %s %s %s", protocol, status, msg);
    return 1;
}


/*
    Build the command arguments. NOTE: argv is untrusted input.
 */
static void buildArgs(HttpStream *stream, int *argcp, cchar ***argvp)
{
    HttpRx *rx;
    HttpTx *tx;
    cchar  *actionProgram, *cp, *fileName, *mimeType, *query;
    char   **argv, *tok;
    ssize  len;
    int    argc, argind, i;

    rx = stream->rx;
    tx = stream->tx;

    fileName = tx->filename;
    assert(fileName);

    actionProgram = 0;
    argind = 0;
    argc = *argcp;

    if (tx->ext) {
        /*
            Action is keyed by MIME type, so the extension must be resolved to one first.
            mprGetMimeProgram matches on the type and its first-character guard makes a mismatch
            silent -- an extension passed here never matches any entry and no interpreter is selected.
         */
        mimeType = mprLookupMime(rx->route->mimeTypes, tx->ext);
        actionProgram = mprGetMimeProgram(rx->route->mimeTypes, mimeType);
        if (actionProgram != 0) {
            argc++;
        }
        /*
            This is an Apache compatible hack for PHP 5.3
         */
        mprAddKey(rx->headers, "REDIRECT_STATUS", itos(HTTP_CODE_MOVED_TEMPORARILY));
    }
    /*
        Count the args for ISINDEX queries. Only valid if there is not a "=" in the query.
        If this is so, then we must not have these args in the query env also?
     */
    query = (char*) rx->parsedUri->query;
    if (query && !schr(query, '=')) {
        argc++;
        for (cp = query; *cp; cp++) {
            if (*cp == '+') {
                argc++;
            }
        }
    } else {
        query = 0;
    }
    len = (argc + 1) * sizeof(char*);
    argv = mprAlloc(len);
    memset(argv, 0, len);

    if (actionProgram) {
        argv[argind++] = sclone(actionProgram);
    }
    argv[argind++] = sclone(fileName);
    /*
        ISINDEX queries. Only valid if there is not a "=" in the query. If this is so, then we must not
        have these args in the query env also?
        FUTURE - should query vars be set in the env?
     */
    if (query) {
        cp = stok(sclone(query), "+", &tok);
        while (cp) {
            argv[argind++] = mprEscapeCmd(mprUriDecode(cp), 0);
            cp = stok(NULL, "+", &tok);
        }
    }
    assert(argind <= argc);
    argv[argind] = 0;
    *argcp = argc;
    *argvp = (cchar**) argv;

    mprDebug("http cgi", 5, "CGI: command:");
    for (i = 0; i < argind; i++) {
        mprDebug("http cgi", 5, "   argv[%d] = %s", i, argv[i]);
    }
}


/*
    Get the next input token. The content buffer is advanced to the next token. This routine always returns a
    non-zero token. The empty string means the delimiter was not found.
 */
static char *getCgiToken(MprBuf *buf, cchar *delim)
{
    char  *token, *nextToken;
    ssize len;

    len = mprGetBufLength(buf);
    if (len == 0) {
        return "";
    }
    token = mprGetBufStart(buf);
    nextToken = sncontains(mprGetBufStart(buf), delim, len);
    if (nextToken) {
        *nextToken = '\0';
        len = (int) strlen(delim);
        nextToken += len;
        buf->start = nextToken;

    } else {
        buf->start = mprGetBufEnd(buf);
    }
    return token;
}


#if ME_DEBUG
/*
    Trace output first part of output received from the cgi process
 */
static void traceCGIData(MprCmd *cmd, char *src, ssize size)
{
    char dest[512];
    int  index, i;

    if (mprGetLogLevel() >= 5) {
        mprDebug("http cgi", 5, "CGI: process wrote (leading %zd bytes) => \n", min(sizeof(dest), size));
        for (index = 0; index < size; ) {
            for (i = 0; i < (sizeof(dest) - 1) && index < size; i++) {
                dest[i] = src[index];
                index++;
            }
            dest[i] = '\0';
            mprDebug("http cgi", 5, "%s", dest);
        }
    }
}
#endif


/*
    Emit one environment variable. Returns the number of slots consumed: zero if the variable is
    unsafe to hand to the child and was dropped.
 */
static int copyInner(HttpStream *stream, cchar **envv, int index, cchar *key, cchar *value, cchar *prefix)
{
    char *cp, *name;

    name = prefix ? sjoin(prefix, key, NULL) : sclone(key);
    for (cp = name; *cp; cp++) {
        if (*cp == '-') {
            *cp = '_';
        } else {
            *cp = toupper((uchar) * cp);
        }
    }
    /*
        Test the name the child would actually receive, after prefixing and conversion. Without this
        a client-supplied request header sets the matching HTTP_ variable in the child -- HTTP_PROXY
        being the httpoxy case.
     */
    if (httpIsCgiVarBlocked(name)) {
        httpLog(stream->trace, "cgi.env.filter", "detail",
                "msg:Dropped unsafe CGI environment variable, var:%s", name);
        return 0;
    }
    cp = sjoin(name, "=", value, NULL);
    if (stream->rx->route->flags & HTTP_ROUTE_ENV_ESCAPE) {
        /*
            This will escape: "&;`'\"|*?~<>^()[]{}$\\\n" and also on windows \r%
         */
        cp = mprEscapeCmd(cp, 0);
    }
    envv[index] = cp;
    return 1;
}


static int copyVars(HttpStream *stream, cchar **envv, int index, MprHash *vars, cchar *prefix)
{
    MprKey *kp;

    for (ITERATE_KEYS(vars, kp)) {
        if (kp->data) {
            index += copyInner(stream, envv, index, kp->key, kp->data, prefix);
        }
    }
    envv[index] = 0;
    return index;
}


static int copyParams(HttpStream *stream, cchar **envv, int index, MprJson *params, cchar *prefix)
{
    MprJson *param;
    int     i;

    for (ITERATE_JSON(params, param, i)) {
        //  Workaround for large form fields that are also copied as post data
        if (slen(param->value) <= ME_MAX_RX_FORM_FIELD) {
            index += copyInner(stream, envv, index, param->name, param->value, prefix);
        }
    }
    envv[index] = 0;
    return index;
}


static int cgiEscapeDirective(MaState *state, cchar *key, cchar *value)
{
    bool on;

    if (!maTokenize(state, value, "%B", &on)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    httpSetRouteEnvEscape(state->route, on);
    return 0;
}


static int cgiPrefixDirective(MaState *state, cchar *key, cchar *value)
{
    cchar *prefix;

    if (!maTokenize(state, value, "%S", &prefix)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    httpSetRouteEnvPrefix(state->route, prefix);
    return 0;
}


/*
    Loadable module initialization
 */
PUBLIC int httpCgiInit(Http *http, MprModule *module)
{
    HttpStage *handler, *connector;

    if ((handler = httpCreateHandler("cgiHandler", module)) == 0) {
        return MPR_ERR_CANT_CREATE;
    }
    http->cgiHandler = handler;
    handler->close = closeCgi;
    handler->outgoingService = cgiToBrowserService;
    handler->incoming = browserToCgiData;
    handler->open = openCgi;
    handler->start = startCgi;

    if ((connector = httpCreateStage("cgiConnector", HTTP_STAGE_CONNECTOR, module)) == 0) {
        return MPR_ERR_CANT_CREATE;
    }
    http->cgiConnector = connector;
    connector->outgoingService = browserToCgiService;
    connector->incoming = cgiToBrowserData;

    /*
        Add configuration file directives
     */
    maAddDirective("CgiEscape", cgiEscapeDirective);
    maAddDirective("CgiPrefix", cgiPrefixDirective);
    return 0;
}

#endif /* ME_COM_CGI */

/*
    Copyright (c) Embedthis Software. All Rights Reserved.
    This software is distributed under a commercial license. Consult the LICENSE.md
    distributed with this software for full details and copyrights.
 */


/********* Start of file src/modules/espHandler.c ************/

/*
    espHandler.c -- ESP Appweb handler

    ESP is a separate add-on product. This file is the glue that binds ESP into Appweb and compiles
    to nothing unless ME_COM_ESP is set and the ESP add-on is installed under src/esp.

    Copyright (c) All Rights Reserved. See copyright notice at the bottom of the file.
 */

/********************************** Includes **********************************/

#include    "appweb.h"

#if ME_COM_ESP
#include    "esp.h"

/************************************* Code ***********************************/
/*
    EspApp /path/to/some*dir/esp.json
    EspApp [prefix="/uri/prefix"] config="/path/to/esp.json"
 */
static int espAppDirective(MaState *state, cchar *key, cchar *value)
{
    HttpRoute *route, *saveRoute;
    MprList   *files;
    cchar     *path, *prefix;
    char      *option, *ovalue, *tok;
    int       next, rc;

    rc = 0;
    saveRoute = state->route;

    if (scontains(value, "=")) {
        path = 0;
        prefix = "/";
        for (option = maGetNextArg(sclone(value), &tok); option; option = maGetNextArg(tok, &tok)) {
            option = stok(option, " =\t,", &ovalue);
            ovalue = strim(ovalue, "\"'", MPR_TRIM_BOTH);
            if (smatch(option, "prefix")) {
                prefix = ovalue;
            } else if (smatch(option, "config")) {
                path = ovalue;
            } else {
                path = 0;
                rc = MPR_ERR_BAD_ARGS;
                mprLog("error appweb", 0, "Using deprecated EspApp arguments. Please consult documentation");
            }
        }
        if (path) {
            state->route = route = httpCreateInheritedRoute(state->route);
            route->flags |= HTTP_ROUTE_HOSTED;
            if (espInit(route, prefix, path) < 0) {
                rc = MPR_ERR_CANT_CREATE;
            } else {
                httpFinalizeRoute(route);
            }
        }
    } else {
        files = mprGlobPathFiles(".", value, 0);
        for (ITERATE_ITEMS(files, path, next)) {
            prefix = mprGetPathBase(mprGetPathDir(mprGetAbsPath(path)));
            route = httpCreateInheritedRoute(state->route);
            route->flags |= HTTP_ROUTE_HOSTED;
            if (espInit(route, prefix, path) < 0) {
                rc = MPR_ERR_CANT_CREATE;
                break;
            }
            httpFinalizeRoute(route);
        }
    }
    state->route = saveRoute;
    return rc;
}


/*
    Loadable module configuration
 */
PUBLIC int httpEspInit(Http *http, MprModule *module)
{
    if (espOpen(module) < 0) {
        return MPR_ERR_CANT_CREATE;
    }
    maAddDirective("EspApp", espAppDirective);
    return 0;
}
#endif /* ME_COM_ESP */

/*
    Copyright (c) Embedthis Software. All Rights Reserved.
    This software is distributed under a commercial license. Consult the LICENSE.md
    distributed with this software for full details and copyrights.
 */


/********* Start of file src/modules/fastHandler.c ************/

/*
    fastHandler.c -- FastCGI handler

    This handler supports the FastCGI spec: https://github.com/fast-cgi/spec/blob/master/spec.md

    It supports launching FastCGI applications and connecting to pre-existing FastCGI applications.
    It will multiplex multiple simultaneous requests to one or more FastCGI apps.

    <Route /fast>
        LoadModule fastHandler libmod_fast
        AddHandler fastHandler php
        FastConnect 127.0.0.1:9991 launch="/usr/local/bin/php-cgi" min=1 max=2 count=500 timeout=5mins multiplex=1
    </Route>

    The interpreter can also come from "Action application/x-php /usr/local/bin/php-cgi", which
    buildFastArgs falls back to when there is no launch=. Prefer launch=: routes share one mime table
    by reference, so an Action is server-wide wherever it is written and would decide how every other
    route runs PHP as well.

    Copyright (c) All Rights Reserved. See copyright notice at the bottom of the file.
 */

/*********************************** Includes *********************************/

#include    "appweb.h"

#if ME_COM_FAST && ME_UNIX_LIKE
/************************************ Locals ***********************************/

#define FAST_VERSION           1
#define FAST_DEBUG             0            //  For debugging (keeps filedes open in FastCGI for debug output)

/*
    FastCGI spec packet types
 */
#define FAST_REAP              0            //  Proxy has been reaped (not part of spec)
#define FAST_BEGIN_REQUEST     1            //  Start new request - sent to FastCGI
#define FAST_ABORT_REQUEST     2            //  Abort request - sent to FastCGI
#define FAST_END_REQUEST       3            //  End request - received from FastCGI
#define FAST_PARAMS            4            //  Send params to FastCGI
#define FAST_STDIN             5            //  Post body data
#define FAST_STDOUT            6            //  Response body
#define FAST_STDERR            7            //  FastCGI app errors
#define FAST_DATA              8            //  Additional data to application (unused)
#define FAST_GET_VALUES        9            //  Query FastCGI app (unused)
#define FAST_GET_VALUES_RESULT 10           //  Query result
#define FAST_UNKNOWN_TYPE      11           //  Unknown management request
#define FAST_MAX               11           //  Max type

/*
    Pseudo types
 */
 #define FAST_COMMS_ERROR      12           //  Communications error

static cchar *fastTypes[FAST_MAX + 1] = {
    "invalid", "begin", "abort", "end", "params", "stdin", "stdout", "stderr",
    "data", "get-values", "get-values-result", "unknown",
};

/*
    FastCGI app types
 */
#define FAST_RESPONDER        1             //  Supported web request responder
#define FAST_AUTHORIZER       2             //  Not supported
#define FAST_FILTER           3             //  Not supported

#define FAST_MAGIC            0x2671825C

/*
    Default constants. WARNING: this code does not yet support multiple requests per app
 */
#define FAST_MAX_APPS         1             //  Max of one app
#define FAST_MIN_APPS         0             //  Min of zero apps to keep running if idle
#define FAST_MAX_REQUESTS     MAXINT64      //  Max number of requests per app instance
#define FAST_MAX_MULTIPLEX    1             //  Max number of concurrent requests per app instance
#define FAST_MAX_ID           0x10000       //  Maximum request ID
#define FAST_PACKET_SIZE      8             //  Size of minimal FastCGI packet
#define FAST_KEEP_CONN        1             //  Flag to app to keep connection open

#define FAST_Q_SIZE           ((FAST_PACKET_SIZE + 65535 + 8) * 2)

#define FAST_REQUEST_COMPLETE 0             //  End Request response status for request complete
#define FAST_CANT_MPX_CONN    1             //  Request rejected -- FastCGI app cannot multiplex requests
#define FAST_OVERLOADED       2             //  Request rejected -- app server is overloaded
#define FAST_UNKNOWN_ROLE     3             //  Request rejected -- unknown role

#ifndef FAST_WAIT_TIMEOUT
#define FAST_WAIT_TIMEOUT     (10 * TPS)    //  Time to wait for a app
#endif

#ifndef FAST_CONNECT_TIMEOUT
#define FAST_CONNECT_TIMEOUT  (10 * TPS)    //  Time to wait for FastCGI to respond to a connect
#endif

#ifndef FAST_APP_TIMEOUT
#define FAST_APP_TIMEOUT      (300 * TPS)   //  Default inactivity time to preserve idle app
#endif

#ifndef FAST_WATCHDOG_TIMEOUT
#define FAST_WATCHDOG_TIMEOUT (60 * TPS)    //  Frequency to check on idle apps and then prune them
#endif

/*
    Top level FastCGI structure per route
 */
typedef struct Fast {
    uint magic;                             //  Magic identifier
    cchar *endpoint;                        //  Proxy listening endpoint
    cchar *launch;                          //  Launch command
    int multiplex;                          //  Maximum number of requests to send to each FastCGI app
    int minApps;                            //  Minumum number of apps to maintain
    int maxApps;                            //  Maximum number of apps to spawn
    uint64 keep;                            //  Keep alive
    uint64 maxRequests;                     //  Maximum number of requests for launched apps before respawning
    MprTicks appTimeout;                    //  Timeout for an idle app to be maintained
    MprList *apps;                          //  List of active apps
    MprList *idleApps;                      //  Idle apps
    MprMutex *mutex;                        //  Multithread sync
    MprCond *cond;                          //  Condition to wait for available app
    MprEvent *timer;                        //  Timer to check for idle apps
    cchar *ip;                              //  Listening IP address
    int port;                               //  Listening port
} Fast;

/*
    Per FastCGI app instance
 */
typedef struct FastApp {
    Fast *fast;                             // Parent pointer
    HttpTrace *trace;                       // Default tracing configuration
    MprTicks lastActive;                    // When last active
    MprSignal *signal;                      // Mpr signal handler for child death
    bool destroy;                           // Must destroy app
    bool destroyed;                         // App has been destroyed
    int inUse;                              // In use counter
    int pid;                                // Process ID of the FastCGI app
    uint64 nextID;                          // Next request ID for this app
    MprList *sockets;                       // Open sockets to apps
    MprList *requests;                      // Requests
    cchar *ip;                              // Bound IP address
    int port;                               // Bound listening port
    int exitStatus;                         // Child exit status, -1 until reaped
    bool noexec;                            // The launch program could not be executed
    MprTicks lastActivity;                  // Last I/O activity
} FastApp;

/*
    Exit status of a child whose execve() failed
 */
#define FAST_EXIT_NOEXEC 127

/*
    Per FastCGI request instance. This is separate from the FastApp properties because the
    FastRequest executes on a different dispatcher.
 */
typedef struct FastRequest {
    Fast *fast;                             // Parent pointer
    FastApp *app;                           // Owning app
    MprSocket *socket;                      // I/O socket
    HttpStream *stream;                     // Owning client request stream
    HttpQueue *connWriteq;                  // Queue to write to the FastCGI app
    HttpQueue *connReadq;                   // Queue to hold read data from the FastCGI app
    HttpTrace *trace;                       // Default tracing configuration
    int id;                                 // FastCGI request ID - assigned from FastApp.nextID % FAST_MAX_ID
    bool eof;                               // Socket is closed
    bool parsedHeaders;                     // Parsed the FastCGI app header response
    bool writeBlocked;                      // Socket is full of write data
    int eventMask;                          // Socket eventMask
    uint64 bytesRead;                       // Bytes read in response
    MprOff declaredLength;                  // Content-Length declared by the app, or negative if none
    MprOff bodyBytes;                       // Body bytes forwarded from the app to the client
} FastRequest;

/*
    List of Fast instances
 */
static MprList *fasts;

/*********************************** Forwards *********************************/

static void addFastPacket(HttpNet *net, HttpPacket *packet);
static void addToFastVector(HttpNet *net, char *ptr, ssize bytes);
static void adjustFastVec(HttpNet *net, ssize written);
static void checkFastLength(FastRequest *req);
static Fast *allocFast(void);
static void fastTerminator(int state, int exitStrategy, int status);
static FastRequest *allocFastRequest(FastApp *app, HttpStream *stream, MprSocket *socket);
static FastApp *allocFastApp(Fast *fast, HttpStream *stream);
static void closeAppSockets(FastApp *app);
static cchar *buildFastArgs(FastApp *app, HttpStream *stream, int *argcp, cchar ***argvp);
static MprOff buildFastVec(HttpQueue *q);
static void fastCloseRequest(HttpQueue *q);
static void fastMaintenance(Fast *fast);
static MprSocket *getFastSocket(FastApp *app);
static void copyFastInner(HttpPacket *packet, cchar *key, cchar *value, cchar *prefix);
static void copyFastParams(HttpPacket *packet, MprJson *params, cchar *prefix);
static void copyFastVars(HttpPacket *packet, MprHash *vars, cchar *prefix);
static HttpPacket *createFastPacket(HttpQueue *q, int type, HttpPacket *packet);
static MprSocket *createListener(FastApp *app, HttpStream *stream);
static void enableFastConnector(FastRequest *req);
static int fastConnectDirective(MaState *state, cchar *key, cchar *value);
static void fastConnectorIO(FastRequest *req, MprEvent *event);
static void fastConnectorIncoming(HttpQueue *q, HttpPacket *packet);
static void fastConnectorIncomingService(HttpQueue *q);
static void fastConnectorOutgoingService(HttpQueue *q);
static void fastHandlerReapResponse(FastRequest *req);
static void fastHandlerResponse(FastRequest *req, int type, HttpPacket *packet);
static void fastIncomingRequestPacket(HttpQueue *q, HttpPacket *packet);
static void freeFastPackets(HttpQueue *q, ssize bytes);
static Fast *getFast(HttpRoute *route);
static char *getFastToken(MprBuf *buf, cchar *delim);
static FastApp *getFastApp(Fast *fast, HttpStream *stream);
static int getListenPort(MprSocket *socket);
static void fastOutgoingService(HttpQueue *q);
static void idleSocketIO(MprSocket *sp, MprEvent *event);
static void killFastApp(FastApp *app);
static void manageFast(Fast *fast, int flags);
static void manageFastApp(FastApp *app, int flags);
static void manageFastRequest(FastRequest *fastConnector, int flags);
static int fastOpenRequest(HttpQueue *q);
static bool parseFastHeaders(FastRequest *req, HttpPacket *packet);
static bool parseFastResponseLine(HttpPacket *packet);
static void prepFastRequestStart(HttpQueue *q);
static void prepFastRequestParams(HttpQueue *q);
static void reapSignalHandler(FastApp *app, MprSignal *sp);
static FastApp *startFastApp(Fast *fast, HttpStream *stream);

#if ME_DEBUG
static void fastInfo(void *ignored, MprSignal *sp);
#endif

/************************************* Code ***********************************/
/*
    Loadable module initialization
 */
PUBLIC int httpFastInit(Http *http, MprModule *module)
{
    HttpStage *handler, *connector;

    /*
        Add configuration file directives
     */
    maAddDirective("FastConnect", fastConnectDirective);

    /*
        Create FastCGI handler to respond to client requests
     */
    if ((handler = httpCreateHandler("fastHandler", module)) == 0) {
        return MPR_ERR_CANT_CREATE;
    }
    http->fastHandler = handler;
    handler->close = fastCloseRequest;
    handler->open = fastOpenRequest;
    handler->incoming = fastIncomingRequestPacket;
    handler->outgoingService = fastOutgoingService;

    /*
        Create FastCGI connector. The connector manages communication to the FastCGI application.
        The Fast handler is the head of the pipeline while the Fast connector is
        after the Http protocol and tailFilter.
     */
    if ((connector = httpCreateConnector("fastConnector", NULL)) == 0) {
        return MPR_ERR_CANT_CREATE;
    }
    http->fastConnector = connector;
    connector->incoming = fastConnectorIncoming;
    connector->incomingService = fastConnectorIncomingService;
    connector->outgoingService = fastConnectorOutgoingService;

    fasts = mprCreateList(0, 0);
    mprAddRoot(fasts);
    mprAddTerminator(fastTerminator);

#if ME_DEBUG
    mprAddRoot(mprAddSignalHandler(ME_SIGINFO, fastInfo, 0, 0, MPR_SIGNAL_AFTER));
#endif
    return 0;
}


/*
    Kill every launched FastCGI application on shutdown.

    A FastCGI application started via "FastConnect ... launch" is forked by this process but is not
    in its process group and is not killed with it. Without this it outlives the server and lingers
    holding the listening socket it inherited.
 */
static void fastTerminator(int state, int exitStrategy, int status)
{
    Fast    *fast;
    FastApp *app;
    int     next, nextApp;

    if (state < MPR_STOPPING) {
        return;
    }
    for (ITERATE_ITEMS(fasts, fast, next)) {
        lock(fast);
        for (ITERATE_ITEMS(fast->apps, app, nextApp)) {
            killFastApp(app);
        }
        for (ITERATE_ITEMS(fast->idleApps, app, nextApp)) {
            killFastApp(app);
        }
        unlock(fast);
    }
}


/*
    Open the fastHandler for a new client request
 */
static int fastOpenRequest(HttpQueue *q)
{
    HttpStream  *stream;
    MprSocket   *socket;
    Fast        *fast;
    FastApp     *app;
    FastRequest *req;

    stream = q->stream;

    httpTrimExtraPath(stream);
    httpMapFile(stream);
    httpCreateCGIParams(stream);

    /*
        Get a Fast instance for this route. First time, this will allocate a new Fast instance. Second and
        subsequent times, will reuse the existing instance.
     */
    fast = getFast(stream->rx->route);

    /*
        Get a FastApp instance. This will reuse an existing FastCGI app if possible. Otherwise,
        it will launch a new FastCGI app if within limits. Otherwise it will wait until one becomes available.
     */
    if ((app = getFastApp(fast, stream)) == 0) {
        httpError(stream, HTTP_CODE_NOT_FOUND, "Cannot allocate FastCGI app for route %s", stream->rx->route->pattern);
        return MPR_ERR_CANT_OPEN;
    }

    /*
        Open a dedicated client socket to the FastCGI app
     */
    if ((socket = getFastSocket(app)) == NULL) {
        /*
            Emit 502, not 500, when the gateway could not be executed: the fault is the upstream program's
            absence, not an error inside this server. Matches what the CGI handler returns for the
            same condition.
         */
        if (app->noexec) {
            httpError(stream, HTTP_CODE_BAD_GATEWAY, "Cannot execute FastCGI program");
        } else {
            httpError(stream, HTTP_CODE_INTERNAL_SERVER_ERROR, "Cannot connect to fast app: %d", errno);
        }
        return MPR_ERR_CANT_CONNECT;
    }

    req = allocFastRequest(app, stream, socket);
    mprAddItem(app->requests, req);
    q->queueData = q->pair->queueData = req;

    /*
        The app can die between being launched and this request being registered on it. 
        Re-check now that the request is registered. After this point the reap handler owns the
        notification and there is no window.
     */
    if (app->destroyed || app->exitStatus >= 0) {
        if (app->noexec) {
            httpError(stream, HTTP_CODE_BAD_GATEWAY, "Cannot execute FastCGI program");
        } else {
            httpError(stream, HTTP_CODE_BAD_GATEWAY, "FastCGI app exited before serving the request");
        }
        return MPR_ERR_CANT_CONNECT;
    }

    /*
        Send a start request followed by the request parameters
     */
    prepFastRequestStart(q);
    prepFastRequestParams(q);
    httpServiceQueue(req->connWriteq);
    enableFastConnector(req);
    return 0;
}


/*
    Release an app and req when the request completes. This closes the connection to the FastCGI app.
    It will destroy the FastCGI app on errors.
 */
static void fastCloseRequest(HttpQueue *q)
{
    Fast        *fast;
    FastRequest *req;
    FastApp     *app;
    cchar       *msg;

    req = q->queueData;
    fast = req->fast;
    app = req->app;

    lock(fast);

    if (req->socket) {
        if (!fast->keep) {
            mprCloseSocket(req->socket, 1);
        } else if (!(req->socket->flags & (MPR_SOCKET_EOF | MPR_SOCKET_DISCONNECTED))) {
            mprRemoveSocketHandler(req->socket);
            mprPushItem(app->sockets, req->socket);
            if (fast->keep) {
                mprAddSocketHandler(req->socket, MPR_READABLE, NULL, idleSocketIO, req->socket, 0);
            }
        }
    }
    mprRemoveItem(app->requests, req);

    if (--app->inUse <= 0) {
        if (mprRemoveItem(fast->apps, app) < 0) {
            httpLog(app->trace, "fast", "error", "msg:Cannot find app in list");
        }
        msg = "Release FastCGI app";
        if (app->pid) {
            if (fast->maxRequests < MAXINT64 && app->nextID >= fast->maxRequests) {
                app->destroy = 1;
            }
            if (app->destroy) {
                msg = "Kill FastCGI app";
                killFastApp(app);
            }
        }
        if (app->destroy) {
            closeAppSockets(app);
        } else {
            mprAddItem(fast->idleApps, app);
            app->lastActive = mprGetTicks();
        }
        httpLog(app->trace, "fast", "context",
                "msg:%s, pid:%d, idle:%d, active:%d, id:%d, destroy:%d, nextId:%lld",
                msg, app->pid, mprGetListLength(fast->idleApps), mprGetListLength(fast->apps),
                req->id, app->destroy, app->nextID);
        mprSignalCond(fast->cond);
    }
    unlock(fast);
}


static Fast *allocFast(void)
{
    Fast *fast;

    fast = mprAllocObj(Fast, manageFast);
    fast->magic = FAST_MAGIC;
    fast->apps = mprCreateList(0, 0);
    fast->idleApps = mprCreateList(0, 0);
    fast->mutex = mprCreateLock();
    fast->cond = mprCreateCond();
    fast->multiplex = FAST_MAX_MULTIPLEX;
    fast->maxRequests = FAST_MAX_REQUESTS;
    fast->minApps = FAST_MIN_APPS;
    fast->maxApps = FAST_MAX_APPS;
    fast->ip = sclone("127.0.0.1");
    fast->port = 0;
    fast->keep = 1;
    fast->appTimeout = FAST_APP_TIMEOUT;
    mprAddItem(fasts, fast);
    fast->timer = mprCreateTimerEvent(NULL, "fast-watchdog", FAST_WATCHDOG_TIMEOUT, fastMaintenance, fast,
                                      MPR_EVENT_QUICK);
    return fast;
}


static void manageFast(Fast *fast, int flags)
{
    if (flags & MPR_MANAGE_MARK) {
        mprMark(fast->cond);
        mprMark(fast->endpoint);
        mprMark(fast->idleApps);
        mprMark(fast->ip);
        mprMark(fast->launch);
        mprMark(fast->mutex);
        mprMark(fast->apps);
        mprMark(fast->timer);
    }
}


static void fastMaintenance(Fast *fast)
{
    FastApp  *app;
    MprTicks now;
    int      count, next;

    lock(fast);
    now = mprGetTicks();
    count = mprGetListLength(fast->apps) + mprGetListLength(fast->idleApps);

    /*
        Prune idle apps. Rely on the HTTP service timer to prune inactive requests, then the app will be returned to
           idleApps.
     */
    for (ITERATE_ITEMS(fast->idleApps, app, next)) {
        if (app->pid && app->destroy) {
            killFastApp(app);

        } else if (app->pid && ((now - app->lastActive) > fast->appTimeout)) {
            if (count-- > fast->minApps) {
                killFastApp(app);
            }
        }
    }
    unlock(fast);
}


/*
    Get the fast structure for a route and save in "extended". Allocate if required.
    One Fast instance is shared by all using the route.
 */
static Fast *getFast(HttpRoute *route)
{
    Fast *fast;

    if ((fast = route->extended) == 0) {
        mprGlobalLock();
        if ((fast = route->extended) == 0) {
            fast = route->extended = allocFast();
        }
        mprGlobalUnlock();
    }
    return fast;
}


/*
    POST/PUT incoming body data from the client destined for the CGI gateway. : For POST "form" requests,
    this will be called before the command is actually started.
 */
static void fastIncomingRequestPacket(HttpQueue *q, HttpPacket *packet)
{
    HttpStream  *stream;
    FastRequest *req;

    assert(q);
    assert(packet);
    stream = q->stream;

    if ((req = q->queueData) == 0) {
        return;
    }
    if (packet->flags & HTTP_PACKET_END) {
        /* End of input */
        httpFinalizeInput(stream);
        if (stream->rx->remainingContent > 0) {
            httpError(stream, HTTP_CODE_BAD_REQUEST, "Client supplied insufficient body data");
            packet = createFastPacket(q, FAST_ABORT_REQUEST, httpCreateDataPacket(0));
        }
    }
    createFastPacket(q, FAST_STDIN, packet);
    httpPutForService(req->connWriteq, packet, HTTP_SCHEDULE_QUEUE);

    /*
        Body packets are sent to this routine directly, so stream->readq->count never increments and the generic
        room test upstream always finds space no matter how far behind the FastCGI app is. Suspend the read queue
        while the app is behind; fastConnectorOutgoingService resumes it as the connection drains. 
     */
    if (req->socket && req->connWriteq->count >= req->connWriteq->max) {
        httpSuspendQueue(q);
    }
}


static void fastOutgoingService(HttpQueue *q)
{
    HttpPacket  *packet;
    FastRequest *req;

    req = q->queueData;

    for (packet = httpGetPacket(q); packet; packet = httpGetPacket(q)) {
        if (!httpWillNextQueueAcceptPacket(q, packet)) {
            httpPutBackPacket(q, packet);
            return;
        }
        httpPutPacketToNext(q, packet);
    }
    if (!(req->eventMask & MPR_READABLE)) {
        enableFastConnector(req);
    }
}


static void fastHandlerReapResponse(FastRequest *req)
{
    HttpNet *net;

    net = req->stream->net;
    fastHandlerResponse(req, FAST_REAP, NULL);
    httpServiceNetQueues(net, 0);
}


/*
    Handle response messages from the FastCGI app
 */
static void fastHandlerResponse(FastRequest *req, int type, HttpPacket *packet)
{
    HttpStream *stream;
    HttpRx     *rx;
    MprBuf     *buf;
    int        status, protoStatus;

    stream = req->stream;

    if (stream->state <= HTTP_STATE_BEGIN || stream->rx->route == NULL) {
        /* Request already complete and stream has been recycled (prepared for next request) */
        return;
    }
    if (type == FAST_COMMS_ERROR) {
        httpError(stream, HTTP_ABORT | HTTP_CODE_COMMS_ERROR, "FastRequest: comms error");

    } else if (type == FAST_REAP) {
        /*
            The app died before answering
         */
        if (req->app && req->app->noexec) {
            httpError(stream, HTTP_CODE_BAD_GATEWAY, "Cannot execute FastCGI program");
        } else {
            httpError(stream, HTTP_ABORT | HTTP_CODE_COMMS_ERROR, "FastRequest: process killed error");
        }

    } else if (type == FAST_END_REQUEST && packet) {
        if (httpGetPacketLength(packet) < 8) {
            httpError(stream, HTTP_CODE_BAD_GATEWAY, "FastCGI bad request end packet");
            return;
        }
        buf = packet->content;
        rx = stream->rx;

        status = mprGetCharFromBuf(buf) << 24 | mprGetCharFromBuf(buf) << 16 |
                 mprGetCharFromBuf(buf) << 8  | mprGetCharFromBuf(buf);
        protoStatus = mprGetCharFromBuf(buf);
        mprAdjustBufStart(buf, 3);

        if (protoStatus == FAST_REQUEST_COMPLETE) {
            httpLog(stream->trace, "rx.fast", "context", "msg:Request complete, id:%d, status:%d", req->id, status);

        } else if (protoStatus == FAST_CANT_MPX_CONN) {
            httpError(stream, HTTP_CODE_BAD_GATEWAY, "FastCGI cannot multiplex requests %s", rx->uri);
            return;

        } else if (protoStatus == FAST_OVERLOADED) {
            httpError(stream, HTTP_CODE_SERVICE_UNAVAILABLE, "FastCGI overloaded %s", rx->uri);
            return;

        } else if (protoStatus == FAST_UNKNOWN_ROLE) {
            httpError(stream, HTTP_CODE_BAD_GATEWAY, "FastCGI unknown role %s", rx->uri);
            return;
        }
        httpLog(stream->trace, "rx.fast.eof", "detail", "msg:FastCGI end request, id:%d", req->id);
        checkFastLength(req);
        httpFinalizeOutput(stream);

    } else if (type == FAST_STDOUT && packet) {
        if (!req->parsedHeaders) {
            if (!parseFastHeaders(req, packet)) {
                return;
            }
            req->parsedHeaders = 1;
        }
        if (httpGetPacketLength(packet) > 0) {
            req->bodyBytes += httpGetPacketLength(packet);
            if (req->declaredLength >= 0 && req->bodyBytes > req->declaredLength) {
                /* Overrun. Do not forward bytes the framing statement does not cover */
                checkFastLength(req);
                return;
            }
            // httpPutPacketToNext(stream->writeq, packet);
            httpPutForService(stream->writeq, packet, HTTP_SCHEDULE_QUEUE);
            httpServiceQueue(stream->writeq);
        }
    }
}


/*
    Reconcile the Content-Length the FastCGI app declared against the body bytes it actually produced.
    The declared value frames the response and disables chunking, so a disagreement puts bytes on the
    wire that do not match the response's own framing statement. 
 */
static void checkFastLength(FastRequest *req)
{
    HttpStream *stream;

    stream = req->stream;
    if (req->declaredLength < 0 || req->bodyBytes == req->declaredLength) {
        return;
    }
    if (stream->error || stream->tx->finalizedOutput) {
        return;
    }
    httpLog(stream->trace, "rx.fast.error", "error",
            "msg:FastCGI Content-Length mismatch, declared:%lld, sent:%lld", req->declaredLength, req->bodyBytes);
    httpError(stream, HTTP_CLOSE | HTTP_CODE_BAD_GATEWAY, "FastCGI response length mismatch");
}


/*
    Parse the FastCGI app output headers. Sample FastCGI program output:
        Content-type: text/html
        <html.....
 */
static bool parseFastHeaders(FastRequest *req, HttpPacket *packet)
{
    HttpStream  *stream;
    MprBuf      *buf;
    char        *endHeaders, *headers, *key, *value;
    int64       length;
    ssize       blen, len;
    int         status;

    stream = packet->stream;
    buf = packet->content;
    headers = mprGetBufStart(buf);
    value = 0;

    headers = mprGetBufStart(buf);
    blen = mprGetBufLength(buf);
    len = 0;

    if ((endHeaders = sncontains(headers, "\r\n\r\n", blen)) == NULL) {
        if ((endHeaders = sncontains(headers, "\n\n", blen)) == NULL) {
            if (slen(headers) < ME_MAX_HEADERS) {
                // Not EOF and less than max headers and have not yet seen an end of headers delimiter
                httpLog(stream->trace, "rx.fast", "detail", "msg:FastCGI incomplete headers, id:%d", req->id);
                return 0;
            }
        }
        len = 2;
    } else {
        len = 4;
    }
    /*
        Split the headers from the body. Add null to ensure we can search for line terminators.
     */
    if (endHeaders) {
        endHeaders[len - 1] = '\0';
        endHeaders += len;
    }

    /*
        Want to be tolerant of FastCGI programs that omit the status line.
     */
    if (strncmp((char*) buf->start, "HTTP/1.", 7) == 0) {
        if (!parseFastResponseLine(packet)) {
            /* httpError already called */
            return 0;
        }
    }
    if (endHeaders && strchr(mprGetBufStart(buf), ':')) {
        while (mprGetBufLength(buf) > 0 && buf->start[0] && (buf->start[0] != '\r' && buf->start[0] != '\n')) {
            if ((key = getFastToken(buf, ":")) == 0) {
                key = "Bad Header";
            }
            value = getFastToken(buf, "\n");
            while (isspace((uchar) * value)) {
                value++;
            }
            len = (int) strlen(value);
            while (len > 0 && (value[len - 1] == '\r' || value[len - 1] == '\n')) {
                value[len - 1] = '\0';
                len--;
            }
            if (schr(value, '\r') || schr(value, '\n')) {
                httpError(stream, HTTP_CODE_BAD_GATEWAY, "FastCGI response header contains a control character");
                return 0;
            }
            httpLog(stream->trace, "rx.fast", "detail", "key:%s, value: %s", key, value);

            if (scaselesscmp(key, "location") == 0) {
                httpRedirect(stream, HTTP_CODE_MOVED_TEMPORARILY, value);

            } else if (scaselesscmp(key, "status") == 0) {
                /*
                    A 1xx is not a final status. It makes the response body-less while the app is still
                    writing a body, so only a final status can be relayed to the client.
                 */
                if ((status = httpParseStatus(value)) < HTTP_CODE_OK) {
                    httpError(stream, HTTP_CODE_BAD_GATEWAY, "Bad FastCGI status: %s", value);
                    return 0;
                }
                httpSetStatus(stream, status);

            } else if (scaselesscmp(key, "content-type") == 0) {
                if (stream->tx->charSet && !scaselesscontains(value, "charset")) {
                    httpSetHeader(stream, "Content-Type", "%s; charset=%s", value, stream->tx->charSet);
                } else {
                    httpSetHeaderString(stream, "Content-Type", value);
                }

            } else if (scaselesscmp(key, "transfer-encoding") == 0) {
                /*
                    A message carrying both Content-Length and Transfer-Encoding is a framing conflict.
                 */
                httpError(stream, HTTP_CODE_BAD_GATEWAY,
                          "FastCGI response declares an unsupported Transfer-Encoding");
                return 0;

            } else if (scaselesscmp(key, "content-length") == 0) {
                if (httpParseDigits(value, &length) < 0) {
                    httpError(stream, HTTP_CODE_BAD_GATEWAY, "Bad FastCGI Content-Length: %s", value);
                    return 0;
                }
                req->declaredLength = (MprOff) length;
                httpSetContentLength(stream, req->declaredLength);
                httpSetChunkSize(stream, 0);

            } else {
                /* Now pass all other headers back to the client */
                key = ssplit(key, ":\r\n\t ", NULL);
                httpSetHeaderString(stream, key, value);
            }
        }
        buf->start = endHeaders;
    }
    return 1;
}


/*
    Parse the FCGI output first line
 */
static bool parseFastResponseLine(HttpPacket *packet)
{
    MprBuf *buf;
    char   *protocol, *status, *msg;

    buf = packet->content;
    protocol = getFastToken(buf, " ");
    if (protocol == 0 || protocol[0] == '\0') {
        httpError(packet->stream, HTTP_CODE_BAD_GATEWAY, "Bad FCGI HTTP protocol response");
        return 0;
    }
    if (strncmp(protocol, "HTTP/1.", 7) != 0) {
        httpError(packet->stream, HTTP_CODE_BAD_GATEWAY, "Unsupported FCGI protocol");
        return 0;
    }
    status = getFastToken(buf, " ");
    if (status == 0 || *status == '\0') {
        httpError(packet->stream, HTTP_CODE_BAD_GATEWAY, "Bad FCGI header response");
        return 0;
    }
    msg = getFastToken(buf, "\n");
    mprLog("http cgi", 4, "FCGI response status: %s %s %s", protocol, status, msg);
    return 1;
}


/*
    Get the next input token. The content buffer is advanced to the next token. This routine always returns a
    non-zero token. The empty string means the delimiter was not found.
 */
static char *getFastToken(MprBuf *buf, cchar *delim)
{
    char  *token, *nextToken;
    ssize len;

    len = mprGetBufLength(buf);
    if (len == 0) {
        return "";
    }
    token = mprGetBufStart(buf);
    nextToken = sncontains(mprGetBufStart(buf), delim, len);
    if (nextToken) {
        *nextToken = '\0';
        len = (int) strlen(delim);
        nextToken += len;
        buf->start = nextToken;

    } else {
        buf->start = mprGetBufEnd(buf);
    }
    return token;
}


/************************************************ FastApp
 ***************************************************************/
/*
    The FastApp represents the connection to a single FastCGI app instance
 */
static FastApp *allocFastApp(Fast *fast, HttpStream *stream)
{
    FastApp *app;

    app = mprAllocObj(FastApp, manageFastApp);
    app->fast = fast;
    app->trace = stream->net->trace;
    app->requests = mprCreateList(0, 0);
    app->sockets = mprCreateList(0, 0);
    app->port = fast->port;
    app->ip = fast->ip;
    app->exitStatus = -1;

    /*
        The requestID must start at 1 by spec
     */
    app->nextID = 1;
    return app;
}


static void closeAppSockets(FastApp *app)
{
    MprSocket *socket;
    int       next;

    for (ITERATE_ITEMS(app->sockets, socket, next)) {
        mprCloseSocket(socket, 1);
    }
}


static void manageFastApp(FastApp *app, int flags)
{
    if (flags & MPR_MANAGE_MARK) {
        mprMark(app->fast);
        mprMark(app->signal);
        mprMark(app->sockets);
        mprMark(app->requests);
        mprMark(app->trace);
        mprMark(app->ip);
    }
}


static FastApp *getFastApp(Fast *fast, HttpStream *stream)
{
    FastApp  *app;
    MprTicks timeout;
    int      next;

    lock(fast);
    app = NULL;
    timeout = mprGetTicks() +  FAST_WAIT_TIMEOUT;

    /*
        Locate a FastApp to serve the request. Use an idle app first. If none available, start a new app
        if under the limits. Otherwise, wait for one to become available.
     */
    while (!app && mprGetTicks() < timeout) {
        for (ITERATE_ITEMS(fast->idleApps, app, next)) {
            if (app->destroy || app->destroyed) {
                continue;
            }
            mprRemoveItemAtPos(fast->idleApps, next - 1);
            mprAddItem(fast->apps, app);
            break;
        }
        if (!app) {
            if (mprGetListLength(fast->apps) < fast->maxApps) {
                if ((app = startFastApp(fast, stream)) != 0) {
                    mprAddItem(fast->apps, app);
                }
                break;

            } else {
                for (ITERATE_ITEMS(fast->apps, app, next)) {
                    if (mprGetListLength(app->requests) < fast->multiplex) {
                        break;
                    }
                }
                if (app) {
                    break;
                }
                unlock(fast);
                mprYield(MPR_YIELD_STICKY);

                mprWaitForCond(fast->cond, TPS);

                mprResetYield();
                lock(fast);
                mprLog("fast", 0, "Waiting for fastCGI app to become available, running %d", mprGetListLength(
                           fast->apps));
#if ME_DEBUG
                fastInfo(NULL, NULL);
#endif
            }
        }
    }
    if (app) {
        app->lastActive = mprGetTicks();
        app->inUse++;
    } else {
        mprLog("fast", 0, "Cannot acquire available fastCGI app, running %d", mprGetListLength(fast->apps));
    }
    unlock(fast);
    return app;
}


/*
    Start a new FastCGI app process. Called with lock(fast)
 */
static FastApp *startFastApp(Fast *fast, HttpStream *stream)
{
    FastApp   *app;
    MprSocket *listen;
    cchar     **argv, *command;
    ssize     nbytes;
    int       argc, i, execStatus[2], execErrno;

#if KEEP
    cchar **envv;
    int   count;
#endif

    app = allocFastApp(fast, stream);

    if (fast->launch) {
        argc = 1;
        if ((command = buildFastArgs(app, stream, &argc, &argv)) == 0) {
            httpError(stream, HTTP_CODE_NOT_FOUND, "Cannot find Fast app command");
            return NULL;
        }
#if KEEP
        /*
            Build environment variables. Currently use only the server env vars.
         */
        count = mprGetHashLength(stream->rx->svars);
        if ((envv = mprAlloc((count + 2) * sizeof(char*))) != 0) {
            count = prepFastEnv(stream, envv, stream->rx->svars);
        }
#endif
        httpLog(app->trace, "fast", "context", "msg:Start FastCGI app, command:%s", command);

        if ((listen = createListener(app, stream)) == NULL) {
            return NULL;
        }
        if (!app->signal) {
            app->signal = mprAddSignalHandler(SIGCHLD, reapSignalHandler, app, NULL, MPR_SIGNAL_BEFORE);
        }
        /*
            Exec status pipe. The child's write end is close-on-exec, so a successful execve closes it
            and the parent reads EOF; a failed execve writes errno instead. The parent must know which
            happened before it hands the app to a request, and waiting for SIGCHLD is too late: the
            child holds the listening socket it was given, so until it exits the parent's connect()
            completes against the backlog of a socket that is already doomed. The request is then
            written into a connection the kernel has reset, which aborts it -- the client gets a dropped
            connection where it is owed a 502. Which side wins that race is scheduling, so the same
            missing launch program answered 502 on macOS and nothing at all on Linux.
         */
        if (pipe(execStatus) < 0) {
            httpError(stream, HTTP_CODE_INTERNAL_SERVER_ERROR, "Cannot create FastCGI exec status pipe");
            return NULL;
        }
        fcntl(execStatus[1], F_SETFD, FD_CLOEXEC);

        if ((app->pid = fork()) < 0) {
            close(execStatus[0]);
            close(execStatus[1]);
            httpError(stream, HTTP_CODE_INTERNAL_SERVER_ERROR, "Cannot fork for FastCGI");
            return NULL;

        } else if (app->pid == 0) {
            // Child. Close the read end first: it may hold fd 0, which the listener is about to take.
            close(execStatus[0]);
            dup2(listen->fd, 0);

            /*
                When debugging, keep stdout/stderr open so printf/fprintf from the FastCGI app will show in the console.
                The exec status pipe must survive to report a failed execve, so it is exempt.
             */
            for (i = FAST_DEBUG ? 3 : 1; i < 128; i++) {
                if (i != execStatus[1]) {
                    close(i);
                }
            }
            execve(command, (char**) argv, (char**) NULL);
            execErrno = errno;
            if (write(execStatus[1], &execErrno, sizeof(execErrno)) < 0) {
            }
            _exit(FAST_EXIT_NOEXEC);
        } else {
            //  Close without a shutdown as this is duped for the child
            close(listen->fd);
            listen->fd = -1;
            close(execStatus[1]);

            /*
                Blocks only until the child execs or dies -- both close the write end -- so it cannot
                outlast the fork it is reporting on.
             */
            execErrno = 0;
            do {
                nbytes = read(execStatus[0], &execErrno, sizeof(execErrno));
            } while (nbytes < 0 && errno == EINTR);
            close(execStatus[0]);

            if (nbytes > 0) {
                /*
                    A deployment fault the operator has to see by name -- at level 0, where a production
                    error log will carry it -- because from the outside it presents as the site being down.
                 */
                mprLog("error fast", 0, "Cannot execute FastCGI program \"%s\": %s. Check the FastConnect "
                       "launch path exists and is executable.", command, strerror(execErrno));
                app->noexec = 1;
                app->destroyed = 1;
            } else {
                httpLog(app->trace, "fast", "context", "msg:FastCGI started app, command:%s, pid:%d", command,
                        app->pid);
            }
        }
    }
    return app;
}


/*
    Build the command arguments for the FastCGI app
 */
static cchar *buildFastArgs(FastApp *app, HttpStream *stream, int *argcp, cchar ***argvp)
{
    Fast   *fast;
    HttpRx *rx;
    HttpTx *tx;
    cchar  *actionProgram, *fileName, *mimeType;
    char   **argv;
    ssize  len;
    int    argc, argind;

    fast = app->fast;
    rx = stream->rx;
    tx = stream->tx;
    fileName = tx->filename;

    actionProgram = 0;
    argind = 0;
    argc = *argcp;

    if (fast->launch && fast->launch[0]) {
        if (mprMakeArgv(fast->launch, (cchar***) &argv, 0) != 1) {
            mprLog("fast error", 0, "Cannot parse FastCGI launch command %s", fast->launch);
            return 0;
        }
        actionProgram = argv[0];
        argc++;

    } else if (tx->ext) {
        /*
            Action is keyed by MIME type, so the extension must be resolved to one first. See the
            same call in cgiHandler.c: mprGetMimeProgram matches on the type, so an extension passed
            here matches nothing and no interpreter is ever selected.
         */
        mimeType = mprLookupMime(rx->route->mimeTypes, tx->ext);
        actionProgram = mprGetMimeProgram(rx->route->mimeTypes, mimeType);
        if (actionProgram != 0) {
            argc++;
        }
    }
    /*
        No ISINDEX arguments. A FastCGI app is a persistent server launched once and then reused for
        every request on the route, so anything taken from the launching request lands in the argv of
        a process that goes on to serve requests that know nothing about it -- the app's command line
        would be decided by whichever request happened to arrive first.

        It is also destructive. A non-option argument is by convention the endpoint a FastCGI app
        should listen on, so "GET /fast-bin/app?a+b+c" launched the app as "app a b c" and the app
        closed the descriptor it had been handed to open "a" instead. The request that launched it
        then waited forever on a socket nobody would accept, the route's one app slot stayed occupied
        by that request, and every later request to the route timed out waiting for a free app and was
        answered 404 Cannot allocate FastCGI app. The whole route failed for the life of the server,
        and which request launched the app is a race -- so it failed about one run in ten.

        The request is carried in FCGI_PARAMS, where a FastCGI app reads it. CGI keeps ISINDEX
        (cgiHandler.c, RFC 3875 4.4): a CGI program is forked per request, so there the arguments
        belong to the request that supplied them.
     */
    len = (argc + 1) * sizeof(char*);
    argv = mprAlloc(len);

    if (actionProgram) {
        argv[argind++] = sclone(actionProgram);
    }
    argv[argind++] = sclone(fileName);
    assert(argind <= argc);
    argv[argind] = 0;
    *argcp = argc;
    *argvp = (cchar**) argv;
    return argv[0];
}


/*
    Proxy process has died, so reap the status and inform relevant streams.
    WARNING: this may be called before all the data has been read from the socket, so we must not set eof = 1 here.
    WARNING: runs on the MPR dispatcher. Everyting must be "fast" locked.
 */
static void reapSignalHandler(FastApp *app, MprSignal *sp)
{
    Fast        *fast;
    FastRequest *req;
    int         next, status;

    fast = app->fast;

    lock(fast);
    if (app->pid && waitpid(app->pid, &status, WNOHANG) == app->pid) {
        app->exitStatus = WIFEXITED(status) ? WEXITSTATUS(status) : -1;
        httpLog(app->trace, "fast", app->exitStatus == 0 ? "context" : "error",
                "msg:FastCGI exited, pid:%d, status:%d", app->pid, app->exitStatus);
        if (app->signal) {
            mprRemoveSignalHandler(app->signal);
            app->signal = 0;
        }
        if (mprLookupItem(app->fast->idleApps, app) >= 0) {
            mprRemoveItem(app->fast->idleApps, app);
        }
        app->destroyed = 1;
        app->pid = 0;
        closeAppSockets(app);

        /*
            Notify all requests on their relevant dispatcher
            Introduce a short delay (1) in the unlikely event that a FastCGI program witout keep alive exits and we
            get notified before the I/O response is received.
         */
        for (ITERATE_ITEMS(app->requests, req, next)) {
            mprCreateLocalEvent(req->stream->dispatcher, "fast-reap", 0, fastHandlerReapResponse, req, 10);
        }
    }
    unlock(fast);
}


/*
    Kill the FastCGI app due to error or maxRequests limit being exceeded
 */
static void killFastApp(FastApp *app)
{
    lock(app->fast);
    if (app->pid) {
        httpLog(app->trace, "fast", "context", "msg:Kill FastCGI process, pid:%d", app->pid);
        if (app->pid) {
            kill(app->pid, SIGTERM);
            app->destroyed = 1;
        }
    }
    unlock(app->fast);
}


/*
    Create a socket connection to the FastCGI app. Retry if the FastCGI is not yet ready.
 */
static MprSocket *getFastSocket(FastApp *app)
{
    MprSocket *socket;
    MprTicks  timeout;
    int       backoff, connected;

    connected = 0;
    backoff = 1;

    while ((socket = mprPopItem(app->sockets)) != 0) {
        mprRemoveSocketHandler(socket);
        if (socket->flags & (MPR_SOCKET_EOF | MPR_SOCKET_DISCONNECTED)) {
            continue;
        }
        return socket;
    }
    timeout = mprGetTicks() + FAST_CONNECT_TIMEOUT;
    while (!app->destroyed) {
        httpLog(app->trace, "fast.rx", "request", "FastCGI connect, ip:%s, port:%d", app->ip, app->port);
        socket = mprCreateSocket();
        if (mprConnectSocket(socket, app->ip, app->port, MPR_SOCKET_NODELAY) == 0) {
            connected = 1;
            break;
        }
        /*
            A launched app that has already been reaped is not going to start listening
         */
        if (app->fast->launch && app->exitStatus >= 0) {
            break;
        }
        if (mprGetTicks() >= timeout) {
            break;
        }
        //  WARNING: yields
        mprSleep(backoff);
        backoff = backoff * 2;
        if (backoff > 50) {
            mprLog("fast", 2, "FastCGI retry connect to %s:%d", app->ip, app->port);
            if (backoff > 2000) {
                backoff = 2000;
            }
        }
    }
    if (!connected) {
        mprLog("fast error", 0, "Cannot connect to FastCGI at %s port %d", app->ip, app->port);
        socket = 0;
    }
    return socket;
}


/*
    Add the FastCGI spec packet header to the packet->prefix
    See the spec at https://github.com/fast-cgi/spec/blob/master/spec.md
 */
static HttpPacket *createFastPacket(HttpQueue *q, int type, HttpPacket *packet)
{
    FastRequest *req;
    uchar       *buf;
    ssize       len, pad;

    req = q->queueData;
    if (!packet) {
        packet = httpCreateDataPacket(0);
    }
    len = httpGetPacketLength(packet);

    packet->prefix = mprCreateBuf(16, 16);
    buf = (uchar*) packet->prefix->start;
    *buf++ = FAST_VERSION;
    *buf++ = type;

    assert(req->id);
    *buf++ = (uchar) (req->id >> 8);
    *buf++ = (uchar) (req->id & 0xFF);

    *buf++ = (uchar) (len >> 8);
    *buf++ = (uchar) (len & 0xFF);

    /*
        Use 8 byte padding alignment
     */
    pad = (len % 8) ? (8 - (len % 8)) : 0;
    assert(pad < 8);

    if (pad > 0) {
        if (mprGetBufSpace(packet->content) < pad) {
            mprGrowBuf(packet->content, pad);
        }
        mprAdjustBufEnd(packet->content, pad);
    }
    *buf++ = (uchar) pad;
    mprAdjustBufEnd(packet->prefix, 8);

    httpLog(req->trace, "tx.fast", "packet", "msg:FastCGI tx packet, type:%s, id:%d, lenth:%ld", fastTypes[type],
            req->id, len);
    return packet;
}


static void prepFastRequestStart(HttpQueue *q)
{
    HttpPacket  *packet;
    FastRequest *req;
    uchar       *buf;

    req = q->queueData;
    packet = httpCreateDataPacket(16);
    buf = (uchar*) packet->content->start;
    *buf++ = 0;
    *buf++ = FAST_RESPONDER;
    *buf++ = req->fast->keep ? FAST_KEEP_CONN : 0;

    // Reserved bytes
    buf += 5;
    mprAdjustBufEnd(packet->content, 8);
    httpPutForService(req->connWriteq, createFastPacket(q, FAST_BEGIN_REQUEST, packet), HTTP_SCHEDULE_QUEUE);
}


static void prepFastRequestParams(HttpQueue *q)
{
    FastRequest *req;
    HttpStream  *stream;
    HttpPacket  *packet;
    HttpRx      *rx;

    req = q->queueData;
    stream = q->stream;
    rx = stream->rx;

    packet = httpCreateDataPacket(stream->limits->headerSize);
    packet->data = req;

    //  This is an Apache compatible hack for PHP 5.3
    //  mprAddKey(rx->headers, "REDIRECT_STATUS", itos(HTTP_CODE_MOVED_TEMPORARILY));

    copyFastParams(packet, rx->params, rx->route->envPrefix);
    copyFastVars(packet, rx->svars, "");
    copyFastVars(packet, rx->headers, "HTTP_");

    httpPutForService(req->connWriteq, createFastPacket(q, FAST_PARAMS, packet), HTTP_SCHEDULE_QUEUE);
    httpPutForService(req->connWriteq, createFastPacket(q, FAST_PARAMS, 0), HTTP_SCHEDULE_QUEUE);
}


/************************************************ FastRequest
 ***********************************************************/
/*
    Setup the request. Must be called locked.
 */
static FastRequest *allocFastRequest(FastApp *app, HttpStream *stream, MprSocket *socket)
{
    FastRequest *req;

    req = mprAllocObj(FastRequest, manageFastRequest);
    req->stream = stream;
    req->socket = socket;
    req->declaredLength = -1;
    req->trace = stream->trace;
    req->fast = app->fast;
    req->app = app;

    if (app->nextID >= MAXINT64) {
        app->nextID = 1;
    }
    req->id = app->nextID++ % FAST_MAX_ID;
    if (req->id == 0) {
        req->id = app->nextID++ % FAST_MAX_ID;
    }
    assert(req->id);

    req->connReadq = httpCreateQueue(stream->net, stream, HTTP->fastConnector, HTTP_QUEUE_RX, 0);
    req->connWriteq = httpCreateQueue(stream->net, stream, HTTP->fastConnector, HTTP_QUEUE_TX, 0);

    req->connReadq->max = FAST_Q_SIZE;
    req->connWriteq->max = FAST_Q_SIZE;

    req->connReadq->queueData = req;
    req->connWriteq->queueData = req;
    req->connReadq->pair = req->connWriteq;
    req->connWriteq->pair = req->connReadq;
    return req;
}


static void manageFastRequest(FastRequest *req, int flags)
{
    if (flags & MPR_MANAGE_MARK) {
        mprMark(req->fast);
        mprMark(req->app);
        mprMark(req->connReadq);
        mprMark(req->socket);
        mprMark(req->stream);
        mprMark(req->trace);
        mprMark(req->connWriteq);
    }
}


static void fastConnectorIncoming(HttpQueue *q, HttpPacket *packet)
{
    FastRequest *req;

    req = q->queueData;
    httpPutForService(req->connWriteq, packet, HTTP_SCHEDULE_QUEUE);
}


/*
    Parse an incoming response packet from the FastCGI app
 */
static void fastConnectorIncomingService(HttpQueue *q)
{
    FastRequest *req;
    FastApp     *app;
    HttpPacket  *packet, *tail;
    MprBuf      *buf;
    ssize       contentLength, len, padLength;
    int         requestID, type, version;

    req = q->queueData;
    app = req->app;
    app->lastActive = mprGetTicks();

    while ((packet = httpGetPacket(q)) != 0) {
        buf = packet->content;

        if (mprGetBufLength(buf) < FAST_PACKET_SIZE) {
            // Insufficient data
            httpPutBackPacket(q, packet);
            break;
        }
        version = mprGetCharFromBuf(buf);
        type = mprGetCharFromBuf(buf);
        requestID = (mprGetCharFromBuf(buf) << 8) | (mprGetCharFromBuf(buf) & 0xFF);

        contentLength = (mprGetCharFromBuf(buf) << 8) | (mprGetCharFromBuf(buf) & 0xFF);
        padLength = mprGetCharFromBuf(buf);
        /* reserved */ (void) mprGetCharFromBuf(buf);
        len = contentLength + padLength;

        if (version != FAST_VERSION) {
            httpLog(app->trace, "fast", "error", "msg:Bad FastCGI response version");
            break;
        }
        if (contentLength < 0 || contentLength > 65535) {
            httpLog(app->trace, "fast", "error", "msg:Bad FastCGI content length, length:%ld", contentLength);
            break;
        }
        if (padLength < 0 || padLength > 255) {
            httpLog(app->trace, "fast", "error", "msg:Bad FastCGI pad length, padding:%ld", padLength);
            break;
        }
        if (mprGetBufLength(buf) < len) {
            // Insufficient data
            mprAdjustBufStart(buf, -FAST_PACKET_SIZE);
            httpPutBackPacket(q, packet);
            break;
        }
        packet->type = type;

        httpLog(req->trace, "rx.fast", "packet", "msg:FastCGI rx packet, type:%s, id:%d, length:%ld, padding %ld",
                fastTypes[type], requestID, len, padLength);

        /*
            Split extra data off this packet
         */
        if ((tail = httpSplitPacket(packet, len)) != 0) {
            httpPutBackPacket(q, tail);
        }
        if (padLength) {
            // Discard padding
            mprAdjustBufEnd(packet->content, -padLength);
        }
        if (type == FAST_STDOUT || type == FAST_END_REQUEST) {
            fastHandlerResponse(req, type, packet);

        } else if (type == FAST_STDERR) {
            // Log and discard stderr
            httpLog(app->trace, "fast", "error", "msg:FastCGI stderr, uri:%s, error:%s",
                    req->stream->rx->uri, mprBufToString(packet->content));

        } else {
            httpLog(app->trace, "fast", "error", "msg:FastCGI invalid packet, command:%s, type:%d",
                    req->stream->rx->uri, type);
            app->destroy = 1;
        }
    }
}


/*
    Handle IO events on the network
 */
static void fastConnectorIO(FastRequest *req, MprEvent *event)
{
    Fast       *fast;
    HttpNet    *net;
    HttpPacket *packet;
    ssize      nbytes;

    fast = req->fast;
    net = req->stream->net;

    if (req->eof) {
        // Network connection to client has been destroyed
        return;
    }
    if (event->mask & MPR_WRITABLE) {
        httpServiceQueue(req->connWriteq);
    }
    if (event->mask & MPR_READABLE) {
        lock(fast);
        if (req->socket) {
            packet = httpCreateDataPacket(ME_PACKET_SIZE);
            nbytes = mprReadSocket(req->socket, mprGetBufEnd(packet->content), ME_PACKET_SIZE);
            req->eof = mprIsSocketEof(req->socket);
            if (nbytes > 0) {
                req->bytesRead += nbytes;
                mprAdjustBufEnd(packet->content, nbytes);
                httpJoinPacketForService(req->connReadq, packet, 0);
                httpServiceQueue(req->connReadq);
            }
        }
        unlock(fast);
    }
    req->app->lastActivity = net->http->now;

    httpServiceNetQueues(net, 0);

    if (!req->eof) {
        enableFastConnector(req);
    }
}


/*
    Detect FastCGI closing the idle socket
 */
static void idleSocketIO(MprSocket *sp, MprEvent *event)
{
    mprCloseSocket(sp, 0);
}


static void enableFastConnector(FastRequest *req)
{
    MprSocket  *sp;
    HttpStream *stream;
    int        eventMask;

    lock(req->fast);
    sp = req->socket;
    stream = req->stream;

    if (sp && !req->eof && !(sp->flags & MPR_SOCKET_CLOSED)) {
        eventMask = 0;
        if (req->connWriteq->count > 0) {
            eventMask |= MPR_WRITABLE;
        }
        /*
            We always ingest from the connector and packets are queued at the fastHandler head writeq.
         */
        if (stream->writeq->count < stream->writeq->max) {
            eventMask |= MPR_READABLE;
        }
        if (eventMask) {
            if (sp->handler == 0) {
                mprAddSocketHandler(sp, eventMask, stream->dispatcher, fastConnectorIO, req, 0);
            } else {
                mprWaitOn(sp->handler, eventMask);
            }
        } else if (sp->handler) {
            mprWaitOn(sp->handler, eventMask);
        }
        req->eventMask = eventMask;
    }
    unlock(req->fast);
}


/*
    Send request and post body data to the fastCGI app
 */
static void fastConnectorOutgoingService(HttpQueue *q)
{
    Fast        *fast;
    FastApp     *app;
    FastRequest *req, *cp;
    HttpNet     *net;
    ssize       written;
    int         errCode, next;

    req = q->queueData;
    app = req->app;
    fast = app->fast;
    app->lastActive = mprGetTicks();
    net = q->net;

    if (req->eof || req->socket == 0) {
        return;
    }
    lock(fast);
    req->writeBlocked = 0;

    while (q->first || net->ioIndex) {
        if (net->ioIndex == 0 && buildFastVec(q) <= 0) {
            freeFastPackets(q, 0);
            break;
        }
        written = mprWriteSocketVector(req->socket, net->iovec, net->ioIndex);
        if (written < 0) {
            errCode = mprGetError();
            if (errCode == EAGAIN || errCode == EWOULDBLOCK) {
                /*  Socket full, wait for an I/O event */
                req->writeBlocked = 1;
                break;
            }
            mprSetSocketEof(req->socket, 1);
            req->eof = 1;
            app->destroy = 1;
            httpLog(req->app->trace, "fast", "error", "msg:Write error, errno:%d", errCode);

            for (ITERATE_ITEMS(app->requests, cp, next)) {
                fastHandlerResponse(cp, FAST_COMMS_ERROR, NULL);
            }
            break;

        } else if (written > 0) {
            freeFastPackets(q, written);
            adjustFastVec(net, written);

        } else {
            /* Socket full */
            break;
        }
    }
    req->app->lastActivity = q->net->http->now;

    /*
        Resume reading the request body now the app has taken what fastIncomingRequestPacket queued for it.
     */
    if (q->count < q->max && httpIsQueueSuspended(req->stream->readq)) {
        httpResumeQueue(req->stream->readq, 0);
    }
    enableFastConnector(req);
    unlock(fast);
}


/*
    Build the IO vector. Return the count of bytes to be written. Return -1 for EOF.
 */
static MprOff buildFastVec(HttpQueue *q)
{
    HttpNet    *net;
    HttpPacket *packet;

    net = q->net;
    /*
        Examine each packet and accumulate as many packets into the I/O vector as possible. Leave the packets on
        the queue for now, they are removed after the IO is complete for the entire packet.
     */
    for (packet = q->first; packet; packet = packet->next) {
        if (net->ioIndex >= (ME_MAX_IOVEC - 2)) {
            break;
        }
        if (httpGetPacketLength(packet) > 0 || packet->prefix) {
            addFastPacket(net, packet);
        }
    }
    return net->ioCount;
}


/*
    Add a packet to the io vector. Return the number of bytes added to the vector.
 */
static void addFastPacket(HttpNet *net, HttpPacket *packet)
{
    assert(net->ioIndex < (ME_MAX_IOVEC - 2));

    if (packet->prefix && mprGetBufLength(packet->prefix) > 0) {
        addToFastVector(net, mprGetBufStart(packet->prefix), mprGetBufLength(packet->prefix));
    }
    if (packet->content && mprGetBufLength(packet->content) > 0) {
        addToFastVector(net, mprGetBufStart(packet->content), mprGetBufLength(packet->content));
    }
}


/*
    Add one entry to the io vector
 */
static void addToFastVector(HttpNet *net, char *ptr, ssize bytes)
{
    assert(bytes > 0);

    net->iovec[net->ioIndex].start = ptr;
    net->iovec[net->ioIndex].len = bytes;
    net->ioCount += bytes;
    net->ioIndex++;
}


static void freeFastPackets(HttpQueue *q, ssize bytes)
{
    HttpPacket *packet;
    ssize      len;

    assert(q->count >= 0);
    assert(bytes >= 0);

    while ((packet = q->first) != 0) {
        if (packet->flags & HTTP_PACKET_END) {
            ;
        } else if (bytes > 0) {
            if (packet->prefix) {
                len = mprGetBufLength(packet->prefix);
                len = min(len, bytes);
                mprAdjustBufStart(packet->prefix, len);
                bytes -= len;
                /* Prefixes don't count in the q->count. No need to adjust */
                if (mprGetBufLength(packet->prefix) == 0) {
                    /* Ensure the prefix is not resent if all the content is not sent */
                    packet->prefix = 0;
                }
            }
            if (packet->content) {
                len = mprGetBufLength(packet->content);
                len = min(len, bytes);
                mprAdjustBufStart(packet->content, len);
                bytes -= len;
                q->count -= len;
                assert(q->count >= 0);
            }
        }
        if ((packet->flags & HTTP_PACKET_END) || (httpGetPacketLength(packet) == 0 && !packet->prefix)) {
            /* Done with this packet - consume it */
            httpGetPacket(q);
        } else {
            /* Packet still has data to be written */
            break;
        }
    }
}


/*
    Clear entries from the IO vector that have actually been transmitted. Support partial writes.
 */
static void adjustFastVec(HttpNet *net, ssize written)
{
    MprIOVec *iovec;
    ssize    len;
    int      i, j;

    if (written == net->ioCount) {
        net->ioIndex = 0;
        net->ioCount = 0;
    } else {
        /*
            Partial write of an vector entry. Need to copy down the unwritten vector entries.
         */
        net->ioCount -= written;
        assert(net->ioCount >= 0);
        iovec = net->iovec;
        for (i = 0; i < net->ioIndex; i++) {
            len = iovec[i].len;
            if (written < len) {
                iovec[i].start += written;
                iovec[i].len -= written;
                break;
            } else {
                written -= len;
            }
        }
        /*
            Compact the vector
         */
        for (j = 0; i < net->ioIndex; ) {
            iovec[j++] = iovec[i++];
        }
        net->ioIndex = j;
    }
}


/*
    FastCGI encoding of strings
 */
static void encodeFastLen(MprBuf *buf, cchar *s)
{
    ssize len;

    len = slen(s);
    if (len <= 127) {
        mprPutCharToBuf(buf, (uchar) len);
    } else {
        mprPutCharToBuf(buf, (uchar) (((len >> 24) & 0x7f) | 0x80));
        mprPutCharToBuf(buf, (uchar) ((len >> 16) & 0xff));
        mprPutCharToBuf(buf, (uchar) ((len >> 8) & 0xff));
        mprPutCharToBuf(buf, (uchar) (len & 0xff));
    }
}


/*
    FastCGI encoding of names and values. Used to send params.
 */
static void encodeFastName(HttpPacket *packet, cchar *name, cchar *value)
{
    MprBuf *buf;

    buf = packet->content;
    encodeFastLen(buf, name);
    encodeFastLen(buf, value);
    mprPutStringToBuf(buf, name);
    mprPutStringToBuf(buf, value);
}


static void copyFastInner(HttpPacket *packet, cchar *key, cchar *value, cchar *prefix)
{
    FastRequest *req;

    req = packet->data;
    if (prefix) {
        key = sjoin(prefix, key, NULL);
    }
    /*
        FastCGI params become environment variables in the application, so the same names a CGI child
        must not receive are unsafe here -- HTTP_PROXY above all. See httpIsCgiVarBlocked().
     */
    if (httpIsCgiVarBlocked(key)) {
        httpLog(req->trace, "tx.fast", "detail", "msg:Dropped unsafe FastCGI env, key:%s", key);
        return;
    }
    httpLog(req->trace, "tx.fast", "detail", "msg:FastCGI env, key:%s, value:%s", key, value);
    encodeFastName(packet, key, value);
}


static void copyFastVars(HttpPacket *packet, MprHash *vars, cchar *prefix)
{
    MprKey *kp;

    for (ITERATE_KEYS(vars, kp)) {
        if (kp->data) {
            copyFastInner(packet, kp->key, kp->data, prefix);
        }
    }
}


static void copyFastParams(HttpPacket *packet, MprJson *params, cchar *prefix)
{
    MprJson *param;
    int     i;

    for (ITERATE_JSON(params, param, i)) {
        copyFastInner(packet, param->name, param->value, prefix);
    }
}


static int fastConnectDirective(MaState *state, cchar *key, cchar *value)
{
    Fast  *fast;
    cchar *endpoint, *args, *ip;
    char  *option, *ovalue, *tok;
    int   port;

    fast = getFast(state->route);

    if (!maTokenize(state, value, "%S ?*", &endpoint, &args)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    fast->endpoint = endpoint;
    if (mprParseSocketAddress(fast->endpoint, &fast->ip, &fast->port, NULL, 0) < 0) {
        mprLog("fast", 0, "Cannot parse listening endpoint");
        return MPR_ERR_BAD_SYNTAX;
    }
    if (args) {
        for (option = maGetNextArg(sclone(args), &tok); option; option = maGetNextArg(tok, &tok)) {
            option = ssplit(option, " =\t,", &ovalue);
            ovalue = strim(ovalue, "\"'", MPR_TRIM_BOTH);

            if (smatch(option, "maxRequests")) {
                fast->maxRequests = httpGetNumber(ovalue);
                if (fast->maxRequests < 1) {
                    fast->maxRequests = 1;
                }
            } else
            if (smatch(option, "launch")) {
                fast->launch = sclone(httpExpandRouteVars(state->route, ovalue));

            } else if (smatch(option, "keep")) {
                if (ovalue == NULL || smatch(ovalue, "true")) {
                    fast->keep = 1;
                } else if (smatch(ovalue, "false")) {
                    fast->keep = 0;
                } else {
                    fast->keep = httpGetNumber(ovalue);
                }

            } else if (smatch(option, "max")) {
                fast->maxApps = httpGetInt(ovalue);
                if (fast->maxApps < 1) {
                    fast->maxApps = 1;
                }

            } else if (smatch(option, "min")) {
                fast->minApps = httpGetInt(ovalue);
                if (fast->minApps < 1) {
                    fast->minApps = 0;
                }

            } else if (smatch(option, "multiplex")) {
                fast->multiplex = httpGetInt(ovalue);
                if (fast->multiplex < 1) {
                    fast->multiplex = 1;
                }

            } else if (smatch(option, "timeout")) {
                fast->appTimeout = httpGetTicks(ovalue);
                if (fast->appTimeout < (30 * TPS)) {
                    fast->appTimeout = 30 * TPS;
                }
            } else {
                mprLog("fast error", 0, "Unknown FastCGI option %s", option);
                return MPR_ERR_BAD_SYNTAX;
            }
        }
    }
    /*
        Pre-test the endpoint
     */
    if (mprParseSocketAddress(fast->endpoint, &ip, &port, NULL, 9128) < 0) {
        mprLog("fast error", 0, "Cannot bind FastCGI app address: %s", fast->endpoint);
        return MPR_ERR_BAD_SYNTAX;
    }
    return 0;
}


/*
    Create listening socket that is passed to the FastCGI app (and then closed after forking)
 */
static MprSocket *createListener(FastApp *app, HttpStream *stream)
{
    Fast      *fast;
    MprSocket *listen;
    int       flags;

    fast = app->fast;

    listen = mprCreateSocket();

    /*
        Port may be zero in which case a dynamic port number is used. If port specified and max > 1, then must reruse
           port.
     */
    flags = MPR_SOCKET_BLOCK | MPR_SOCKET_NODELAY | MPR_SOCKET_INHERIT;
    if (fast->multiplex > 1 && fast->port) {
        flags |= MPR_SOCKET_REUSE_PORT;
    }
    if (mprListenOnSocket(listen, fast->ip, fast->port, flags) == SOCKET_ERROR) {
        if (mprGetError() == EADDRINUSE) {
            httpLog(app->trace, "fast", "error",
                    "msg:Cannot open listening socket for FastCGI. Already bound, address:%s, port:%d",
                    fast->ip ? fast->ip : "*", fast->port);
        } else {
            httpLog(app->trace, "fast", "error", "msg:Cannot open listening socket for FastCGI, address:%s port:%d",
                    fast->ip ? fast->ip : "*", fast->port);
        }
        httpError(stream, HTTP_CODE_INTERNAL_SERVER_ERROR, "Cannot create listening endpoint");
        return NULL;
    }
    app->ip = fast->ip;
    if (fast->port == 0) {
        app->port = getListenPort(listen);
    } else {
        app->port = fast->port;
    }
    httpLog(app->trace, "fast", "context", "msg:Listening for FastCGI, endpoint: %s, port:%d",
            (app->ip && *app->ip) ? app->ip : "*", app->port);
    return listen;
}


static int getListenPort(MprSocket *socket)
{
    struct sockaddr_in sin;
    socklen_t          len;

    len = sizeof(sin);
    if (getsockname(socket->fd, (struct sockaddr*) &sin, &len) < 0) {
        return MPR_ERR_CANT_FIND;
    }
    return ntohs(sin.sin_port);
}


#if KEEP
static int prepFastEnv(HttpStream *stream, cchar **envv, MprHash *vars)
{
    HttpRoute *route;
    MprKey    *kp;
    cchar     *canonical;
    char      *cp;
    int       index = 0;

    route = stream->rx->route;

    for (ITERATE_KEYS(vars, kp)) {
        if (kp->data) {
            cp = sjoin(kp->key, "=", kp->data, NULL);
            if (stream->rx->route->flags & HTTP_ROUTE_ENV_ESCAPE) {
                //  This will escape: "&;`'\"|*?~<>^()[]{}$\\\n" and also on windows \r%
                cp = mprEscapeCmd(cp, 0);
            }
            envv[index] = cp;
            for (; *cp != '='; cp++) {
                if (*cp == '-') {
                    *cp = '_';
                } else {
                    *cp = toupper((uchar) * cp);
                }
            }
            index++;
        }
    }
    canonical = route->canonical ? httpUriToString(route->canonical, 0) : route->host->defaultEndpoint->ip;
    envv[index++] = sfmt("FCGI_WEB_SERVER_ADDRS=%s", canonical);
    envv[index] = 0;
#if UNUSED || 1
    int i;
    for (i = 0; i < index; i++) {
        print("ENV[%d] = %s", i, envv[i]);
    }
#endif
    return index;
}
#endif


#if ME_DEBUG
static void fastInfo(void *ignored, MprSignal *sp)
{
    Fast        *fast;
    FastApp     *app;
    FastRequest *req;
    Http        *http;
    HttpHost    *host;
    HttpRoute   *route;
    HttpStream  *stream;
    int         nextHost, nextRoute, nextApp, nextReq;

    http = HTTP;
    print("\nFast Report:");
    for (ITERATE_ITEMS(http->hosts, host, nextHost)) {
        for (ITERATE_ITEMS(host->routes, route, nextRoute)) {
            if ((fast = route->extended) == 0 || fast->magic != FAST_MAGIC) {
                continue;
            }
            print("\nRoute %-40s ip %s:%d", route->pattern, fast->ip, fast->port);
            for (ITERATE_ITEMS(fast->apps, app, nextApp)) {
                print("\n    App free sockets %d, requests %d, ip %s:%d\n",
                      app->sockets->length, app->requests->length, app->ip, app->port);
                for (ITERATE_ITEMS(app->requests, req, nextReq)) {
                    stream = req->stream;
                    print(
                        "        Req %p ID %d, socket %p flags 0x%x, req eof %d, state %d, finalized output %d, input %d, bytes %d, error %d, netMask 0x%x reqMask 0x%x",
                        req, (int) req->id, req->socket, req->socket->flags, req->eof, stream->state,
                        stream->tx->finalizedOutput, stream->tx->finalizedInput, (int) req->bytesRead, stream->error,
                        stream->net->eventMask, req->eventMask);
                }
            }
        }
    }
}
#endif

#endif /* ME_COM_FAST */

/*
    Copyright (c) Embedthis Software. All Rights Reserved.
    This software is distributed under a commercial license. Consult the LICENSE.md
    distributed with this software for full details and copyrights.
 */


/********* Start of file src/modules/proxyHandler.c ************/

/*
    proxyHandler.c -- Proxy handler

    The proxy modules supports launching backend applications and connecting to pre-existing applications.
    It will multiplex multiple simultaneous requests to one or more apps.

    <Route /proxy>
        Reset pipeline
        CanonicalName https://example.com
        SetHandler proxyHandler
        Prefix /proxy
        ProxyConnect 127.0.0.1:9991 launch="program args" min=0 max=2 maxRequests=unlimited timeout=5mins
           multiplex=unlimited
 # min/max are number of proxies to keep
    </Route>

    Copyright (c) All Rights Reserved. See copyright notice at the bottom of the file.
 */

/*********************************** Includes *********************************/

#include    "appweb.h"

#if ME_COM_PROXY && ME_UNIX_LIKE
/************************************ Locals ***********************************/

#define PROXY_DEBUG            0             //  For debugging (keeps files open in Proxy for debug output)

/*
    Default constants
 */
#define PROXY_MAX_PROXIES      1             //  Max of one proxy
#define PROXY_MIN_PROXIES      0             //  Min of zero proxies to keep running if inactive
#define PROXY_MAX_REQUESTS     MAXINT64      //  Max number of requests per proxy instance
#define PROXY_MAX_MULTIPLEX    1             //  Max number of concurrent requests per proxy instance
#define PROXY_PACKET_SIZE      8             //  Size of minimal Proxy packet

#define PROXY_Q_SIZE           ((PROXY_PACKET_SIZE + 65535 + 8) * 2)

#ifndef PROXY_WAIT_TIMEOUT
#define PROXY_WAIT_TIMEOUT     (10 * TPS)    //  Time to wait for a proxy
#endif

#ifndef PROXY_CONNECT_TIMEOUT
#define PROXY_CONNECT_TIMEOUT  (10 * TPS)    //  Time to wait for Proxy to respond to a connect
#endif

#ifndef PROXY_PROXY_TIMEOUT
#define PROXY_PROXY_TIMEOUT    (300 * TPS)   //  Default inactivity time to preserve idle proxy
#endif

#ifndef PROXY_WATCHDOG_TIMEOUT
#define PROXY_WATCHDOG_TIMEOUT (60 * TPS)    //  Frequence to check on idle proxies
#endif

#define PROXY_MAGIC            0x71629A03


/*
    Top level Proxy structure per route
 */
typedef struct Proxy {
    uint magic;                             //  Magic identifier
    cchar *endpoint;                        //  App listening endpoint
    cchar *launch;                          //  Launch path
    cchar *name;                            //  Proxy name
    int multiplex;                          //  Maximum number of requests to send to each app
    int minApps;                            //  Minumum number of proxies to maintain
    int maxApps;                            //  Maximum number of proxies to spawn
    uint64 maxRequests;                     //  Maximum number of requests for launched apps before respawning
    MprTicks proxyTimeout;                  //  Timeout for an idle proxy to be maintained
    MprList *apps;                          //  List of active apps
    MprList *idleApps;                      //  Idle apps
    MprMutex *mutex;                        //  Multithread sync
    MprCond *cond;                          //  Condition to wait for available app
    HttpLimits *limits;                     //  Proxy connection limits
    MprSsl *ssl;                            //  SSL configuration
    MprEvent *timer;                        //  Timer to check for idle apps
    HttpTrace *trace;                       //  Tracing object for proxy side trace
    cchar *ip;                              //  Listening IP address
    int port;                               //  Listening port
    int protocol;                           //  HTTP/1 or HTTP/2 protocol
} Proxy;

/*
    Per app instance
 */
typedef struct ProxyApp {
    Proxy *proxy;                           // Parent proxy pointer
    HttpTrace *trace;                       // Default tracing configuration
    MprTicks lastActive;                    // When last active
    MprSignal *signal;                      // Mpr signal handler for child death
    bool destroy;                           // Must destroy app
    bool destroyed;                         // App has been destroyed
    int inUse;                              // In use counter
    int pid;                                // Process ID of the app
    int seqno;                              // App seqno for trace
    uint64 nextID;                          // Next request ID for this app
    MprList *networks;                      // Open network connections
    MprList *requests;                      // Current requests
} ProxyApp;

/*
    Per request instance
 */
typedef struct ProxyRequest {
    Proxy *proxy;                           // Parent proxy pointer
    ProxyApp *app;                          // Owning app
    HttpStream *stream;                     // Client request stream
    HttpNet *proxyNet;                      // Network to the proxy backend
    HttpStream *proxyStream;                // Stream to the proxy backend for the current request
    HttpTrace *trace;                       // Default tracing configuration
} ProxyRequest;

/*
    List of proxies
 */
 static MprList *proxies;

/*********************************** Forwards *********************************/

static Proxy *allocProxy(HttpRoute *route);
static void proxyTerminator(int state, int exitStrategy, int status);
static ProxyApp *allocProxyApp(Proxy *proxy);
static ProxyRequest *allocProxyRequest(ProxyApp *app, HttpNet *net, HttpStream *stream);
static void closeAppNetworks(ProxyApp *app);
static Proxy *getProxy(HttpRoute *route);
static ProxyApp *getProxyApp(Proxy *proxy, HttpStream *stream);
static HttpNet *getProxyNetwork(ProxyApp *app, MprDispatcher *dispatcher);
static void killProxyApp(ProxyApp *app);
static void manageProxy(Proxy *proxy, int flags);
static void manageProxyApp(ProxyApp *app, int flags);
static void manageProxyRequest(ProxyRequest *proxyRequest, int flags);
static void proxyAbortRequest(ProxyRequest *req);
static void proxyDestroyNet(HttpNet *net);
static void proxyCloseRequest(HttpQueue *q);
static int proxyCloseConfigDirective(MaState *state, cchar *key, cchar *value);
static int proxyConfigDirective(MaState *state, cchar *key, cchar *value);
static int proxyConnectDirective(MaState *state, cchar *key, cchar *value);
static void proxyFrontNotifier(HttpStream *stream, int event, int arg);
static void proxyIO(HttpNet *net, int event);
static int proxyLogDirective(MaState *state, cchar *key, cchar *value);
static int proxyOpenRequest(HttpQueue *q);
static int proxyTraceDirective(MaState *state, cchar *key, cchar *value);
static HttpStream *proxyCreateStream(ProxyRequest *req);
static void proxyClientIncoming(HttpQueue *q, HttpPacket *packet);
static void proxyClientOutgoingService(HttpQueue *q);
static void proxyBackNotifier(HttpStream *stream, int event, int arg);
static void proxyDeath(ProxyApp *app, MprSignal *sp);
static void proxyStartRequest(HttpQueue *q);
static void proxyStreamIncoming(HttpQueue *q);
static void proxyStreamOutgoing(HttpQueue *q);
static ProxyApp *startProxyApp(Proxy *proxy, HttpStream *stream);
static void proxyMaintenance(Proxy *proxy);
static void releaseAppNetworks(ProxyApp *app);
static void transferClientHeaders(HttpStream *stream, HttpStream *proxyStream);
static void transferProxyHeaders(HttpStream *proxyStream, HttpStream *stream);

#if ME_DEBUG
static void proxyInfo(void *ignored, MprSignal *sp);
#endif

/************************************* Code ***********************************/
/*
    Loadable module initialization
 */
PUBLIC int httpProxyInit(Http *http, MprModule *module)
{
    HttpStage *handler;

    /*
        Add configuration file directives
     */
    maAddDirective("</ProxyConfig", proxyCloseConfigDirective);
    maAddDirective("<ProxyConfig", proxyConfigDirective);
    maAddDirective("ProxyConnect", proxyConnectDirective);
    maAddDirective("ProxyLog", proxyLogDirective);
    maAddDirective("ProxyTrace", proxyTraceDirective);

    /*
        Create Proxy handler to respond to client requests
     */
    if ((handler = httpCreateHandler("proxyHandler", module)) == 0) {
        return MPR_ERR_CANT_CREATE;
    }
    http->proxyHandler = handler;
    handler->close = proxyCloseRequest;
    handler->open = proxyOpenRequest;
    handler->start = proxyStartRequest;
    handler->incoming = proxyClientIncoming;
    handler->outgoingService = proxyClientOutgoingService;

    proxies = mprCreateList(0, 0);
    mprAddRoot(proxies);
    mprAddTerminator(proxyTerminator);

#if ME_DEBUG
    mprAddRoot(mprAddSignalHandler(ME_SIGINFO, proxyInfo, 0, 0, MPR_SIGNAL_AFTER));
#endif
    return 0;
}


/*
    Kill every launched proxy application on shutdown.

    A proxy application started via "ProxyConnect ... launch=" is forked by this process but is not
    in its process group and is not killed with it. Without this it outlives the server, holds its
    listening port, and the next server start finds the address in use.
 */
static void proxyTerminator(int state, int exitStrategy, int status)
{
    Proxy    *proxy;
    ProxyApp *app;
    int      next, nextApp;

    if (state < MPR_STOPPING) {
        return;
    }
    for (ITERATE_ITEMS(proxies, proxy, next)) {
        lock(proxy);
        for (ITERATE_ITEMS(proxy->apps, app, nextApp)) {
            killProxyApp(app);
        }
        for (ITERATE_ITEMS(proxy->idleApps, app, nextApp)) {
            killProxyApp(app);
        }
        unlock(proxy);
    }
}


/*
    Open the proxyHandler for a new client request
 */
static int proxyOpenRequest(HttpQueue *q)
{
    HttpNet      *proxyNet;
    HttpStream   *stream;
    Proxy        *proxy;
    ProxyApp     *app;
    ProxyRequest *req;

    stream = q->stream;

    /*
        Get a Proxy instance for this route. First time, this will allocate a new Proxy instance. Second and
        subsequent times, will reuse the existing instance.
     */
    proxy = getProxy(stream->rx->route);

    /*
        Get a ProxyApp instance. This will reuse an existing Proxy app if possible. Otherwise,
        it will launch a new Proxy app if within limits. Otherwise it will wait until one becomes available.
     */
    if ((app = getProxyApp(proxy, stream)) == 0) {
        httpError(stream, HTTP_CODE_SERVICE_UNAVAILABLE, "Cannot allocate ProxyApp for route %s",
                  stream->rx->route->pattern);
        return MPR_ERR_CANT_OPEN;
    }

    /*
        Get or allocate a network connection to the proxy
        Use the streams dispatcher so that events on the proxy network are serialized with respect to the client
           network.
        This means we don't need locking to serialize access from the client network events to the proxy network and
           vice versa.
     */
    if ((proxyNet = getProxyNetwork(app, stream->dispatcher)) == 0) {
        httpError(stream, HTTP_CODE_SERVICE_UNAVAILABLE, "Cannot allocate network for proxy %s",
                  stream->rx->route->pattern);
        return MPR_ERR_CANT_OPEN;
    }
    proxyNet->trace = proxy->trace;

    /*
        Allocate a per-request instance
     */
    if ((req = allocProxyRequest(app, proxyNet, stream)) == 0) {
        httpError(stream, HTTP_CODE_SERVICE_UNAVAILABLE, "Cannot allocate proxy request for proxy %s",
                  stream->rx->route->pattern);
        httpDestroyNet(proxyNet);
        return MPR_ERR_CANT_OPEN;
    }
    q->queueData = q->pair->queueData = req;

    transferClientHeaders(stream, req->proxyStream);
    httpSetStreamNotifier(stream, proxyFrontNotifier);
    httpEnableNetEvents(proxyNet);
    return 0;
}


/*
    Release a proxy app and request when the request completes. This closes the connection to the Proxy app.
    It will destroy the Proxy app on errors or if the number of requests exceeds the maxRequests limit.
 */
static void proxyCloseRequest(HttpQueue *q)
{
    Proxy        *proxy;
    ProxyRequest *req;
    ProxyApp     *app;
    cchar        *msg;

    req = q->queueData;
    proxy = req->proxy;
    app = req->app;

    mprRemoveItem(app->requests, req);

    lock(proxy);
    if (--app->inUse <= 0) {
        msg = "Release Proxy app";
        if (mprRemoveItem(proxy->apps, app) < 0) {
            httpLog(proxy->trace, "proxy", "error", "msg:Cannot find proxy app in list");
        }
        if (app->pid) {
            if (proxy->maxRequests < MAXINT64 && app->nextID >= proxy->maxRequests) {
                app->destroy = 1;
            }
            if (app->destroy) {
                msg = "Kill Proxy app";
                killProxyApp(app);
            }
        }
        if (app->destroy) {
            closeAppNetworks(app);
        } else {
            app->lastActive = mprGetTicks();
            mprAddItem(proxy->idleApps, app);
            releaseAppNetworks(app);
        }
        httpLog(proxy->trace, "proxy", "context",
                "msg:%s, pid:%d, idle:%d, active:%d, id:%lld, maxRequests:%lld, destroy:%d, nextId:%lld",
                msg, app->pid, mprGetListLength(proxy->idleApps), mprGetListLength(proxy->apps),
                app->nextID, proxy->maxRequests, app->destroy, app->nextID);
        mprSignalCond(proxy->cond);
    }
    unlock(proxy);
}


static void proxyStartRequest(HttpQueue *q)
{
    ProxyRequest *req;
    HttpStream   *stream;
    HttpRx       *rx;

    req = q->queueData;
    stream = q->stream;
    rx = q->stream->rx;
    if (smatch(rx->upgrade, "websocket")) {
        stream->keepAliveCount = 0;
        stream->upgraded = 1;
        req->proxyStream->upgraded = 1;
        rx->eof = 0;
        rx->remainingContent = HTTP_UNLIMITED;
    }
}


static Proxy *allocProxy(HttpRoute *route)
{
    Proxy *proxy;

    proxy = mprAllocObj(Proxy, manageProxy);
    proxy->magic = PROXY_MAGIC;
    proxy->name = sclone(route->pattern);
    proxy->apps = mprCreateList(0, 0);
    proxy->idleApps = mprCreateList(0, 0);
    proxy->mutex = mprCreateLock();
    proxy->cond = mprCreateCond();
    proxy->multiplex = PROXY_MAX_MULTIPLEX;
    proxy->maxRequests = PROXY_MAX_REQUESTS;
    proxy->minApps = PROXY_MIN_PROXIES;
    proxy->maxApps = PROXY_MAX_PROXIES;
    proxy->ip = sclone("127.0.0.1");
    proxy->port = 0;
    proxy->protocol = 1;
    proxy->proxyTimeout = PROXY_PROXY_TIMEOUT;
    proxy->ssl = NULL;
    proxy->limits = route->limits;
    proxy->trace = httpCreateTrace(route->trace);
    mprAddItem(proxies, proxy);
    proxy->timer = mprCreateTimerEvent(NULL, "proxy-watchdog", PROXY_WATCHDOG_TIMEOUT,
                                       proxyMaintenance, proxy, MPR_EVENT_QUICK);
    return proxy;
}


static void manageProxy(Proxy *proxy, int flags)
{
    if (flags & MPR_MANAGE_MARK) {
        mprMark(proxy->apps);
        mprMark(proxy->cond);
        mprMark(proxy->endpoint);
        mprMark(proxy->idleApps);
        mprMark(proxy->ip);
        mprMark(proxy->launch);
        mprMark(proxy->limits);
        mprMark(proxy->name);
        mprMark(proxy->mutex);
        mprMark(proxy->ssl);
        mprMark(proxy->timer);
        mprMark(proxy->trace);
    }
}


static void proxyMaintenance(Proxy *proxy)
{
    ProxyApp *app;
    MprTicks now;
    int      count, next;

    now = mprGetTicks();

    lock(proxy);
    count = mprGetListLength(proxy->apps) + mprGetListLength(proxy->idleApps);
    for (ITERATE_ITEMS(proxy->idleApps, app, next)) {
        if (app->pid && ((now - app->lastActive) > proxy->proxyTimeout)) {
            if (count-- > proxy->minApps) {
                killProxyApp(app);
            }
        }
    }
    unlock(proxy);
}


/*
    Get the proxy structure for a route and save in "extended". Allocate if required.
    One Proxy instance is shared by all using the route.
 */
static Proxy *getProxy(HttpRoute *route)
{
    Proxy *proxy;

    if ((proxy = route->extended) == 0) {
        mprGlobalLock();
        if ((proxy = route->extended) == 0) {
            proxy = route->extended = allocProxy(route);
            proxy->trace = route->trace;
        }
        mprGlobalUnlock();
    }
    return proxy;
}


/*
    Notifier for events relating to the client (browser)
    Confusingly this is the server side of the client connection.
 */
static void proxyFrontNotifier(HttpStream *stream, int event, int arg)
{
    ProxyRequest *req;
    HttpStream   *proxyStream;

    assert(stream->net->endpoint);

    if ((req = stream->writeq->queueData) == 0) {
        return;
    }
    proxyStream = req->proxyStream;
    if (proxyStream == NULL || proxyStream->destroyed) {
        return;
    }
    switch (event) {
    case HTTP_EVENT_READABLE:
    case HTTP_EVENT_WRITABLE:
        break;

    case HTTP_EVENT_ERROR:
        if (!stream->tx->finalizedInput || proxyStream->tx->finalizedOutput) {
            if (stream->upgraded) {
                httpError(proxyStream, HTTP_CLOSE, "Client closed connection");
            } else {
                httpError(proxyStream, HTTP_CLOSE, "Client closed connection before request sent to proxy");
            }
            //  The stream and its dispatcher will be destroyed so switch to the MPR dispatcher
            proxyStream->net->dispatcher = 0;
        }
        break;

    case HTTP_EVENT_DESTROY:
        break;

    case HTTP_EVENT_DONE:
        break;

    case HTTP_EVENT_STATE:
        switch (stream->state) {
        case HTTP_STATE_BEGIN:
        case HTTP_STATE_CONNECTED:
        case HTTP_STATE_FIRST:
        case HTTP_STATE_PARSED:
            break;

        case HTTP_STATE_CONTENT:
            if (stream->rx->upgrade) {
                //  Cause the headers to be pushed out
                httpPutPacket(proxyStream->writeq, httpCreateDataPacket(0));
            }
            break;

        case HTTP_STATE_READY:
            if (!stream->rx->upgrade) {
                httpFinalizeOutput(proxyStream);
            }
            break;

        case HTTP_STATE_RUNNING:
            break;
        case HTTP_STATE_FINALIZED:
            break;
        case HTTP_STATE_COMPLETE:
            break;
        }
        break;
    }
}


/*
    Events for communications with the proxy app
    This is using a client side HTTP to communicate with the proxy
 */
static void proxyBackNotifier(HttpStream *proxyStream, int event, int arg)
{
    ProxyRequest *req;
    HttpNet      *net;

    net = proxyStream->net;
    assert(net->endpoint == 0);

    if ((req = proxyStream->writeq->queueData) == 0) {
        return;
    }
    switch (event) {
    case HTTP_EVENT_READABLE:
    case HTTP_EVENT_WRITABLE:
        break;

    case HTTP_EVENT_DESTROY:
        break;

    case HTTP_EVENT_DONE:
        httpLog(proxyStream->trace, "tx.proxy", "result", "msg:Request complete");
        if (proxyStream->error) {
            proxyAbortRequest(req);
        }
        httpDestroyStream(proxyStream);
        req->proxyStream = 0;

        if (net->error || proxyStream->upgraded || (net->protocol < 2 && proxyStream->keepAliveCount <= 0)) {
            httpDestroyNet(net);
        } else {
            mprPushItem(req->app->networks, net);
        }
        break;

    case HTTP_EVENT_ERROR:
        break;

    case HTTP_EVENT_STATE:
        switch (proxyStream->state) {
        case HTTP_STATE_BEGIN:
        case HTTP_STATE_CONNECTED:
        case HTTP_STATE_FIRST:
            break;
        case HTTP_STATE_PARSED:
            transferProxyHeaders(proxyStream, req->stream);
            break;
        case HTTP_STATE_CONTENT:
        case HTTP_STATE_READY:
        case HTTP_STATE_RUNNING:
        case HTTP_STATE_FINALIZED:
            break;
        case HTTP_STATE_COMPLETE:
            break;
        }
        break;
    }
}


static void proxyNetCallback(HttpNet *net, int event)
{
    ProxyApp *app;

    app = net->data;
    if (!app) {
        return;
    }
    switch (event) {
    case HTTP_NET_ERROR:
    case HTTP_NET_EOF:
        lock(app->proxy);
        mprRemoveItem(app->networks, net);
        httpDestroyNet(net);
        unlock(app->proxy);
        break;

    case HTTP_NET_IO:
        proxyIO(net, event);
        break;
    }
}


/*
    When we get an IO event on a network, service the associated other network on the same proxy request.
 */
static void proxyIO(HttpNet *net, int event)
{
    HttpNet *n;
    int     more, next;

    do {
        more = 0;
        for (ITERATE_ITEMS(HTTP->networks, n, next)) {
            if (n->dispatcher && n->dispatcher == net->dispatcher && n->serviceq->scheduleNext != n->serviceq &&
                !n->destroyed) {
                httpServiceNet(n);
                more = 1;
            }
        }
    } while (more);
}


/*
    Incoming data from the client destined for proxy
 */
static void proxyClientIncoming(HttpQueue *q, HttpPacket *packet)
{
    HttpStream   *stream;
    HttpStream   *proxyStream;
    ProxyRequest *req;

    assert(q);
    assert(packet);
    stream = q->stream;

    if ((req = q->queueData) == 0) {
        return;
    }
    proxyStream = req->proxyStream;
    packet->stream = proxyStream;

    if (packet->flags & HTTP_PACKET_END) {
        httpFinalizeInput(stream);
        if (stream->net->protocol < 0 && stream->rx->remainingContent > 0) {
            httpError(stream, HTTP_CODE_BAD_REQUEST, "Client supplied insufficient body data");
        } else {
            httpFinalizeOutput(proxyStream);
        }
    } else {
        httpPutPacket(proxyStream->writeq, packet);
        /*
            Body packets are dispatched to this routine directly, so stream->readq->count never rises and the
            generic room test upstream always finds space no matter how far behind the proxy is. Suspend the read
            queue while the proxy is behind; proxyStreamOutgoing resumes it as the proxy drains.
         */
        if (proxyStream->writeq->count >= proxyStream->writeq->max) {
            httpSuspendQueue(q);
        }
    }
}


/*
    Send data back to the client (browser)
 */
static void proxyClientOutgoingService(HttpQueue *q)
{
    HttpPacket   *packet;
    HttpStream   *proxyStream;
    ProxyRequest *req;

    req = q->queueData;
    for (packet = httpGetPacket(q); packet; packet = httpGetPacket(q)) {
        if (!httpWillNextQueueAcceptPacket(q, packet)) {
            httpPutBackPacket(q, packet);
            return;
        }
        httpPutPacketToNext(q, packet);
    }
    /*
        Manual flow control to the proxy stream. Back enable the proxy stream to resume transferring data to this queue
     */
    if ((proxyStream = req->proxyStream) == 0) {
        return;
    }
    assert(!proxyStream->destroyed);
    if (httpIsQueueSuspended(proxyStream->readq)) {
        httpResumeQueue(proxyStream->readq, HTTP_SCHEDULE_QUEUE);
    }
}


/*
    Read a response from the proxy and pass back to the client
    The queue is the proxyStream readq (QueueHead-rx)
 */
static void proxyStreamIncoming(HttpQueue *q)
{
    HttpPacket   *packet;
    HttpStream   *stream;
    ProxyRequest *req;

    req = q->queueData;
    if (req == 0) {
        return;
    }
    //  Client stream
    stream = req->stream;

    //  If client write queue (browser) is suspended -- cannot transfer any packets here
    if (httpIsQueueSuspended(stream->writeq)) {
        httpSuspendQueue(q);
        return;
    }

    for (packet = httpGetPacket(q); packet; packet = httpGetPacket(q)) {
        packet->stream = stream;
        /*
            Handle case of bad proxy sending output that is unexpected
         */
        if (stream->tx->finalizedOutput || stream->state < HTTP_STATE_PARSED || stream->state >= HTTP_STATE_FINALIZED) {
            continue;
        }
        //  Test if the client stream will accept this packet, if not, suspend (q)
        if (!httpWillQueueAcceptPacket(q, stream->writeq, packet)) {
            httpPutBackPacket(q, packet);
            return;
        }
        if (packet->flags & HTTP_PACKET_END) {
            httpFinalizeOutput(stream);
        } else {
            httpPutPacket(stream->writeq, packet);
        }
    }
}


/*
    Send the request body on to the proxy and pass back-pressure to the client.
    The queue is the proxyStream writeq (QueueHead-tx)
 */
static void proxyStreamOutgoing(HttpQueue *q)
{
    HttpPacket   *packet;
    HttpStream   *stream;
    ProxyRequest *req;

    if ((req = q->queueData) == 0) {
        return;
    }
    for (packet = httpGetPacket(q); packet; packet = httpGetPacket(q)) {
        if (!httpWillNextQueueAcceptPacket(q, packet)) {
            httpPutBackPacket(q, packet);
            return;
        }
        httpPutPacketToNext(q, packet);
    }
    /*
        Manual flow control to the client stream. Resume reading the request body now the proxy has drained.
     */
    if ((stream = req->stream) != 0 && httpIsQueueSuspended(stream->readq)) {
        httpResumeQueue(stream->readq, 0);
    }
}


/*
    Transfer response headers from the proxy to the client
 */
static void transferProxyHeaders(HttpStream *proxyStream, HttpStream *stream)
{
    Proxy   *proxy;
    MprKey  *kp;
    HttpUri *target, *proxyApp, *uri;
    bool    local;
    cchar   *hval, *location;
    int     complete;

    assert(stream);
    assert(proxyStream);

    httpLog(proxyStream->trace, "rx.proxy", "result", "msg:Received headers from proxy");

    for (ITERATE_KEYS(proxyStream->rx->headers, kp)) {
        httpSetHeaderString(stream, kp->key, kp->data);
    }
    /*
        Remove Connection: Keep-Alive. Keep Connection: Close.
     */
    if ((hval = httpGetTxHeader(stream, "Connection")) != 0) {
        httpRemoveHeader(stream, "Connection");
        if (scaselesscontains(hval, "Close")) {
            httpSetHeaderString(stream, "Connection", "Close");
        }
    }
    httpRemoveHeader(stream, "Keep-Alive");
    httpRemoveHeader(stream, "Content-Length");
    httpRemoveHeader(stream, "Transfer-Encoding");
    httpSetHeaderString(stream, "X-Proxied", "true");

    /*
        Handle redirects for internal or external resources. For internal resources,
        modify the location to use the Canonical domain or if not defined, the Host header
        from the initial request. Handle 127.0.0.1 and localhost equality intelligently.
     */
    if ((location = httpGetTxHeader(stream, "Location")) != 0) {
        proxy = getProxy(stream->rx->route);
        proxyApp = httpCreateUri(proxy->endpoint, 0);

        /*
            Host and port will be NULL for relative locations
         */
        target = httpCreateUri(location, 0);

        /*
            The redirection is local if the location is relative (no host), or the "host" matches
            the proxy, is set to "localhost" or "12.7.0.0.1".
            If the redirection is for a local resource use the ext, ref and query, but
            prefix the path with the route prefix. Use the current request IP or Canonical domain
            for the scheme, host and port.
         */
        local = (smatch(target->host, proxyApp->host) ||
                 (((!target->host || smatch(target->host, "localhost") || smatch(target->host, "127.0.0.1")) &&
                   (!proxyApp->host || smatch(proxyApp->host, "localhost") || smatch(proxyApp->host, "127.0.0.1")))));

        if (local && (!target->port || target->port == proxyApp->port)) {
            /*
                Redirection for a local resource (matching hostname and port)
                Get the scheme/host/port for the canonical domain if defined, otherwise the current request endpoint.
             */
            if (stream->rx->route->canonical) {
                uri = httpCloneUri(stream->rx->route->canonical, 0);
                complete = HTTP_COMPLETE_URI;
            } else {
                /*
                    No CanonicalName. Do not build an absolute URL out of rx->parsedUri: its host is
                    the client's own Host header, checked for character class and nothing else, so the
                    client would be choosing the domain it is redirected to. Emit a relative reference instead. 
                 */
                uri = httpCloneUri(target, 0);
                uri->scheme = 0;
                uri->host = 0;
                uri->port = 0;
                complete = 0;
            }
            uri->path = sjoin(stream->rx->route->prefix, target->path, NULL);
            uri->ext = target->ext;
            uri->reference = target->reference;
            uri->query = target->query;
        } else {
            //  External redirection - keep as is
            uri = target;
            complete = HTTP_COMPLETE_URI;
        }
        location = httpUriToString(uri, complete);
        httpSetHeaderString(stream, "Location", location);
    }
    httpSetStatus(stream, proxyStream->rx->status);
    if (proxyStream->rx->status == HTTP_CODE_SWITCHING) {
        proxyStream->rx->remainingContent = HTTP_UNLIMITED;
        stream->keepAliveCount = 0;
        stream->upgraded = 1;
        httpSetHeaderString(stream, "Connection", "Upgrade");
        //  Force headers to be sent to client
        httpPutPacketToNext(stream->writeq, httpCreateDataPacket(0));
    }
}


/*
    Transfer request headers from the client to the proxy
 */
static void transferClientHeaders(HttpStream *stream, HttpStream *proxyStream)
{
    MprKey   *kp;
    HttpHost *host;
    cchar    *hval;

    assert(stream);
    assert(proxyStream);

    host = stream->host;

    for (ITERATE_KEYS(stream->rx->headers, kp)) {
        httpSetHeaderString(proxyStream, kp->key, kp->data);
    }
    /*
        Keep Connection: Upgrade
     */
    if ((hval = httpGetTxHeader(proxyStream, "Connection")) != 0) {
        httpRemoveHeader(proxyStream, "Connection");
        if (scaselesscontains(hval, "Upgrade")) {
            httpSetHeaderString(proxyStream, "Connection", "Upgrade");
        }
    }
    httpRemoveHeader(proxyStream, "Content-Length");
    httpRemoveHeader(proxyStream, "Transfer-Encoding");
    httpSetHeaderString(proxyStream, "X-Client", stream->net->ip);
    httpSetHeaderString(stream, "X-Proxied", "true");

    if (stream->rx->route->canonical) {
        httpSetHeaderString(proxyStream, "X-Canonical",
                            httpUriToString(stream->rx->route->canonical, HTTP_COMPLETE_URI));
    } else if (host->hostname) {
        httpSetHeaderString(proxyStream, "X-Hostname", host->hostname);
    }
}

/************************************************ ProxyApp
 ***************************************************************/
/*
    The ProxyApp represents the connection to a single Proxy app instance
 */
static ProxyApp *allocProxyApp(Proxy *proxy)
{
    ProxyApp   *app;
    static int nextSeqno = 0;

    app = mprAllocObj(ProxyApp, manageProxyApp);
    app->proxy = proxy;
    app->trace = proxy->trace;
    app->requests = mprCreateList(0, 0);
    app->networks = mprCreateList(0, 0);
    app->nextID = 1;
    app->seqno = nextSeqno++;
    return app;
}


//  Should be called with proxy locked
static void closeAppNetworks(ProxyApp *app)
{
    HttpNet *net;
    int     next;

    for (ITERATE_ITEMS(app->networks, net, next)) {
        httpDestroyNet(net);
    }
}


static void releaseAppNetworks(ProxyApp *app)
{
    HttpNet *net;
    int     next;

    for (ITERATE_ITEMS(app->networks, net, next)) {
        //  Reassign to use the MPR dispatcher and not any associated stream dispatcher
        net->dispatcher = 0;
        //  Listen for disconnection events
        httpEnableNetEvents(net);
    }
}


static void manageProxyApp(ProxyApp *app, int flags)
{
    if (flags & MPR_MANAGE_MARK) {
        mprMark(app->networks);
        mprMark(app->proxy);
        mprMark(app->requests);
        mprMark(app->signal);
        mprMark(app->trace);
    }
}


static ProxyApp *getProxyApp(Proxy *proxy, HttpStream *stream)
{
    ProxyApp *app, *bestApp;
    MprTicks timeout;
    int      bestCount, count, next;

    timeout = mprGetTicks() +  PROXY_WAIT_TIMEOUT;
    app = NULL;

    lock(proxy);
    /*
        Locate a ProxyApp to serve the request. Use an idle proxy app first. If none available, start a new proxy app
        if under the limits. Otherwise, wait for one to become available.
     */
    while (!app && mprGetTicks() < timeout) {
        for (ITERATE_ITEMS(proxy->idleApps, app, next)) {
            if (app->destroy || app->destroyed) {
                continue;
            }
            mprRemoveItemAtPos(proxy->idleApps, next - 1);
            mprAddItem(proxy->apps, app);
            break;
        }
        if (!app) {
            if (mprGetListLength(proxy->apps) < proxy->maxApps) {
                if ((app = startProxyApp(proxy, stream)) != 0) {
                    mprAddItem(proxy->apps, app);
                }
                break;

            } else {
                /*
                    Pick lightest load
                 */
                bestApp = 0;
                bestCount = MAXINT;
                for (ITERATE_ITEMS(proxy->apps, app, next)) {
                    count = mprGetListLength(app->requests);
                    if (count < proxy->multiplex) {
                        if (count < bestCount) {
                            bestApp = app;
                            bestCount = count;
                        }
                    }
                }
                if (bestApp) {
                    app = bestApp;
                    break;
                }
                unlock(proxy);
                mprYield(MPR_YIELD_STICKY);

                mprWaitForCond(proxy->cond, TPS);

                mprResetYield();
                lock(proxy);
                mprLog("proxy", 0, "Waiting for Proxy app to become available, running %d", mprGetListLength(
                           proxy->apps));
            }
        }
    }
    if (app) {
        app->lastActive = mprGetTicks();
        app->inUse++;
    } else {
        mprLog("proxy", 0, "Cannot acquire available proxy, running %d", mprGetListLength(proxy->apps));
    }
    unlock(proxy);
    return app;
}


static HttpNet *getProxyNetwork(ProxyApp *app, MprDispatcher *dispatcher)
{
    HttpNet  *net;
    Proxy    *proxy;
    MprTicks timeout;
    int      connected, backoff, level, protocol;

    proxy = app->proxy;

    while ((net = mprPopItem(app->networks)) != 0) {
        if (net->destroyed) {
            continue;
        }
        //  Switch to the client dispatcher to serialize requests (no locking yea!)
        assert(!(dispatcher->flags & MPR_DISPATCHER_DESTROYED));
        net->dispatcher = dispatcher;
        net->sharedDispatcher = 1;
        return net;
    }

    protocol = proxy->protocol;
    if (protocol >= 2 && !proxy->ssl) {
        mprLog("proxy error", 0, "Cannot use HTTP/2 when SSL is not configured inside ProxyConfig");
        protocol = 1;
    }

    if ((net = httpCreateNet(dispatcher, NULL, protocol, HTTP_NET_ASYNC)) == 0) {
        return net;
    }
    net->sharedDispatcher = 1;
    net->limits = httpCloneLimits(proxy->limits);
    net->data = app;

    net->trace = app->trace;
    level = PTOI(mprLookupKey(net->trace->events, "packet"));
    net->tracing = (net->trace->level >= level) ? 1 : 0;

    httpSetNetCallback(net, proxyNetCallback);

    timeout = mprGetTicks() + PROXY_CONNECT_TIMEOUT;
    connected = 0;
    backoff = 1;

    mprAddRoot(net);

    while (1) {
        if (httpConnectNet(net, proxy->ip, proxy->port, proxy->ssl) == 0) {
            connected = 1;
            mprLog("proxy", 2, "Proxy connected to %s:%d", proxy->ip, proxy->port);
            break;
        }
        net->eof = net->error = 0;
        if (mprGetTicks() >= timeout) {
            break;
        }
        //  WARNING: yields
        mprSleep(backoff);
        backoff = backoff * 2;
        if (backoff > 50) {
            mprLog("proxy", 2, "Proxy retry connect to %s:%d", proxy->ip, proxy->port);
            if (backoff > 2000) {
                backoff = 2000;
            }
        }
    }
    mprRemoveRoot(net);

    if (!connected) {
        mprLog("proxy error", 0, "Cannot connect to proxy %s at %s:%d", proxy->name, proxy->ip, proxy->port);
        httpDestroyNet(net);
        net = 0;
    }
    return net;
}


/*
    Start a new Proxy app process. Called with lock(proxy)
 */
static ProxyApp *startProxyApp(Proxy *proxy, HttpStream *stream)
{
    ProxyApp *app;
    cchar    **argv, *command;
    int      i;

    app = allocProxyApp(proxy);

    if (proxy->launch) {
        mprMakeArgv(proxy->launch, &argv, 0);
        command = argv[0];

        httpLog(app->trace, "proxy", "context", "msg:Start Proxy app, command:%s", command);

        if (!app->signal) {
            app->signal = mprAddSignalHandler(SIGCHLD, proxyDeath, app, NULL, MPR_SIGNAL_BEFORE);
        }
        if ((app->pid = fork()) < 0) {
            fprintf(stderr, "Fork failed for Proxy");
            return NULL;

        } else if (app->pid == 0) {
            /*
                CHILD: When debugging, keep stdout/stderr open so printf/fprintf from the Proxy app will show in the
                   console.
             */
            for (i = PROXY_DEBUG ? 3 : 1; i < 128; i++) {
                close(i);
            }
            if (execve(command, (char**) argv, environ) < 0) {
                printf("Cannot exec proxy app: %s\n", command);
            }
            return NULL;
        } else {
            httpLog(app->trace, "proxy", "context", "msg:Proxy started, command:%s, pid:%d", command, app->pid);
        }
    }
    return app;
}


/*
    Proxy process has died, so reap the status and inform relevant streams.
    WARNING: this may be called before all the data has been read from the socket, so we must not set eof = 1 here.
    WARNING: runs on the MPR dispatcher. Everyting must be "proxy" locked.
 */
static void proxyDeath(ProxyApp *app, MprSignal *sp)
{
    HttpNet      *net;
    Proxy        *proxy;
    ProxyRequest *req;
    int          next, status;

    proxy = app->proxy;

    lock(proxy);
    if (app->pid && waitpid(app->pid, &status, WNOHANG) == app->pid) {
        httpLog(app->trace, "proxy", WEXITSTATUS(status) == 0 ? "context" : "error",
                "msg:Proxy exited, pid:%d, status:%d", app->pid, WEXITSTATUS(status));
        if (app->signal) {
            mprRemoveSignalHandler(app->signal);
            app->signal = 0;
        }
        if (mprLookupItem(app->proxy->idleApps, app) >= 0) {
            mprRemoveItem(app->proxy->idleApps, app);
        }
        app->destroyed = 1;
        app->pid = 0;

        /*
            Notify all requests on their relevant dispatcher
         */
        for (ITERATE_ITEMS(app->requests, req, next)) {
            mprCreateLocalEvent(req->stream->dispatcher, "proxy-reap", 0, proxyAbortRequest, req, 0);
        }
        for (ITERATE_ITEMS(app->networks, net, next)) {
            mprCreateLocalEvent(net->dispatcher, "net-reap", 0, proxyDestroyNet, net, 0);
        }
    }
    unlock(proxy);
}


static void proxyDestroyNet(HttpNet *net)
{
    if (net && !net->destroyed) {
        httpDestroyNet(net);
    }
}


/*
    Clean / abort request
 */
static void proxyAbortRequest(ProxyRequest *req)
{
    HttpStream *stream;

    stream = req->stream;
    if (stream->state <= HTTP_STATE_BEGIN || stream->rx->route == NULL) {
        // Request already complete and stream has been recycled (prepared for next request)
        return;
    }
    httpError(stream, HTTP_CLOSE | HTTP_CODE_INTERNAL_SERVER_ERROR, "Proxy comms error");
}


/*
    Kill the Proxy app due to error or maxRequests limit being exceeded
 */
static void killProxyApp(ProxyApp *app)
{
    lock(app->proxy);
    if (app->pid) {
        httpLog(app->trace, "proxy", "context", "msg:Kill Proxy process, pid:%d", app->pid);
        if (app->pid) {
            kill(app->pid, SIGTERM);
        }
    }
    unlock(app->proxy);
}

/************************************************ ProxyRequest
 ***********************************************************/

static ProxyRequest *allocProxyRequest(ProxyApp *app, HttpNet *proxyNet, HttpStream *stream)
{
    ProxyRequest *req;

    req = mprAllocObj(ProxyRequest, manageProxyRequest);
    req->stream = stream;
    req->trace = app->trace;
    req->proxy = app->proxy;
    req->app = app;
    req->proxyNet = proxyNet;
    if ((req->proxyStream = proxyCreateStream(req)) == 0) {
        return 0;
    }
    mprAddItem(app->requests, req);
    return req;
}


static HttpStream *proxyCreateStream(ProxyRequest *req)
{
    HttpStream *proxyStream, *stream;
    HttpRx     *rx;
    Proxy      *proxy;
    cchar      *prefix, *uri;

    stream = req->stream;
    rx = stream->rx;
    proxy = req->proxy;

    if ((proxyStream = httpCreateStream(req->proxyNet, 0)) == 0) {
        return 0;
    }
    httpSetStreamNotifier(proxyStream, proxyBackNotifier);
    httpSetNetCallback(stream->net, proxyIO);
    httpCreatePipeline(proxyStream);
    proxyStream->readq->service = proxyStreamIncoming;
    /*
        Give the proxy write queue a service routine so request body data is counted there rather than passed
        straight through. Without a count there is nothing to measure the proxy's backlog against.
     */
    proxyStream->writeq->service = proxyStreamOutgoing;

    proxyStream->trace = proxy->trace;
    proxyStream->proxied = 1;
    proxyStream->writeq->queueData = proxyStream->readq->queueData = req;
    proxyStream->rx->route = stream->http->clientRoute;

    prefix = rx->route->prefix;
    uri = (prefix && sstarts(rx->uri, prefix)) ? &rx->uri[slen(prefix)] : rx->uri;
    proxyStream->tx->parsedUri = httpCreateUri(uri, 0);
    proxyStream->tx->parsedUri->query = rx->parsedUri->query;
    proxyStream->tx->method = stream->rx->method;
    proxyStream->limits->inactivityTimeout = proxy->proxyTimeout;

    httpSetState(proxyStream, HTTP_STATE_CONNECTED);
    return proxyStream;
}


static void manageProxyRequest(ProxyRequest *req, int flags)
{
    if (flags & MPR_MANAGE_MARK) {
        mprMark(req->app);
        mprMark(req->proxy);
        mprMark(req->proxyNet);
        mprMark(req->proxyStream);
        mprMark(req->stream);
        mprMark(req->trace);
    }
}


/*
    <ProxyConfig>
    </ProxyConfig>
 */
static int proxyConfigDirective(MaState *state, cchar *key, cchar *value)
{
    state = maPushState(state);
    /*
        Every SSLxxx directive in this block configures the outbound connection to the backend, not
        this server's listener. checkSsl() cannot tell the difference on its own, so mark the scope.
     */
    state->flags |= MA_PARSE_PROXY_CLIENT;
    if (state->enabled) {
        state->route = httpCreateInheritedRoute(state->route);
    }
    return 0;
}

/*
    </ProxyConfig>
 */
static int proxyCloseConfigDirective(MaState *state, cchar *key, cchar *value)
{
    Proxy *proxy;

    /*
        The Proxy belongs to the route enclosing this block, not to the inherited route the block created.
     */
    proxy = getProxy(state->prev->route);
    if (state->route != state->prev->route) {
        /*
            Extract SSL and limit configuration. The block's SSL object wins over anything ProxyConnect
            defaulted,  so re-apply the ALPN it asked for rather than losing it here.
         */
        if (state->route->ssl) {
            proxy->ssl = state->route->ssl;
            if (proxy->protocol == 2) {
                mprSetSslAlpn(proxy->ssl, "h2");
            }
        }
        proxy->limits = state->route->limits;
    }
    maPopState(state);
    return 0;
}


static int proxyConnectDirective(MaState *state, cchar *key, cchar *value)
{
    Proxy *proxy;
    cchar *endpoint, *args;
    char  *option, *ovalue, *tok;

    proxy = getProxy(state->route);

    if (!maTokenize(state, value, "%S ?*", &endpoint, &args)) {
        return MPR_ERR_BAD_SYNTAX;
    }
    proxy->endpoint = endpoint;

    if (args && *args) {
        for (option = maGetNextArg(sclone(args), &tok); option; option = maGetNextArg(tok, &tok)) {
            option = ssplit(option, " =\t,", &ovalue);
            ovalue = strim(ovalue, "\"'", MPR_TRIM_BOTH);

            if (smatch(option, "maxRequests")) {
                proxy->maxRequests = httpGetNumber(ovalue);
                if (proxy->maxRequests < 1) {
                    proxy->maxRequests = 1;
                }

            } else if (smatch(option, "http1")) {
                proxy->protocol = 1;
                proxy->ssl = 0;

            } else if (smatch(option, "http2")) {
                proxy->protocol = 2;
                if (!proxy->ssl) {
                    proxy->ssl = mprCreateSsl(0);
                }
                mprSetSslAlpn(proxy->ssl, "h2");

            } else if (smatch(option, "launch")) {
                proxy->launch = sclone(httpExpandRouteVars(state->route, ovalue));

            } else if (smatch(option, "max")) {
                proxy->maxApps = httpGetInt(ovalue);
                if (proxy->maxApps < 1) {
                    proxy->maxApps = 1;
                }

            } else if (smatch(option, "min")) {
                proxy->minApps = httpGetInt(ovalue);
                if (proxy->minApps < 1) {
                    proxy->minApps = 0;
                }

            } else if (smatch(option, "multiplex")) {
                proxy->multiplex = httpGetInt(ovalue);
                if (proxy->multiplex < 1) {
                    proxy->multiplex = 1;
                }

            } else if (smatch(option, "ssl")) {
                if (!proxy->ssl) {
                    proxy->ssl = mprCreateSsl(0);
                }

            } else if (smatch(option, "timeout")) {
                proxy->proxyTimeout = httpGetTicks(ovalue);
                if (proxy->proxyTimeout < (30 * TPS)) {
                    proxy->proxyTimeout = 30 * TPS;
                }
            } else {
                mprLog("proxy error", 0, "Unknown Proxy option %s", option);
                return MPR_ERR_BAD_SYNTAX;
            }
        }
    }
    state->route->ssl = proxy->ssl;

    /*
        Pre-test the endpoint
     */
    if (mprParseSocketAddress(proxy->endpoint, &proxy->ip, &proxy->port, NULL, 9128) < 0) {
        mprLog("proxy error", 0, "Cannot bind Proxy proxy address: %s", proxy->endpoint);
        return MPR_ERR_BAD_SYNTAX;
    }
    return 0;
}


static int proxyLogDirective(MaState *state, cchar *key, cchar *value)
{
    Proxy *proxy;

    proxy = getProxy(state->route);
    proxy->trace = httpCreateTrace(proxy->trace);
    proxy->trace->flags &= ~MPR_LOG_CMDLINE;
    return maTraceLogDirective(state, proxy->trace, key, value);
}


static int proxyTraceDirective(MaState *state, cchar *key, cchar *value)
{
    Proxy *proxy;

    proxy = getProxy(state->route);
    if (proxy->trace == 0) {
        proxy->trace = httpCreateTrace(proxy->trace);
        proxy->trace->flags &= ~MPR_LOG_CMDLINE;
    }
    proxy->trace->flags &= ~MPR_LOG_CMDLINE;
    return maTraceDirective(state, proxy->trace, key, value);
}



#if ME_DEBUG
static void proxyInfo(void *ignored, MprSignal *sp)
{
    Proxy        *proxy;
    ProxyApp     *app;
    ProxyRequest *req;
    Http         *http;
    HttpHost     *host;
    HttpRoute    *route;
    HttpStream   *stream;
    int          nextHost, nextRoute, nextApp, nextReq;

    http = HTTP;
    print("\nProxy Report:");
    for (ITERATE_ITEMS(http->hosts, host, nextHost)) {
        for (ITERATE_ITEMS(host->routes, route, nextRoute)) {
            if ((proxy = route->extended) == 0 || proxy->magic != PROXY_MAGIC) {
                continue;
            }
            print("\nRoute %-40s ip %s:%d", route->pattern, proxy->ip, proxy->port);
            for (ITERATE_ITEMS(proxy->apps, app, nextApp)) {
                print("\n    App free networks %d, requests %d, seqno %d\n",
                      app->networks->length, app->requests->length, app->seqno);
                for (ITERATE_ITEMS(app->requests, req, nextReq)) {
                    stream = req->stream;
                    print(
                        "        Req %p network %p mask 0x%x, req eof %d, state %d, finalized output %d, input %d, error %d, netMask 0x%x",
                        req, req->proxyNet, req->proxyNet->eventMask, req->proxyNet->eof, stream->state,
                        stream->tx->finalizedOutput, stream->tx->finalizedInput, stream->error,
                        stream->net->eventMask);
                }
            }
        }
    }
}
#endif

#endif /* ME_COM_PROXY */

/*
    Copyright (c) Embedthis Software. All Rights Reserved.
    This software is distributed under a commercial license. Consult the LICENSE.md
    distributed with this software for full details and copyrights.
 */


/********* Start of file src/modules/testHandler.c ************/

/*
    testHandler.c -- Test handler to assist when developing handlers and modules

    This handler is a basic file handler without the frills for GET requests.

    Copyright (c) All Rights Reserved. See copyright notice at the bottom of the file.
 */

#include    "appweb.h"

#if ME_COM_TEST

static int test_open(HttpQueue *q)
{
    return 0;
}

static void test_close(HttpQueue *q)
{
}

static void test_incoming(HttpQueue *q, HttpPacket *packet)
{
    // httpFinalizeInput(q->stream);
}

static void test_ready(HttpQueue *q)
{
    httpSetStatus(q->stream, 200);
    httpFinalize(q->stream);
}

PUBLIC int httpTestInit(Http *http, MprModule *module)
{
    HttpStage *handler;

    handler = httpCreateHandler("test", module);

    handler->open = test_open;
    handler->incoming = test_incoming;
    handler->ready = test_ready;
    handler->close = test_close;
    return 0;
}

#endif

/*
    Copyright (c) Embedthis Software. All Rights Reserved.
    This software is distributed under a commercial license. Consult the LICENSE.md
    distributed with this software for full details and copyrights.
 */


/********* Start of file src/modules/testBenchHandler.c ************/

/*
    testBenchHandler.c - Test handler for benchmark suite

    Provides minimal action handlers for performance benchmarking and for the session tests, which
    need a live server-issued session id obtained without authenticating.

    Gated on ME_COM_TEST, the switch that means "build the test modules" -- the same one testHandler.c
    uses. It was gated on ME_DEBUG, which conflates "test fixtures wanted" with "optimization level".
    That held only while the default build happened to be debug; once the default became release
    (10184) the fixtures vanished from "make test" and every session test 404ed. A production build
    turns these off with ME_COM_TEST=0, which is what that switch is for.

    Copyright (c) All Rights Reserved. See copyright notice at the bottom of the file.
 */


#if ME_COM_TEST || ME_BENCHMARK

/*
    streamAction limits. STREAM_CHUNK is one write; STREAM_MAX caps what a request can ask for.
 */
#define STREAM_CHUNK    4080
#define STREAM_DEFAULT  65536
#define STREAM_MAX      (64 * 1024 * 1024)

/*
    Simple success action - minimal overhead for baseline benchmarking
 */
static void testBenchSuccess(HttpStream *stream)
{
    httpSetStatus(stream, 200);
    httpWrite(stream->writeq, "OK");
    httpFinalize(stream);
}

/*
    WebSocket echo callback - handles incoming WebSocket messages
    Echoes back messages with the same type (text/binary)
 */
static void wsEchoCallback(HttpStream *stream, int event, int arg)
{
    HttpPacket *packet;

    if (event == HTTP_EVENT_READABLE) {
        // Echo back all messages
        for (packet = httpGetPacket(stream->readq); packet; packet = httpGetPacket(stream->readq)) {
            if (packet->type == WS_MSG_TEXT || packet->type == WS_MSG_BINARY) {
                httpSendBlock(stream, packet->type, httpGetPacketStart(packet), httpGetPacketLength(packet), 0);
            }
        }
    } else if (event == HTTP_EVENT_APP_CLOSE) {
        // Connection closed - nothing special needed
    }
}

/*
    WebSocket echo handler - for WebSocket benchmarking
    Sets up the notifier to echo back messages
 */
static void testBenchWs(HttpStream *stream)
{
    httpSetStreamNotifier(stream, wsEchoCallback);
}

/*
    Upload response handler - responds to successful upload tests
 */
static void testBenchUpload(HttpStream *stream)
{
    httpSetStatus(stream, 200);
    httpFinalize(stream);
}


/*
    Report what the upload filter staged, so an upload can be verified behind a handler that is not a
    gateway. Without this the only route carrying uploadFilter targets a CGI program, and the filter's
    behaviour under fileHandler, fastHandler and proxyHandler is inferred rather than tested.

    Prints one line per staged file from rx->files -- which is the filter's own record, not a
    re-derivation of it -- then every request parameter, which is where the filter's own
    FILE_SIZE_<name> and FILE_CLIENT_FILENAME_<name> land. A test can assert the two agree. The
    FILE_<n>_* spelling is not among them: those are synthesised by httpCreateCGIParams for a
    gateway, so they appear on the CGI and FastCGI routes and not here.

    ITERATE_ITEMS leaves index already advanced past the item it yielded, so index is the 1-based
    file number. This is the same convention var.c uses for FILE_<n>_*, and why the CGI tests
    assert CGI_FILE_1_SIZE for a single upload.
 */
static void uploadReportAction(HttpStream *stream)
{
    HttpUploadFile  *file;
    MprJson         *params, *param;
    int             index;

    httpSetStatus(stream, 200);
    httpSetHeaderString(stream, "Content-Type", "text/plain");

    for (ITERATE_ITEMS(stream->rx->files, file, index)) {
        httpWrite(stream->writeq, "FILE %d name=%s client=%s size=%zd type=%s\n",
                  index, file->name ? file->name : "",
                  file->clientFilename ? file->clientFilename : "",
                  file->size, file->contentType ? file->contentType : "");
    }
    if ((params = httpGetParams(stream)) != 0) {
        for (ITERATE_JSON(params, param, index)) {
            httpWrite(stream->writeq, "PARAM %s=%s\n", param->name, param->value ? param->value : "");
        }
    }
    httpWrite(stream->writeq, "FILES %d\n", stream->rx->files ? mprGetListLength(stream->rx->files) : 0);
    httpFinalize(stream);
}


/*
    Write "size" bytes of a repeating printable pattern, for the response flow-control tests.

    HTTP_BLOCK is the whole point of this fixture and must not be relaxed to a buffering write. An
    action runs on a worker thread, so blocking there is legitimate, and a blocking write is the only
    mode that actually stops when the write queue fills and resumes when it drains. A buffered write
    would queue the entire body regardless of whether the server has any backpressure at all, so a
    slow-reader test built on it would pass against a server with flow control removed -- it would be
    measuring the queue's capacity, not the mechanism.

    The size is clamped. An unclamped size parameter would make this an unauthenticated
    memory-exhaustion endpoint in every ME_COM_TEST build, which is a poor trade for a test fixture.
 */
static void streamAction(HttpStream *stream)
{
    char    pattern[STREAM_CHUNK + 1];
    cchar   *value;
    ssize   size, remaining, thisWrite;
    int     i;

    value = httpGetParam(stream, "size", 0);
    size = value ? (ssize) stoi(value) : STREAM_DEFAULT;
    if (size < 0) {
        size = STREAM_DEFAULT;
    }
    if (size > STREAM_MAX) {
        size = STREAM_MAX;
    }
    /*
        A 50-digit line plus a newline, so a test can check structure at the tail as well as the
        total -- a flow-control defect that drops a window mid-body leaves the total wrong, and one
        that duplicates a window leaves the structure wrong. Neither check alone catches both.
     */
    for (i = 0; i < STREAM_CHUNK; i++) {
        pattern[i] = (char) (((i + 1) % 51 == 0) ? '\n' : ('0' + (i % 10)));
    }
    pattern[STREAM_CHUNK] = '\0';

    httpSetStatus(stream, 200);
    httpSetHeaderString(stream, "Content-Type", "text/plain");
    httpSetContentLength(stream, size);

    for (remaining = size; remaining > 0; remaining -= thisWrite) {
        thisWrite = min(remaining, STREAM_CHUNK);
        if (httpWriteBlock(stream->writeq, pattern, thisWrite, HTTP_BLOCK) != thisWrite) {
            break;
        }
    }
    httpFinalize(stream);
}

/*
    Session variable read/write, so a test can establish an anonymous session and observe its state.

    This is the only way a test can hold a genuine, live, server-issued session id obtained WITHOUT
    authenticating - which is what the session-fixation and id-rotation tests need. A test that plants
    a fabricated id proves nothing, because an id the server never issued was never going to be
    adopted; the case that matters is a real one presented at the privilege transition.

    Ordering is deliberate and load bearing: a GET reads and must NOT create a session, so an
    unauthenticated client cannot mint server state simply by asking. A POST writes and therefore
    does establish one. Do not "fix" the GET to create a session - see test/session/novel-cookie.
 */
static void sessionTestAction(HttpStream *stream)
{
    cchar   *value;

    if (scaselessmatch(stream->rx->method, "POST")) {
        value = httpGetParam(stream, "number", 0);
        httpSetSessionVar(stream, "number", value);
    } else {
        value = httpGetSessionVar(stream, "number", 0);
    }
    httpSetStatus(stream, 200);
    httpSetHeaderString(stream, "Content-Type", "text/plain");
    httpWrite(stream->writeq, "Number %s\n", value ? value : "null");
    httpFinalize(stream);
}


/*
    Stream-notifier leak probe.

    A handler that installs a stream notifier owns it for one request only. On a keep-alive
    connection the stream is reset and reused, so a notifier left installed then runs for a request
    served by a different handler -- and every such notifier reads the handler queue's queueData as
    its own private type, which is a wild pointer read once another handler owns that queue. The
    proxy handler installs one, so the pairing is reachable in an ordinary configuration.

    The probe makes the leak observable without depending on that misread crashing. The route
    /action/notifier-probe installs a notifier that counts every firing which does not belong to its
    own request, and /action/notifier-leaks reports the count. Zero is the invariant. The route is
    unique to the probe, so comparing rx->uri identifies a firing exactly; a firing after the reset
    sees a fresh rx with no uri at all, which is likewise not the probe's own.
 */
static volatile int notifierLeakCount;

static void probeNotifier(HttpStream *stream, int event, int arg)
{
    cchar   *uri;

    uri = stream->rx ? stream->rx->uri : 0;
    if (!smatch(uri, "/action/notifier-probe")) {
        mprAtomicAdd(&notifierLeakCount, 1);
    }
}

static void notifierProbeAction(HttpStream *stream)
{
    httpSetStreamNotifier(stream, probeNotifier);
    httpSetStatus(stream, 200);
    httpSetHeaderString(stream, "Content-Type", "text/plain");
    httpWrite(stream->writeq, "PROBE\n");
    httpFinalize(stream);
}

static void notifierLeaksAction(HttpStream *stream)
{
    httpSetStatus(stream, 200);
    httpSetHeaderString(stream, "Content-Type", "text/plain");
    httpWrite(stream->writeq, "LEAKS %d\n", notifierLeakCount);
    httpFinalize(stream);
}


/*
    Module initialization - called from config.c maLoadModules()
    Registers action callbacks via httpDefineAction
 */
PUBLIC int httpTestBenchInit(Http *http, MprModule *module)
{
    // Exact match only via hash lookup
    // Register action callbacks - httpDefineAction uses URI path only
    httpDefineAction("/test/bench/", testBenchSuccess);
    httpDefineAction("/test/ws/", testBenchWs);
    httpDefineAction("/test/upload/", testBenchUpload);
    httpDefineAction("/action/sessionTest", sessionTestAction);
    httpDefineAction("/action/sessionCacheTest", sessionTestAction);
    httpDefineAction("/action/sessionXsrfTest", sessionTestAction);

    /*
        Scenario-test fixtures. actionHandler dispatches on an exact rx->pathInfo match, so each
        needs its own entry -- a prefix will not do. /wsecho reuses testBenchWs rather than adding a
        second echo: the callback is already correct and a copy would be one more thing to keep in
        step.
     */
    httpDefineAction("/action/stream", streamAction);
    httpDefineAction("/action/upload", uploadReportAction);
    httpDefineAction("/wsecho", testBenchWs);
    httpDefineAction("/wslimit", testBenchWs);
    httpDefineAction("/action/notifier-probe", notifierProbeAction);
    httpDefineAction("/action/notifier-leaks", notifierLeaksAction);
    return 0;
}

#endif // ME_COM_TEST || ME_BENCHMARK

/*
    Copyright (c) Embedthis Software. All Rights Reserved.
    This software is distributed under a commercial license. Consult the LICENSE.md
    distributed with this software for full details and copyrights.
 */


/********* Start of file src/modules/testWebSocketsHandler.c ************/

/*
    testWebSocketsHandler.c -- Test handler to assist when developing web sockets apps

    Copyright (c) All Rights Reserved. See copyright notice at the bottom of the file.
 */
#include    "appweb.h"

#if ME_COM_TEST_WEBSOCKETS

static int test_open(HttpQueue *q)
{
    return 0;
}

static void test_close(HttpQueue *q)
{
}

static void test_incoming(HttpQueue *q, HttpPacket *packet)
{
    // 3K
    char *data =
        "\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
0123456789012345678901234567890123456789012345678\n\
END OF DOCUMENT\n";

    httpSendBlock(q->stream, WS_MSG_TEXT, data, slen(data), 0);
}

static void test_ready(HttpQueue *q)
{
}

PUBLIC int httpTestWebSocketsInit(Http *http, MprModule *module)
{
    HttpStage *handler;

    handler = httpCreateHandler("testWebSocketsHandler", module);

    handler->open = test_open;
    handler->incoming = test_incoming;
    handler->ready = test_ready;
    handler->close = test_close;
    return 0;
}

#endif

/*
    Copyright (c) Embedthis Software. All Rights Reserved.
    This software is distributed under a commercial license. Consult the LICENSE.md
    distributed with this software for full details and copyrights.
 */

#else
void dummyAppweb(){}
#endif /* ME_COM_APPWEB */
