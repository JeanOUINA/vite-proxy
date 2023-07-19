import Joi from "joi";
import { nodes } from "./vite.js";
import config, { Modules } from "./config.js";
import { ViteError } from "web3-vite/dist/errors.js";
import WalletNamespace from "./namespaces/wallet.js";
import CachingNamespace from "./namespaces/caching.js";
import SubscribeNamespace from "./namespaces/subscribe.js";
import { WebSocket } from "ws";
import { Request } from "express";
import VPoWNamespace from "./namespaces/vpow.js";
import HeartbeatNamespace from "./namespaces/heartbeat.js";
import { consumeRateLimit, globalLimit } from "./rate_limits.js";

export interface ViteRequest {
    method: string,
    params: any[],
    id?: number,
    jsonrpc?: "2.0",
    ws?: WebSocket,
    req?: Request,
    rateLimitKey?: string,
    vpowApiKey?: string
}

export type MethodOverride = (request: ViteRequest) => Promise<any>
const methodOverrides = new Map<string, MethodOverride>([])

methodOverrides.set("subscribe", SubscribeNamespace.request.bind(SubscribeNamespace))

if(config.modules.includes(Modules.vpow)){
    methodOverrides.set("util_getPoWNonce", VPoWNamespace.request.bind(VPoWNamespace))
    methodOverrides.set("pow_getPowNonce", VPoWNamespace.request.bind(VPoWNamespace))
    methodOverrides.set("vpow", VPoWNamespace.request.bind(VPoWNamespace))
}

if(config.modules.includes(Modules.wallet)){
    methodOverrides.set("wallet", WalletNamespace.request.bind(WalletNamespace))
}

if(config.modules.includes(Modules.caching)){
    methodOverrides.set("ledger", CachingNamespace.request.bind(CachingNamespace))
    CachingNamespace.start()
}

if(config.modules.includes(Modules.heartbeat)){
    methodOverrides.set("heartbeat", HeartbeatNamespace.request.bind(HeartbeatNamespace))
}

const requestSchema = Joi.object({
    method: Joi.string().required(),
    params: Joi.array().items(Joi.any()).default([]),
    id: Joi.number().required().min(0).integer(),
    jsonrpc: Joi.string().valid("2.0").required(),
    ws: Joi.any().optional(),
    req: Joi.any().optional(),
    rateLimitKey: Joi.string().optional(),
    vpowApiKey: Joi.string().optional()
}).required()

export async function serveRequest(request: ViteRequest){
    try{
        request = await requestSchema.validateAsync(request)
        const { method, id, jsonrpc, rateLimitKey } = request


        const methodParts = method.split("_")
        // if not the case, might be a system call; allow
        if(rateLimitKey && methodParts[0] !== "heartbeat"){
            consumeRateLimit("global", rateLimitKey, globalLimit)
        }
        // so we can have override for pow_getPowNonce method and pow namespace
        for(let i = 0; i < methodParts.length; i++){
            const m = methodParts.slice(0, methodParts.length-i).join("_")

            if(methodOverrides.has(m)){
                const result = await methodOverrides.get(m)!(request)
                return {
                    id: id,
                    jsonrpc: jsonrpc,
                    result: result
                }
            }
        }

        const result = await proxyRequest(request)
        return {
            id: id,
            jsonrpc: jsonrpc,
            result: result
        }
    }catch(e){
        const err = e as Error
        if(err instanceof ViteError){
            return {
                error: {
                    message: err.message,
                    code: err.code
                },
                id: request.id,
                jsonrpc: request.jsonrpc
            }
        }

        return {
            error: {
                message: `${err.name}: ${err.message}`,
                code: -32002
            },
            id: request.id,
            jsonrpc: request.jsonrpc
        }
    }
}

export function proxyRequest(request: ViteRequest): Promise<any> {
    const node = nodes[Math.floor(Math.random() * nodes.length)]
    return node.request(request.method, request.params)
}