/*
    hugeForm.tst.ts - Test very large form handling
    Note: Test currently disabled as form limit is set to 32K
 */

import {thas, tskip, ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'

let http: Http = new Http
let count = 6000

//  Test disabled - form limit is 32K
//  Large form test would require custom route with increased limit
