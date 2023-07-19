import ipaddr from "ipaddr.js"

export async function getCloudflareCIDRs(){
    const resps = await Promise.all([
        fetch("https://www.cloudflare.com/ips-v4"),
        fetch("https://www.cloudflare.com/ips-v6")
    ])
    const ranges = await Promise.all(resps.map(resp => resp.text()))

    return ranges.map(range => 
        range.split("\n")
        .map(line => line.trim())
        .filter(line => !!line)
    ).flat()
    .map(range => ipaddr.parseCIDR(range))
}

export const cloudflareCIDRs = await getCloudflareCIDRs()

export function isIPInCloudflareRange(ip:string){
    const addr = ipaddr.parse(ip)
    return cloudflareCIDRs.some(range => {
        if(addr.kind !== range[0].kind){
            return false
        }
        return addr.match(range)
    })
}