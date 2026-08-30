#!/usr/bin/env bash
#
#   prep.sh - Prepare Appweb benchmark test environment
#

make-files() {
    COUNT=$1
    OUTPUT=$2
    if [ ! -f $OUTPUT ] ; then
        echo "   [Create] $OUTPUT"
        > $OUTPUT
        while [ $COUNT -gt 0 ] ; do
            echo 0123456789012345678901234567890123456789012345678 >>$OUTPUT
            COUNT=$((COUNT - 1))
        done
        echo END OF DOCUMENT >>$OUTPUT
    fi
}

# Directories already created by mkdir in implementation
# mkdir -p site/static site/auth site/put
mkdir -p site/static site/auth site/put

# Create benchmark-specific test files in static directory
make-files 20 site/static/1K.txt      # 1KB
make-files 205 site/static/10K.txt    # 10KB
make-files 2050 site/static/100K.txt  # 100KB
make-files 20500 site/static/1M.txt   # 1MB

# Create simple index file for basic tests
cat > site/index.html <<'EOF'
<!DOCTYPE html>
<html>
<head><title>Appweb Benchmark Test</title></head>
<body><h1>Appweb Benchmark Server</h1></body>
</html>
EOF

# Create JSON file for action tests
cat > site/test.json <<'EOF'
{
    "status": "ok",
    "message": "Benchmark test data"
}
EOF

# Create auth directory for authentication tests
cat > site/auth/secret.html <<'EOF'
<!DOCTYPE html>
<html>
<head><title>Secret</title></head>
<body><h1>Authenticated Content</h1></body>
</html>
EOF

# Note: Authentication users are defined inline in appweb.conf
# User ralph with password pass5 is configured for digest auth tests

#
#   Copy the client roots.crt to the .testme binary directory
#
mkdir -p .testme/bench.tst
cp ../../certs/roots.crt .testme/roots.crt

echo "Benchmark environment prepared successfully"
