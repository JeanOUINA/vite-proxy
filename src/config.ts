import { join } from "path";
import __dirname from "./__dirname.js";
import { readFile } from "fs/promises";
import { existsSync } from "fs";

export enum Modules {
    vpow = "vpow",
    wallet = "wallet",
    ssl = "ssl",
    caching = "caching",
    rate_limits = "rate_limits",
    heartbeat = "heartbeat"
}
// [limit, interval]
export type RateLimitDefinition = [number, string]
export interface SSLConfig {
    key: string,
    cert: string
}
export interface Config {
    nodes: string[],
    modules: Modules[],

    vpow_api_key: string,

    port: number,
    host: string,
    ssl?: SSLConfig,

    rate_limits: RateLimitsConfig,

    headers: {
        [key: string]: string
    }
}
export interface RateLimitsConfig {
    global: RateLimitDefinition,
    vpow: RateLimitDefinition,
}

export const configPath = join(__dirname, "../config.json")
if(!existsSync(configPath)){
    console.error(`config.json not found at ${configPath}`)
    console.error("Please copy config.example.json to config.json and edit it.")
    process.exit(1)
}

export const config:Config = JSON.parse(await readFile(configPath, "utf-8"))
export default config

export function validateConfig(config:Config){
    if(typeof config !== "object" || config === null){
        throw new Error("config must be an object")
    }
    if(!("nodes" in config) || !Array.isArray(config.nodes)){
        throw new Error("config.nodes must be an array")
    }
    if(config.nodes.length === 0){
        throw new Error("config.nodes must not be empty")
    }
    if(config.nodes.find(node => typeof node !== "string")){
        throw new Error("config.nodes must be an array of strings")
    }
    if(config.nodes.find(node => {
        try{
            new URL(node)
            return false
        }catch(e){
            return true
        }
    })){
        throw new Error("config.nodes must be an array of valid URLs")
    }
    if(!("modules" in config) || !Array.isArray(config.modules)){
        throw new Error("config.modules must be an array")
    }
    if(config.modules.find(module => typeof module !== "string")){
        throw new Error("config.modules must be an array of strings")
    }
    if(config.modules.find(module => !(module in Modules))){
        throw new Error("config.modules must be an array of valid modules")
    }
    if(config.modules.includes(Modules.vpow)){
        if(!("vpow_api_key" in config) || typeof config.vpow_api_key !== "string"){
            throw new Error("config.vpow_api_key must be a string (required by vpow module)")
        }
        if(!/^[\da-f]{64}$/i.test(config.vpow_api_key)){
            throw new Error("config.vpow_api_key must be a 64-character hex string (required by vpow module)")
        }
    }
    if(config.modules.includes(Modules.ssl)){
        if(!("ssl" in config) || typeof config.ssl !== "object" || config.ssl === null){
            throw new Error("config.ssl must be an object (required by ssl module)")
        }
        
        if(!("key" in config.ssl) || typeof config.ssl.key !== "string"){
            throw new Error("config.ssl.key must be a string (required by ssl module)")
        }
        if(!("cert" in config.ssl) || typeof config.ssl.cert !== "string"){
            throw new Error("config.ssl.cert must be a string (required by ssl module)")
        }

        if(!existsSync(config.ssl.key)){
            throw new Error(`config.ssl.key file not found at ${config.ssl.key}`)
        }
        if(!existsSync(config.ssl.cert)){
            throw new Error(`config.ssl.cert file not found at ${config.ssl.cert}`)
        }
    }
    if(!("port" in config) || typeof config.port !== "number"){
        throw new Error("config.port must be a number")
    }
    if(!("host" in config) || typeof config.host !== "string"){
        throw new Error("config.host must be a string")
    }

    // headers
    if(!("headers" in config) || typeof config.headers !== "object" || config.headers === null){
        throw new Error("config.headers must be an object")
    }
    for(const [key, value] of Object.entries(config.headers)){
        if(typeof key !== "string"){
            throw new Error("config.headers keys must be strings")
        }
        if(typeof value !== "string"){
            throw new Error("config.headers values must be strings")
        }
    }
}

try{
    validateConfig(config)
}catch(err){
    console.error("Invalid config.json:", (err as Error).message)
    process.exit(1)
}