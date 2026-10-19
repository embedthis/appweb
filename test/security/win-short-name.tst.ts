/* Reject Windows 8.3 aliases and device names (trimmed stem) that could bypass routing or handler selection. */

import {teq, tget, tskip, ttrue} from '@embedthis/testme'

const HTTP = tget('TM_HTTP') || 'http://127.0.0.1:4100'

if (process.platform != 'win32') {
    tskip('Skip test -- 8.3 short names exist only on Windows')
} else {
    for (let path of ['/INDEX~1.HTM', '/ADMINI~1/index.html', '/dir/SECRE~12.CON']) {
        let response = await fetch(HTTP + path)
        teq(response.status, 400)
    }
    //  A tilde without a digit, or past the first eight characters, is an ordinary name
    for (let path of ['/a~b.html', '/longername~1.html']) {
        let response = await fetch(HTTP + path)
        ttrue(response.status != 400)
    }
    //  Device names are matched on the stem with trailing spaces trimmed, as Windows resolves them
    for (let path of ['/CON%20.txt', '/AUX%20%20.log', '/dir/COM1%20.html', '/CONIN$']) {
        let response = await fetch(HTTP + path)
        teq(response.status, 400)
    }
}
