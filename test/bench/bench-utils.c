/*
    bench-utils.c - Benchmark utility functions

    Copyright (c) All Rights Reserved. See details at the end of the file.
 */

/********************************** Includes **********************************/

#include "bench-utils.h"
#include <stdio.h>
#include <stdlib.h>
#include <time.h>

/*********************************** Locals ***********************************/

// Default durations in milliseconds
#define DEFAULT_TOTAL_DURATION 120000      // 120 seconds total (2 minutes)
#define DEFAULT_SOAK_DURATION  12000       // 12 seconds warmup (10%)
#define DEFAULT_BENCH_DURATION 108000      // 108 seconds benchmarking (90%)

// Benchmark timing constants
#define MIN_GROUP_DURATION_MS 500        // Minimum 500ms per test group

static Ticks totalDuration = DEFAULT_TOTAL_DURATION;
static Ticks soakDuration = DEFAULT_SOAK_DURATION;
static Ticks benchDuration = DEFAULT_BENCH_DURATION;
static Ticks perGroupDuration = 0;  // Calculated based on number of groups
// Results are now managed in BenchApp structure instead of global

/************************************ Code ************************************/

void configureDuration(int numGroups)
{
    char *env = getenv("TESTME_DURATION");
    int  tmDuration;

    if (env) {
        // User specified duration in seconds via tm --duration
        tmDuration = atoi(env);
        if (tmDuration > 0) {
            totalDuration = tmDuration * TPS;  // Convert to milliseconds
        }
    }
    // Allocate 10% to soak, 90% to benchmarking
    soakDuration = totalDuration / 10;
    benchDuration = totalDuration - soakDuration;

    // Divide benchmark time among test groups
    if (numGroups > 0) {
        perGroupDuration = benchDuration / numGroups;
    }
    printf("Duration-based benchmarking:\n");
    printf("  Total: %lld seconds\n", (long long) (totalDuration / 1000));
    printf("  Soak:  %lld seconds\n", (long long) (soakDuration / 1000));
    printf("  Bench: %lld seconds\n", (long long) (benchDuration / 1000));
    printf("  Per group: %lld seconds for %d groups\n", (long long) (perGroupDuration / 1000), numGroups);
}

Ticks getSoakDuration(void)
{
    return soakDuration;
}

Ticks getBenchDuration(void)
{
    return perGroupDuration;
}

/*
    Manager callback for BenchResult
    Marks heap-allocated fields for MPR garbage collector
 */
static void manageBenchResult(BenchResult *result, int flags)
{
    if (flags & MPR_MANAGE_MARK) {
        mprMark(result->name);
        mprMark(result->samples);
    }
}

BenchResult *createBenchResult(cchar *name)
{
    BenchResult *result;

    result = mprAllocObj(BenchResult, manageBenchResult);
    result->name = sclone(name);
    result->iterations = 0;
    result->totalTime = 0;
    result->minTime = MAXINT64;
    result->maxTime = 0;
    result->avgTime = 0.0;
    result->p95Time = 0.0;
    result->p99Time = 0.0;
    result->requestsPerSec = 0.0;
    result->bytesTransferred = 0;
    result->errors = 0;
    result->samples = mprCreateList(0, MPR_LIST_STATIC_VALUES);
    return result;
}

void recordTiming(BenchResult *result, Ticks elapsed)
{
    if (!result) return;

    // Add sample to list for percentile calculations
    mprAddItem(result->samples, (void*) (ssize) elapsed);

    // Track running totals
    result->totalTime += elapsed;
    if (elapsed < result->minTime) {
        result->minTime = elapsed;
    }
    if (elapsed > result->maxTime) {
        result->maxTime = elapsed;
    }
}

// Comparison function for qsort
static int compareTicks(const void *a, const void *b)
{
    Ticks ta = (Ticks) (ssize) * (void**) a;
    Ticks tb = (Ticks) (ssize) * (void**) b;
    return (ta > tb) - (ta < tb);
}

void calculateStats(BenchResult *result)
{
    int count, p95Index, p99Index;

    if (!result || !result->samples) return;

    count = mprGetListLength(result->samples);
    if (count == 0) {
        // No successful samples - reset minTime from MAXINT64 to 0
        result->minTime = 0;
        return;
    }

    // Calculate average
    result->avgTime = (double) result->totalTime / count;

    // Calculate requests per second
    if (result->totalTime > 0) {
        result->requestsPerSec = (count * 1000.0) / result->totalTime;
    }

    // Sort samples for percentile calculations
    qsort(result->samples->items, (size_t) count, sizeof(void*), compareTicks);

    // Calculate p95 (95th percentile)
    p95Index = (int) (count * 0.95);
    if (p95Index >= count) p95Index = count - 1;
    result->p95Time = (Ticks) (ssize) result->samples->items[p95Index];

    // Calculate p99 (99th percentile)
    p99Index = (int) (count * 0.99);
    if (p99Index >= count) p99Index = count - 1;
    result->p99Time = (Ticks) (ssize) result->samples->items[p99Index];
}

