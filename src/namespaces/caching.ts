import { ActionQueue, SnapshotBlock } from "web3-vite";
import { Namespace } from "../Namespace.js";
import events from "../events.js";
import { proxyRequest, ViteRequest } from "../proxy.js";
import Joi from "joi";
import { hashSchema } from "../validation.js";

export const expireTimes = {
    snapshotBlock: 60*1000
}

export type CachingQueueKeyNamespace = "get_snapshot_block_by_hash" |
    "get_snapshot_block_by_height"
export type CachingQueueKey = `${CachingQueueKeyNamespace}:${string}`

// we'll only cache the most used methods; the rest will be proxied
export default new class CachingNamespace extends Namespace {
    queue = new ActionQueue<CachingQueueKey>()
    constructor(){
        super()

        this.methods.set("ledger_getLatestSnapshotHash", this.ledger_getLatestSnapshotHash.bind(this))
        this.methods.set("ledger_getLatestSnapshotChainHash", this.ledger_getLatestSnapshotHash.bind(this))
        this.methods.set("ledger_getSnapshotChainHeight", this.ledger_getSnapshotChainHeight.bind(this))

        this.methods.set("ledger_getSnapshotBlockByHash", this.ledger_getSnapshotBlockByHash.bind(this))
        this.methods.set("ledger_getSnapshotBlockByHeight", this.ledger_getSnapshotBlockByHeight.bind(this))
    }

    start(){
        events.on("snapshotBlock", (height, hash) => {
            this.snapshotChainHeight = height
            this.snapshotChainHash = hash
            // attempt at caching directly, before even going to clients
            // also lock queues
            
            this.queue.queueAction(`get_snapshot_block_by_hash:${hash}`, async () => {
                // lock hash and height queues, while fetching
                await this.ledger_getSnapshotBlockByHeight({
                    method: "ledger_getSnapshotBlockByHeight",
                    params: [height]
                }).catch(() => {})
            })
        })
    }

    snapshotBlockByHashCache = new Map<string, SnapshotBlock>()
    snapshotBlockByHeightCache = new Map<number, SnapshotBlock>()

    ledger_getSnapshotBlockByHeightSchema = Joi.array().allow(
        Joi.string().required().regex(/^\d+$/),
        Joi.number().required().min(0).integer()
    ).required().length(1)
    async ledger_getSnapshotBlockByHeight(request: ViteRequest):Promise<SnapshotBlock>{
        const [heightAny] = await this.ledger_getSnapshotBlockByHeightSchema.validateAsync(request.params) as [string|number]
        const height = typeof heightAny === "string" ? parseInt(heightAny) : heightAny
        
        return this.queue.queueAction(`get_snapshot_block_by_height:${height}`, async () => {
            if(this.snapshotBlockByHeightCache.has(height)){
                console.log(`[get_snapshot_block_by_height:${height}] cache hit`)
                return this.snapshotBlockByHeightCache.get(height)!
            }

            const snapshotBlock:SnapshotBlock = await proxyRequest(request)

            this.snapshotBlockByHeightCache.set(height, snapshotBlock)
            this.snapshotBlockByHashCache.set(snapshotBlock.hash, snapshotBlock)
            setTimeout(() => {
                this.snapshotBlockByHeightCache.delete(height)
                this.snapshotBlockByHashCache.delete(snapshotBlock.hash)
            }, expireTimes.snapshotBlock)
            
            return snapshotBlock
        })
    }

    ledger_getSnapshotBlockByHashSchema = Joi.array().items(
        hashSchema
    ).required()
    async ledger_getSnapshotBlockByHash(request: ViteRequest):Promise<SnapshotBlock>{
        const [hash] = await this.ledger_getSnapshotBlockByHashSchema.validateAsync(request.params) as [string]
        
        return this.queue.queueAction(`get_snapshot_block_by_hash:${hash}`, async () => {
            if(this.snapshotBlockByHashCache.has(hash)){
                console.log(`[get_snapshot_block_by_hash:${hash}] cache hit`)
                return this.snapshotBlockByHashCache.get(hash)!
            }

            const snapshotBlock:SnapshotBlock = await proxyRequest(request)

            this.snapshotBlockByHeightCache.set(snapshotBlock.height, snapshotBlock)
            this.snapshotBlockByHashCache.set(hash, snapshotBlock)
            setTimeout(() => {
                this.snapshotBlockByHeightCache.delete(snapshotBlock.height)
                this.snapshotBlockByHashCache.delete(hash)
            }, expireTimes.snapshotBlock)
            
            return snapshotBlock
        })
    }

    snapshotChainHeight:number|undefined
    snapshotChainHash:string|undefined

    async ledger_getLatestSnapshotBlock(request: ViteRequest):Promise<SnapshotBlock>{
        if(this.snapshotChainHeight === undefined){
            // we don't have the data yet from subscription; proxy it
            return proxyRequest(request)
        }
        // might be cached, let's just get it from here
        return this.ledger_getSnapshotBlockByHeight({
            method: "ledger_getSnapshotBlockByHeight",
            params: [this.snapshotChainHeight.toFixed(0)]
        })
    }

    async ledger_getSnapshotChainHeight(request: ViteRequest):Promise<string>{
        // we don't have the data yet from subscription; proxy it
        if(this.snapshotChainHeight === undefined){
            return proxyRequest(request)
        }
        return this.snapshotChainHeight.toFixed(0)
    }

    async ledger_getLatestSnapshotHash(request: ViteRequest):Promise<string>{
        // we don't have the data yet from subscription; proxy it
        if(this.snapshotChainHash === undefined){
            return proxyRequest(request)
        }
        return this.snapshotChainHash
    }

    public async request(request: ViteRequest): Promise<any> {
        const { method } = request
        if(!this.methods.has(method)){
            // just proxy
            return proxyRequest(request)
        }
        return this.methods.get(method)!.call(this, request)
    }
}