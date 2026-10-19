/*
    Python and PHP Action mappings use Bash wrappers to resolve PATH and supply arguments, so they cannot run on
    Windows. Probe the mappings, not just interpreter availability. The .act fixture supplies Windows coverage.
 */

import {WINDOWS} from './gateways'

export const NO_WRAPPER = 'the interpreter wrappers are #!/bin/bash and Windows has no /bin/bash for appweb to spawn'

/*
    The reason this interpreter's Action mapping cannot run here, or null when it can.
 */
export function noInterpreter(name: string): string | null {
    if (WINDOWS) {
        return NO_WRAPPER
    }
    return Bun.which(name) ? null : 'no ' + name + ' on PATH'
}
