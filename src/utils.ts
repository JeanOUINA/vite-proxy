import { NextFunction, Request, Response } from "express"
import { Txn } from "node-lmdb"
import { errors } from "web3-vite"

export function handleAsync(
    middleware: (req: Request, res: Response, next: NextFunction) => Promise<any>
){
    return (req: Request, res: Response, next: NextFunction) => {
        middleware(req, res, next)
        ?.catch?.(err => {
            if(err instanceof errors.ViteError){
                res.status(500).send({
                    error: {
                        code: err.code,
                        message: err.message
                    }
                })
            }else{
                res.status(500).send({
                    error: {
                        code: -32001,
                        message: `${err.name}: ${err.message}`
                    }
                })
            }
        })
    }
}

export function isValidWalletAddress(address: Buffer){
    return address.length === 21 && address[20] === 0x00
}
export function encodeIntegerToBuffer(number:number){
    if(number % 1 !== 0)throw new Error("Invalid number")
    const bytes = []
    while(number > 0){
        bytes.unshift(number & 0xff)
        number = number >> 8
    }
    return Buffer.from(bytes)
}
export function withTxn<T=any>(txn:Txn, callback: (txn:Txn) => T):T{
    try{
        const data = callback(txn)
        txn.commit()
        return data
    }catch(e){
        txn.abort()
        throw e
    }
}

export class DurationError extends Error {
    name = "DurationError"
}
export const durationUnits:Record<string, number> = {
    s: 1000,
    m: 60*1000,
    h: 60*60*1000,
    d: 24*60*60*1000,
    w: 7*24*60*60*1000
}
export function resolveDuration(durationstr:string):number{
    if(!durationstr.length)return 0
    let duration = 0n
    let input = ""
    const chars = durationstr.split("")
    
    while(chars[0]){
        const unit = chars.shift()!
        if(/^\d+(m|s|h|d|w)$/.test(input+unit)){
            const multiplier = BigInt(durationUnits[unit])
            const rawDuration = BigInt(input)
            duration = duration + rawDuration*multiplier
            input = ""
        }else{
            input += unit
        }
    }
    if(input)throw new DurationError("Invalid duration: "+durationstr)
    return Number(duration)
}