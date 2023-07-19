import { AccountBlockV2, EventEmitter } from "web3-vite";

export default new EventEmitter<{
    snapshotBlock: [height: number, hash: string, removed: boolean],
    accountBlock: [hash: string, removed: boolean],
    resolvedAccountBlock: [block: AccountBlockV2, removed: boolean]
}>()