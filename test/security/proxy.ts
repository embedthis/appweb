/* Use raw sockets to preserve request bytes that an HTTP client would normalize or refuse. */

import {tget} from '@embedthis/testme'
import {Uri} from '@embedthis/ejscript'

export const HTTP = new Uri(tget('TM_HTTP') || 'http://127.0.0.1:4100')

//  Port of the backend the proxy test routes in test/appweb.conf connect to. Each test starts its own.
export const BACKEND = 9997

/*
    Collect the raw response until close or timeout; send more after matching after, when supplied.
 */
export async function exchange(request: string, after?: string, more?: string, timeout = 3000): Promise<string> {
    let response = ''
    let sent = false
    let closed: () => void
    let done = new Promise<void>((resolve) => (closed = resolve))
    let client = await Bun.connect({
        hostname: HTTP.host,
        port: Number(HTTP.port),
        socket: {
            data(socket: any, data: Buffer) {
                response += data.toString('latin1')
                if (after && more && !sent && response.includes(after)) {
                    sent = true
                    socket.write(more)
                }
            },
            close() {
                closed()
            },
            error() {
                closed()
            },
        },
    })
    client.write(request)
    await Promise.race([done, Bun.sleep(timeout)])
    client.end()
    return response
}

export function statusOf(response: string): number {
    let match = response.match(/^HTTP\/1\.1 (\d{3})/)
    return match ? Number(match[1]) : 0
}
