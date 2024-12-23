#
#	RPM spec file for the Embedthis Appweb HTTP web server
#
Summary: ${settings.title} -- Embeddable HTTP Web Server
Name: ${settings.name}
Version: ${settings.version}
License: Commercial
Group: Applications/Internet
URL: https://www.embedthis.com/
Distribution: Embedthis
Vendor: Embedthis Software
BuildRoot: ${prefixes.rpm}/BUILDROOT/${settings.name}-${settings.version}.${platform.mappedCpu}
AutoReqProv: no

%description
Embedthis Appweb is the fast, little web server.

%prep

%build

%install
    if [ -x "${prefixes.vapp}/bin/uninstall" ] ; then
        appweb_HEADLESS=1 "${prefixes.vapp}/bin/uninstall" </dev/null 2>&1 >/dev/null
    fi
    mkdir -p ${prefixes.rpm}/BUILDROOT/${settings.name}-${settings.version}.${platform.mappedCpu}
    cp -r ${prefixes.content}/* ${prefixes.rpm}/BUILDROOT/${settings.name}-${settings.version}.${platform.mappedCpu}

%clean

%files -f binFiles.txt

%post
set -x
if [ -x /usr/bin/chcon ] ; then
	sestatus | grep enabled >/dev/null 2>&1
	if [ $? = 0 ] ; then
		for f in ${prefixes.vapp}/bin/*.so ; do
			chcon /usr/bin/chcon -t texrel_shlib_t $f
		done
	fi
fi
ldconfig -n ${prefixes.vapp}/bin

mkdir -p "${prefixes.spool}" "${prefixes.cache}" "${prefixes.log}"
chown nobody "${prefixes.spool}" "${prefixes.cache}" "${prefixes.log}"
chgrp nobody "${prefixes.spool}" "${prefixes.cache}" "${prefixes.log}"
chmod 755 "${prefixes.spool}" "${prefixes.cache}" "${prefixes.log}"

${prefixes.bin}/appman install enable start

%preun
rm -f ${prefixes.app}/latest

%postun
