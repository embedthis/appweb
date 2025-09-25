/**
    @file appweb.h
    @brief Embedthis Appweb HTTP Web Server header
    @description This header provides the core API for the Embedthis Appweb embedded web server.
        Appweb is a compact, fast embedded web server supporting HTTP/1 and HTTP/2 protocols.
        It includes configuration parsing, module loading, and server management functionality.
    @stability Stable
 */

#ifndef _h_APPWEB
#define _h_APPWEB 1

/********************************* Includes ***********************************/

#include    "osdep.h"
#include    "mpr.h"
#include    "http.h"

#ifdef __cplusplus
extern "C" {
#endif

/********************************* Tunables ***********************************/

#define MA_UNLOAD_TIMEOUT "5mins"           /**< Default module inactivity timeout */

/********************************** Defines ***********************************/

/*
    Build Configuration Macros - Component Feature Flags
    These macros control which optional Appweb components are included in the build.
    Set to 1 to enable, 0 to disable. Can be overridden at build time.
 */

/*
    ME_COM_CGI: Enable CGI (Common Gateway Interface) handler support.
    When enabled, allows Appweb to execute CGI scripts and programs.
    CGI support enables execution of external programs to generate dynamic content.
 */
#ifndef ME_COM_CGI
    #define ME_COM_CGI 0                /**< Enable CGI handler support */
#endif

/*
    ME_COM_EJSCRIPT: Enable Ejscript server-side JavaScript support.
    When enabled, allows execution of server-side JavaScript using the Ejscript engine.
    This provides dynamic scripting capabilities within Appweb.
 */
#ifndef ME_COM_EJSCRIPT
    #define ME_COM_EJSCRIPT 0           /**< Enable Ejscript JavaScript support */
#endif

/*
    ME_COM_ESP: Enable ESP (Embedded Server Pages) web framework.
    When enabled, includes the ESP web framework for creating dynamic web applications.
    ESP provides MVC architecture, templating, and database integration.
 */
#ifndef ME_COM_ESP
    #define ME_COM_ESP 0                /**< Enable ESP web framework */
#endif

/*
    ME_COM_FAST: Enable FastCGI protocol support.
    When enabled, allows Appweb to communicate with FastCGI applications.
    FastCGI provides better performance than traditional CGI for dynamic content generation.
 */
#ifndef ME_COM_FAST
    #define ME_COM_FAST 0               /**< Enable FastCGI protocol support */
#endif

/*
    ME_COM_MDB: Enable Memory Database (MDB) support.
    When enabled, includes the in-memory database functionality.
    MDB provides fast, lightweight database operations for embedded applications.
 */
#ifndef ME_COM_MDB
    #define ME_COM_MDB 0                /**< Enable Memory Database support */
#endif

/*
    ME_COM_PHP: Enable PHP scripting language support.
    When enabled, allows Appweb to execute PHP scripts for dynamic content generation.
    Requires PHP interpreter to be available on the system.
 */
#ifndef ME_COM_PHP
    #define ME_COM_PHP 0                /**< Enable PHP scripting support */
#endif

/*
    ME_COM_PROXY: Enable HTTP proxy and reverse proxy functionality.
    When enabled, allows Appweb to act as an HTTP proxy server,
    forwarding requests to backend servers. Supports load balancing and failover.
 */
#ifndef ME_COM_PROXY
    #define ME_COM_PROXY 0              /**< Enable HTTP proxy functionality */
#endif

/*
    ME_COM_SDB: Enable SQLite Database (SDB) support.
    When enabled, includes SQLite database functionality for persistent storage.
    SDB provides SQL database operations with SQLite as the backend engine.
 */
#ifndef ME_COM_SDB
    #define ME_COM_SDB 0                /**< Enable SQLite Database support */
#endif

/*
    ME_COM_SSL: Enable SSL/TLS secure communications support.
    When enabled, includes SSL/TLS encryption capabilities for HTTPS connections.
    Requires either OpenSSL or MbedTLS cryptographic library.
 */
#ifndef ME_COM_SSL
    #define ME_COM_SSL 0                /**< Enable SSL/TLS secure communications */
#endif

/*
    ME_COM_TEST: Enable test handler module for development and testing.
    When enabled, includes the test handler which provides debugging
    and testing utilities. Should be disabled in production builds.
 */
#ifndef ME_COM_TEST
    #define ME_COM_TEST 1               /**< Enable test handler module */
#endif

/*
    ME_COM_TEST_WEBSOCKETS: Enable WebSocket test functionality.
    When enabled, includes WebSocket testing capabilities in the test handler.
    Used for development and testing WebSocket protocol support.
 */
#ifndef ME_COM_TEST_WEBSOCKETS
    #define ME_COM_TEST_WEBSOCKETS 1    /**< Enable WebSocket test functionality */
#endif

/******************************************************************************/

/*
    Configuration Parsing State Flags
    These flags control the behavior during configuration file parsing.
 */

/*
    MA_PARSE_NON_SERVER: Configuration file parsing mode flag.
    Indicates that the configuration file is being parsed by a utility program
    rather than the main server. This affects how certain directives are processed.
 */
#define MA_PARSE_NON_SERVER 0x1         /**< Command file being parsed by a utility program */

/**
    Current configuration parse state
    @description Structure that maintains the parsing state when processing Appweb configuration files.
        This state is used to track the current host, route, authentication settings, and other context
        information during configuration file parsing. The state can be pushed and popped to handle
        nested configuration blocks and include files.
    @stability Internal
 */
typedef struct MaState {
    HttpHost *host;                     /**< Current host */
    HttpAuth *auth;                     /**< Quick alias for route->auth */
    HttpRoute *route;                   /**< Current route */
    MprFile *file;                      /**< Config file handle */
    char *key;                          /**< Current directive being parsed */
    char *configDir;                    /**< Directory containing config file */
    char *filename;                     /**< Config file name */
    char *endpoints;                    /**< Virtual host endpoints */
    char *data;                         /**< Config data (managed) */
    int lineNumber;                     /**< Current line number */
    int enabled;                        /**< True if the current block is enabled */
    int flags;                          /**< Parsing flags */
    struct MaState *prev;               /**< Previous (inherited) state */
    struct MaState *top;                /**< Top level state */
    struct MaState *current;            /**< Current state */
} MaState;

/**
    Appweb configuration file directive parsing callback function
    @description Directive callbacks are invoked to parse a directive. Directive callbacks are registered using
        maAddDirective. The callback receives the current parsing state and the directive key-value pair
        to process. The function should parse the directive value and update the configuration accordingly.
    @param state Current config parse state
    @param key Directive key name
    @param value Directive key value
    @return Zero if successful, otherwise a negative MPR error code. See the Appweb log for diagnostics.
    @stability Stable
 */
typedef int (MaDirective)(MaState *state, cchar *key, cchar *value);

/**
    Define a new appweb configuration file directive
    @description The appweb configuration file parser is extensible. New directives can be registered by this call. When
        encountered in the config file, the given callback procedure will be invoked to parse the directive.
        This allows custom modules to extend the configuration syntax.
    @param directive Directive name
    @param proc Directive callback procedure of the type MaDirective
    @stability Stable
 */
PUBLIC void maAddDirective(cchar *directive, MaDirective proc);

/**
    Configure a web server
    @description This will configure a web server based on either a configuration file or using the supplied
        IP address and port. Parameters provided will override corresponding values in the configuration file.
        This function provides a convenient way to programmatically configure the server while still using
        a base configuration file.
    @param configFile File name of the Appweb configuration file (appweb.conf) that defines the web server configuration
    @param home Admin directory for the server. This overrides the value in the config file
    @param documents Default directory for web documents to serve. This overrides the value in the config file
    @param ip IP address to listen on. This overrides the value specified in the config file
    @param port Port address to listen on. This overrides the value specified in the config file
    @return Zero if successful, otherwise a negative MPR error code. See the Appweb log for diagnostics.
    @stability Stable
 */
PUBLIC int maConfigureServer(cchar *configFile, cchar *home, cchar *documents, cchar *ip, int port);

/**
    Get the next argument in a directive
    @description Break a string into arguments. Arguments may be quoted and an outer quoting of the
        entire argument is removed. This function modifies the input string by inserting null terminators
        to separate arguments.
    @param s String to examine and tokenize
    @param tok Pointer to store the reference to the next token
    @return Pointer to the current token (not allocated, points into the original string)
    @stability Stable
 */
PUBLIC char *maGetNextArg(char *s, char **tok);

/**
    Load an appweb module
    @description Load an appweb module. If the module is already loaded, this call will return successfully without
        reloading. Modules can be dynamically loaded or may also be pre-loaded using static linking.
        The module name should correspond to the module's initialization function name.
    @param name Module name used for identification and to locate the initialization function
    @param libname Library path name for dynamic loading, or NULL for statically linked modules
    @return Zero if successful, otherwise a negative MPR error code. See the Appweb log for diagnostics.
    @stability Stable
 */
PUBLIC int maLoadModule(cchar *name, cchar *libname);

/**
    Load default modules
    @description Load all the default Appweb modules including CGI, ESP, proxy, and test modules based on
        the compile-time configuration. This function is typically called during server initialization.
    @return Zero if successful, otherwise a negative MPR error code. See the Appweb log for diagnostics.
    @stability Stable
 */
PUBLIC int maLoadModules(void);

/**
    Parse an Appweb configuration file
    @description Parse the configuration file and configure the server. This creates a default host and route
        and then configures the server based on config file directives. This is the primary function for
        initializing the server from a configuration file.
    @param path Configuration file pathname
    @return Zero if successful, otherwise a negative MPR error code. See the Appweb log for diagnostics.
    @stability Stable
 */
PUBLIC int maParseConfig(cchar *path);

/**
    Parse a configuration file with state context
    @description Parse a configuration file within the context of the given state. This is used internally
        for parsing include files and nested configuration blocks. The state maintains the parsing context
        including current host, route, and authentication settings.
    @param state Current state level object containing parsing context
    @param path Filename to parse
    @return Zero if successful, otherwise a negative MPR error code. See the Appweb log for diagnostics.
    @stability Stable
 */
PUBLIC int maParseFile(MaState *state, cchar *path);

/**
    Pop the state
    @description This is used when parsing config files to handle nested include files and block level directives.
        When exiting a configuration block or include file, this function restores the previous parsing state.
    @param state Current state to pop
    @return The next lower level state object, or NULL if at the top level
    @stability Stable
 */
PUBLIC MaState *maPopState(MaState *state);

/**
    Push the state
    @description This is used when parsing config files to handle nested include files and block level directives.
        When entering a configuration block or include file, this function saves the current state and creates
        a new parsing context.
    @param state Current state to push
    @return The state passed as a parameter which becomes the new top level state
    @stability Stable
 */
PUBLIC MaState *maPushState(MaState *state);

/**
    Tokenize a string based on route data
    @description This is a utility routine to parse a string into tokens given a format specifier.
        Mandatory tokens can be specified with "%" format specifier. Optional tokens are specified with "?" format.
        Values wrapped in quotes will have the outermost quotes trimmed.
    @param state Current config parsing state
    @param str String to tokenize and parse
    @param fmt Format string specifier defining expected token types
    Supported token format specifiers:
    - %B - Boolean. Parses: on/off, true/false, yes/no
    - %N - Number. Parses numbers in base 10
    - %S - String. Removes quotes
    - %P - Path string. Removes quotes and expands ${PathVars}. Resolved relative to host->dir (ServerRoot)
    - %W - Parse words into a list
    - %! - Optional negate. Set value to HTTP_ROUTE_NOT present, otherwise zero
    @return True if the string can be successfully parsed
    @stability Stable
 */
PUBLIC bool maTokenize(MaState *state, cchar *str, cchar *fmt, ...);

/**
    Create and run a simple web server listening on a single IP address
    @description Create a simple web server without using a configuration file. The server is created to listen on
        the specified IP address and port. This routine provides a one-line embedding of Appweb. If you want to
        use a config file, try the maRunWebServer instead.
    @param ip IP address on which to listen. Set to "0.0.0.0" to listen on all interfaces
    @param port Port number to listen on
    @param home Home directory for the web server
    @param documents Directory containing the documents to serve
    @return Zero if successful, otherwise a negative MPR error code. See the Appweb log for diagnostics.
    @stability Stable
 */
PUBLIC int maRunSimpleWebServer(cchar *ip, int port, cchar *home, cchar *documents);

/**
    Create and run a web server based on a configuration file
    @description Create a web server configuration based on the supplied config file. This routine provides
        a one-line embedding of Appweb. If you don't want to use a config file, try the maRunSimpleWebServer
        instead.
    @param configFile File name of the Appweb configuration file (appweb.conf) that defines the web server configuration
    @return Zero if successful, otherwise a negative MPR error code. See the Appweb log for diagnostics.
    @stability Stable
 */
PUBLIC int maRunWebServer(cchar *configFile);

/**
    Save the authorization configuration to a file
    @description Write the current authorization configuration to a file using the AuthFile schema format.
        The file format consists of user and role definitions with their associated capabilities.
    AuthFile schema:
        User name password abilities...
        Role name abilities...
    @param auth Auth object allocated by httpCreateAuth
    @param path Path name of file to write
    @return Zero if successful, otherwise a negative MPR error code
    @stability Internal
 */
PUBLIC int maWriteAuthFile(HttpAuth *auth, char *path);

/*
    Internal module initialization functions
 */
#if ME_COM_CGI
/**
    Initialize the CGI handler module
    @description Initialize the CGI (Common Gateway Interface) handler module for processing CGI scripts.
    @param http HTTP service object
    @param mp Module object for the CGI handler
    @return Zero if successful, otherwise a negative MPR error code
    @stability Internal
 */
PUBLIC int httpCgiInit(Http *http, MprModule *mp);
#endif
#if ME_COM_FAST
/**
    Initialize the FastCGI handler module
    @description Initialize the FastCGI handler module for processing FastCGI applications.
    @param http HTTP service object
    @param mp Module object for the FastCGI handler
    @return Zero if successful, otherwise a negative MPR error code
    @stability Internal
 */
PUBLIC int httpFastInit(Http *http, MprModule *mp);
#endif
#if ME_COM_ESP
/**
    Initialize the ESP (Embedded Server Pages) module
    @description Initialize the ESP web framework module for dynamic content generation.
    @param http HTTP service object
    @param mp Module object for the ESP framework
    @return Zero if successful, otherwise a negative MPR error code
    @stability Internal
 */
PUBLIC int httpEspInit(Http *http, MprModule *mp);
#endif
#if ME_COM_PROXY
/**
    Initialize the proxy handler module
    @description Initialize the proxy handler module for HTTP proxying functionality.
    @param http HTTP service object
    @param mp Module object for the proxy handler
    @return Zero if successful, otherwise a negative MPR error code
    @stability Internal
 */
PUBLIC int httpProxyInit(Http *http, MprModule *mp);
#endif
#if ME_COM_TEST
/**
    Initialize the test handler module
    @description Initialize the test handler module for development and testing functionality.
    @param http HTTP service object
    @param mp Module object for the test handler
    @return Zero if successful, otherwise a negative MPR error code
    @stability Internal
 */
PUBLIC int httpTestInit(Http *http, MprModule *mp);
#endif
#if ME_COM_TEST_WEBSOCKETS
/**
    Initialize the test WebSockets module
    @description Initialize the test WebSockets module for WebSocket testing functionality.
    @param http HTTP service object
    @param mp Module object for the WebSocket test module
    @return Zero if successful, otherwise a negative MPR error code
    @stability Internal
 */
PUBLIC int httpTestWebSocketsInit(Http *http, MprModule *mp);
#endif

/**
    Process trace directive
    @description Internal function to process trace configuration directives for HTTP request/response tracing.
    @param state Current configuration parsing state
    @param trace HTTP trace object
    @param key Directive key name
    @param value Directive value
    @return Zero if successful, otherwise a negative MPR error code
    @stability Internal
 */
PUBLIC int maTraceDirective(MaState *state, HttpTrace *trace, cchar *key, cchar *value);

/**
    Process trace log directive
    @description Internal function to process trace log configuration directives for configuring trace logging.
    @param state Current configuration parsing state
    @param trace HTTP trace object
    @param key Directive key name
    @param value Directive value
    @return Zero if successful, otherwise a negative MPR error code
    @stability Internal
 */
PUBLIC int maTraceLogDirective(MaState *state, HttpTrace *trace, cchar *key, cchar *value);

#ifdef __cplusplus
} /* extern C */
#endif

/*
    Build Customization Support
 */

/*
    ME_CUSTOMIZE: Enable build-time customization support.
    When defined, includes the customize.h header file which allows
    build-time overrides and customizations of default behavior and settings.
 */
#if ME_CUSTOMIZE
 #include "customize.h"            /**< Build-time customization overrides */
#endif

#endif /* _h_APPWEB */

/*
    Copyright (c) Embedthis Software. All Rights Reserved.
    This software is distributed under a commercial license. Consult the LICENSE.md
    distributed with this software for full details and copyrights.
 */
