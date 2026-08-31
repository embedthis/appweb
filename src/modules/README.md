Appweb Loadable Modules
=======================

The modules directory contains the source for the loadable modules.

Key Files
---------

* dirHandler.c       - Directory listing handler
* cgiHandler.c       - CGI handler
* espHandler.c       - ESP add-on glue: the EspApp directive and httpEspInit(). Compiled only when ME_COM_ESP is set
                       (default 0), otherwise it compiles to nothing.
* phpHandler.c       - PHP handler
* sslModule.c        - Loadable SSL support

ESP Add-On
----------

ESP (Embedded Server Pages) is a separate add-on product and is not bundled with Appweb. SQLite was only ever the ESP
database backend, so it ships with the add-on too. `src/esp` and `src/sqlite` do not exist in this repo.

Appweb deliberately keeps the conditional hooks so the add-on can bind ESP back in as a plugin, all gated on
`ME_COM_ESP`: `espHandler.c` here, plus the module load / handler registration / `<if ESP_MODULE>` conditional in
`src/config.c`, the `ME_COM_ESP` flag and `httpEspInit()` prototype in `src/appweb.h`, and the static-link ESP app hook
in `src/server/appweb.c`. To build with the add-on, install the `esp` and `sqlite` paks and run
`cd projects && premake5 --esp gmake`.
