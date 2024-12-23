let http: Http = new Http

let i
for (i = 4000; i < 9129; i++) {
    Path('a.dat').write('a'.times(i) + '\n')

    http.upload('http://127.0.0.1:4100/upload/cgiProgram.cgi', { myfile: 'a.dat' } )
    if (http.status != 200) {
        print('Failed', i)
        break
    } else {
        print(http.response)
        print('Passed', i)
    }
    http.wait()
}
