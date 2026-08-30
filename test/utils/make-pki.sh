#!/bin/bash
#
#   make-pki.sh - Generate the test PKI and certificate revocation lists for the mTLS revocation tests
#
#   Builds a two-level PKI under test/pki:
#
#       root                        Root certificate authority (trust anchor)
#       +-- int                     Intermediate certificate authority
#       |   +-- client-int          Client certificate issued by the intermediate
#       +-- client-root             Client certificate issued directly by the root
#       +-- server                  TLS server certificate, CN=localhost
#
#   And four revocation list bundles, each holding a root CRL and an intermediate CRL:
#
#       crl-empty.crl               Nothing revoked
#       crl-leaf.crl                client-root revoked
#       crl-chain.crl               The intermediate authority revoked
#       crl-expired.crl             Nothing revoked, but the root CRL is past its nextUpdate
#
#   Each bundle is generated from its own copy of the root authority database so the revocation
#   sets stay independent of each other.
#
#   Also writes pki/revoke.conf holding the virtual hosts that serve these lists. test/appweb.conf
#   includes pki/*.conf with a glob, so a tree without this PKI simply has no revocation endpoints
#   and the revocation tests skip.
#
#   Everything here is for testing only -- never use these keys or certificates in production.
#

set -e
trap 'echo "   [Error] make-pki.sh failed -- revocation tests will be skipped" >&2' ERR

cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1

PKI=pki
BITS=2048
DAYS=3650

if ! type openssl >/dev/null 2>&1; then
    echo "   [Skip] openssl not found, skipping revocation test PKI"
    exit 0
fi

#
#   Regenerate only when missing. The certificates are long lived, but the expired CRL is generated
#   relative to now, so a stale tree is discarded rather than reused.
#
if [ -f $PKI/.generated ]; then
    exit 0
fi
echo '   [Create] revocation test PKI'
rm -rf $PKI
mkdir -p $PKI

#
#   Minimal CA configuration. The policy is deliberately permissive so the client and server
#   distinguished names do not have to match the authority.
#
cat > $PKI/openssl.cnf <<'EOF'
[ ca ]
default_ca = testCa

[ testCa ]
database         = $ENV::CA_DIR/index.txt
serial           = $ENV::CA_DIR/serial
crlnumber        = $ENV::CA_DIR/crlnumber
new_certs_dir    = $ENV::CA_DIR
certificate      = $ENV::CA_DIR/ca.crt
private_key      = $ENV::CA_DIR/ca.key
default_md       = sha256
default_days     = 3650
default_crl_days = 3650
policy           = testPolicy
email_in_dn      = no
unique_subject   = no
rand_serial      = no

[ testPolicy ]
commonName = supplied

[ req ]
distinguished_name = testDn
prompt             = no

[ testDn ]
CN = unused

[ caExt ]
basicConstraints = critical,CA:TRUE
keyUsage         = critical,keyCertSign,cRLSign
subjectKeyIdentifier = hash

[ serverExt ]
basicConstraints = critical,CA:FALSE
keyUsage         = critical,digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName   = DNS:localhost,IP:127.0.0.1

[ clientExt ]
basicConstraints = critical,CA:FALSE
keyUsage         = critical,digitalSignature,keyEncipherment
extendedKeyUsage = clientAuth
EOF

#
#   The [ testCa ] section resolves CA_DIR when the configuration is loaded, so every openssl
#   invocation needs it set -- even those that do not act as an authority. Commands that do
#   override it inline.
#
PKI_DIR=$(cd $PKI && pwd)
export CA_DIR=$PKI_DIR/root

#
#   initCa dir -- create an authority database
#
initCa() {
    mkdir -p "$1"
    : > "$1/index.txt"
    echo '01' > "$1/serial"
    echo '01' > "$1/crlnumber"
}

#
#   makeKeyAndCsr name cn -- create a key and certificate request
#
makeKeyAndCsr() {
    openssl genrsa -out $PKI/$1.key $BITS 2>/dev/null
    openssl req -new -config $PKI/openssl.cnf -key $PKI/$1.key -out $PKI/$1.csr -subj "/CN=$2" 2>/dev/null
}

#
#   sign caDir name extension -- issue a certificate from an authority
#
sign() {
    CA_DIR=$PKI_DIR/$1 openssl ca -batch -notext -config $PKI/openssl.cnf \
        -in $PKI/$2.csr -out $PKI/$2.crt -extfile $PKI/openssl.cnf -extensions $3 -days $DAYS >/dev/null 2>&1
}

#
#   Root authority. Self-signed, and its own database so it can issue and revoke.
#
initCa $PKI/root
openssl genrsa -out $PKI/root.key $BITS 2>/dev/null
openssl req -new -x509 -config $PKI/openssl.cnf -key $PKI/root.key -out $PKI/root.crt \
    -subj "/CN=Appweb Test Root CA" -days $DAYS -extensions caExt 2>/dev/null
cp $PKI/root.key $PKI/root/ca.key
cp $PKI/root.crt $PKI/root/ca.crt

#
#   Intermediate authority, issued by the root.
#
initCa $PKI/int
makeKeyAndCsr int "Appweb Test Intermediate CA"
sign root int caExt
cp $PKI/int.key $PKI/int/ca.key
cp $PKI/int.crt $PKI/int/ca.crt