void printBenchResult(BenchResult *result)
{
    if (!result) return;

    printf("\n");
    printf("=== %s ===\n", result->name);
    printf("Iterations:       %d\n", result->iterations);
    printf("Total Time:       %lld ms\n", (long long) result->totalTime);
    printf("Requests/sec:     %.2f\n", result->requestsPerSec);
    printf("Latency (ms):\n");
    printf("  Min:            %lld\n", (long long) result->minTime);
    printf("  Avg:            %.3f\n", result->avgTime);
    printf("  Max:            %lld\n", (long long) result->maxTime);
    printf("  p95:            %.3f\n", result->p95Time);
    printf("  p99:            %.3f\n", result->p99Time);
    if (result->bytesTransferred > 0) {
        printf("Bytes:            %lld (%.2f MB)\n",
               (long long) result->bytesTransferred,
               result->bytesTransferred / (1024.0 * 1024.0));
        printf("Throughput:       %.2f MB/s\n",
               (result->bytesTransferred / (1024.0 * 1024.0)) / (result->totalTime / 1000.0));
    }
    printf("Errors:           %d\n", result->errors);
    printf("\n");
}

void saveBenchGroup(MprJson *resultsJson, cchar *groupName, BenchResult **results, int count)
{
    MprJson     *group, *testResult;
    BenchResult *result;
    int         i;

    if (!resultsJson || !groupName || !results || count <= 0) return;

    // Create group object
    group = mprCreateJson(MPR_JSON_OBJ);

    // Add each test result
    for (i = 0; i < count; i++) {
        result = results[i];
        if (!result) continue;

        testResult = mprCreateJson(MPR_JSON_OBJ);

        // MPR JSON requires string values - convert numbers to strings
        mprWriteJson(testResult, "requestsPerSec", sfmt("%.2f", result->requestsPerSec), 0);
        mprWriteJson(testResult, "avgLatency", sfmt("%.3f", result->avgTime), 0);
        mprWriteJson(testResult, "p95Latency", sfmt("%.3f", result->p95Time), 0);
        mprWriteJson(testResult, "p99Latency", sfmt("%.3f", result->p99Time), 0);
        mprWriteJson(testResult, "minLatency", itos((int64) result->minTime), 0);
        mprWriteJson(testResult, "maxLatency", itos((int64) result->maxTime), 0);
        mprWriteJson(testResult, "bytesTransferred", itos((int64) result->bytesTransferred), 0);
        mprWriteJson(testResult, "iterations", itos(result->iterations), 0);
        mprWriteJson(testResult, "errors", itos(result->errors), 0);
        // Add testResult to group at result->name
        mprWriteJsonObj(group, result->name, testResult);
    }
    // Add group to results JSON at groupName
    mprWriteJsonObj(resultsJson, groupName, group);
}

/*
   Save results as markdown table
 */
