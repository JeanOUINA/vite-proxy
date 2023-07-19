import config from "./config.js";
import { RateLimitNamespace, getKey, incrementRateLimitStatus, rate_limit_env } from "./dbs/rate_limit.js";
import { resolveDuration } from "./utils.js";

export type Limit = [number, number]
export const globalLimit:Limit = [
    config.rate_limits.global[0],
    resolveDuration(config.rate_limits.global[1])
]
export const vpowLimit:Limit = [
    config.rate_limits.vpow[0],
    resolveDuration(config.rate_limits.vpow[1])
]

export function consumeRateLimit(namespace:RateLimitNamespace, rateLimitKey:string, limit: Limit){
    const txn = rate_limit_env.beginTxn()
    const key = getKey(rateLimitKey, namespace)
    try{
        const status = incrementRateLimitStatus(txn, key, ...limit)
        console.log(`${namespace}:${rateLimitKey} rate limit status: ${status}/${limit[0]}/${limit[1]}`)
        txn.commit()
    }catch(err){
        txn.abort()
        throw err
    }
}