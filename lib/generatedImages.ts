import mongoose from 'mongoose'
import { GridFSBucket } from 'mongodb'
import GeneratedImage from '../models/GeneratedImage'

type SaveGeneratedImageOptions = {
  userId: string
  threadId: string
  prompt: string
  mimeType: string
  data: Buffer
}

type SaveGeneratedImageUrlOptions = {
  userId: string
  threadId: string
  prompt: string
  imageUrl: string
}

export async function saveGeneratedImage({
  userId,
  threadId,
  prompt,
  mimeType,
  data,
}: SaveGeneratedImageOptions): Promise<string> {
  if (data.byteLength === 0 || data.byteLength > 40_000_000) {
    throw new Error('Generated image size is outside the supported range.')
  }

  if (data.byteLength > 12_000_000) {
    const database = mongoose.connection.db
    if (!database) throw new Error('MongoDB is not connected.')
    const bucket = new GridFSBucket(database, { bucketName: 'generated_image_files' })
    const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/webp' ? 'webp' : 'png'
    const upload = bucket.openUploadStream(`tobi-image.${extension}`, {
      metadata: { userId, threadId, mimeType },
    })
    await new Promise<void>((resolve, reject) => {
      upload.once('error', reject)
      upload.once('finish', resolve)
      upload.end(data)
    })

    try {
      const image = await GeneratedImage.create({
        userId,
        threadId,
        prompt: prompt.slice(0, 2_000),
        mimeType,
        gridFsId: upload.id,
      })
      return image._id.toString()
    } catch (error) {
      await bucket.delete(upload.id).catch(() => undefined)
      throw error
    }
  }

  const image = await GeneratedImage.create({
    userId,
    threadId,
    prompt: prompt.slice(0, 2_000),
    mimeType,
    data,
  })

  return image._id.toString()
}

export async function saveGeneratedImageUrl({
  userId,
  threadId,
  prompt,
  imageUrl,
}: SaveGeneratedImageUrlOptions): Promise<string> {
  const parsedUrl = new URL(imageUrl)
  if (
    parsedUrl.protocol !== 'https:'
    || !(
      (parsedUrl.hostname === 'image.pollinations.ai' && parsedUrl.pathname.startsWith('/prompt/'))
      || (parsedUrl.hostname === 'gen.pollinations.ai' && parsedUrl.pathname.startsWith('/image/'))
    )
  ) {
    throw new Error('Generated image URL is not from the configured image service.')
  }

  const image = await GeneratedImage.create({
    userId,
    threadId,
    prompt: prompt.slice(0, 2_000),
    imageUrl: parsedUrl.toString(),
  })

  return image._id.toString()
}