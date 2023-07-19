import Joi from "joi";
import { isValidAddress } from "web3-vite";

export const hashSchema = Joi.string().required().regex(/^[\da-f]{64}$/)
export const addressSchema = Joi.string().required().custom((value, helpers) => {
    if(!isValidAddress(value)){
        return helpers.error("any.invalid")
    }
    return value
})