static void saveMarkdownResults(MprJson *resultsJson, cchar *version, cchar *timestamp, cchar *platform, cchar *profile, cchar *tls, int64 memoryInitial, int64 memoryFinal)
{
    FILE        *fp;
    MprJson     *groupKey, *testKey;
    int         groupIndex, testIndex;
    cchar       *categoryLabel, *osDir;

#if MACOSX
    osDir = "macosx";
#elif LINUX
    osDir = "linux";
#elif WINDOWS
    osDir = "windows";
#else
    osDir = "macosx";
#endif

    char path[256];
    snprintf(path, sizeof(path), "../../doc/benchmarks/%s/latest.md", osDir);
    fp = fopen(path, "w");
    if (!fp) {
        printf("Warning: Could not open doc/benchmarks/%s/latest.md for writing\n", osDir);
        return;
    }

    // Write header
    fprintf(fp, "# Appweb Benchmark Results\n\n");
    fprintf(fp, "**Version:** %s  \n", version);
    fprintf(fp, "**Timestamp:** %s  \n", timestamp);
    fprintf(fp, "**Platform:** %s  \n", platform);
    fprintf(fp, "**Profile:** %s  \n", profile);
    fprintf(fp, "**TLS:** %s  \n", tls);
    fprintf(fp, "**Total Duration:** %lld seconds (%llds soak + %llds bench)  \n",
            (long long) (totalDuration / 1000), (long long) (soakDuration / 1000),
            (long long) (benchDuration / 1000));

    // Add memory information if available
    if (memoryInitial > 0) {
        fprintf(fp, "**Initial Memory (after soak):** %.2f MB  \n", memoryInitial / 1024.0);
    }
    if (memoryFinal > 0) {
        fprintf(fp, "**Final Memory:** %.2f MB  \n", memoryFinal / 1024.0);
    }
    if (memoryInitial > 0 && memoryFinal > 0) {
        fprintf(fp, "**Memory Delta:** %+.2f MB  \n", (memoryFinal - memoryInitial) / 1024.0);
    }
    fprintf(fp, "\n");

    // Write table header
    fprintf(fp, "## Performance Results\n\n");
    fprintf(fp, "| Category | Test | Req/Sec | Avg Latency (ms) | P95 (ms) | P99 (ms) | "
                "Min (ms) | Max (ms) | Bytes | Errors | Iterations |\n");
    fprintf(fp, "|----------|------|---------|------------------|----------|----------|"
                "----------|----------|-------|--------|------------|\n");

    // Output wrk (Max Throughput) first if it exists
    for (ITERATE_JSON(resultsJson, groupKey, groupIndex)) {
        if (!groupKey->name || !smatch(groupKey->name, "wrk")) continue;

        // Write category header row
        fprintf(fp, "| **Max Throughput** | | | | | | | | | | |\n");

        // Iterate through tests in this group
        for (ITERATE_JSON(groupKey, testKey, testIndex)) {
            int64  iterations, minLat, maxLat, bytesTransferred, errors;
            double reqPerSec, avgLat, p95Lat, p99Lat, bytesMB;
            cchar  *valStr;

            if (!testKey->name) continue;

            // Extract values (all stored as strings in MPR_JSON_STRINGS mode)
            valStr = mprReadJson(testKey, "iterations");
            iterations = valStr ? stoi(valStr) : 0;

            valStr = mprReadJson(testKey, "requestsPerSec");
            reqPerSec = valStr ? stof(valStr) : 0.0;

            valStr = mprReadJson(testKey, "avgLatency");
            avgLat = valStr ? stof(valStr) : 0.0;

            valStr = mprReadJson(testKey, "p95Latency");
            p95Lat = valStr ? stof(valStr) : 0.0;

            valStr = mprReadJson(testKey, "p99Latency");
            p99Lat = valStr ? stof(valStr) : 0.0;

            valStr = mprReadJson(testKey, "minLatency");
            minLat = valStr ? stoi(valStr) : 0;

            valStr = mprReadJson(testKey, "maxLatency");
            maxLat = valStr ? stoi(valStr) : 0;

            valStr = mprReadJson(testKey, "bytesTransferred");
            bytesTransferred = valStr ? stoi(valStr) : 0;

            valStr = mprReadJson(testKey, "errors");
            errors = valStr ? stoi(valStr) : 0;

            // Format bytes
            bytesMB = bytesTransferred / (1024.0 * 1024.0);

            // Write test row (use %.1f for all latency values for consistency with web module)
            fprintf(fp, "| | %s | %d | %.2f | %.1f | %.1f | %.1f | %.1f | ", testKey->name,
                    (int) reqPerSec, avgLat, p95Lat, p99Lat, (double) minLat, (double) maxLat);

            if (bytesMB >= 1.0) {
                fprintf(fp, "%.1f MB", bytesMB);
            } else if (bytesTransferred >= 1024) {
                fprintf(fp, "%.1f KB", bytesTransferred / 1024.0);
            } else {
                fprintf(fp, "%lld", (long long) bytesTransferred);
            }
            fprintf(fp, " | %lld | %lld |\n", (long long) errors, (long long) iterations);
        }
    }

    // Then iterate through all other result groups (skipping wrk)
    for (ITERATE_JSON(resultsJson, groupKey, groupIndex)) {
        if (!groupKey->name || smatch(groupKey->name, "wrk")) continue;

        // Format category name
        if (scmp(groupKey->name, "static_files") == 0) {
            categoryLabel = "**Static Files (HTTP Library)**";
        } else if (scmp(groupKey->name, "https") == 0) {
            categoryLabel = "**HTTPS (HTTP Library)**";
        } else if (scmp(groupKey->name, "static_files_raw_http") == 0) {
            categoryLabel = "**Static Files (Raw HTTP)**";
        } else if (scmp(groupKey->name, "static_files_raw_https") == 0) {
            categoryLabel = "**Static Files (Raw HTTPS)**";
        } else if (scmp(groupKey->name, "put") == 0) {
            categoryLabel = "**PUT Uploads**";
        } else if (scmp(groupKey->name, "auth") == 0) {
            categoryLabel = "**Auth (Digest)**";
        } else if (scmp(groupKey->name, "actions") == 0) {
            categoryLabel = "**Actions**";
        } else {
            categoryLabel = groupKey->name;
        }

        // Write category header row
        fprintf(fp, "| %s | | | | | | | | | | |\n", categoryLabel);

        // Iterate through tests in this group
        for (ITERATE_JSON(groupKey, testKey, testIndex)) {
            int64  iterations, minLat, maxLat, bytesTransferred, errors;
            double reqPerSec, avgLat, p95Lat, p99Lat, bytesMB;
            cchar  *valStr;

            if (!testKey->name) continue;

            // Extract values (all stored as strings in MPR_JSON_STRINGS mode)
            valStr = mprReadJson(testKey, "iterations");
            iterations = valStr ? stoi(valStr) : 0;

            valStr = mprReadJson(testKey, "requestsPerSec");
            reqPerSec = valStr ? stof(valStr) : 0.0;

            valStr = mprReadJson(testKey, "avgLatency");
            avgLat = valStr ? stof(valStr) : 0.0;

            valStr = mprReadJson(testKey, "p95Latency");
            p95Lat = valStr ? stof(valStr) : 0.0;

            valStr = mprReadJson(testKey, "p99Latency");
            p99Lat = valStr ? stof(valStr) : 0.0;

            valStr = mprReadJson(testKey, "minLatency");
            minLat = valStr ? stoi(valStr) : 0;

            valStr = mprReadJson(testKey, "maxLatency");
            maxLat = valStr ? stoi(valStr) : 0;

            valStr = mprReadJson(testKey, "bytesTransferred");
            bytesTransferred = valStr ? stoi(valStr) : 0;

            valStr = mprReadJson(testKey, "errors");
            errors = valStr ? stoi(valStr) : 0;

            // Format bytes
            bytesMB = bytesTransferred / (1024.0 * 1024.0);

            // Write test row (use %.1f for all latency values for consistency with web module)
            fprintf(fp, "| | %s | %d | %.2f | %.1f | %.1f | %.1f | %.1f | ", testKey->name,
                    (int) reqPerSec, avgLat, p95Lat, p99Lat, (double) minLat, (double) maxLat);

            if (bytesMB >= 1.0) {
                fprintf(fp, "%.1f MB", bytesMB);
            } else if (bytesTransferred >= 1024) {
                fprintf(fp, "%.1f KB", bytesTransferred / 1024.0);
            } else {
                fprintf(fp, "%lld", (long long) bytesTransferred);
            }
            fprintf(fp, " | %lld | %lld |\n", (long long) errors, (long long) iterations);
        }
    }

    fprintf(fp, "\n## Notes\n\n");
    fprintf(fp, "- **Warm tests**: Reuse connection/socket for all requests\n");
    fprintf(fp, "- **Cold tests**: New connection/socket for each request\n");
    fprintf(fp, "- **Raw tests**: Direct socket I/O bypassing HTTP library (shows true server performance)\n");
    fprintf(fp, "- **HTTP Library tests**: Standard HTTP client (includes client overhead)\n");
    fprintf(fp, "- **wrk tests**: Maximum throughput using multi-threaded wrk tool (12 threads, 40 connections)\n");
    fprintf(fp, "- All latency values are in milliseconds\n");
    fprintf(fp, "- Bytes column shows total data transferred during test\n");
    fprintf(fp, "- Memory measurements show server RSS (Resident Set Size) in KB and MB\n");

    fclose(fp);
    printf("Results saved to: doc/benchmarks/%s/latest.md\n", osDir);
}

