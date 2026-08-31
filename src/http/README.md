Embedthis Http
===

Embedthis Http is a HTTP library supporting HTTP/1.0, HTTP/1.1 and HTTP/2.  It provides server side and client side API.

Embedthis Http provides reference applications that demonstrate the library. The "http" program is a test HTTP client and "server" is a test web server.

Embedthis Http is used by the [Appweb](https://www.embedthis.com/) and [ESP](https://www.embedthis.com/esp/) applications.

Licensing
---
See LICENSE.md for details.

### To Read Documentation:

  See doc/index.html

### To Build:

    make

Images are built into */bin. The build configuration is saved in */inc/me.h.

### To Test:

    make test

### To Run:

    make run

This will run appweb in the src/server directory using the src/server/appweb.conf configuration file.

### To Install:

    make install

### To Create Packages:

    make package

## AI Documentation

Machine-readable documentation for LLMs is available in `AI/designs/` and `CLAUDE.md`.

Resources
---
- [Embedthis web site](https://embedthis.com/)
