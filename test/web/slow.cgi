#!/bin/sh

echo "Content-type: text/html"
echo ""
echo "PATH $PATH"
echo "<html><body><p>Simple CGI program</p>"
echo "<pre>" 

i=0
while [ $i -lt 20 ] ;  do
    sleep 3
    date
    i=`expr $i + 1`
done
echo "</pre>"
echo "</body></html>"
