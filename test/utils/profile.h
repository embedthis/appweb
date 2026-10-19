/*
    profile.h - Force-included into every C test so it is compiled with the MPR configuration of the library it links

    testme.json5 defines TM_PROFILE_<profile> from the TestMe profile (the PROFILE environment variable).
 */

#if defined(TM_PROFILE_sanitize)
    #include "../../bin/sanitize.h"
#endif
