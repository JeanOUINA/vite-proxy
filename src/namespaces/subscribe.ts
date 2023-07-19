import { AccountBlockV2, ActionQueue, AddressType, BlockType, EventEmitter, Subscription, isValidAddress } from "web3-vite";
import { Namespace } from "../Namespace.js";
import events from "../events.js";
import { ViteRequest } from "../proxy.js";
import Joi from "joi";
import { randomBytes } from "crypto";
import { ViteError } from "web3-vite/dist/errors.js";
import { addressSchema, hashSchema } from "../validation.js";
import { subscriptionNode } from "../vite.js";

// func (s *SubscribeApi) NewSnapshotBlocksFilter() (rpc.ID, error) {
// func (s *SubscribeApi) CreateSnapshotBlockFilter() (rpc.ID, error) {
// func (s *SubscribeApi) NewSnapshotBlockFilter() (rpc.ID, error) {
// func (s *SubscribeApi) NewAccountBlocksFilter() (rpc.ID, error) {
// func (s *SubscribeApi) CreateAccountBlockFilter() (rpc.ID, error) {
// func (s *SubscribeApi) NewAccountBlockFilter() (rpc.ID, error) {
// func (s *SubscribeApi) NewAccountBlocksByAddrFilter(addr types.Address) (rpc.ID, error) {
// func (s *SubscribeApi) CreateAccountBlockFilterByAddress(addr types.Address) (rpc.ID, error) {
// func (s *SubscribeApi) NewAccountBlockByAddressFilter(addr types.Address) (rpc.ID, error) {
// func (s *SubscribeApi) NewOnroadBlocksByAddrFilter(addr types.Address) (rpc.ID, error) {
// func (s *SubscribeApi) CreateUnreceivedBlockFilterByAddress(addr types.Address) (rpc.ID, error) {
// func (s *SubscribeApi) NewUnreceivedBlockByAddressFilter(addr types.Address) (rpc.ID, error) {
// func (s *SubscribeApi) NewLogsFilter(param RpcFilterParam) (rpc.ID, error) {
// func (s *SubscribeApi) CreateVmLogFilter(param api.VmLogFilterParam) (rpc.ID, error) {
// func (s *SubscribeApi) NewVmLogFilter(param api.VmLogFilterParam) (rpc.ID, error) {
// func (s *SubscribeApi) UninstallFilter(id rpc.ID) bool {
// func (s *SubscribeApi) GetFilterChanges(id rpc.ID) (interface{}, error) {
// func (s *SubscribeApi) GetChangesByFilterId(id rpc.ID) (interface{}, error) {

const filterMethods = new Map<string, string>([
    ["newSnapshotBlocksFilter", "newSnapshotBlocks"],
    ["createSnapshotBlockFilter", "createSnapshotBlockSubscription"],
    ["newSnapshotBlockFilter", "newSnapshotBlock"],
    ["newAccountBlocksFilter", "newAccountBlocks"],
    ["createAccountBlockFilter", "createAccountBlockSubscription"],
    ["newAccountBlockFilter", "newAccountBlock"],
    ["newAccountBlocksByAddrFilter", "newAccountBlocksByAddr"],
    ["createAccountBlockFilterByAddress", "createAccountBlockSubscriptionByAddress"],
    ["newAccountBlockByAddressFilter", "newAccountBlockByAddress"],
    ["newOnroadBlocksByAddrFilter", "newOnroadBlocksByAddr"],
    ["createUnreceivedBlockFilterByAddress", "createUnreceivedBlockSubscriptionByAddress"],
    ["newUnreceivedBlockByAddressFilter", "newUnreceivedBlockByAddress"],
    ["newLogsFilter", "newLogs"],
    ["createVmLogFilter", "createVmlogSubscription"],
    ["newVmLogFilter", "newVmLog"]
])

type SubscriptionTopic = "newSnapshotBlocks" | "createSnapshotBlockSubscription" | "newSnapshotBlock" |
    "newAccountBlocks" | "createAccountBlockSubscription" | "newAccountBlock" |
    "newAccountBlocksByAddr" | "createAccountBlockSubscriptionByAddress" | "newAccountBlockByAddress" |
    "newOnroadBlocksByAddr" | "createUnreceivedBlockSubscriptionByAddress" | "newUnreceivedBlockByAddress" |
    "newLogs" | "createVmlogSubscription" | "newVmLog"
