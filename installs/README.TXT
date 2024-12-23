Embedthis Appweb(TM)

Welcome to Appweb -- the fastest little web server.

This document contains details regarding the installation procedure for the binary Embedthis Appweb package.  This package contains pre-built stand-alone web server and an embeddable HTTP library with headers. You can read the documentation for the latest release online at:

https://embedthis.com/appweb/doc/

This software is copyrighted and distributed under license. Please read the LICENSE.TXT for details.


Table of Contents

* System Requirements
* Installation Package Formats
* Development Environment Platform Support
* Apple MAC OS X  Release Details
* Windows Release Details
* Removing Appweb
* Running Appweb
* Building from the Source Code
* License and Copyright Information


System Requirements

Operating System Support

    * Windows-7, Windows-8 (x86,x64)
    * Mac OS X 10.8+ (x64)
    * Linux 2.6 (x86,x64,arm,ppc,mips)
    * VxWorks (x86,arm,ppc,mips)

To deploy Appweb in an embedded environment, you will need at least the following:

    * 4 MB Disk / ROM space
    * 2 MB RAM

To rebuild Appweb from source code on your development system, you will need at least:

    * 80 MB disk space

Installation Package Formats

The Appweb binary installation is published in two formats:

    * Native Apple MAC OS X PKG format
    * Native Windows installer format

For other platforms, you will need to download the source code distribution and build then install. The product documentation describes how to build from source.


Development Environment Platform Support

If you wish to embed Appweb in your application or build Appweb from source code, you will need to use a C compiler and associated development tools.  Several development environments are supported.  You may choose any of the following:

    * Linux/Unix GNU Tools

    * Windows Visual Studio 2010 or later

    * WindRiver Tornado Development Tools


Apple Mac OS X Release Details

To install the native MAC OS X PKG image:

   1. Download the PKG image.

   2. Double click on the PKG file image.

   3. Answer the questions as prompted.


Windows Release Details

To install the Windows Installer image:

   1. Login with administrator privileges. This is necessary as the binary
      installation needs to install a Windows Service.

   2. Use WinZip or equivalent software to extract the installation image. This
      will extract the README.TXT and setup.exe from the zip archive.

   3. Double click on the setup.exe image to run it.


Removing Appweb

This is the procedure to remove Appweb on all systems except Windows.

   1. Run the uninstall script in the install directory for Appweb by typing:

      sudo /usr/lib/appweb/latest/bin/uninstall

If you installed the Appweb Windows Installer image, follow these steps to remove Appweb. If you installed the Tar
self-install image, you will need to remove Appweb using the procedure described above.

   1. Login with administrator privileges

   2. Run the Add / Remove Programs applet from the control panel.

   3. Select the Embedthis Appweb and choose remove.


Running Appweb

Appweb will start when the Appweb installation procedure completes and on some systems, will launch your browser directed at the Appweb local home page.  Thereafter, Appweb will automatically start if the system is rebooted. If you wish to manually stop Appweb, type:

    appman stop

To restart Appweb:

    appman start

Alternatively, you can run appweb manually:

    cd /etc/appweb
    appweb -v

To get all the options for Appweb, read the Appweb man page via

    man appweb

or get the command help via:

    appweb --help

Appweb is configured by default to listen on port 80. To test that it is serving pages, point your browser at http://localhost/.


Building from the Source Code

If you wish to rebuild the Appweb product from the distributed source code, please download the source code distribution from the Embedthis web site. Then read "Building from Source" in the Appweb product documentation for an explanation of the necessary steps to successfully rebuild the product.


License and Copyright Information

This software is supplied under license. Both a GNU and commercial license are available. Please read LICENSE.TXT for details. This documentation and the software described in this document may be used and copied only in accordance with the terms of the accompanying license agreement. Product and technical information in this document is subject to change without notice and does not represent a commitment on the part of Embedthis Software LLC.

Copyright (c) Embedthis Software. All Rights Reserved.

Embedthis is a trademark of Embedthis Software LLC. Embedthis, Appweb and ESP are trademarks of Embedthis Software. All other brand or product names are the trademarks or registered trademarks of their respective holders.


Embedthis Software, LLC.
11335 NE 122nd, Suite 105
Kirkland, Washington, 98034-6933
(425) 780-6863
info@embedthis.com