#
#   Server certificate and the two client certificates.
#
makeKeyAndCsr server localhost
sign root server serverExt

makeKeyAndCsr client-root "client-root"
sign root client-root clientExt

makeKeyAndCsr client-int "client-int"
sign int client-int clientExt

#
#   gencrl caDir output [extra args] -- generate a revocation list
#
gencrl() {
    caDir="$1"; out="$2"; shift 2
    CA_DIR=$PKI_DIR/$caDir openssl ca -batch -config $PKI/openssl.cnf -gencrl -out "$out" "$@" 2>/dev/null
}

#
#   revoke caDir cert -- mark a certificate revoked in an authority database
#
revoke() {
    CA_DIR=$PKI_DIR/$1 openssl ca -batch -config $PKI/openssl.cnf -revoke $PKI/$2.crt >/dev/null 2>&1
}

#
#   Each bundle needs a list for every authority in the chain. CRL_CHECK_ALL requires one for the
#   issuer of every certificate it checks, including the trust anchor itself.
#
gencrl int $PKI/int-empty.crl
gencrl root $PKI/root-empty.crl

cp -r $PKI/root $PKI/root-leaf
revoke root-leaf client-root
gencrl root-leaf $PKI/root-leaf.crl

cp -r $PKI/root $PKI/root-chain
revoke root-chain int
gencrl root-chain $PKI/root-chain.crl

#
#   An already-expired list. The validity window is stated explicitly because -crldays and
#   -crlhours only accept positive values.
#
gencrl root $PKI/root-expired.crl -crl_lastupdate 20200101000000Z -crl_nextupdate 20200102000000Z

cat $PKI/root-empty.crl   $PKI/int-empty.crl > $PKI/crl-empty.crl
cat $PKI/root-leaf.crl    $PKI/int-empty.crl > $PKI/crl-leaf.crl
cat $PKI/root-chain.crl   $PKI/int-empty.crl > $PKI/crl-chain.crl
cat $PKI/root-expired.crl $PKI/int-empty.crl > $PKI/crl-expired.crl

rm -f $PKI/*.csr $PKI/*.pem

#
#   Virtual hosts exercising each revocation state. Written here rather than kept in appweb.conf so
#   that a tree without this PKI has no endpoints referencing files that do not exist.
#
cat > $PKI/revoke.conf <<'EOF'
#
#   revoke.conf - mTLS certificate revocation endpoints
#
#   Generated by test/utils/make-pki.sh. Do not edit -- regenerate instead.
#
#   Every endpoint requires a client certificate and trusts only the root authority, so a client
#   issued by the intermediate must supply the intermediate in its chain.
#

<VirtualHost *:8443>
    ListenSecure 127.0.0.1:8443             # <CRLNONE>
    SSLVerifyClient on
    SSLCACertificateFile    "pki/root.crt"
    SSLCertificateFile      "pki/server.crt"
    SSLCertificateKeyFile   "pki/server.key"
</VirtualHost>

<VirtualHost *:8444>
    ListenSecure 127.0.0.1:8444             # <CRLEMPTY>
    SSLVerifyClient on
    SSLCACertificateFile    "pki/root.crt"
    SSLCertificateFile      "pki/server.crt"
    SSLCertificateKeyFile   "pki/server.key"
    SSLCARevocationFile     "pki/crl-empty.crl"
</VirtualHost>

<VirtualHost *:8445>
    ListenSecure 127.0.0.1:8445             # <CRLLEAF>
    SSLVerifyClient on
    SSLCACertificateFile    "pki/root.crt"
    SSLCertificateFile      "pki/server.crt"
    SSLCertificateKeyFile   "pki/server.key"
    SSLCARevocationFile     "pki/crl-leaf.crl"
</VirtualHost>

<VirtualHost *:8446>
    ListenSecure 127.0.0.1:8446             # <CRLCHAIN>
    SSLVerifyClient on
    SSLCACertificateFile    "pki/root.crt"
    SSLCertificateFile      "pki/server.crt"
    SSLCertificateKeyFile   "pki/server.key"
    SSLCARevocationFile     "pki/crl-chain.crl"
</VirtualHost>

<VirtualHost *:8447>
    ListenSecure 127.0.0.1:8447             # <CRLEXPIRED>
    SSLVerifyClient on
    SSLCACertificateFile    "pki/root.crt"
    SSLCertificateFile      "pki/server.crt"
    SSLCertificateKeyFile   "pki/server.key"
    SSLCARevocationFile     "pki/crl-expired.crl"
</VirtualHost>

#
#   The same list as CRLCHAIN, but checked against the client certificate only. A certificate
#   issued under the revoked intermediate is accepted here -- the cost of the opt-out.
#
<VirtualHost *:8448>
    ListenSecure 127.0.0.1:8448             # <CRLLEAFONLY>
    SSLVerifyClient on
    SSLCACertificateFile    "pki/root.crt"
    SSLCertificateFile      "pki/server.crt"
    SSLCertificateKeyFile   "pki/server.key"
    SSLCARevocationFile     "pki/crl-chain.crl"
    SSLCARevocationCheck    leaf
</VirtualHost>
EOF

touch $PKI/.generated
exit 0
