/*
    Test caching

    Assumes configuration of: LimitCache 64K, CacheItem 16K
 */
#include "esp.h"

//  This is configured for caching by API below
static void api() {
    render("{ when: %lld, uri: '%s', query: '%s' }\r\n", mprGetTicks(), getUri(), getQuery());
}

static void sml() {
    int     i;
    for (i = 0; i < 1; i++) {
        render("Line: %05d %s", i, "aaaaaaaaaaaaaaaaaabbbbbbbbbbbbbbbbccccccccccccccccccddddddd<br/>\r\n");
        mprYield(0);
    }
    render("{ when: %lld, uri: '%s', query: '%s' }\r\n", mprGetTicks(), getUri(), getQuery());
}

static void medium() {
    int     i;
    //  This will emit ~8K (under the item limit)
    for (i = 0; i < 100; i++) {
        render("Line: %05d %s", i, "aaaaaaaaaaaaaaaaaabbbbbbbbbbbbbbbbccccccccccccccccccddddddd<br/>\r\n");
        mprYield(0);
    }
    render("{ when: %lld, uri: '%s', query: '%s' }\r\n", mprGetTicks(), getUri(), getQuery());
}

static void big() {
    int     i;
    //  This will emit ~39K (under the item limit)
    for (i = 0; i < 500; i++) {
        render("Line: %05d %s", i, "aaaaaaaaaaaaaaaaaabbbbbbbbbbbbbbbbccccccccccccccccccddddddd<br/>\r\n");
        mprYield(0);
    }
}

static void huge() {
    int     i;
    //  This will emit ~390K (over the item limit)
    for (i = 0; i < 10000; i++) {
        render("Line: %05d %s", i, "aaaaaaaaaaaaaaaaaabbbbbbbbbbbbbbbbccccccccccccccccccddddddd<br/>\r\n");
        mprYield(0);
    }
    render("{ when: %lld, uri: '%s', query: '%s' }\r\n", mprGetTicks(), getUri(), getQuery());
}

static void clear() {
    espUpdateCache(getStream(), "/cache/manual", 0, 0);
    espUpdateCache(getStream(), "/cache/big", 0, 0);
    espUpdateCache(getStream(), "/cache/medium", 0, 0);
    espUpdateCache(getStream(), "/cache/small", 0, 0);
    espUpdateCache(getStream(), "/cache/api", 0, 0);
    render("done");
}

static void client() {
    render("{ when: %lld, uri: '%s', query: '%s' }\r\n", mprGetTicks(), getUri(), getQuery());
}

static void manual() {
    if (smatch(getQuery(), "send")) {
        setHeader("X-SendCache", "true");
        finalize();
    } else if (!espRenderCached(getStream())) {
        render("{ when: %lld, uri: '%s', query: '%s' }\r\n", mprGetTicks(), getUri(), getQuery());
    }
}

static void update() {
    cchar   *data = sfmt("{ when: %lld, uri: '%s', query: '%s' }\r\n", mprGetTicks(), getUri(), getQuery());
    espUpdateCache(getStream(), "/cache/manual", data, 86400);
    render("done");
}

ESP_EXPORT int esp_controller_app_cache(HttpRoute *route, MprModule *module) {
    HttpRoute   *rp;

    espAction(route, "cache/api", NULL, api);
    espAction(route, "cache/big", NULL, big);
    espAction(route, "cache/small", NULL, sml);
    espAction(route, "cache/medium", NULL, medium);
    espAction(route, "cache/clear", NULL, clear);
    espAction(route, "cache/client", NULL, client);
    espAction(route, "cache/huge", NULL, huge);
    espAction(route, "cache/manual", NULL, manual);
    espAction(route, "cache/update", NULL, update);

    //  This is not required for unit tests
    if ((rp = httpLookupRoute(route->host, "/cache/")) != 0) {
        espCache(rp, "/cache/{action}", 0, 0);
    }
    return 0;
}
