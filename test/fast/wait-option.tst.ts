/* FastConnect accepts wait=. Successful startup proves the option is recognized. */

import {ttrue} from '@embedthis/testme'
import {withServer} from '../security/server'

const PORT = 4601

await withServer('fast-wait-option', PORT, ['FastConnect 127.0.0.1:0 launch min=0 max=1 wait=45secs'], async () => {
    ttrue(true)
})