void saveFinalResults(MprJson *resultsJson, int64 memoryInitial, int64 memoryFinal)
{
    MprJson   *root, *config, *memory;
    char      *platform, *profile, *output, *osVersion, *arch;
    char      timestamp[64], platformFull[128];
    time_t    now;
    struct tm *tm_info;

    if (!resultsJson) {
        printf("Warning: No benchmark results to save\n");
        return;
    }
    root = mprCreateJson(MPR_JSON_OBJ);
    // Add version
    mprWriteJson(root, "version", "1.0.0-dev", 0);

    // Add timestamp (human-readable format)
    time(&now);
    tm_info = localtime(&now);
    strftime(timestamp, sizeof(timestamp), "%b %d, %Y %I:%M %p", tm_info);
    mprWriteJson(root, "timestamp", timestamp, 0);

    // Add platform info with OS version and architecture
    platform = getenv("PLATFORM");
    if (!platform) {
#if MACOSX
        platform = "macosx";
#elif LINUX
        platform = "linux";
#elif WINDOWS
        platform = "windows";
#elif ME_UNIX_LIKE
        platform = "unix";
#else
        platform = "unknown";
#endif
    }

    // Get OS version from uname -r if not set via environment
    osVersion = getenv("OS_VERSION");
    if (!osVersion || !*osVersion) {
#if MACOSX || LINUX
        FILE *fp = popen("uname -r 2>/dev/null", "r");
        if (fp) {
            static char osVersionBuf[64];
            if (fgets(osVersionBuf, sizeof(osVersionBuf), fp)) {
                // Trim newline
                char *nl = strchr(osVersionBuf, '\n');
                if (nl) *nl = '\0';
                osVersion = osVersionBuf;
            }
            pclose(fp);
        }
        if (!osVersion) {
            osVersion = "";
        }
#else
        osVersion = "";
#endif
    }

    // Get architecture from uname -m if not set via environment
    arch = getenv("ARCH");
    if (!arch || !*arch) {
#if MACOSX || LINUX
        FILE *fp = popen("uname -m 2>/dev/null", "r");
        if (fp) {
            static char archBuf[32];
            if (fgets(archBuf, sizeof(archBuf), fp)) {
                // Trim newline
                char *nl = strchr(archBuf, '\n');
                if (nl) *nl = '\0';
                arch = archBuf;
            }
            pclose(fp);
        }
        if (!arch) {
#if ME_64
            arch = "x64";
#else
            arch = "x86";
#endif
        }
#else
#if ME_64
        arch = "x64";
#else
        arch = "x86";
#endif
#endif
    }

    // Format platform string with version and arch if available
    if (*osVersion && *arch) {
        snprintf(platformFull, sizeof(platformFull), "%s %s (%s)", platform, osVersion, arch);
    } else if (*arch) {
        snprintf(platformFull, sizeof(platformFull), "%s (%s)", platform, arch);
    } else {
        snprintf(platformFull, sizeof(platformFull), "%s", platform);
    }
    mprWriteJson(root, "platform", platformFull, 0);

    // Add profile (use dev/prod instead of debug/release)
    profile = getenv("PROFILE");
    if (!profile) {
#if ME_DEBUG
        profile = "dev";
#else
        profile = "prod";
#endif
    }
    mprWriteJson(root, "profile", profile, 0);

    // Add TLS info
    mprWriteJson(root, "tls", "openssl", 0);  // Would need runtime detection

    config = mprCreateJson(MPR_JSON_OBJ);
    mprWriteJson(config, "soakDuration", itos((int64) soakDuration), 0);
    mprWriteJson(config, "benchDuration", itos((int64) benchDuration), 0);
    mprWriteJson(config, "perGroupDuration", itos((int64) perGroupDuration), 0);
    mprWriteJson(config, "totalDuration", itos((int64) totalDuration), 0);
    mprWriteJson(config, "timingPrecision", "milliseconds", 0);
    mprWriteJsonObj(root, "config", config);

    // Add memory object
    if (memoryInitial > 0 || memoryFinal > 0) {
        memory = mprCreateJson(MPR_JSON_OBJ);
        if (memoryInitial > 0) {
            mprWriteJson(memory, "initialKB", itos(memoryInitial), 0);
            mprWriteJson(memory, "initialMB", sfmt("%.1f", memoryInitial / 1024.0), 0);
        }
        if (memoryFinal > 0) {
            mprWriteJson(memory, "finalKB", itos(memoryFinal), 0);
            mprWriteJson(memory, "finalMB", sfmt("%.1f", memoryFinal / 1024.0), 0);
        }
        if (memoryInitial > 0 && memoryFinal > 0) {
            mprWriteJson(memory, "changeKB", itos(memoryFinal - memoryInitial), 0);
            mprWriteJson(memory, "changeMB", sfmt("%.1f", (memoryFinal - memoryInitial) / 1024.0), 0);
        }
        mprWriteJsonObj(root, "memory", memory);
    }

    // Add results to root
    mprWriteJsonObj(root, "results", resultsJson);

    // Determine OS-specific directory
    cchar *osDir;
#if MACOSX
    osDir = "macosx";
#elif LINUX
    osDir = "linux";
#elif WINDOWS
    osDir = "windows";
#else
    osDir = "macosx";
#endif

    // Save to JSON5 file
    output = mprJsonToString(root, MPR_JSON_PRETTY);
    if (output) {
        char jsonPath[256];
        snprintf(jsonPath, sizeof(jsonPath), "../../doc/benchmarks/%s/latest.json5", osDir);
        FILE *fp = fopen(jsonPath, "w");
        if (fp) {
            fprintf(fp, "%s\n", output);
            fclose(fp);
            printf("\nResults saved to: doc/benchmarks/%s/latest.json5\n", osDir);
        } else {
            printf("Warning: Could not open doc/benchmarks/%s/latest.json5 for writing\n", osDir);
            printf("Results:\n%s\n", output);
        }
    }
    // Save to markdown file
    saveMarkdownResults(resultsJson, "1.0.0-dev", timestamp, platformFull, profile, "openssl", memoryInitial, memoryFinal);
}

