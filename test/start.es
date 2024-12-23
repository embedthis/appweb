require ejs.web

let server: HttpServer = new HttpServer
var router = Router(null)

/* Add a custom extension and routes */
router.add(/\.ejx$/i, {name: "ejx", module: "ejs.template", response: TemplateApp, method: "*"})
router.addHandlers()
router.addDefault(StaticApp)
router.addCatchall()
router.show()

server.on('readable', function (event, request) {
    server.serve(request, router)
})
server.listen()
