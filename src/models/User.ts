import mongoose, { Document, Schema } from "mongoose";

export enum UserPermission {
    ADMIN = "admin",
    UPLOAD = "upload",
    ADD_DOMAIN = "add_domain"
}

export interface IUser extends Document {
    name: string,
    email: string,
    avatar: string,
    permissions: UserPermission[]
}

const UserSchema = new Schema<IUser>({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true
    },
    avatar: {
        type: String,
        required: true
    },
    permissions: {
        type: [String],
        required: true,
        default: [],
        enum: Object.values(UserPermission)
    }
})

export default mongoose.model<IUser>("User", UserSchema);