const subscriptionsTopicsVersions = new Map<SubscriptionTopic, number>([
    ["newSnapshotBlocks", 1],
    ["createSnapshotBlockSubscription", 2],
    ["newSnapshotBlock", 2],

    ["newAccountBlocks", 1],
    ["createAccountBlockSubscription", 2],
    ["newAccountBlock", 2],

    ["newAccountBlocksByAddr", 1],
    ["createAccountBlockSubscriptionByAddress", 2],
    ["newAccountBlockByAddress", 2],

    ["newOnroadBlocksByAddr", 1],
    ["createUnreceivedBlockSubscriptionByAddress", 2],
    ["newUnreceivedBlockByAddress", 2],

    ["newLogs", 1],
    ["createVmlogSubscription", 2],
    ["newVmLog", 2]
])

interface Range {
    fromHeight: number|string,
    toHeight: number|string
}
interface VmLogSubscriptionParams {
    addressHeightRange: Record<string, Range>,
    topics: string[][]
}

export type SubscriptionNotifierEvents = {
    data: [any],
    close: []
}
export interface FilterSubscription {
    id: string,
    notifier: EventEmitter<SubscriptionNotifierEvents>,
    unsubscribe: () => void,
    cache: any[],
    timeout: NodeJS.Timeout
}

export type SubscriptionQueueKeyNamespace = "new_vmlog"
export type SubcriptionQueueKey = `${SubscriptionQueueKeyNamespace}:${string}`