/*
   Get memory size of the appweb server process in KB
 */
int64 getServerMemory(void)
{
    FILE *fp;
    char buf[1024];
    int64 memory;
    int pid;

    memory = 0;

    // Try to read PID from bench.pid (created by setup.sh)
    fp = fopen("bench.pid", "r");
    if (!fp) {
        printf("Warning: Could not open bench.pid file\n");
        return 0;
    }
    if (fscanf(fp, "%d", &pid) != 1) {
        printf("Warning: Could not read PID from bench.pid\n");
        fclose(fp);
        return 0;
    }
    fclose(fp);
    printf("Monitoring appweb server process: PID %d\n", pid);

#if MACOSX || LINUX
    // Use ps to get RSS (resident set size) in KB
    snprintf(buf, sizeof(buf), "ps -o rss= -p %d 2>/dev/null", pid);
    fp = popen(buf, "r");
    if (fp) {
        if (fscanf(fp, "%lld", &memory) != 1) {
            printf("Warning: Could not read memory for PID %d\n", pid);
            memory = 0;
        }
        pclose(fp);
    }
#endif
    return memory;
}

/*
   Calculate group duration with multiplier and enforce minimum
 */
Ticks calculateGroupDuration(Ticks duration, double multiplier)
{
    Ticks groupDuration;

    groupDuration = (Ticks) (duration * multiplier);
    if (groupDuration < MIN_GROUP_DURATION_MS) {
        groupDuration = MIN_GROUP_DURATION_MS;
    }
    return groupDuration;
}

/*
   Set socket linger option to avoid TIME_WAIT state
   With l_onoff=1 and l_linger=0, close() will send RST instead of FIN
 */
void setSocketLinger(MprSocket *sp, bool on)
{
#if ME_UNIX_LIKE || ME_BSD_LIKE || WINDOWS
    struct linger sl;
    sl.l_onoff = on ? 1 : 0;
    sl.l_linger = 0;
    setsockopt(sp->fd, SOL_SOCKET, SO_LINGER, (char*) &sl, sizeof(sl));
#endif
}

/*
   Check if response has "Connection: close" header
   Returns true if connection should be closed
 */
bool hasConnectionClose(cchar *headers, size_t len)
{
    cchar  *start, *end, *line;
    size_t remaining;

    start = headers;
    remaining = len;

    while (remaining > 0) {
        line = start;
        end = (cchar*) memchr(line, '\n', remaining);
        if (!end) {
            break;
        }
        // Check for end of headers
        if (end == line || (end > line && *(end - 1) == '\r' && end - 1 == line)) {
            break;
        }
        // Check for Connection: close header (case insensitive)
        if ((end - line) > 11 && sncaselesscmp(line, "connection:", 11) == 0) {
            cchar *value = line + 11;
            // Skip whitespace
            while (value < end && (*value == ' ' || *value == '\t')) {
                value++;
            }
            if (sncaselesscmp(value, "close", 5) == 0) {
                return true;
            }
        }
        remaining -= (size_t) (end - line + 1);
        start = end + 1;
    }
    return false;
}

/*
   Extract Content-Length from raw HTTP headers
   Returns -1 if not found or invalid
 */
