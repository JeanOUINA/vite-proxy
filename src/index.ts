import "modernlog/patch.js"
import { app } from "./server.js"
import config, { Modules } from "./config.js"
import { Server as HTTPServer } from "http"
import { Server as HTTPSServer } from "https"
import { readFile } from "fs/promises"
import { wss } from "./ws.js"

const server = config.modules.includes(Modules.ssl) ? new HTTPSServer({
    key: await readFile(config.ssl!.key, "utf-8"),
    cert: await readFile(config.ssl!.cert, "utf-8")
}, app) : new HTTPServer(app)

server.listen(config.port, config.host, () => {
    console.log(`Server listening on ${config.host}:${config.port}`)
})

server.on("upgrade", (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request)
    })
})