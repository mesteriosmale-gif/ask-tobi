import mongoose, { Schema } from 'mongoose'
import type { Document, Model } from 'mongoose'

export interface UserDocument extends Document {
  name: string
  email: string
  emailVerified: Date | null
  image: string | null
  passwordHash: string | null
}

const UserSchema = new Schema<UserDocument>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    emailVerified: { type: Date, default: null },
    image: { type: String, default: null },
    passwordHash: { type: String, default: null, select: false },
  },
  { timestamps: true, collection: 'users' },
)

const User: Model<UserDocument> =
  mongoose.models.User as Model<UserDocument> || mongoose.model<UserDocument>('User', UserSchema)

export default User
