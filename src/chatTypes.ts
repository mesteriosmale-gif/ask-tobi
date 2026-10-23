export type SculptureVisualState = {
  primaryColor: string
  secondaryColor: string
  highlightColor: string
  energy: number
  spin: number
  waveSpeed: number
  waveFrequency: number
  particleSize: number
  turbulence: number
}

export type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  imageId?: string
  imageUrl?: string
  imageResolution?: 'standard' | '2k' | '4k' | '8k'
  projectFiles?: ProjectFile[]
  videoJobId?: string
  videoJobToken?: string
  videoStatus?: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled'
  videoUrl?: string
  attachments?: ChatAttachmentMetadata[]
}

export type ProjectFile = {
  path: string
  content: string
}

export type ChatAttachmentMetadata = {
  id?: string
  name: string
  mimeType: string
  size: number
  data?: string
}

export type ChatThread = {
  id: string
  title: string
  updatedAt: string
}

export type ChatResponse = {
  reply: string
  visualState: SculptureVisualState
  provider?: string
  imageId?: string
  imageUrl?: string
  imageResolution?: 'standard' | '2k' | '4k' | '8k'
  projectFiles?: ProjectFile[]
  videoJobId?: string
  videoJobToken?: string
  videoStatus?: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled'
  videoUrl?: string
  videoPending?: boolean
  fallback?: boolean
  threadId?: string
  userAttachments?: ChatAttachmentMetadata[]
}
