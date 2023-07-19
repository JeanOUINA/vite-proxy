import { ViteError } from "web3-vite/dist/errors.js";
import { Namespace } from "../Namespace.js";
import { ViteRequest } from "../proxy.js";
import { WebSocket } from "ws";
import Joi from "joi";

export default new class HeartbeatNamespace extends Namespace {
    constructor(){
        super()

        this.methods.set("start", this.start.bind(this))
        this.methods.set("ping", this.ping.bind(this))
    }

    heartbeatsClients = new WeakMap<WebSocket, NodeJS.Timeout>()

    async start(request: ViteRequest):Promise<boolean>{
        if(!request.ws)throw new ViteError({error: {code: -32002, message: `Cannot enable heartbeat on a non-websocket connection`}})
        if(this.heartbeatsClients.has(request.ws))throw new ViteError({error: {code: -32002, message: `Heartbeat is already enabled on this connection`}})
        this.heartbeatsClients.set(request.ws!, setTimeout(() => {
            request.ws!.close()
        }, 45*1000))

        request.ws!.on("close", () => {
            this.heartbeatsClients.delete(request.ws!)
        })

        console.log(`[${request.rateLimitKey}] Heartbeat enabled`)

        return true
    }

    heartbeatPingSchema = Joi.array().items(
        Joi.number().required().min(0).integer()
    ).default([])
    async ping(request: ViteRequest):Promise<boolean>{
        if(!request.ws)throw new ViteError({error: {code: -32002, message: `Cannot ping a non-websocket connection`}})
        if(!this.heartbeatsClients.has(request.ws))throw new ViteError({error: {code: -32002, message: `Heartbeat is not enabled on this connection`}})

        const [timestamp] = await this.heartbeatPingSchema.validateAsync(request.params) as [number]

        clearTimeout(this.heartbeatsClients.get(request.ws!)!)
        this.heartbeatsClients.set(request.ws!, setTimeout(() => {
            request.ws!.close()
        }, 45*1000))
        console.log(`[${request.rateLimitKey}] Ping (${Date.now() - timestamp}ms)`)

        return true
    }
}