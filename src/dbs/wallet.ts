import * as fs from "fs"
import { join } from "path"
import lmdb, { Txn } from "node-lmdb"
import { DBArrayPush, DBArraySlice } from "../db_utils/array.js"
import { isValidWalletAddress } from "../utils.js"
import __dirname from "../__dirname.js"

export const dataPath = join(__dirname, "../dbs/wallets")
if(!fs.existsSync(dataPath))fs.mkdirSync(dataPath, {
    recursive: true
})

export const wallet_env = new lmdb.Env()

process.on("exit", () => {
    wallet_env.close()
})
wallet_env.open({
    path: dataPath,
    mapSize: 2*1024*1024*1024,
    maxDbs: 20
})

export const walletsMapDB = wallet_env.openDbi({
    name: "wallets_map",
    create: true
})

export const walletsInfosDB = wallet_env.openDbi({
    name: "wallets_infos",
    create: true
})

export interface WalletInfo {
    primaryAddress: Buffer,
    mnemonics: Buffer
}

export function setWalletInfo(txn:Txn, info:WalletInfo){
    if(!isValidWalletAddress(info.primaryAddress)){
        throw new Error("Invalid primary address")
    }
    if(txn.getBinary(walletsInfosDB, info.primaryAddress)?.length){
        throw new Error("Wallet already exists")
    }
    txn.putBinary(walletsInfosDB, info.primaryAddress, Buffer.concat([
        info.primaryAddress,
        info.mnemonics
    ]))
    DBArrayPush(txn, walletsMapDB, `wallets`, info.primaryAddress)
}

export function getWalletInfo(txn:Txn, primaryAddress:Buffer):WalletInfo|undefined{
    if(!isValidWalletAddress(primaryAddress)){
        throw new Error("Invalid primary address")
    }
    const data = txn.getBinary(walletsInfosDB, primaryAddress)
    if(!data)return undefined

    return {
        primaryAddress: data.slice(0, 21),
        mnemonics: data.slice(21)
    }
}

export function listWallets(txn:Txn){
    return DBArraySlice(txn, walletsMapDB, `wallets`, 0)
}