import fetch from "node-fetch"
import { ViteError } from "web3-vite/dist/errors.js"

const powUrl = "https://pow.vitamin.tips"
export default async function generate_work(hash:string, threshold:string, token:string){
    const pathname = `/${token}/api/generate_work`
    const url = new URL(pathname, powUrl)
    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            hash: hash,
            threshold: threshold
        })
    })
    const json:{
        code: number,
        msg: string|null,
        error: string|null,
        data: {
            work: string
        }
    } = await res.json() as any

    if(json.code !== 0){
        throw new ViteError({
            error: {
                code: -32002,
                message: json.error ?? json.msg ?? "Unknown error"
            }
        })
    }

    return Buffer.from(json.data.work, "hex").reverse()
}