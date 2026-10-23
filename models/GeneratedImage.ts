import mongoose, { Schema } from 'mongoose'
import { Buffer } from 'node:buffer'
import type { Document, Model, Types } from 'mongoose'

export interface GeneratedImageDocument extends Document {
  userId: Types.ObjectId
  threadId: string
  prompt: string
  mimeType?: string
  data?: Buffer
  gridFsId?: Types.ObjectId
  imageUrl?: string
  createdAt: Date
}

const GeneratedImageSchema = new Schema<GeneratedImageDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    threadId: { type: String, required: true, index: true },
    prompt: { type: String, required: true, maxlength: 2_000 },
    mimeType: {
      type: String,
      enum: ['image/png', 'image/jpeg', 'image/webp'],
      required: false,
    },
    data: { type: Buffer, required: false },
    gridFsId: { type: Schema.Types.ObjectId, required: false },
    imageUrl: {
      type: String,
      maxlength: 7_000,
      validate: {
        validator: (value: string | undefined) =>
          !value || /^https:\/\/(?:image\.pollinations\.ai\/prompt\/|gen\.pollinations\.ai\/image\/)/.test(value),
        message: 'Generated image URLs must use the configured image service.',
      },
    },
  },
  { collection: 'generated_images', timestamps: { createdAt: true, updatedAt: false } },
)

GeneratedImageSchema.pre('validate', function validateImageStorage() {
  const hasStoredImage = Boolean(this.mimeType && (this.data || this.gridFsId))
  const hasImageUrl = Boolean(this.imageUrl)
  if (Number(hasStoredImage) + Number(hasImageUrl) !== 1) {
    this.invalidate('data', 'Store image bytes, a GridFS file, or a generated image URL.')
  }
})

GeneratedImageSchema.index({ userId: 1, createdAt: -1 })

const GeneratedImage: Model<GeneratedImageDocument> =
  mongoose.models.GeneratedImage as Model<GeneratedImageDocument>
  || mongoose.model<GeneratedImageDocument>('GeneratedImage', GeneratedImageSchema)

export default GeneratedImage