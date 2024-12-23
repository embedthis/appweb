Embedthis Appweb
===

Appweb is a compact, fast and secure web server for embedded applications. It
supports HTTP/1 and HTTP/2 with a web server and HTTP client utility.

Licensing
---
See [LICENSE.md](LICENSE.md) for details.

### Documentation

  See https://www.embedthis.com/appweb/doc/index.html.

### Building from Source

You can build Appweb with make, Visual Studio or Xcode.

### To Build with Make:

#### Linux or MacOS

    make

or to see the commands as they are invoked:

    make SHOW=1

You can pass make variables to tailor the build. For a list of variables:

	make help

To run

	make run

#### Windows

make

The make.bat runs projects/windows.bat to locate the Visual Studio compiler. If
you have setup
your CMD environment for Visual Studio by running the Visual Studio
vsvarsall.bat, then that edition of
Visual Studio will be used. If not, windows.bat will attempt to locate the most
recent Visual Studio version.

### To Build with Visual Studio:

Open the solution file at:

    projects/appweb-windows-default.sln

Then select Build -> Solution.

To run the debugger, right-click on the "appweb" project and set it as the
startup project. Then modify the project properties and set the Debugging
configuration properties. Set the working directory to be:

    $(ProjectDir)\..\..\test

Set the arguments to be
    -v

Then start debugging.

### To Build with Xcode.

Open the solution file:

    projects/appweb-macosx-default.sln

Choose Product -> Scheme -> Edit Scheme, and select "Build" on the left of the
dialog. Click the "+" symbol at the bottom in the center and then select all
targets to be built. Before leaving this dialog, set the debugger options by
selecting "Run/Debug" on the left hand side. Under "Info" set the Executable to
be "appweb", set the launch arguments to be "-v" and set the working directory
to be an absolute path to the "./test" directory in the appweb source. The
click "Close" to save.

Click Project -> Build to build.

Click Project -> Run to run.

### To install:

If you have built from source using Make, you can install the software using:

    sudo make install

### To uninstall

    sudo make uninstall

### To Run:

The src/server directory contains a minimal appweb.conf suitable for production
use without SSL. The test directory contains an appweb.conf that is fully
configured for testing. When using the src/server/appweb.conf, change to the
src/server directory to run. When using the test/appweb.conf, change to the
test directory to run.


### Samples

A library of samples using Appweb are available at the GitHub repository:

https://github.com/embedthis/appweb-doc/samples

Resources
---
  - [Appweb web site](https://www.embedthis.com/)
  - [Embedthis web site](https://www.embedthis.com/)
