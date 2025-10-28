/*
    misc.tst - Misc. Http tests

    Tests miscellaneous HTTP functionality including MIME type detection
    based on file extensions.
 */

import {ttrue} from 'testme'
import {Uri} from 'ejscript'

// Test MIME type detection for common file extensions
ttrue(new Uri("a.txt").mimeType == "text/plain")
ttrue(new Uri("a.html").mimeType == "text/html")
ttrue(new Uri("a.json").mimeType == "application/json")
