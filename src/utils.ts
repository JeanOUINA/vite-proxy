import { NextFunction, Request, Response } from "express"

export function handleAsync(
    middleware: (req: Request, res: Response, next: NextFunction) => Promise<any>
){
    return (req: Request, res: Response, next: NextFunction) => {
        middleware(req, res, next)
        ?.catch?.(err => {
            res.status(500).json({
                error: err.message
            })
        })
    }
}
