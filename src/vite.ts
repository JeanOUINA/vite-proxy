import { Client } from "web3-vite";
import config from "./config.js";
import { WebsocketProvider } from "web3-vite/dist/providers/ws.js";
import events from "./events.js";
import { serveRequest } from "./proxy.js";

export let nodes = config.nodes.map(node => new Client(node))

console.log(`Testing nodes...`)

await Promise.all(nodes.map(node => {
    return node.methods.net.syncInfo()
    .then(info => {
        if(info.state !== 2)throw new Error("Node is not synced")
    })
    .catch(e => {
        console.warn(`Node ${node.provider.url} is not working`, e)
        nodes = nodes.filter(n => n !== node)
    })
}))

if(nodes.length === 0){
    console.error("No working nodes found")
    process.exit(1)
}

console.log(`${nodes.length} working nodes`)
export let subscriptionNode = nodes.find(node => node.provider instanceof WebsocketProvider)
if(!subscriptionNode){
    console.warn("No websocket node found. Subscription events will be using HTTP (slow).")
    subscriptionNode = nodes[0]
}

subscriptionNode.subscribe("snapshotBlock")
.then(subscription => {
    subscription.events.on("data", (block) => {
        events.emit("snapshotBlock", parseInt(block.height), block.hash, block.removed)
    })
})

subscriptionNode.subscribe("accountBlock")
.then(subscription => {
    subscription.events.on("data", async (block) => {
        events.emit("accountBlock", block.hash, block.removed)
        const {
            result: accountBlock
        } = await serveRequest({
            method: "ledger_getAccountBlockByHash",
            params: [block.hash],
            id: 0,
            jsonrpc: "2.0"
        })
        if(!accountBlock)return
        events.emit("resolvedAccountBlock", accountBlock, block.removed)
    })
})

// this prevents disconnections with cloudflare
for(const node of nodes){
    if(node === subscriptionNode)continue
    if(!(node.provider instanceof WebsocketProvider))continue
    node.subscribe("snapshotBlock")
}