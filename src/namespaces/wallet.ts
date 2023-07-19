import { getAddressFromOriginalAddress, getOriginalAddressFromAddress, isValidAddress, WalletMnemonics } from "web3-vite";
import { getWalletInfo, listWallets, setWalletInfo, wallet_env } from "../dbs/wallet.js";
import * as crypto from "crypto";
import * as bip39 from "bip39"
import { withTxn } from "../utils.js";
import { Namespace } from "../Namespace.js";
import { ViteRequest } from "../proxy.js";
import Joi from "joi";
import { ViteError } from "web3-vite/dist/errors.js";

interface CreateEntropyFileResponse {
    mnemonics: string,
    primaryAddress: string,
    filePath: string
}
interface NewStoreResponse {
    mnemonic: string,
    primaryAddr: string,
    filename: string
}

export default new class WalletNamespace extends Namespace {
    private getEntropyFilePath(address:string){
        return `/vite-proxy/wallets/${address}`
    }
    private getAddressFromEntropyFilePath(entropyFile:string){
        if(!/^\/vite-proxy\/wallets\/vite_[abcdef\d]{50}$/.test(entropyFile)){
            throw new ViteError({error: {code: -32002, message: "error given store not found"}})
        }
        const address = entropyFile.slice("/vite-proxy/wallets/".length)
        if(!isValidAddress(address)){
            throw new ViteError({error: {code: -32002, message: "error given store not found"}})
        }
        return address
    }
    private encryptMnemonics(mnemonics:string, passphrase:string){
        const entropy = Buffer.from(bip39.mnemonicToEntropy(mnemonics), "hex")
        const key = crypto.createHash("sha256").update(passphrase).digest()
        const iv = crypto.randomBytes(16)

        const encrypted:Buffer[] = []
        const cipher = crypto.createCipheriv("aes-256-gcm", key, iv)
        encrypted.push(cipher.update(entropy))
        encrypted.push(cipher.final())

        const authTag = cipher.getAuthTag()
        const buffers = [
            // store version 0
            Buffer.from([0]),
            iv,
            Buffer.from([authTag.length]),
            authTag,
            ...encrypted
        ]
        return Buffer.concat(buffers)
    }
    private decryptMnemonics(data:Buffer, passphrase:string){
        if(data[0] > 0){
            throw new Error("Unsupported wallet store version")
        }
        const key = crypto.createHash("sha256").update(passphrase).digest()
        const iv = data.slice(1, 17)
        const authTagLength = data[17]
        const authTag = data.slice(18, 18 + authTagLength)
        const encrypted = data.slice(18 + authTagLength)

        const buffers = []
        const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv)
        decipher.setAuthTag(authTag)
        buffers.push(decipher.update(encrypted))
        buffers.push(decipher.final())

        const entropy = Buffer.concat(buffers)
        return bip39.entropyToMnemonic(entropy.toString("hex"))
    }

    unlockedWallets = new Map<string, WalletMnemonics>()

    constructor(){
        super()

        this.methods.set("getEntropyFilesInStandardDir", this.getAllEntropyFiles)
        this.methods.set("getAllEntropyFiles", this.getAllEntropyFiles)
        this.methods.set("listEntropyFilesInStandardDir", this.getAllEntropyFiles)
        this.methods.set("listAllEntropyFiles", this.getAllEntropyFiles)
        
        this.methods.set("exportMnemonic", this.exportMnemonic)

        this.methods.set("unlock", this.unlock)
        this.methods.set("lock", this.lock)

        this.methods.set("deriveAddressesByIndexRange", this.deriveAddressesByIndexRange)

        this.methods.set("recoverEntropyFile", this.recoverEntropyFile)
        this.methods.set("recoverEntropyStoreFromMnemonic", this.recoverEntropyFile)
        this.methods.set("createEntropyFile", this.createEntropyFile)
        this.methods.set("newMnemonicAndEntropyStore", this.createEntropyFile)
    }

    getAllEntropyFilesSchema = Joi.array().length(0).required()
    async getAllEntropyFiles({params}: ViteRequest): Promise<string[]> {
        await this.getAllEntropyFilesSchema.validateAsync(params)

        const files = withTxn(
            wallet_env.beginTxn({
                readonly: true
            }),
            (txn) => listWallets(txn)
        )

        return files.map(file => {
            return this.getEntropyFilePath(getAddressFromOriginalAddress(file.toString("hex")))
        })
    }

    exportMnemonicSchema = Joi.array().items(Joi.string()).length(2).required()
    async exportMnemonic({params}: ViteRequest): Promise<string> {
        const [address, passphrase] = await this.exportMnemonicSchema.validateAsync(params) as [string, string]
        const originalAddress = Buffer.from(getOriginalAddressFromAddress(address), "hex")
        const wallet = withTxn(
            wallet_env.beginTxn({
                readonly: true
            }),
            (txn) => getWalletInfo(txn, originalAddress)
        )
        if(!wallet){
            throw new ViteError({error: {code: -32002, message: "error given store not found"}})
        }

        try{
            return this.decryptMnemonics(wallet.mnemonics, passphrase)
        }catch{
            throw new ViteError({error: {code: -32002, message: "error decrypt store"}})
        }
    }

    unlockSchema = Joi.array().items(Joi.string()).length(2).required()
    async unlock({params}: ViteRequest):Promise<void>{
        const [entropyFile, passphrase] = await this.unlockSchema.validateAsync(params) as [string, string]
        const address = this.getAddressFromEntropyFilePath(entropyFile)
        const mnemonics = await this.exportMnemonic({
            method: "wallet_exportMnemonic",
            params: [address, passphrase]
        })

        this.unlockedWallets.set(address, new WalletMnemonics(mnemonics))
    }

    lockSchema = Joi.array().items(Joi.string()).length(1).required()
    async lock({params}: ViteRequest):Promise<void>{
        const [entropyFile] = await this.lockSchema.validateAsync(params) as [string]
        const address = this.getAddressFromEntropyFilePath(entropyFile)
        if(!this.unlockedWallets.has(address))return

        this.unlockedWallets.delete(address)
    }

    deriveAddressesByIndexRangeEntropyFileSchema = Joi.string().required()
    deriveAddressesByIndexRangeStartIndexSchema = Joi.number().integer().min(0).required()
    deriveAddressesByIndexRangeEndIndexSchema = Joi.number().integer().min(0).required()
    deriveAddressesByIndexRangeSchema = Joi.array().items(
        this.deriveAddressesByIndexRangeEntropyFileSchema,
        this.deriveAddressesByIndexRangeStartIndexSchema,
        this.deriveAddressesByIndexRangeEndIndexSchema
    ).length(3).required()
    async deriveAddressesByIndexRange({params}:ViteRequest):Promise<string[]>{
        const [entropyFile, startIndex, endIndex] = await this.deriveAddressesByIndexRangeSchema.validateAsync(params) as [string, number, number]
        await this.deriveAddressesByIndexRangeEntropyFileSchema.validateAsync(entropyFile)
        await this.deriveAddressesByIndexRangeStartIndexSchema.validateAsync(startIndex)
        await this.deriveAddressesByIndexRangeEndIndexSchema.validateAsync(endIndex)

        const address = this.getAddressFromEntropyFilePath(entropyFile)
        if(!this.unlockedWallets.has(address)){
            throw new ViteError({error: {code: -32002, message: "the crypto store is locked"}})
        }

        const wallet = this.unlockedWallets.get(address)!
        const addresses = []
        for(let i = startIndex; i <= endIndex; i++){
            addresses.push(wallet.deriveAddress(i).address)
        }
        return addresses
    }

    createEntropyFileSchema = Joi.array().items(Joi.string()).length(1).required()
    async createEntropyFile({method, params}: ViteRequest): Promise<CreateEntropyFileResponse|NewStoreResponse> {
        const [passphrase] = await this.createEntropyFileSchema.validateAsync(params) as [string]
        const mnemonics = bip39.generateMnemonic(256)

        switch(method){
            case "wallet_createEntropyFile":
                return this.recoverEntropyFile({
                    method: "wallet_recoverEntropyFile",
                    params: [mnemonics, passphrase]
                })
            case "wallet_newMnemonicAndEntropyStore":
                return this.recoverEntropyFile({
                    method: "wallet_recoverEntropyStoreFromMnemonic",
                    params: [mnemonics, passphrase]
                })
        }

        throw new ViteError({error: {code: -32601, message: `Method ${method} not found (?) This is a bug, please report`}})
    }

    recoverEntropyFileSchema = Joi.array().items(Joi.string()).length(2).required()
    async recoverEntropyFile({method, params}: ViteRequest): Promise<CreateEntropyFileResponse|NewStoreResponse> {
        const [mnemonics, passphrase] = await this.recoverEntropyFileSchema.validateAsync(params) as [string, string]
        const encrypted = this.encryptMnemonics(mnemonics, passphrase)
        const primaryAddress = new WalletMnemonics(mnemonics).mainAddress.address
        

        withTxn(
            wallet_env.beginTxn(),
            (txn) => setWalletInfo(txn, {
                primaryAddress: Buffer.from(getOriginalAddressFromAddress(primaryAddress), "hex"),
                mnemonics: encrypted
            })
        )

        switch(method){
            case "wallet_recoverEntropyFile":
                return {
                    mnemonics: mnemonics,
                    primaryAddress: primaryAddress,
                    filePath: this.getEntropyFilePath(primaryAddress)
                }
            case "wallet_recoverEntropyStoreFromMnemonic":
                return {
                    mnemonic: mnemonics,
                    primaryAddr: primaryAddress,
                    filename: this.getEntropyFilePath(primaryAddress)
                }
        }

        throw new ViteError({error: {code: -32601, message: `Method ${method} not found (?) This is a bug, please report`}})
    }
}