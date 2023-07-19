// this code was generated at 90% by github copilot lmao
import { Dbi, Txn } from "node-lmdb";
import { encodeIntegerToBuffer } from "../utils.js";

export function DBArrayGetKey(base:string, index:number){
    return Buffer.concat([
        Buffer.from(`${base}.`),
        encodeIntegerToBuffer(index)
    ])
}
export function DBArrayLength(txn: Txn, db: Dbi, base: string){
    return txn.getNumber(db, base) || 0
}
export function DBArrayPush(txn: Txn, db: Dbi, base: string, element: Buffer){
    const length = DBArrayLength(txn, db, base)
    txn.putNumber(db, base, length + 1)
    txn.putBinary(db, DBArrayGetKey(base, length), element)
    return length
}
export function DBArrayPop(txn: Txn, db: Dbi, base: string){
    const length = DBArrayLength(txn, db, base)
    if(length === 0)return null

    const key = DBArrayGetKey(base, length-1)
    const data = txn.getBinary(db, key)
    txn.del(db, key)
    txn.putNumber(db, base, length - 1)
    return data
}
export function DBArrayGet(txn: Txn, db: Dbi, base: string, index: number):Buffer|undefined{
    const length = DBArrayLength(txn, db, base)
    if(index >= length)return undefined

    return txn.getBinary(db, DBArrayGetKey(base, index))
}
export function DBArraySlice(txn: Txn, db: Dbi, base: string, start: number, end: number = DBArrayLength(txn, db, base)){
    if(start < 0)start = 0
    if(end < start)throw new Error("Invalid slice")
    const length = DBArrayLength(txn, db, base)
    if(start >= length)return []
    if(end > length)end = length
    const result:Buffer[] = []
    for(let i = start; i < end; i++){
        const data = DBArrayGet(txn, db, base, i)!
        result.push(data)
    }
    return result
}