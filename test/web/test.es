exports.app = function (request) { 
    return {
        status: 201, 
        headers: {"Content-Type": "text/html"}, 
        body: "Hello Cruel World\n"
    } 
}
