/*
    dir.tst - Directory GET tests

    Tests HTTP GET requests for directories. This test is currently disabled as it
    requires directory listing support to be enabled in the server configuration.

    TODO - Enable directory listings in test configuration
    TODO - Test directory listing formatting and content
    TODO - Test directory index file resolution
 */

import {ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

// All tests currently disabled pending directory listing support
// Uncomment when directory listings are enabled in test config
