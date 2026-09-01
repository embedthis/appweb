/*
    interpreters.ts - Which CGI interpreter mappings this platform can actually run

    test/appweb.conf maps application/x-python and application/x-php onto utils/python.cgi and
    utils/php.cgi. Both are "#!/bin/bash" wrappers, and the wrapper is not incidental: it resolves
    the interpreter from PATH -- there is no fixed path for python3 or php-cgi that holds on macOS,
    on Ubuntu and in the Linux container at once -- and it supplies php-cgi's
    -d cgi.force_redirect=0, which Action itself cannot carry because it takes a single program
    token and no arguments.

    Windows has no /bin/bash. appweb reads the wrapper's shebang (prepWinProgram), looks for the
    program it names, finds nothing, and the request returns 404 "Cannot run CGI process". So the
    interpreter being installed says nothing about whether its mapping can run, and probing for
    python3 or php-cgi alone is exactly how these arms came to fail the Windows suite: both are on
    the runner image, and both mappings are unrunnable there anyway.

    That leaves Windows with no Action coverage at all -- the perl mapping names /usr/bin/perl,
    which is not there either. Restoring it means giving appweb a wrapper Windows can spawn; that is
    tracked separately and is not something a test can work around.
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
