import * as dotenv from "dotenv"
import { join } from "path"
import __dirname from "./__dirname.js"

dotenv.config({
    path: join(__dirname, "..", ".env")
})
