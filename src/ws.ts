import WebSocket from "ws";
import { serveRequest } from "./proxy.js";
import { getIp } from "./ip.js";
import config from "./config.js";

export const wss = new WebSocket.Server({ noServer: true })

wss.on("connection", (ws, req) => {
    ws.setMaxListeners(0)
    const ip = getIp(req.socket.remoteAddress!, req.headers["x-forwarded-for"] as string)
    console.log(`[${ip}] [WS] Connected`)
    
    const url = new URL("http://localhost" + req.url)
    const vpow_api_key = url.searchParams.get("vpow_api_key") ?? config.vpow_api_key

    ws.on("message", async (message) => {
        try{
            const data = JSON.parse(message.toString("utf8"))
            if(Array.isArray(data)){
                const result = await Promise.all(
                    data.map(req => {
                        return serveRequest({
                            ...req,
                            ws: ws,
                            rateLimitKey: ip,
                            vpowApiKey: vpow_api_key
                        })
                    })
                )
                ws.send(JSON.stringify(result))
            }else{
                const result = await serveRequest({
                    ...data,
                    ws: ws,
                    rateLimitKey: ip,
                    vpowApiKey: vpow_api_key
                })
                ws.send(JSON.stringify(result))
            }
        }catch(err){
            ws.close(1006, "Invalid request")
        }
    })

    ws.on("close", () => {
        console.log(`[${ip}] [WS] Connection closed`)
    })
})