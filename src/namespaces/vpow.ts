import { Namespace } from "../Namespace.js";
import { proxyRequest, ViteRequest } from "../proxy.js";
import Joi from "joi";
import { hashSchema } from "../validation.js";
import { difficultyToTarget } from "../pow.js";
import BigNumber from "bignumber.js";
import generate_work from "../vpow.js";
import config, { Modules } from "../config.js";
import { consumeRateLimit, vpowLimit } from "../rate_limits.js";

// add rate limits and proxy to vpow
export default new class VPoWNamespace extends Namespace {
    constructor(){
        super()

        this.methods.set("util_getPoWNonce", this.util_getPoWNonce.bind(this))
        this.methods.set("pow_getPowNonce", this.util_getPoWNonce.bind(this))
    }

    utilGetPoWNonceDifficultySchema = Joi.string().required().regex(/^\d+$/)
    utilGetPoWNonceThresholdSchema = hashSchema
    utilGetPoWNonceSchema = Joi.array().items(
        this.utilGetPoWNonceDifficultySchema,
        this.utilGetPoWNonceThresholdSchema
    ).required()
    async util_getPoWNonce(request: ViteRequest){
        const [difficulty, hash] = await this.utilGetPoWNonceSchema.validateAsync(request.params)
        await this.utilGetPoWNonceDifficultySchema.validateAsync(difficulty)
        await this.utilGetPoWNonceThresholdSchema.validateAsync(hash)

        const threshold = difficultyToTarget(new BigNumber(difficulty))

        const vpow_api_key = request.vpowApiKey ?? config.vpow_api_key
        const rateLimit = config.vpow_api_key == vpow_api_key
        
        console.log(rateLimit, vpow_api_key)
        if(rateLimit && config.modules.includes(Modules.rate_limits)){
            if(!request.rateLimitKey)throw new Error("rateLimitKey is undefined")

            consumeRateLimit("vpow", request.rateLimitKey, vpowLimit)
        }
        
        const nonce = await generate_work(hash, threshold, vpow_api_key)
        return nonce.toString("base64")
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