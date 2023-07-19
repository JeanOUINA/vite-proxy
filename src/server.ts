import express from "express"
import { serveRequest } from "./proxy.js"
import config from "./config.js"
import { getIp } from "./ip.js"

export const app = express()
.disable("x-powered-by")
.use(
    (req, res, next) => {
        for(const key in config.headers){
            res.setHeader(key, config.headers[key])
        }
        next()
    }
)
.post(
    "*",
    (req, res, next) => {
        // parse body
        let body = ""
        req.on("data", chunk => body += chunk)
        req.on("end", () => {
            try{
                req.body = JSON.parse(body)
            }catch(e){
                req.body = null
            }
            next()
        })
    },
    async (req, res) => {
        const ip = getIp(req.ip, req.headers["x-forwarded-for"])
        let vpow_api_key = config.vpow_api_key
        if("vpow_api_key" in req.query){
            if(typeof req.query.vpow_api_key !== "string"){
                return res.status(500).send("querystring vpow_api_key must be a string")
            }
            vpow_api_key = req.query.vpow_api_key
        }

        if(Array.isArray(req.body)){
            res.status(200).send(
                await Promise.all(
                    req.body.map(req => {
                        return serveRequest({
                            ...req,
                            req: req,
                            rateLimitKey: ip,
                            vpowApiKey: vpow_api_key
                        })
                    })
                )
            )
        }else{
            const result = await serveRequest({
                ...req.body,
                req: req,
                rateLimitKey: ip,
                vpowApiKey: vpow_api_key
            })
            res.status(200).send(result)
        }
    }
)