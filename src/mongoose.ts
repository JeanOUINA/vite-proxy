import "./env.js"
import mongoose from "mongoose";

export let connection:mongoose.Connection
export async function connect(){
    console.info("Connecting to MongoDB")
    const m = await mongoose.connect(process.env.MONGO_URL, {
        auth: {
            username: process.env.MONGO_USER,
            password: process.env.MONGO_PASS,
        },
        authSource: "admin",
        tls: true
    })
    connection = m.connection
    console.log("Connected to MongoDB")
}