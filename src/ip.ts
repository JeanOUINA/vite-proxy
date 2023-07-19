import { isIPInCloudflareRange } from "./cloudflare.js"

export function getIp(remoteAddress:string, XForwardedFor:string|string[]|undefined):string{
    let ip = remoteAddress
    if(ip.startsWith("::ffff:")){
        ip = ip.slice(7)
    }

    // this might be nginx; accept X-Forwarded-For
    if(["::1", "127.0.0.1"].includes(ip) && XForwardedFor){
        const h = XForwardedFor
        if(Array.isArray(h)){
            throw new Error("X-Forwarded-For must be a single string")
        }
        const members = h.split(",").map(s => s.trim())
        ip = members[members.length - 1]
        // check if realIp is cloudflare
        if(isIPInCloudflareRange(ip) && members.length > 1){
            // trust further
            ip = members[members.length - 2]
            // not gonna accept any other proxy; stop here
        }
    }

    return ip
}