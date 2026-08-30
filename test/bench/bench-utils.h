/*
    bench-utils.h - Benchmark utility functions and data structures

    Copyright (c) All Rights Reserved. See details at the end of the file.
 */

#ifndef _h_BENCH_UTILS
#define _h_BENCH_UTILS 1

/********************************** Includes **********************************/

#include "mpr.h"
#include "http.h"

#ifdef __cplusplus
extern "C" {
#endif

/********************************** Constants ********************************/

/**
 * HTTP request timeout in milliseconds
 * Prevents benchmark from hanging on unresponsive server
 */
#define HTTP_TIMEOUT_MS 20000  // 20 second timeout

/*********************************** Types ************************************/

/**
 * Benchmark result structure
 * Stores timing and statistical data for a benchmark run
 */
typedef struct BenchResult {
    char *name;               // Benchmark name
    int iterations;           // Number of iterations run
    Ticks totalTime;          // Total time (milliseconds)
    Ticks minTime;            // Minimum latency (ms)
    Ticks maxTime;            // Maximum latency (ms)
    double avgTime;           // Average latency (ms)
    double p95Time;           // 95th percentile (ms)
    double p99Time;           // 99th percentile (ms)
    double requestsPerSec;    // Throughput
    int64 bytesTransferred;   // Total bytes
    int errors;               // Error count
    MprList *samples;         // Individual timing samples for percentiles (MPR GC managed)
} BenchResult;

/**
 * Benchmark application context
 * Stores state for benchmark runs including error tracking
 */
typedef struct BenchApp {
    HttpNet *net;                     // Network connection for benchmarks
    MprDispatcher *dispatcher;        // Dispatcher for async operations
    BenchResult **results;            // Array of benchmark results
    MprJson *resultsJson;             // JSON object for accumulated results
    MprSocket *rawSocket;             // Raw socket for GC retention during raw benchmarks
    MprSsl *ssl;                      // SSL context for GC retention during raw HTTPS benchmarks
    char *testData;                   // Test data buffer
    char *testDataArray[4];           // Pre-loaded test data for each file class
    int64 memoryInitial;              // Server memory at start of benchmark
    int64 memoryFinal;                // Server memory at end of benchmark
    int protocol;                     // HTTP_1_1 or HTTP_1_0
    int resultCount;                  // Number of results in array
    int totalErrors;                  // Total errors across all benchmarks
    int errorCount;                   // Errors within current benchmark phase
    bool close;                       // Close connection after request
    bool stopOnErrors;                // Set via TESTME_STOP environment variable
    bool fatalError;                  // Set when test fails and stopOnErrors is true
    bool reuseConnection;             // true = warm (keep-alive), false = cold (new per request)
} BenchApp;

/********************************** Prototypes ********************************/

/**
 * Get memory size of the appweb server process in KB
 * Reads PID from .pidfile and uses ps to get RSS (resident set size)
 * @return Server memory in KB, or 0 if not available
 */
extern int64 getServerMemory(void);

/**
 * Calculate group duration with multiplier and enforce minimum
 * @param duration Base duration in milliseconds
 * @param multiplier Fraction of base duration (e.g., 0.25 = 25%)
 * @return Calculated duration in milliseconds (enforces minimum)
 */
extern Ticks calculateGroupDuration(Ticks duration, double multiplier);

/**
 * Check if response has "Connection: close" header
 * @param headers Raw HTTP headers
 * @param len Length of headers buffer
 * @return true if connection should be closed
 */
extern bool hasConnectionClose(cchar *headers, size_t len);

/**
 * Extract Content-Length from raw HTTP headers
 * @param headers Raw HTTP headers
 * @param len Length of headers buffer
 * @return Content-Length value, or -1 if not found or invalid
 */
extern ssize parseContentLength(cchar *headers, size_t len);

/**
 * Read until we find end of HTTP headers (\r\n\r\n or \n\n)
 * @param sp Socket to read from
 * @param buf Buffer to store headers and initial body data
 * @param bufsize Size of buffer
 * @param bodyStart Output: offset where body data begins (after header delimiter)
 * @param bodyLen Output: how much body data was read along with headers
 * @return Total bytes read, or -1 on error
 */
extern ssize readHeaders(MprSocket *sp, char *buf, size_t bufsize, ssize *bodyStart, ssize *bodyLen);

/**
 * Execute a single raw socket request
 * Caller must provide a connected socket. On error or Connection: close, socket is closed
 * and caller should check sp->fd < 0 to detect need for reconnection.
 * @param sp Connected socket (caller manages creation and GC retention)
 * @param request Raw HTTP request string
 * @param expectedSize Expected response body size for validation
 * @return true on success, false on error
 */
extern bool executeRawRequest(MprSocket *sp, cchar *request, ssize expectedSize);

/**
 * Configure duration-based benchmarking from TESTME_DURATION environment variable
 * Divides total duration into soak (10%) and benchmark (90%) phases
 * Benchmark time is divided equally among test groups
 * @param numGroups Number of test groups to allocate benchmark time among
 */
extern void configureDuration(int numGroups);

/**
 * Get soak phase duration
 * @return Soak duration in milliseconds
 */
extern Ticks getSoakDuration(void);

/**
 * Get benchmark duration per group
 * @return Duration in milliseconds allocated to each test group
 */
extern Ticks getBenchDuration(void);

/**
 * Create a new benchmark result structure
 * @param name Benchmark name
 * @return Allocated benchmark result structure (MPR GC managed)
 */
extern BenchResult *createBenchResult(cchar *name);

/**
 * Record a timing sample
 * @param result Benchmark result structure
 * @param elapsed Elapsed time in milliseconds
 */
extern void recordTiming(BenchResult *result, Ticks elapsed);

/**
 * Calculate statistics from recorded samples
 * Computes min, max, avg, p95, p99, and requests/sec
 * @param result Benchmark result structure
 */
extern void calculateStats(BenchResult *result);

/**
 * Print benchmark results to console
 * @param result Benchmark result structure
 */
extern void printBenchResult(BenchResult *result);

/**
 * Save benchmark group results to JSON
 * Appends results to the provided JSON structure
 * @param resultsJson JSON object to accumulate results
 * @param groupName Test group name (e.g., "static_files", "uploads")
 * @param results Array of benchmark results
 * @param count Number of results in array
 */
extern void saveBenchGroup(MprJson *resultsJson, cchar *groupName, BenchResult **results, int count);

/**
 * Save final results to JSON and Markdown files
 * Writes complete results with metadata to:
 *   - doc/benchmarks/latest.json5
 *   - doc/benchmarks/latest.md
 * @param resultsJson JSON object containing accumulated results
 * @param memoryInitial Server memory after soak (KB), 0 if not measured
 * @param memoryFinal Server memory at completion (KB), 0 if not measured
 */
extern void saveFinalResults(MprJson *resultsJson, int64 memoryInitial, int64 memoryFinal);

/*
    NULL-safe Result Management

    Error tracking fields are stored in the BenchApp struct:
    - totalErrors: Total errors across all benchmarks
    - stopOnErrors: Set via TESTME_STOP environment variable
    - fatalError: Set when test fails and stopOnErrors is true
 */

/**
 * Initialize a benchmark result (NULL-safe wrapper for createBenchResult)
 * @param name Benchmark name
 * @param recordResults True to create result, false to return NULL
 * @return Benchmark result or NULL if not recording
 */
extern BenchResult *initResult(cchar *name, bool recordResults);

/**
 * Record a request result (NULL-safe)
 * Updates iterations, timing, bytes, and errors
 * Handles global error tracking and stopOnErrors behavior
 * @param app Benchmark application context (for error tracking)
 * @param result Benchmark result (NULL-safe)
 * @param isSuccess True if request succeeded
 * @param elapsed Elapsed time in milliseconds
 * @param bytes Bytes transferred
 */
extern void recordRequest(BenchApp *app, BenchResult *result, bool isSuccess, Ticks elapsed, ssize bytes);

/**
 * Log a request error with consistent formatting
 * Increments app->totalErrors and app->errorCount, logs error, and checks app->stopOnErrors
 * @param app Benchmark application context
 * @param benchName Benchmark name (e.g., "Static files", "Auth")
 * @param url Request URL
 * @param status HTTP status code (0 for client-side errors like timeout or connection failure)
 * @param err Optional error message from client (may be NULL)
 * @param recordResults True if recording results (limits error logging)
 * @return false if benchmark should stop (fatalError set), true to continue
 */
extern bool logError(BenchApp *app, cchar *benchName, cchar *url, int status, cchar *err, bool recordResults);

/******************************** Connection Management ************************/

/**
 * Connect or reconnect the raw socket
 * @param app Benchmark application context
 * @param host Target hostname
 * @param port Target port
 * @param ssl SSL context for HTTPS, or NULL for HTTP
 * @return true on success, false on error
 */
extern bool connectRawSocket(BenchApp *app, cchar *host, int port, MprSsl *ssl);

/**
 * Execute HTTP request on existing network connection (for keep-alive)
 * Similar to httpRequest() but reuses the provided net for connection persistence
 * @param app Benchmark application context
 * @param net Network connection
 * @param method HTTP method (GET, PUT, etc.)
 * @param uri Request URI
 * @param data Request body data (NULL for GET)
 * @param err Output: error message on failure
 * @return HttpStream on success, NULL on error
 */
extern HttpStream *netRequest(BenchApp *app, HttpNet *net, cchar *method, cchar *uri, cchar *data, char **err);

/**
 * Set no-linger on stream socket to avoid TIME_WAIT buildup
 * Called before destroying stream on cold connections
 * @param stream HTTP stream
 */
extern void setNoLinger(HttpStream *stream);

/**
 * Initialize connection context for warm/cold mode
 * @param app Benchmark application context
 * @param warm true for keep-alive connections, false for new connection per request
 * @param protocol HTTP protocol version (HTTP_1_1 or HTTP_1_0)
 */
extern void initConnection(BenchApp *app, bool warm, int protocol);

/**
 * Get network connection
 * For warm: returns existing net, creates on first call
 * For cold: creates new net each time (after previous was destroyed)
 * @param app Benchmark application context
 * @return Network connection
 */
extern HttpNet *getNet(BenchApp *app);

/**
 * Release network connection after request
 * For warm: keeps connection alive
 * For cold: destroys connection to force new one next time
 * @param app Benchmark application context
 */
extern void releaseNet(BenchApp *app);

/**
 * Free network connection context
 * @param app Benchmark application context
 */
extern void freeConnection(BenchApp *app);

/******************************** Response Handling ****************************/

/**
 * Get HTTP response status
 * Reads and discards the response body to leave the connection in a clean state
 * @param app Benchmark application context
 * @param stream HTTP stream from httpRequest()
 * @param statusOut Output: HTTP status code (0 on timeout)
 * @param acceptAny2xx True to accept any 2xx status (for PUT), false to require 200 (for GET)
 * @return true if request succeeded, false on timeout or non-matching status
 */
extern bool getResponse(BenchApp *app, HttpStream *stream, int *statusOut, bool acceptAny2xx);

/**
 * Parse wrk benchmark output and populate result structure
 * Extracts latency, throughput, and transfer metrics from wrk's text output
 * @param output wrk command output text
 * @param result Benchmark result structure to populate
 * @return true on success, false if parsing failed
 */
extern bool parseWrkOutput(cchar *output, BenchResult *result);

/**
 * Set socket linger option to avoid TIME_WAIT state
 * With on=true and l_linger=0, close() will send RST instead of FIN
 * @param sp Socket to configure
 * @param on True to enable no-linger (RST on close), false to disable
 */
extern void setSocketLinger(MprSocket *sp, bool on);

#ifdef __cplusplus
}
#endif
#endif /* _h_BENCH_UTILS */

/*
    Copyright (c) Embedthis Software. All Rights Reserved.
    This software is distributed under a commercial license. Consult the LICENSE.md
    distributed with this software for full details and copyrights.
 */
