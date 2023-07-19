import * as fs from "fs"
import { join } from "path"
import lmdb, { Txn } from "node-lmdb"
import __dirname from "../__dirname.js"
import { createHash, randomBytes } from "crypto"
import config, { Modules } from "../config.js"
import { ViteError } from "web3-vite/dist/errors.js"

export const dataPath = join(__dirname, "../dbs/rate_limits")
if(!fs.existsSync(dataPath))fs.mkdirSync(dataPath, {
    recursive: true
})

export const rate_limit_env = new lmdb.Env()

process.on("exit", () => {
    rate_limit_env.close()
})
rate_limit_env.open({
    path: dataPath,
    mapSize: 2*1024*1024*1024,
    maxDbs: 20
})

export const rateLimitsDB = rate_limit_env.openDbi({
    name: "rate_limits",
    create: true
})
export const rateLimitsExpireDB = rate_limit_env.openDbi({
    name: "rate_limits_expire",
    create: true
})

export function getRateLimitStatus(txn:Txn, key:Buffer):number{
    const number = txn.getNumber(rateLimitsDB, key)
    if(!number)return 0

    return number
}

export function incrementRateLimitStatus(txn:Txn, key:Buffer, max:number, expires:number):number{
    let number = txn.getNumber(rateLimitsDB, key) ?? 0
    if(number >= max){
        throw new ViteError({
            error: {
                code: -35005,
                message: "Rate limit exceeded; please try again later"
            }
        })
    }
    number++
    
    const expirationDate = Date.now() + expires
    const id = randomBytes(8)
    const expireMap = getRateLimitsExpireMap(txn)
    expireMap.push([id, key, expirationDate])
    saveRateLimitsExpireMap(txn, expireMap)

    setTimeout(() => {
        const txn = rate_limit_env.beginTxn()
        const expireMap = getRateLimitsExpireMap(txn)
        const index = expireMap.findIndex(([_id]) => id.equals(_id))
        if(index === -1)return txn.commit()
        expireMap.splice(index, 1)
        saveRateLimitsExpireMap(txn, expireMap)

        const number = txn.getNumber(rateLimitsDB, key)
        if(!number)return txn.commit()

        if(number === 1){
            txn.del(rateLimitsDB, key)
        }else{
            txn.putNumber(rateLimitsDB, key, number - 1)
        }

        console.log(`${key.toString("hex")} rate limit status: ${number - 1}`)
        txn.commit()
    }, expirationDate - Date.now())
    
    txn.putNumber(rateLimitsDB, key, number)
    return number
}

export type RateLimitNamespace = "global" | "vpow"
export function getKey(rateLimitKey:string, namespace:RateLimitNamespace){
    return createHash("md5").update(namespace).update(rateLimitKey).digest()
}

let rateLimitMapCache:[Buffer, Buffer, number][]
export function getRateLimitsExpireMap(txn:Txn){
    if(rateLimitMapCache)return rateLimitMapCache

    const map:[Buffer, Buffer, number][] = []
    const data = txn.getBinary(rateLimitsExpireDB, "map")
    if(!data)return []
    for(let i = 0; i * 32 < data.length; i++){
        const index = i * 32
        const id = data.subarray(index, index + 8)
        const key = data.subarray(index + 8, index + 24)
        const value = data.readBigInt64BE(index + 24)
        map.push([id, key, Number(value)])
    }

    rateLimitMapCache = map
    return map
}

export function saveRateLimitsExpireMap(txn:Txn, map: [Buffer, Buffer, number][]){
    const data = Buffer.alloc(map.length * 32)
    for(let i = 0; i < map.length; i++){
        const index = i * 32
        const [id, key, value] = map[i]
        id.copy(data, index)
        key.copy(data, index + 8)
        data.writeBigInt64BE(BigInt(value), index + 24)
    }
    txn.putBinary(rateLimitsExpireDB, "map", data)
    rateLimitMapCache = map
}

if(config.modules.includes(Modules.rate_limits)){
    const txn = rate_limit_env.beginTxn({
        readonly: true
    })
    const expireMap = getRateLimitsExpireMap(txn)
    txn.commit()

    for(const [id, key, expirationDate] of expireMap){
        setTimeout(() => {
            const txn = rate_limit_env.beginTxn()
            const expireMap = getRateLimitsExpireMap(txn)
            const index = expireMap.findIndex(([_id]) => id.equals(_id))
            if(index === -1)return txn.commit()
            expireMap.splice(index, 1)
            saveRateLimitsExpireMap(txn, expireMap)
    
            const number = txn.getNumber(rateLimitsDB, key)
            if(!number)return txn.commit()
    
            if(number === 1){
                txn.del(rateLimitsDB, key)
            }else{
                txn.putNumber(rateLimitsDB, key, number - 1)
            }
            txn.commit()
            console.log(`${key.toString("hex")} rate limit status: ${number - 1}`)
        }, expirationDate - Date.now())
    }
}