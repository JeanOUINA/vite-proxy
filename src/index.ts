import "modernlog/patch.js"
import { connect } from "./mongoose.js"
import { app } from "./server.js"

await connect()

app.listen(+process.env.PORT, process.env.HOST, () => {
    console.log(`Listening on http://${process.env.HOST}:${process.env.PORT}`)
})
