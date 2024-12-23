/*
    Support functions for Embedthis Appweb

    Copyright (c) All Rights Reserved. See copyright notice at the bottom of the file.
 */

require ejs.tar
require ejs.unix

public function startService() {
    if (Config.OS != 'windows' && App.uid != 0) {
        trace('Skip', 'Must be root to install Appweb daemon')
        return
    }
    if (!me.cross) {
        stopService(true)
        trace('Run', 'appman install enable start')
        Cmd([me.prefixes.bin.join('appman' + me.globals.EXE), 'install', 'enable', 'start'])
        if (me.platform.os == 'windows') {
            Cmd([me.prefixes.bin.join('appwebMonitor' + me.globals.EXE)], {detach: true})
        }
    }
}


public function stopService(quiet: Boolean = false) {
    if (Config.OS != 'windows' && App.uid != 0) {
        return
    }
    if (!me.cross) {
        if (!quiet) {
            trace('Stop', me.settings.title)
        }
        if (me.platform.os == 'windows') {
            try {
                Cmd([me.prefixes.bin.join('appwebMonitor'), '--stop'])
            } catch {}
        }
        let appman = Cmd.locate(me.prefixes.bin.join('appman'))
        if (appman) {
            try {
                Cmd([appman, '--continue', 'stop', 'disable', 'uninstall'])
            } catch {}
        }
    }
}