ssize parseContentLength(cchar *headers, size_t len)
{
    cchar  *start, *end, *line, *value;
    size_t remaining;

    start = headers;
    remaining = len;

    while (remaining > 0) {
        line = start;
        end = (cchar*) memchr(line, '\n', remaining);
        if (!end) {
            break;
        }
        // Check for end of headers
        if (end == line || (end > line && *(end - 1) == '\r' && end - 1 == line)) {
            break;
        }
        // Check for Content-Length header (case insensitive)
        if ((end - line) > 16 && sncaselesscmp(line, "content-length:", 15) == 0) {
            value = line + 15;
            // Skip whitespace
            while (value < end && (*value == ' ' || *value == '\t')) {
                value++;
            }
            return stoi(value);
        }
        remaining -= (size_t) (end - line + 1);
        start = end + 1;
    }
    return -1;
}

/*
   Read until we find \r\n\r\n (end of headers)
   Returns total bytes read, or -1 on error
   Sets *bodyStart to the offset where body data begins (after the header delimiter)
   Sets *bodyLen to how much body data was read along with headers
 */
ssize readHeaders(MprSocket *sp, char *buf, size_t bufsize, ssize *bodyStart, ssize *bodyLen)
{
    ssize total, nbytes, headerEnd;
    char  *end;

    total = 0;
    *bodyStart = 0;
    *bodyLen = 0;

    while (total < (ssize) bufsize - 1) {
        nbytes = mprReadSocket(sp, buf + total, bufsize - (size_t) total - 1);
        if (nbytes <= 0) {
            return -1;
        }
        total += nbytes;
        buf[total] = '\0';

        // Look for end of headers
        end = scontains(buf, "\r\n\r\n");
        if (end) {
            headerEnd = end - buf + 4;  // +4 for \r\n\r\n
            *bodyStart = headerEnd;
            *bodyLen = total - headerEnd;
            return total;
        }
        // Also accept \n\n (non-standard but some clients use it)
        end = scontains(buf, "\n\n");
        if (end) {
            headerEnd = end - buf + 2;  // +2 for \n\n
            *bodyStart = headerEnd;
            *bodyLen = total - headerEnd;
            return total;
        }
    }
    return -1;  // Headers too large
}

/*
   Helper: Execute a single raw socket request
   Caller must provide a connected socket (sp). If the socket is NULL or closed, caller should reconnect.
   Returns true on success, false on error (caller should check sp->fd < 0 to detect closed socket)
 */
bool executeRawRequest(MprSocket *sp, cchar *request, ssize expectedSize)
{
    char      headers[8192], buf[8192];
    ssize     bodyStart, bodyInHeaders, headerLen, contentLen, bodyRead, nbytes, toRead;

    if (!sp || sp->fd < 0) {
        return false;
    }
    // Send request
    if (mprWriteSocket(sp, request, slen(request)) < 0) {
        mprCloseSocket(sp, 0);
        return false;
    }
    // Read headers (may also read some body data)
    headerLen = readHeaders(sp, headers, sizeof(headers), &bodyStart, &bodyInHeaders);
    if (headerLen < 0) {
        mprCloseSocket(sp, 0);
        return false;
    }
    // Parse Content-Length
    contentLen = parseContentLength(headers, (size_t) bodyStart);
    if (contentLen < 0 || contentLen > expectedSize * 2) {
        mprCloseSocket(sp, 0);
        return false;
    }
    // Consume body data (discard - we don't need it)
    bodyRead = bodyInHeaders;

    // Read and discard remaining body data
    while (bodyRead < contentLen) {
        toRead = contentLen - bodyRead;
        if (toRead > (ssize) sizeof(buf)) {
            toRead = sizeof(buf);
        }
        nbytes = mprReadSocket(sp, buf, (size_t) toRead);
        if (nbytes <= 0) {
            mprCloseSocket(sp, 0);
            return false;
        }
        bodyRead += nbytes;
    }
    // Check for "Connection: close" header - if present, close socket so caller knows to reconnect
    if (hasConnectionClose(headers, (size_t) bodyStart)) {
        mprCloseSocket(sp, 0);
    }
    return true;
}

/*
    Error tracking is now managed via the BenchApp struct passed to functions.
 */

/*
   Initialize a benchmark result (NULL-safe wrapper)
   Returns NULL if not recording results (for soak phase)
 */
BenchResult *initResult(cchar *name, bool recordResults)
{
    return recordResults ? createBenchResult(name) : NULL;
}

/*
   Record a request result (NULL-safe)
   Handles NULL result (soak phase) gracefully
 */
void recordRequest(BenchApp *app, BenchResult *result, bool isSuccess, Ticks elapsed, ssize bytes)
{
    if (!result) {
        // Soak phase - don't record individual results
        // Still track errors globally
        if (!isSuccess) {
            app->totalErrors++;
            if (app->stopOnErrors) {
                app->fatalError = true;
            }
        }
        return;
    }

    // Benchmark phase - record results
    result->iterations++;
    if (isSuccess) {
        recordTiming(result, elapsed);
        result->bytesTransferred += bytes;
    } else {
        result->errors++;
        app->totalErrors++;
        if (app->stopOnErrors) {
            app->fatalError = true;
        }
    }
}

/*
   Log a request error with consistent formatting
   Increments app->totalErrors and app->errorCount, logs error, and checks app->stopOnErrors
   Returns false if benchmark should stop (fatalError set), true to continue
 */
