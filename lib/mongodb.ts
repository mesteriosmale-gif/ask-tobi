import mongoose from 'mongoose'
import { MongoClient } from 'mongodb'

export const mongoUri = process.env.MONGODB_URL?.trim() || process.env.MONGODB_URI?.trim()

declare global {
  var mongooseConnection:
    | { connection: typeof mongoose | null; promise: Promise<typeof mongoose> | null }
    | undefined
  var mongoClientPromise: Promise<MongoClient> | undefined
}

const cachedMongoose =
  globalThis.mongooseConnection ??
  (globalThis.mongooseConnection = { connection: null, promise: null })

let clientPromise: Promise<MongoClient>
if (!mongoUri) {
  clientPromise = Promise.resolve(new MongoClient('mongodb://127.0.0.1:27017'))
} else if (process.env.NODE_ENV === 'development') {
  globalThis.mongoClientPromise ??= Promise.resolve(new MongoClient(mongoUri))
  clientPromise = globalThis.mongoClientPromise
} else {
  clientPromise = Promise.resolve(new MongoClient(mongoUri))
}

export { clientPromise }

export default async function connectToDatabase(): Promise<typeof mongoose> {
  if (!mongoUri) {
    throw new Error('MONGODB_URI or MONGODB_URL is not configured.')
  }

  if (cachedMongoose.connection) {
    return cachedMongoose.connection
  }

  cachedMongoose.promise ??= mongoose.connect(mongoUri, { bufferCommands: false })

  try {
    cachedMongoose.connection = await cachedMongoose.promise
    return cachedMongoose.connection
  } catch (error) {
    cachedMongoose.promise = null
    throw error
  }
}
