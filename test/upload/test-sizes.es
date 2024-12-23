let http: Http = new Http

let i
for (i = 6200; i < 9129; i++) {
    Path('a.dat').write('a'.times(i) + '\n')

    http.upload('http://127.0.0.1:4100/upload/upload.esp', { myfile: 'a.dat' } )
    if (http.status != 200) {
        print('Failed', i)
        break
    } else {
        print('Passed', i)
    }
    http.wait()
}
