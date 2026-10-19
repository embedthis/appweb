/*
    sanitize.h - MPR configuration of the sanitizer build

    bin/sanitize.sh force-includes this into the library build, and the C tests include it when TestMe runs with
    PROFILE=sanitize. Both must agree: MprMem and the inline mprMark() change size with ME_MPR_ALLOC_CHECK.
 */

#define ME_MPR_ALLOC_CHECK 1
#define ME_MPR_DEBUG_LOGGING 1
#define ME_MPR_ASSERT_FATAL 1