// consider filter dead after 5 minutes
const deadline = 5*60*1000
// we'll only cache the most used methods; the rest will be proxied
export default new class SubscribeNamespace extends Namespace {
    queue = new ActionQueue<SubcriptionQueueKey>()
    constructor(){
        super()

        this.methods.set("subscribe", this.subscribe.bind(this))
        
        for(const method of filterMethods.keys()){
            this.methods.set(method, this.subscribe_with_filter.bind(this))
        }
        this.methods.set("uninstallFilter", this.uninstallFilter.bind(this))
        this.methods.set("getFilterChanges", this.getFilterChanges.bind(this))
        this.methods.set("getChangesByFilterId", this.getFilterChanges.bind(this))
    }

    subscriptions = {
        vmlog: new Map<string, Subscription<"vmlog">>()
    }

    filtersSubscriptions = new Map<string, FilterSubscription>()
    async subscribe_with_filter(request:ViteRequest){
        const notifier = new EventEmitter<SubscriptionNotifierEvents>()
        const [, m] = request.method.split("_")
        const method = filterMethods.get(m)!

        const subscriptionId = await this.subscribe({
            ...request,
            method: "subscribe_subscribe",
            params: [method, ...request.params]
        }, notifier)

        const subscription:FilterSubscription = {
            id: subscriptionId,
            notifier,
            unsubscribe: () => {
                notifier.emit("close")
                this.filtersSubscriptions.delete(subscriptionId)
                clearTimeout(subscription.timeout)
            },
            cache: [],
            timeout: setTimeout(() => {
                subscription.unsubscribe()
            }, deadline)
        }
        this.filtersSubscriptions.set(subscriptionId, subscription)
        notifier.on("data", (data) => {
            subscription.cache.push(data)
        })

        return subscriptionId
    }

    uninstallFilterSchema = Joi.array().items(
        Joi.string().required()
    ).length(1).required()
    async uninstallFilter(request:ViteRequest){
        const [id] = await this.uninstallFilterSchema.validateAsync(request.params) as [string]
        const subscription = this.filtersSubscriptions.get(id)
        if(subscription){
            subscription.unsubscribe()
            this.filtersSubscriptions.delete(id)
        }

        return !!subscription
    }

    async getFilterChanges(request:ViteRequest){
        const [id] = await this.uninstallFilterSchema.validateAsync(request.params) as [string]
        const subscription = this.filtersSubscriptions.get(id)
        if(!subscription)throw new Error("Filter not found")

        const cache = subscription.cache
        subscription.cache = []
        
        clearTimeout(subscription.timeout)
        subscription.timeout = setTimeout(() => {
            subscription.unsubscribe()
        }, deadline)

        return {
            subscription: id,
            result: cache
        }
    }

    subscribeTopicSchema = Joi.string().required().allow(
        ...subscriptionsTopicsVersions.keys()
    )
    newSnapshotBlockSubscriptionArgumentsSchema = Joi.array().length(0)
    newAccountBlockSubscriptionArgumentsSchema = Joi.array().length(0)
    newAccountBlockByAddressSubscriptionArgumentsSchema = Joi.array().items(
        addressSchema
    ).length(1)
    newUnreceivedBlockByAddressSubscriptionArgumentsSchema = Joi.array().items(
        addressSchema
    ).length(1)
    newVmLogSubscriptionParamsSchema = Joi.object({
        addressHeightRange: Joi.object().pattern(addressSchema, Joi.object({
            fromHeight: Joi.allow(
                Joi.number().integer().min(0).required(),
                Joi.string().required().regex(/^\d+$/)
            ).required(),
            toHeight: Joi.allow(
                Joi.number().integer().min(0).required(),
                Joi.string().required().regex(/^\d+$/)
            ).required()
        })).required(),
        topics: Joi.array().items(
            Joi.array().items(hashSchema)
        ).min(0).default([]),
    }).required()
    newVmLogSubscriptionArgumentsSchema = Joi.array().items(
        this.newVmLogSubscriptionParamsSchema
    ).length(1)
    subscribeSchema = Joi.array().items(Joi.any()).required().min(1)
    async subscribe(request: ViteRequest, notifier?:EventEmitter<SubscriptionNotifierEvents>){
        const subscriptionId = `0x${randomBytes(16).toString("hex")}`

        const [topic, ...args] = await this.subscribeSchema.validateAsync(request.params) as [SubscriptionTopic, ...any[]]
        await this.subscribeTopicSchema.validateAsync(topic)
        console.log(`[${request.rateLimitKey}] Subscribing to ${topic} [${subscriptionId}]`)
        
        if(request.ws){
            notifier = new EventEmitter<SubscriptionNotifierEvents>()
            request.ws.on("close", () => {
                notifier!.emit("close")
            })
            notifier.on("data", (data) => {
                request.ws!.send(JSON.stringify({
                    jsonrpc: "2.0",
                    method: "subscribe_subscription",
                    params: {
                        subscription: subscriptionId,
                        result: [data]
                    }
                }))
            })
        }
        if(!notifier)throw new ViteError({error: {code: -32600, message: "Cannot start a subscription with no notifier (vite-proxy bug)"}})
        notifier.on("close", () => {
            console.log(`[${request.rateLimitKey}] Unsubscribing from ${topic} [${subscriptionId}]`)
        })

        const version = subscriptionsTopicsVersions.get(topic)!
        switch(topic){
            case "newSnapshotBlocks":
            case "createSnapshotBlockSubscription":
            case "newSnapshotBlock": {
                await this.newSnapshotBlockSubscriptionArgumentsSchema.validateAsync(args)
                const listener = (height:number, hash:string, removed:boolean) => {
                    switch(version){
                        case 1:
                            return notifier!.emit("data", {
                                height: height,
                                heightStr: height.toString(),
                                hash,
                                removed
                            })
                        case 2:
                            return notifier!.emit("data", {
                                height: height.toString(),
                                hash,
                                removed
                            })
                    }
                }
                events.on("snapshotBlock", listener)
                notifier.on("close", () => {
                    events.off("snapshotBlock", listener)
                })
                break
            }

            case "newAccountBlocks":
            case "createAccountBlockSubscription":
            case "newAccountBlock": {
                await this.newAccountBlockSubscriptionArgumentsSchema.validateAsync(args)
                const listener = (hash: string, removed: boolean) => {
                    notifier!.emit("data", {
                        hash,
                        removed
                    })
                }
                events.on("accountBlock", listener)
                notifier.on("close", () => {
                    events.off("accountBlock", listener)
                })
                break
            }

            case "newAccountBlocksByAddr":
            case "createAccountBlockSubscriptionByAddress":
            case "newAccountBlockByAddress": {
                const [address] = await this.newAccountBlockByAddressSubscriptionArgumentsSchema.validateAsync(args) as [string]
                const listener = (accountBlock: AccountBlockV2, removed: boolean) => {
                    if(accountBlock.address !== address)return
                    switch(version){
                        case 1:
                            return notifier!.emit("data", {
                                height: parseInt(accountBlock.height),
                                heightStr: accountBlock.height,
                                hash: accountBlock.hash,
                                removed: removed
                            })
                        case 2:
                            return notifier!.emit("data", {
                                height: accountBlock.height,
                                hash: accountBlock.hash,
                                removed: removed
                            })
                    }
                }
                events.on("resolvedAccountBlock", listener)
                notifier.on("close", () => {
                    events.off("resolvedAccountBlock", listener)
                })
                break
            }

            case "newOnroadBlocksByAddr":
            case "createUnreceivedBlockSubscriptionByAddress":
            case "newUnreceivedBlockByAddress": {
                const [address] = await this.newUnreceivedBlockByAddressSubscriptionArgumentsSchema.validateAsync(args) as [string]
                const listener = (accountBlock: AccountBlockV2, removed: boolean) => {
                    if(accountBlock.toAddress !== address)return
                    if([
                        BlockType.Receive,
                        BlockType.ReceiveError,
                        BlockType.GenesisReceive
                    ].includes(accountBlock.blockType))return
                    switch(version){
                        case 1:
                            return notifier!.emit("data", {
                                closed: !!accountBlock.receiveBlockHash,
                                hash: accountBlock.hash,
                                removed: removed
                            })
                        case 2:
                            return notifier!.emit("data",{
                                received: !!accountBlock.receiveBlockHash,
                                hash: accountBlock.hash,
                                removed: removed
                            })
                    }
                }
                events.on("resolvedAccountBlock", listener)
                notifier.on("close", () => {
                    events.off("resolvedAccountBlock", listener)
                })
                break
            }

            case "newLogs":
            case "createVmlogSubscription":
            case "newVmLog": {
                const [params] = await this.newVmLogSubscriptionArgumentsSchema.validateAsync(args) as [VmLogSubscriptionParams]

                for(const address in params.addressHeightRange){
                    let startHeight = params.addressHeightRange[address].fromHeight
                    let endHeight = params.addressHeightRange[address].toHeight
                    
                    if(typeof startHeight === "string"){
                        startHeight = params.addressHeightRange[address].fromHeight = parseInt(startHeight)
                    }
                    if(typeof endHeight === "string"){
                        endHeight = params.addressHeightRange[address].toHeight = parseInt(endHeight)
                    }

                    if(endHeight < startHeight && endHeight !== 0){
                        throw new ViteError({error: {code: -32002, message: `to height < from height`}})
                    }

                    if(isValidAddress(address) !== AddressType.Contract){
                        throw new ViteError({error: {code: -32002, message: `invalid address; Not a contract address`}})
                    }
                    const contractInfo = await subscriptionNode!.methods.contract.getContractInfo(address)
                    if(!contractInfo.code){
                        throw new ViteError({error: {code: -32002, message: `invalid address; Contract does not exist`}})
                    }
                }

                const subscriptions = await Promise.all(
                    Object.entries(params.addressHeightRange)
                    .map(([address]) => {
                        return this.queue.queueAction(`new_vmlog:${address}`, async () => {
                            console.log(`[${request.rateLimitKey}] new_vmlog:${address} ${subscriptionId}`)
                            if(this.subscriptions.vmlog.has(address)){
                                return this.subscriptions.vmlog.get(address)!
                            }

                            const subscription = await subscriptionNode!.subscribe("vmlog", {
                                [address]: {
                                    startHeight: "0",
                                    endHeight: "0"
                                }
                            })
                            this.subscriptions.vmlog.set(address, subscription)
                            subscription.events.setMaxListeners(0)

                            return subscription
                        })
                    })
                )

                for(const subscription of subscriptions){
                    const listener = (log:{
                        vmlog: {
                            topics: string[];
                            data: string;
                        };
                        accountBlockHash: string;
                        accountBlockHeight: string;
                        address: string;
                        removed: boolean;
                    }) => {
                        for(let i = 0; i < params.topics.length; i++){
                            if(params.topics[i].length === 0)continue
                            if(params.topics[i].includes(log.vmlog.topics[i]))continue
                            return
                        }
                        const height = parseInt(log.accountBlockHeight)
                        if(height < (params.addressHeightRange[log.address].fromHeight as number))return
                        if(params.addressHeightRange[log.address].toHeight !== 0 && height > (params.addressHeightRange[log.address].toHeight as number))return

                        notifier!.emit("data", log)
                    }
                    subscription.events.on("data", listener)
                    notifier.on("close", () => {
                        subscription.events.off("data", listener)
                    })
                }

                break
            }

            default: {
                throw new ViteError({error: {code: -32601, message: `Couldn't start subscription; ${topic} is not implemented`}})
            }
        }

        return subscriptionId
    }
}