bool logError(BenchApp *app, cchar *benchName, cchar *url, int status, cchar *err, bool recordResults)
{
    app->totalErrors++;
    app->errorCount++;

    // During soak phase, don't log 401 errors - they're part of normal digest auth challenge-response
    if (!recordResults && status == 401) {
        return !app->stopOnErrors;
    }
    if (app->errorCount <= 5 || !recordResults) {
        if (status == 0) {
            // Client-side error (timeout, connection failure, etc.)
            tinfo("Warning: %s error: %s (%s)", benchName, err ? err : "timeout", url);
        } else {
            tinfo("Warning: %s request failed: %s (status %d)", benchName, url, status);
        }
    }
    if (app->stopOnErrors) {
        app->fatalError = true;
        return false;
    }
    return true;
}

/******************************** Connection Management ************************/

/*
    Connect or reconnect the raw socket
    Returns true on success, false on error
*/
bool connectRawSocket(BenchApp *app, cchar *host, int port, MprSsl *ssl)
{
    if (app->rawSocket) {
        mprCloseSocket(app->rawSocket, 1);
    }
    app->rawSocket = mprCreateSocket();
    if (!app->rawSocket) {
        return false;
    }
    if (mprConnectSocket(app->rawSocket, host, port, 0) < 0) {
        app->rawSocket = NULL;
        return false;
    }
    if (ssl) {
        if (mprUpgradeSocket(app->rawSocket, ssl, host) < 0) {
            app->rawSocket = NULL;
            return false;
        }
    }
    // Set no-linger immediately so all closes (including error paths) avoid TIME_WAIT
    setSocketLinger(app->rawSocket, true);
    mprSetSocketBlockingMode(app->rawSocket, 1);
    mprSetSocketNoDelay(app->rawSocket, 1);
    return true;
}

/*
    Execute HTTP request on existing network connection (for keep-alive)
    Similar to httpRequest() but reuses the provided net for connection persistence
    Returns stream on success, NULL on error
*/
HttpStream *netRequest(BenchApp *app, HttpNet *net, cchar *method, cchar *uri, cchar *data, char **err)
{
    HttpStream *stream;
    ssize len;
    static int seq = 0;

    assert(net && method && uri && err);

    *err = NULL;
    app->close = false;

    // Create new stream on existing network connection
    // Streams are managed by net->streams (added by httpAddStream in httpCreateStream)
    stream = httpCreateStream(net, 0);
    if (!stream) {
        *err = sclone("Cannot create stream");
        return NULL;
    }
    httpAddHeader(stream, "X-SEQ", "%d", seq++);
    // Connect and send request
    if (httpConnect(stream, method, uri, NULL) < 0) {
        *err = sfmt("Cannot connect to %s", uri);
        return NULL;
    }
    // Write request body data if provided
    if (data) {
        len = slen(data);
        httpSetContentLength(stream, len);
        if (httpWriteBlock(stream->writeq, data, len, HTTP_BLOCK) != len) {
            *err = sclone("Cannot write request body data");
            return NULL;
        }
    }
    // Finalize request and wait for response
    httpFinalizeOutput(stream);
    if (httpWait(stream, HTTP_STATE_CONTENT, HTTP_TIMEOUT_MS) < 0) {
        *err = sclone("No response");
        return NULL;
    }
    return stream;
}

/*
    Set no-linger on stream socket to avoid TIME_WAIT buildup
    Called before destroying stream on cold connections
*/
void setNoLinger(HttpStream *stream)
{
    if (stream && stream->sock) {
        setSocketLinger(stream->sock, true);
    }
}

/*
   Initialize connection context for warm/cold mode
   For warm mode: connection is reused across requests
   For cold mode: new connection created per request
*/
void initConnection(BenchApp *app, bool warm, int protocol)
{
    app->net = NULL;
    app->dispatcher = NULL;
    app->reuseConnection = warm;
    app->protocol = protocol;
}

/*
   Get network connection
   For warm: returns existing net, creates on first call
   For cold: creates new net each time (after previous was destroyed)
*/
HttpNet *getNet(BenchApp *app)
{
    // For warm connections, reuse existing net
    if (app->reuseConnection && app->net) {
        return app->net;
    }
    // Always create fresh dispatcher and net together
    app->dispatcher = mprCreateDispatcher("bench", MPR_DISPATCHER_AUTO);
    mprStartDispatcher(app->dispatcher);
    app->net = httpCreateNet(app->dispatcher, NULL, app->protocol, 0);
    return app->net;
}

/*
   Release network connection after request
   For warm: keeps connection alive
   For cold: destroys connection to force new one next time
*/
void releaseNet(BenchApp *app)
{
    // For cold connections, destroy net to force new connection
    // httpDestroyNet also destroys the dispatcher, so clear both
    if (app->close || (!app->reuseConnection && app->net)) {
        httpDestroyNet(app->net);
        app->net = NULL;
        app->dispatcher = NULL;
    }
    // For warm connections, keep net alive
}

/*
   Free network connection context
*/
void freeConnection(BenchApp *app)
{
    if (app->net) {
        httpDestroyNet(app->net);
        app->net = NULL;
    }
    app->dispatcher = NULL;
}

/******************************** Response Handling ****************************/
/*
   Get HTTP response status
   Reads and discards the response body to leave the connection in a clean state
   Returns true if request succeeded, false otherwise
   For GET: expects 200
   For PUT: expects 2xx
 */
