import { ViteError } from "web3-vite/dist/errors.js"
import { MethodOverride, ViteRequest } from "./proxy.js"

export class Namespace {
    public readonly methods: Map<string, MethodOverride> = new Map()

    public request(request: ViteRequest): Promise<any> {
        const { method } = request
        const [, m] = method.split("_")
        if(!this.methods.has(m)){
            console.warn(`\x1b[33m${method}\x1b[0m is not implemented`)
            throw new ViteError({error: {code: -32601, message: `The method ${method} does not exist/is not available`}})
        }
        return this.methods.get(m)!.call(this, request)
    }
}