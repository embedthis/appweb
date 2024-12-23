/**
    makerom.c - Compile source files into C code suitable for embedding in ROM.
  
    Usage: makerom --mount mount --strip string files ... >rom.c
  
    Copyright (c) All Rights Reserved. See copyright notice at the bottom of the file.
 */

/********************************** Includes **********************************/

#include    "mpr.h"

/**************************** Forward Declarations ****************************/

#define MOUNT_POINT "/rom"

static void printUsage(void);
static int binToC(MprList *files, cchar *mount, cchar *strip);

/*********************************** Code *************************************/

int main(int argc, char **argv)
{
    MprList     *files;
    FILE        *fp;
    char        *argp, *mount, *strip, *fileList, *path, fbuf[ME_MAX_FNAME];
    int         nextArg, err;

    mprCreate(argc, argv, 0);

    err = 0;
    mount = "";
    strip = "";
    mount = MOUNT_POINT;
    files = mprCreateList(-1, 0);
    fileList = 0;

    for (nextArg = 1; nextArg < argc; nextArg++) {
        argp = argv[nextArg];
        if (*argp != '-') {
            break;
        }
        if (smatch(argp, "--files")) {
            if (nextArg >= argc) {
                err++;
            } else {
                fileList = argv[++nextArg];
            }
        } else if (smatch(argp, "--mount")) {
            if (nextArg >= argc) {
                err++;
            } else {
                mount = argv[++nextArg];
            }

        } else if (smatch(argp, "--prefix") || smatch(argp, "--strip")) {
            if (nextArg >= argc) {
                err++;
            } else {
                strip = argv[++nextArg];
            }

        } else {
            err++;
        }
    }
    if (err) {
        printUsage();
        return MPR_ERR;
    }
    if (fileList) {
        if ((fp = fopen(fileList, "r")) == 0) {
            mprLog("error makerom", 0, "Cannot open file list %s", fileList);
            return MPR_ERR;
        }
        while (fgets(fbuf, sizeof(fbuf), fp) != NULL) {
            path = strim(fbuf, "\r\n", 0);
            mprAddItem(files, path);
        }
        fclose(fp);
    }
    while (nextArg < argc) {
        mprAddItem(files, argv[nextArg++]);
    }
    if (mprGetListLength(files) == 0) {
        printUsage();
        return MPR_ERR;
    }
    if (binToC(files, mount, strip) < 0) {
        return MPR_ERR;
    }
    return 0;
}


static void printUsage(void)
{
    mprEprintf("usage: makerom [options] files... >output.c\n");
    mprEprintf("  Makerom options:\n");
    mprEprintf("  --files fileList      # List of files\n");
    mprEprintf("  --name structName     # Name of top level C struct\n");
    mprEprintf("  --mount mount         # Mount point for the ROM file system\n");
    mprEprintf("  --strip string        # Filename prefix to strip\n");
}


/* 
    Encode the files as C code
 */
static int binToC(MprList *files, cchar *mount, cchar *strip)
{
    struct stat     sbuf;
    char            buf[512];
    char            *filename, *p, *name;
    ssize           len;
    int             fd, next, i, j;

    mprPrintf("/*\n    Compiled Files\n */\n");

    mprPrintf("#include \"mpr.h\"\n\n");
    mprPrintf("#if ME_ROM\n");

    /*
        Open each input file and compile
     */
    for (next = 0; (filename = mprGetNextItem(files, &next)) != 0; ) {
        if (stat(filename, &sbuf) == 0 && sbuf.st_mode & S_IFDIR) {
            continue;
        } 
        if ((fd = open(filename, O_RDONLY | O_BINARY, 0666)) < 0) {
            mprLog("error makerom", 0, "Cannot open file %s", filename);
            return -1;
        }
        mprPrintf("static uchar _file_%d[] = {\n", next);

        while ((len = read(fd, buf, sizeof(buf))) > 0) {
            p = buf;
            for (i = 0; i < len; ) {
                mprPrintf("    ");
                for (j = 0; p < &buf[len] && j < 16; j++, p++) {
                    mprPrintf("%4d,", (unsigned char) *p);
                }
                i += j;
                mprPrintf("\n");
            }
        }
        mprPrintf("    0 };\n\n");
        close(fd);
    }

    /*
        Now output the page index
     */ 
    mprPrintf("PUBLIC MprRomInode romFiles[] = {\n");
    strip = mprGetNativePath(strip);
    mount = mprGetNativePath(mount);

    for (next = 0; (filename = mprGetNextItem(files, &next)) != 0; ) {
        name = mprGetRelPath(filename, 0);
        name = mprNormalizePath(name);
        name = mprGetNativePath(name);
        name = sncmp(name, strip, slen(strip)) == 0 ? &name[slen(strip)] : name;
        name = mprJoinPath(mount, name);
#if ME_WIN_LIKE
        name = sreplace(name, "\\", "\\\\");
#endif
        if (stat(filename, &sbuf) == 0 && sbuf.st_mode & S_IFDIR) {
            mprPrintf("    { \"%s\", 0, 0, 0 },\n", name);
            continue;
        }
        mprPrintf("    { \"%s\", _file_%d, %d, %d },\n", name, next, (int) sbuf.st_size, next);
    }
    mprPrintf("    { 0, 0, 0, 0 },\n");
    mprPrintf("};\n");
    mprPrintf("\nPUBLIC MprRomInode *mprGetRomFiles() {\n    return romFiles;\n}\n");
    mprPrintf("#else\n");
    mprPrintf("PUBLIC int romDummy;\n");
    mprPrintf("#endif /* ME_ROM */\n");
    return 0;
}

/*
    Copyright (c) Embedthis Software. All Rights Reserved.
    This software is distributed under a commercial license. Consult the LICENSE.md
    distributed with this software for full details and copyrights.
 */