bool getResponse(BenchApp *app, HttpStream *stream, int *statusOut, bool acceptAny2xx)
{
    char buf[8192];
    ssize nbytes;
    int status;

    status = httpGetStatus(stream);
    if (httpWait(stream, HTTP_STATE_CONTENT, HTTP_TIMEOUT_MS) < 0) {
        *statusOut = 0;
        return false;  // Timeout
    }
    // Consume full response body
    while ((nbytes = httpRead(stream, buf, sizeof(buf))) > 0) {
        // Discard data - just consuming it for timing accuracy
    }
    // Get final status
    status = httpGetStatus(stream);
    *statusOut = status;

    if (smatch(httpGetHeader(stream, "Connection"), "close")) {
        app->close = true;
    }
    // Status 0 means no response received
    if (status == 0) {
        return false;
    }
    if (acceptAny2xx) {
        return (status >= 200 && status < 300);
    } else {
        return (status == 200);
    }
}

/*
   Parse wrk benchmark output and populate result structure

   Expected wrk output format:
     Running 30s test @ http://localhost:4200/
       12 threads and 40 connections
       Thread Stats   Avg      Stdev     Max   +/- Stdev
         Latency     1.23ms  456.78us  10.45ms   89.12%
         Req/Sec    12.34k     1.23k   15.67k    78.90%
       123456 requests in 30.01s, 123.45MB read
     Requests/sec:  12345.67
     Transfer/sec:      4.12MB
 */
bool parseWrkOutput(cchar *output, BenchResult *result)
{
    char  *latencyLine, *requestsLine, *throughputLine;
    double avgLatency, reqPerSec, totalRequests, totalTime;

    if (!output || !result) {
        return false;
    }

    // Find latency line: "  Latency     1.23ms  456.78us  10.45ms   89.12%"
    latencyLine = scontains(output, "Latency");
    if (latencyLine) {
        // Skip "Latency" and whitespace to get to avg value
        latencyLine = latencyLine + 7;  // Skip "Latency"
        while (*latencyLine && isspace(*latencyLine)) latencyLine++;

        // Parse average latency
        avgLatency = stof(latencyLine);
        // Check if it's in microseconds (us) or milliseconds (ms)
        if (scontains(latencyLine, "us")) {
            avgLatency = avgLatency / 1000.0;  // Convert us to ms
        }
        result->avgTime = avgLatency;

        // Parse max latency (skip stdev, get third value)
        cchar *maxStr = latencyLine;
        int spaces = 0;
        while (*maxStr && spaces < 2) {
            if (isspace(*maxStr)) {
                spaces++;
                while (*maxStr && isspace(*maxStr)) maxStr++;
            } else {
                maxStr++;
            }
        }
        if (*maxStr) {
            result->maxTime = (Ticks) stof(maxStr);
            if (scontains(maxStr, "us")) {
                result->maxTime = result->maxTime / 1000;  // Convert us to ms
            }
        }
    }

    // Find requests/sec line: "Requests/sec:  12345.67"
    throughputLine = scontains(output, "Requests/sec:");
    if (throughputLine) {
        reqPerSec = stof(throughputLine + 13);  // Skip "Requests/sec:"
        result->requestsPerSec = reqPerSec;
    }

    // Find total requests line: "123456 requests in 30.01s, 123.45MB read"
    requestsLine = scontains(output, "requests in");
    if (requestsLine) {
        // Scan backwards to find the number before "requests"
        cchar *numStart = requestsLine - 1;
        while (numStart > output && isspace(*numStart)) numStart--;
        while (numStart > output && (isdigit(*numStart) || *numStart == '.')) numStart--;
        if (*numStart && !isdigit(*numStart)) numStart++;
        totalRequests = stof(numStart);
        result->iterations = (int) totalRequests;

        // Extract time: "30.01s"
        cchar *timeStr = scontains(requestsLine, "in");
        if (timeStr) {
            timeStr += 3;  // Skip "in "
            while (*timeStr && isspace(*timeStr)) timeStr++;
            totalTime = stof(timeStr) * 1000.0;  // Convert seconds to ms
            result->totalTime = (Ticks) totalTime;

            // Calculate min as a reasonable estimate (avg - some margin)
            if (result->avgTime > 0) {
                result->minTime = (Ticks) (result->avgTime * 0.5);  // Rough estimate
            }
        }

        // Extract bytes transferred
        cchar *bytesStr = scontains(requestsLine, ", ");
        if (bytesStr) {
            bytesStr += 2;  // Skip ", "
            double bytes = stof(bytesStr);
            if (scontains(bytesStr, "MB")) {
                bytes = bytes * 1024.0 * 1024.0;
            } else if (scontains(bytesStr, "KB")) {
                bytes = bytes * 1024.0;
            } else if (scontains(bytesStr, "GB")) {
                bytes = bytes * 1024.0 * 1024.0 * 1024.0;
            }
            result->bytesTransferred = (int64) bytes;
        }
    }

    // Set p95/p99 to reasonable estimates based on max
    if (result->maxTime > 0 && result->avgTime > 0) {
        result->p95Time = result->avgTime + (result->maxTime - result->avgTime) * 0.5;
        result->p99Time = result->avgTime + (result->maxTime - result->avgTime) * 0.75;
    }

    return true;
}

/*
    Copyright (c) Embedthis Software. All Rights Reserved.
    This software is distributed under a commercial license. Consult the LICENSE.md
    distributed with this software for full details and copyrights.
 */
