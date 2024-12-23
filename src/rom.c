/*
    romFiles -- Compiled Files
 */
#include "mpr.h"

#if ME_ROM

PUBLIC MprRomInode romFiles[] = {
    { 0, 0, 0, 0 },
};

PUBLIC MprRomInode *mprGetRomFiles() {
    return romFiles;
}
#else
PUBLIC int romDummy;
#endif /* ME_ROM */
