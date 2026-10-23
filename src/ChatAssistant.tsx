'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, FormEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import JSZip from 'jszip'
import { signOut, useSession } from 'next-auth/react'
import type {
  ChatAttachmentMetadata,
  ChatMessage,
  ChatResponse,
  ChatThread,
  ProjectFile,
  SculptureVisualState,
} from './chatTypes'
import AnimeAvatar from './AnimeAvatar'
import AuthPanel from './AuthPanel'
import './ChatWorkspace.css'

type ChatAssistantProps = {
  onVisualStateChange: (visualState: SculptureVisualState) => void
  googleSignInEnabled: boolean
  initialOpen?: boolean
}

type PendingAttachment = ChatAttachmentMetadata & {
  key: string
  data: string
  previewUrl?: string
}

type LibraryImage = {
  id: string
  prompt: string
  mimeType: string
  createdAt: string
}

type SpeechResultEvent = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>
  resultIndex: number
}

type SpeechRecognitionLike = {
  lang: string
  interimResults: boolean
  onresult: ((event: SpeechResultEvent) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike
  webkitSpeechRecognition?: new () => SpeechRecognitionLike
}

type ImageResolution = 'standard' | '2k' | '4k' | '8k'

const FILE_LIMIT = 2_000_000
const ACCEPTED_EXTENSIONS = new Map<string, string>([
  ['.pdf', 'application/pdf'],
  ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['.txt', 'text/plain'],
  ['.md', 'text/markdown'],
  ['.csv', 'text/csv'],
  ['.json', 'application/json'],
  ['.html', 'text/html'],
  ['.htm', 'text/html'],
  ['.css', 'text/css'],
  ['.js', 'application/javascript'],
  ['.jsx', 'application/javascript'],
  ['.ts', 'text/typescript'],
  ['.tsx', 'text/typescript'],
  ['.py', 'text/plain'],
  ['.java', 'text/plain'],
  ['.c', 'text/plain'],
  ['.cpp', 'text/plain'],
  ['.h', 'text/plain'],
  ['.go', 'text/plain'],
  ['.rs', 'text/plain'],
  ['.xml', 'application/xml'],
  ['.mp3', 'audio/mpeg'],
  ['.wav', 'audio/wav'],
  ['.ogg', 'audio/ogg'],
  ['.webm', 'audio/webm'],
  ['.m4a', 'audio/mp4'],
  ['.aac', 'audio/aac'],
  ['.flac', 'audio/flac'],
])

function isVisualState(value: unknown): value is SculptureVisualState {
  if (typeof value !== 'object' || value === null) return false
  return 'primaryColor' in value && typeof value.primaryColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.primaryColor)
    && 'secondaryColor' in value && typeof value.secondaryColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.secondaryColor)
    && 'highlightColor' in value && typeof value.highlightColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.highlightColor)
    && 'energy' in value && typeof value.energy === 'number' && Number.isFinite(value.energy)
    && 'spin' in value && typeof value.spin === 'number' && Number.isFinite(value.spin)
    && 'waveSpeed' in value && typeof value.waveSpeed === 'number' && Number.isFinite(value.waveSpeed)
    && 'waveFrequency' in value && typeof value.waveFrequency === 'number' && Number.isFinite(value.waveFrequency)
    && 'particleSize' in value && typeof value.particleSize === 'number' && Number.isFinite(value.particleSize)
    && 'turbulence' in value && typeof value.turbulence === 'number' && Number.isFinite(value.turbulence)
}

function isChatMessages(value: unknown): value is ChatMessage[] {
  return Array.isArray(value)
    && value.every((message) =>
      typeof message === 'object'
      && message !== null
      && 'role' in message
      && (message.role === 'user' || message.role === 'assistant')
      && 'content' in message
      && typeof message.content === 'string',
    )
}

function getErrorMessage(result: unknown, fallback: string): string {
  return typeof result === 'object' && result !== null && 'error' in result
    ? String(result.error)
    : fallback
}

function newThreadId(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? `chat-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}

function videoReadyReply(prompt: string): string {
  if (/[\u0600-\u06ff]/.test(prompt)) return 'آپ کی 720p ویڈیو تیار ہے۔'
  if (/[\u0900-\u097f]/.test(prompt)) return 'आपका 720p वीडियो तैयार है۔'
  if (/\b(me|mujhe|mera|meri|hai|ho|karo|banao|chahiye|nahi|batao)\b/i.test(prompt)) {
    return 'Aap ki 720p video tayyar hai.'
  }
  return 'Your 720p video is ready.'
}

function videoFailedReply(prompt: string): string {
  if (/[\u0600-\u06ff]/.test(prompt)) return 'ویڈیو رینڈر مکمل نہیں ہو سکا۔ سادہ پرامپٹ کے ساتھ دوبارہ کوشش کریں۔'
  if (/[\u0900-\u097f]/.test(prompt)) return 'वीडियो रेंडर पूरा नहीं हो सका। सरल प्रॉम्प्ट के साथ फिर कोशिश करें।'
  if (/\b(me|mujhe|mera|meri|hai|ho|karo|banao|chahiye|nahi|batao)\b/i.test(prompt)) {
    return 'Video render mukammal nahi ho saka. Aasaan prompt ke sath dobara try karein.'
  }
  return 'The video render did not finish. Try again with a simpler prompt.'
}

function buildPreviewDocument(files: ProjectFile[]): string {
  const html = files.find((file) => file.path.toLowerCase().endsWith('.html'))?.content
    ?? '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Project preview</title></head><body><main><h1>Project preview</h1><p>Add an HTML file to see the live preview.</p></main></body></html>'
  const css = files
    .filter((file) => file.path.toLowerCase().endsWith('.css'))
    .map((file) => file.content.replace(/<\/style/gi, '<\\/style'))
    .join('\n')
  const scripts = files
    .filter((file) => /\.m?js$/i.test(file.path))
    .map((file) => file.content.replace(/<\/script/gi, '<\\/script'))
    .map((content) => `<script>${content}</script>`)
    .join('\n')
  const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https:; img-src data: blob: https:; media-src data: blob: https:; font-src data: https:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">`
  const document = html.replace(/<link\b[^>]*href=["'][^"']+\.css(?:\?[^"']*)?["'][^>]*>/gi, '')
    .replace(/<script\b[^>]*src=["'][^"']+\.m?js(?:\?[^"']*)?["'][^>]*>\s*<\/script>/gi, '')
  const withPolicy = /<head\b[^>]*>/i.test(document)
    ? document.replace(/<head\b[^>]*>/i, (head) => `${head}${policy}`)
    : `${policy}${document}`
  const withStyles = css
    ? withPolicy.replace(/<\/head\s*>/i, `<style>${css}</style></head>`)
    : withPolicy
  return scripts
    ? withStyles.replace(/<\/body\s*>/i, `${scripts}</body>`)
    : withStyles
}

function downloadTextFile(path: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = path.split('/').pop() || 'project-file.txt'
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

async function downloadProjectZip(files: ProjectFile[]) {
  const zip = new JSZip()
  for (const file of files) zip.file(file.path, file.content)
  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'tobi-project.zip'
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    menu: 'M4 6h16M4 12h16M4 18h16',
    close: 'm6 6 12 12M18 6 6 18',
    plus: 'M12 5v14m-7-7h14',
    search: 'm20 20-4.2-4.2M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z',
    book: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 1 4 17.5Zm0 0v12M8 7h8m-8 4h8',
    image: 'M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M14.5 9h.01',
    library: 'M4 5h16v14H4zM8 9h8m-8 4h8',
    paperclip: 'm8 12.5 6.8-6.8a3 3 0 0 1 4.2 4.2l-8.5 8.5a5 5 0 0 1-7.1-7.1L12 2.7',
    mic: 'M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm-7-4v1a7 7 0 0 0 14 0v-1m-7 8v3m-4 0h8',
    send: 'M4 12h15m-6-6 6 6-6 6',
    download: 'M12 3v12m-5-5 5 5 5-5M4 19v2h16v-2',
    sparkle: 'm12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Zm7 11 .9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14Z',
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[name] ?? paths.sparkle} />
    </svg>
  )
}

export default function ChatAssistant({
  onVisualStateChange,
  googleSignInEnabled,
  initialOpen = false,
}: ChatAssistantProps) {
  const { data: session, status: authStatus } = useSession()
  const [open, setOpen] = useState(initialOpen)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [section, setSection] = useState<'chat' | 'students' | 'images' | 'library'>('chat')
  const [modelTier, setModelTier] = useState<'low' | 'medium' | 'high'>('medium')
  const [modelProvider, setModelProvider] = useState<'auto' | 'gemini' | 'openrouter' | 'groq' | 'huggingface'>('auto')
  const [imageResolution, setImageResolution] = useState<ImageResolution>('standard')
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyLoadedFor, setHistoryLoadedFor] = useState<string | null>(null)
  const [threadId, setThreadId] = useState<string | null>(null)
  const [threads, setThreads] = useState<ChatThread[]>([])
  const [search, setSearch] = useState('')
  const [attachments, setAttachments] = useState<PendingAttachment[]>([])
  const [libraryImages, setLibraryImages] = useState<LibraryImage[]>([])
  const [error, setError] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [reactionTick, setReactionTick] = useState(0)
  const [projectFileSelections, setProjectFileSelections] = useState<Record<string, string>>({})
  const conversation = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const recognition = useRef<SpeechRecognitionLike | null>(null)
  const attachmentsRef = useRef<PendingAttachment[]>([])
  const polledVideoJobs = useRef(new Set<string>())
  const activeThreadId = useRef<string | null>(threadId)
  activeThreadId.current = threadId
  const userId = session?.user?.id
  const historyIsReady = authStatus === 'authenticated'
    && Boolean(userId)
    && historyLoadedFor === userId

  useEffect(() => {
    if (authStatus !== 'authenticated' || !userId) return
    let active = true

    async function loadWorkspace() {
      setHistoryLoading(true)
      setHistoryLoadedFor(null)
      try {
        const threadResponse = await fetch('/api/chat/threads')
        const threadResult: unknown = await threadResponse.json()
        if (!threadResponse.ok) throw new Error(getErrorMessage(threadResult, 'Recent chats could not be loaded.'))
        if (
          typeof threadResult !== 'object'
          || threadResult === null
          || !('threads' in threadResult)
          || !Array.isArray(threadResult.threads)
        ) {
          throw new Error('Recent chats returned an invalid response.')
        }

        const recentThreads = threadResult.threads as ChatThread[]
        const selectedThreadId = recentThreads[0]?.id || newThreadId()
        const historyResponse = recentThreads[0]
          ? await fetch(`/api/chat/history?threadId=${encodeURIComponent(selectedThreadId)}`)
          : null
        const historyResult: unknown = historyResponse ? await historyResponse.json() : { messages: [] }
        if (historyResponse && !historyResponse.ok) {
          throw new Error(getErrorMessage(historyResult, 'Your saved chat could not be loaded.'))
        }
        if (
          typeof historyResult !== 'object'
          || historyResult === null
          || !('messages' in historyResult)
          || !isChatMessages(historyResult.messages)
        ) {
          throw new Error('Saved chat history returned an invalid response.')
        }

        if (active) {
          setThreads(recentThreads)
          setThreadId(selectedThreadId)
          setMessages(historyResult.messages)
          setHistoryLoadedFor(userId ?? null)
          requestAnimationFrame(() => {
            conversation.current?.scrollTo({ top: conversation.current.scrollHeight })
          })
        }
      } catch (caught) {
        if (active) {
          setThreadId(newThreadId())
          setMessages([])
          setHistoryLoadedFor(userId ?? null)
          setError(caught instanceof Error ? caught.message : 'Your saved chats could not be loaded.')
        }
      } finally {
        if (active) setHistoryLoading(false)
      }
    }

    void loadWorkspace()
    return () => {
      active = false
    }
  }, [authStatus, userId])

  useEffect(() => () => {
    for (const attachment of attachmentsRef.current) {
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl)
    }
    recognition.current?.stop()
  }, [])

  useEffect(() => {
    if (section !== 'library' || authStatus !== 'authenticated') return
    let active = true
    async function loadLibrary() {
      try {
        const response = await fetch('/api/chat/images')
        const result: unknown = await response.json()
        if (!response.ok) throw new Error(getErrorMessage(result, 'Your image library could not be loaded.'))
        if (typeof result === 'object' && result !== null && 'images' in result && Array.isArray(result.images)) {
          if (active) setLibraryImages(result.images as LibraryImage[])
        }
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : 'Your image library could not be loaded.')
      }
    }
    void loadLibrary()
    return () => {
      active = false
    }
  }, [section, authStatus])

  useEffect(() => {
    if (authStatus !== 'authenticated' || !threadId) return
    for (const [index, message] of messages.entries()) {
      if (
        message.role !== 'assistant'
        || !message.videoJobId
        || !message.videoJobToken
        || message.videoUrl
        || message.videoStatus === 'failed'
        || message.videoStatus === 'canceled'
        || message.videoStatus === 'succeeded'
      ) {
        continue
      }
      const jobKey = `${threadId}:${message.videoJobId}`
      if (polledVideoJobs.current.has(jobKey)) continue
      polledVideoJobs.current.add(jobKey)
      const sourcePrompt = messages.slice(0, index).reverse().find((item) => item.role === 'user')?.content ?? ''
      void pollVideoJob(threadId, message, sourcePrompt)
    }
  }, [authStatus, messages, threadId])

  function startNewChat() {
    if (loading) return
    for (const attachment of attachmentsRef.current) {
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl)
    }
    attachmentsRef.current = []
    setThreadId(newThreadId())
    setMessages([])
    setAttachments([])
    setHistoryLoadedFor(userId ?? null)
    setInput('')
    setError('')
    setSection('chat')
    setModelTier('medium')
  }

  async function openThread(selected: ChatThread) {
    if (loading) return
    if (selected.id === threadId && historyLoadedFor === userId) {
      setSection('chat')
      return
    }
    setSection('chat')
    setThreadId(selected.id)
    setMessages([])
    setHistoryLoadedFor(null)
    setHistoryLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/chat/history?threadId=${encodeURIComponent(selected.id)}`)
      const result: unknown = await response.json()
      if (!response.ok) throw new Error(getErrorMessage(result, 'Your saved chat could not be loaded.'))
      if (typeof result !== 'object' || result === null || !('messages' in result) || !isChatMessages(result.messages)) {
        throw new Error('Saved chat history returned an invalid response.')
      }
      setMessages(result.messages)
      setHistoryLoadedFor(userId ?? null)
      requestAnimationFrame(() => {
        conversation.current?.scrollTo({ top: conversation.current.scrollHeight })
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Your saved chat could not be loaded.')
    } finally {
      setHistoryLoading(false)
    }
  }

  async function pollVideoJob(jobThreadId: string, message: ChatMessage, sourcePrompt: string) {
    const jobId = message.videoJobId
    const token = message.videoJobToken
    if (!jobId || !token) return
    const key = `${jobThreadId}:${jobId}`

    try {
      for (let attempt = 0; attempt < 120; attempt += 1) {
        if (activeThreadId.current !== jobThreadId) return
        await new Promise((resolve) => window.setTimeout(resolve, 5_000))
        const query = new URLSearchParams({ id: jobId, token })
        const response = await fetch(`/api/chat/video?${query}`)
        const result: unknown = await response.json()
        if (!response.ok || typeof result !== 'object' || result === null || !('status' in result)) {
          console.error('Video job status could not be loaded.', response.status)
          return
        }
        if (result.status === 'starting' || result.status === 'processing') continue
        if (
          result.status !== 'succeeded'
          && result.status !== 'failed'
          && result.status !== 'canceled'
        ) {
          console.error('Video job returned an unexpected status.')
          return
        }

        const videoUrl = result.status === 'succeeded'
          && 'videoUrl' in result
          && typeof result.videoUrl === 'string'
          ? result.videoUrl
          : undefined
        setMessages((current) => current.map((currentMessage) => (
          currentMessage.videoJobId === jobId
            ? {
                ...currentMessage,
                videoStatus: result.status as ChatMessage['videoStatus'],
                ...(videoUrl ? { videoUrl } : {}),
                ...(result.status === 'succeeded'
                  ? { content: videoReadyReply(sourcePrompt) }
                  : { content: videoFailedReply(sourcePrompt) }),
              }
            : currentMessage
        )))

        const saveResponse = await fetch('/api/chat/video', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: jobId,
            token,
            threadId: jobThreadId,
            status: result.status,
            ...(videoUrl ? { videoUrl } : {}),
          }),
        })
        if (!saveResponse.ok) {
          console.warn('The finished video could not be saved to chat history.')
        }
        return
      }
    } catch (caught) {
      console.error('Video generation status polling failed.', {
        errorName: caught instanceof Error ? caught.name : 'UnknownError',
      })
    } finally {
      polledVideoJobs.current.delete(key)
    }
  }

  function resolveFileMime(file: File): string | null {
    if (file.type.startsWith('image/')) {
      return ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ? file.type : null
    }
    const extension = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`
    return ACCEPTED_EXTENSIONS.get(extension) ?? null
  }

  async function addFiles(files: FileList | File[]) {
    const incoming = Array.from(files)
    if (attachmentsRef.current.length + incoming.length > 4) {
      setError('Attach up to 4 files at a time.')
      return
    }
    if (attachmentsRef.current.reduce((total, attachment) => total + attachment.size, 0)
      + incoming.reduce((total, file) => total + file.size, 0) > 6_000_000) {
      setError('Attachments must total 6 MB or less.')
      return
    }

    const prepared: PendingAttachment[] = []
    try {
      for (const file of incoming) {
        const mimeType = resolveFileMime(file)
        if (!mimeType) throw new Error(`${file.name} has an unsupported file type.`)
        if (file.size < 1 || file.size > FILE_LIMIT) throw new Error(`${file.name} must be 2 MB or smaller.`)
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => typeof reader.result === 'string'
            ? resolve(reader.result)
            : reject(new Error(`Could not read ${file.name}.`))
          reader.onerror = () => reject(new Error(`Could not read ${file.name}.`))
          reader.readAsDataURL(file)
        })
        const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
        prepared.push({
          key: `${file.name}-${file.size}-${newThreadId()}`,
          name: file.name,
          mimeType,
          size: file.size,
          data: base64,
          ...(mimeType.startsWith('image/') ? { previewUrl: URL.createObjectURL(file) } : {}),
        })
      }
      const latestTotalBytes = attachmentsRef.current.reduce((total, attachment) => total + attachment.size, 0)
        + prepared.reduce((total, attachment) => total + attachment.size, 0)
      if (attachmentsRef.current.length + prepared.length > 4 || latestTotalBytes > 6_000_000) {
        throw new Error('Attachments are limited to 4 files and 6 MB total.')
      }
      const nextAttachments = [...attachmentsRef.current, ...prepared]
      attachmentsRef.current = nextAttachments
      setAttachments(nextAttachments)
      setError('')
    } catch (caught) {
      for (const attachment of prepared) {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl)
      }
      setError(caught instanceof Error ? caught.message : 'Could not add the selected files.')
    }
  }

  function removeAttachment(key: string) {
    const removed = attachmentsRef.current.find((attachment) => attachment.key === key)
    if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl)
    const nextAttachments = attachmentsRef.current.filter((attachment) => attachment.key !== key)
    attachmentsRef.current = nextAttachments
    setAttachments(nextAttachments)
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    setIsDragOver(false)
    if (event.dataTransfer.files.length > 0) void addFiles(event.dataTransfer.files)
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) void addFiles(event.target.files)
    event.target.value = ''
  }

  function toggleVoiceInput() {
    const speechWindow = window as SpeechWindow
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
    if (!Recognition) {
      setError('Voice input is not supported in this browser.')
      return
    }
    if (recognition.current) {
      recognition.current.stop()
      recognition.current = null
      setIsRecording(false)
      return
    }

    const currentRecognition = new Recognition()
    currentRecognition.lang = navigator.language || 'en-US'
    currentRecognition.interimResults = true
    currentRecognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .slice(event.resultIndex)
        .map((result) => result[0]?.transcript ?? '')
        .join('')
      if (transcript) setInput((current) => `${current}${current && !current.endsWith(' ') ? ' ' : ''}${transcript}`)
    }
    currentRecognition.onerror = () => {
      setError('Voice input could not be captured. Check your microphone permission.')
      setIsRecording(false)
      recognition.current = null
    }
    currentRecognition.onend = () => {
      setIsRecording(false)
      recognition.current = null
    }
    recognition.current = currentRecognition
    currentRecognition.start()
    setIsRecording(true)
    setError('')
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const content = input.trim() || (attachmentsRef.current.length ? 'Please analyze the attached file(s).' : '')
    if (
      !content
      || loading
      || historyLoading
      || !historyIsReady
      || authStatus !== 'authenticated'
      || !threadId
    ) return

    const pendingFiles = attachmentsRef.current
    const sentThreadId = threadId
    const nextMessages = [...messages, {
      role: 'user' as const,
      content,
      ...(pendingFiles.length
        ? {
            attachments: pendingFiles.map(({ name, mimeType, size }) => ({ name, mimeType, size })),
          }
        : {}),
    }]
    setMessages(nextMessages)
    setInput('')
    for (const attachment of pendingFiles) {
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl)
    }
    attachmentsRef.current = []
    setAttachments([])
    setError('')
    setLoading(true)

    try {
      const recentMessages = nextMessages.slice(-16).map(({ role, content: messageContent }) => ({
        role,
        content: messageContent,
      }))
      if (recentMessages[0]?.role === 'assistant') recentMessages.shift()
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId: sentThreadId,
          mode: section,
          model: modelTier,
          provider: modelProvider,
          imageResolution,
          messages: recentMessages,
          attachments: pendingFiles.map(({ name, mimeType, size, data }) => ({
            name,
            mimeType,
            size,
            data,
          })),
        }),
      })
      const result: unknown = await response.json()

      if (!response.ok) {
        if (response.status === 401) {
          await signOut({ redirect: false })
          setMessages([])
          setThreads([])
          setHistoryLoadedFor(null)
        }
        throw new Error(getErrorMessage(result, 'The assistant could not respond. Please try again.'))
      }

      if (
        typeof result !== 'object'
        || result === null
        || !('reply' in result)
        || !('visualState' in result)
        || typeof result.reply !== 'string'
        || !isVisualState(result.visualState)
      ) {
        throw new Error('The assistant returned an invalid response. Please try again.')
      }

      const chatResponse = result as ChatResponse
      const userAttachments = chatResponse.userAttachments ?? []
      setMessages((current) => [
        ...current.slice(0, -1),
        { role: 'user', content, ...(userAttachments.length ? { attachments: userAttachments } : {}) },
        {
          role: 'assistant',
          content: chatResponse.reply,
          ...(chatResponse.imageId ? { imageId: chatResponse.imageId } : {}),
          ...(chatResponse.imageUrl ? { imageUrl: chatResponse.imageUrl } : {}),
          ...(chatResponse.imageResolution ? { imageResolution: chatResponse.imageResolution } : {}),
          ...(chatResponse.projectFiles?.length ? { projectFiles: chatResponse.projectFiles } : {}),
          ...(chatResponse.videoJobId ? { videoJobId: chatResponse.videoJobId } : {}),
          ...(chatResponse.videoJobToken ? { videoJobToken: chatResponse.videoJobToken } : {}),
          ...(chatResponse.videoStatus ? { videoStatus: chatResponse.videoStatus } : {}),
          ...(chatResponse.videoUrl ? { videoUrl: chatResponse.videoUrl } : {}),
        },
      ])
      onVisualStateChange(chatResponse.visualState)
      setThreads((current) => {
        const existing = current.find((thread) => thread.id === sentThreadId)
        const updated: ChatThread = {
          id: sentThreadId,
          title: existing?.title || content.replace(/\s+/g, ' ').slice(0, 100),
          updatedAt: new Date().toISOString(),
        }
        return [updated, ...current.filter((thread) => thread.id !== sentThreadId)]
      })
      if (chatResponse.imageId) {
        setLibraryImages((current) => [
          {
            id: chatResponse.imageId!,
            prompt: content,
            mimeType: 'image/png',
            createdAt: new Date().toISOString(),
          },
          ...current,
        ])
      }
      requestAnimationFrame(() => {
        conversation.current?.scrollTo({ top: conversation.current.scrollHeight, behavior: 'smooth' })
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSignOut() {
    try {
      await signOut({ redirect: false })
      for (const attachment of attachmentsRef.current) {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl)
      }
      attachmentsRef.current = []
      setMessages([])
      setThreads([])
      setHistoryLoadedFor(null)
      setThreadId(null)
      setInput('')
      setAttachments([])
      setError('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign out failed. Please try again.')
    }
  }

  const displayName = session?.user?.name?.trim()
    || session?.user?.email?.split('@')[0]
    || 'Guest'
  const filteredThreads = threads.filter((thread) =>
    thread.title.toLowerCase().includes(search.trim().toLowerCase()),
  )
  const isAuthenticated = authStatus === 'authenticated'
  const sectionTitle = section === 'students'
    ? 'Study with Tobi'
    : section === 'images'
      ? 'Image studio'
      : section === 'library'
        ? 'Your library'
        : 'Tobi'

  return (
    <>
      <div className={`ai-assistant ${open ? 'is-open' : ''}`}>
        {open && (
          <section
            className={`chat-panel chat-platform ${sidebarOpen ? '' : 'sidebar-collapsed'} ${isDragOver ? 'is-drag-over' : ''}`}
            aria-label="Tobi AI assistant"
            onDragOver={(event) => {
              if (event.dataTransfer.types.includes('Files')) {
                event.preventDefault()
                setIsDragOver(true)
              }
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragOver(false)
            }}
            onDrop={handleDrop}
          >
            <aside className="chat-sidebar" aria-label="Chat navigation">
              <div className="sidebar-heading">
                <span className="tobi-mark"><Icon name="sparkle" /></span>
                <span>Tobi</span>
                <button type="button" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)}>
                  <Icon name="close" />
                </button>
              </div>
              <button className="sidebar-new-chat" type="button" onClick={startNewChat} disabled={!isAuthenticated || loading}>
                <Icon name="plus" />
                <span>New chat</span>
              </button>
              <label className="sidebar-search">
                <Icon name="search" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search chats"
                  aria-label="Search chats"
                />
              </label>
              <nav className="sidebar-sections" aria-label="Tobi sections">
                <button className={section === 'students' ? 'active' : ''} type="button" onClick={() => setSection('students')}>
                  <Icon name="book" /><span>Students</span>
                </button>
                <button className={section === 'images' ? 'active' : ''} type="button" onClick={() => setSection('images')}>
                  <Icon name="image" /><span>Images</span>
                </button>
                <button className={section === 'library' ? 'active' : ''} type="button" onClick={() => setSection('library')}>
                  <Icon name="library" /><span>Library</span>
                </button>
              </nav>
              <div className="sidebar-recents">
                <h2>Recents</h2>
                {filteredThreads.length === 0 ? (
                  <p className="sidebar-empty">{search ? 'No matching chats' : 'Your recent chats will appear here'}</p>
                ) : (
                  <div className="recent-thread-list">
                    {filteredThreads.map((thread) => (
                      <button
                        className={thread.id === threadId ? 'active' : ''}
                        type="button"
                        key={thread.id}
                        onClick={() => void openThread(thread)}
                        title={thread.title}
                      >
                        <span>{thread.title}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="sidebar-profile">
                <span className="sidebar-user-avatar">
                  {session?.user?.image
                    ? <img src={session.user.image} alt="" referrerPolicy="no-referrer" />
                    : displayName.slice(0, 1).toUpperCase()}
                </span>
                <span className="sidebar-user-copy">
                  <strong>{authStatus === 'loading' ? 'Checking session…' : displayName}</strong>
                  <small>{isAuthenticated ? 'Signed in' : 'Guest'}</small>
                </span>
                {isAuthenticated && (
                  <button type="button" onClick={() => void handleSignOut()} title="Sign out" aria-label="Sign out">
                    <Icon name="close" />
                  </button>
                )}
              </div>
            </aside>

            <div className="chat-main">
              <header className="workspace-topbar">
                <div className="workspace-title">
                  {!sidebarOpen && (
                    <button type="button" aria-label="Open sidebar" onClick={() => setSidebarOpen(true)}>
                      <Icon name="menu" />
                    </button>
                  )}
                  <div>
                    <h1>{sectionTitle}</h1>
                    <p>{section === 'students' ? 'Learn one step at a time' : 'A creative AI companion'}</p>
                  </div>
                </div>
                <div className="workspace-actions">
                  <div className="chat-account-bar" aria-label="User account">
                    <span className="chat-user-avatar" aria-hidden="true">
                      {session?.user?.image
                        ? <img src={session.user.image} alt="" referrerPolicy="no-referrer" />
                        : displayName.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="chat-user-name">{displayName}</span>
                    {isAuthenticated && (
                      <button className="chat-account-action" type="button" onClick={() => void handleSignOut()}>
                        Sign out
                      </button>
                    )}
                  </div>
                  <button className="workspace-close" type="button" aria-label="Close chat" onClick={() => setOpen(false)}>
                    <Icon name="close" />
                  </button>
                </div>
              </header>

              <div className={`workspace-content ${section === 'library' ? 'library-view' : ''}`}>
                {authStatus === 'loading' ? (
                  <p className="auth-loading" role="status">Checking your sign-in…</p>
                ) : !isAuthenticated ? (
                  <AuthPanel googleSignInEnabled={googleSignInEnabled} />
                ) : section === 'library' ? (
                  <div className="library-content">
                    <div className="library-heading">
                      <p>Your generated images</p>
                      <span>{libraryImages.length} saved</span>
                    </div>
                    {libraryImages.length === 0 ? (
                      <div className="library-empty">
                        <span className="tobi-mark"><Icon name="image" /></span>
                        <h2>Your creative library</h2>
                        <p>Images you create with Tobi will be saved here.</p>
                        <button type="button" onClick={() => setSection('images')}>Create an image</button>
                      </div>
                    ) : (
                      <div className="library-grid">
                        {libraryImages.map((image) => (
                          <article key={image.id}>
                            <a href={`/api/chat/images/${image.id}`} target="_blank" rel="noreferrer">
                              <img src={`/api/chat/images/${image.id}`} alt={image.prompt} loading="lazy" />
                            </a>
                            <p>{image.prompt}</p>
                            <a className="library-download" href={`/api/chat/images/${image.id}?download=1`} download>
                              <Icon name="download" /> Download
                            </a>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="chat-messages" ref={conversation} aria-live="polite">
                      {!historyIsReady && historyLoading ? (
                        <p className="auth-loading" role="status">Loading your saved chats…</p>
                      ) : messages.length === 0 ? (
                        <div className="workspace-welcome">
                          <span className="welcome-sparkle"><Icon name="sparkle" /></span>
                          <p className="chat-kicker">
                            {section === 'images' ? 'Your idea, brought to life.' : 'A little intelligence, a lot of imagination.'}
                          </p>
                          <h2>
                            {section === 'images'
                              ? 'What should I create?'
                              : section === 'students'
                                ? 'What are you learning today?'
                                : 'How can I help?'}
                          </h2>
                          <p>
                            {section === 'images'
                              ? 'Describe an image or drop a reference photo to get started.'
                              : section === 'students'
                                ? 'Ask a question, upload your notes, or work through a problem together.'
                                : 'Ask Tobi anything, add a file, or create an image.'}
                          </p>
                          {section === 'chat' && (
                            <div className="prompt-suggestions">
                              <button type="button" onClick={() => setInput('Explain a complex idea simply')}>Explain something</button>
                              <button type="button" onClick={() => { setSection('images'); setInput('Generate an image of ') }}>Create an image</button>
                              <button type="button" onClick={() => setSection('students')}>Study with Tobi</button>
                            </div>
                          )}
                        </div>
                      ) : (
                        messages.map((message, index) => {
                          const projectFiles = message.projectFiles ?? []
                          const projectKey = `${threadId}-${index}`
                          const activePath = projectFileSelections[projectKey] ?? projectFiles[0]?.path
                          const activeFile = projectFiles.find((file) => file.path === activePath) ?? projectFiles[0]
                          const preview = projectFiles.length ? buildPreviewDocument(projectFiles) : ''
                          const videoQuery = message.videoJobId && message.videoJobToken
                            ? new URLSearchParams({ id: message.videoJobId, token: message.videoJobToken })
                            : null
                          const videoStreamUrl = videoQuery ? `/api/chat/video?${videoQuery}&stream=1` : ''
                          const videoDownloadUrl = videoQuery ? `/api/chat/video?${videoQuery}&download=1` : ''

                          return (
                            <article className={`chat-message message-${message.role}`} key={`${threadId}-${index}`}>
                              {message.content && <div className="chat-message-copy">{message.content}</div>}
                              {message.attachments?.map((attachment, attachmentIndex) => (
                                <a
                                  className="message-attachment"
                                  href={attachment.id ? `/api/chat/attachments/${attachment.id}` : undefined}
                                  key={`${attachment.id ?? attachment.name}-${attachmentIndex}`}
                                >
                                  <Icon name="paperclip" />
                                  <span>{attachment.name}</span>
                                </a>
                              ))}
                              {(message.imageId || message.imageUrl) && (
                                <div className="generated-image-card">
                                  <a
                                    href={message.imageId ? `/api/chat/images/${message.imageId}` : message.imageUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    <img
                                      src={message.imageId ? `/api/chat/images/${message.imageId}` : message.imageUrl}
                                      alt={`Generated image: ${message.content || 'Tobi image'}`}
                                      loading="lazy"
                                    />
                                  </a>
                                  <span className="media-resolution">
                                    Requested {message.imageResolution ?? 'standard'} resolution · provider output limits may apply
                                  </span>
                                  {message.imageId && (
                                    <a href={`/api/chat/images/${message.imageId}?download=1`} download>
                                      <Icon name="download" /> Download image
                                    </a>
                                  )}
                                </div>
                              )}
                              {projectFiles.length > 0 && activeFile && (
                                <section className="project-studio" aria-label="Live project editor and preview">
                                  <header className="project-studio-heading">
                                    <div>
                                      <strong>Live project</strong>
                                      <span>{projectFiles.length} editable files</span>
                                    </div>
                                    <button
                                      className="project-download-button"
                                      type="button"
                                      onClick={() => {
                                        void downloadProjectZip(projectFiles).catch((caught: unknown) => {
                                          setError(caught instanceof Error ? caught.message : 'Project ZIP could not be created.')
                                        })
                                      }}
                                    >
                                      <Icon name="download" /> Download project ZIP
                                    </button>
                                  </header>
                                  <div className="project-studio-grid">
                                    <div className="project-editor">
                                      <div className="project-file-tabs" aria-label="Project files">
                                        {projectFiles.map((file) => (
                                          <button
                                            className={file.path === activeFile.path ? 'active' : ''}
                                            key={file.path}
                                            type="button"
                                            onClick={() => setProjectFileSelections((current) => ({
                                              ...current,
                                              [projectKey]: file.path,
                                            }))}
                                          >
                                            {file.path}
                                          </button>
                                        ))}
                                      </div>
                                      <textarea
                                        className="project-code-editor"
                                        aria-label={`Edit ${activeFile.path}`}
                                        spellCheck={false}
                                        value={activeFile.content}
                                        onChange={(event) => {
                                          const content = event.target.value
                                          setMessages((current) => current.map((item, itemIndex) => (
                                            itemIndex === index
                                              ? {
                                                  ...item,
                                                  projectFiles: item.projectFiles?.map((file) => (
                                                    file.path === activeFile.path ? { ...file, content } : file
                                                  )),
                                                }
                                              : item
                                          )))
                                        }}
                                      />
                                      <div className="project-editor-actions">
                                        <span>Changes update the preview automatically</span>
                                        <button
                                          className="project-download-button"
                                          type="button"
                                          onClick={() => downloadTextFile(activeFile.path, activeFile.content)}
                                        >
                                          <Icon name="download" /> Download file
                                        </button>
                                      </div>
                                    </div>
                                    <div className="project-preview">
                                      <div className="project-preview-heading">
                                        <span>Live preview</span>
                                        <span>Sandboxed</span>
                                      </div>
                                      <iframe
                                        title={`Live preview of ${activeFile.path}`}
                                        sandbox="allow-scripts"
                                        referrerPolicy="no-referrer"
                                        srcDoc={preview}
                                      />
                                    </div>
                                  </div>
                                </section>
                              )}
                              {message.videoJobId && (
                                <div className="generated-video-card">
                                  {message.videoStatus === 'failed' || message.videoStatus === 'canceled'
                                    ? <p role="status">Video render did not finish. Try a simpler prompt.</p>
                                    : message.videoUrl || message.videoStatus === 'succeeded'
                                      ? <video controls preload="metadata" src={videoStreamUrl}>Your browser does not support video playback.</video>
                                      : <p className="video-rendering" role="status">Rendering a 720p video… This can take a few minutes.</p>}
                                  {videoDownloadUrl && (message.videoUrl || message.videoStatus === 'succeeded') && (
                                    <a href={videoDownloadUrl}>
                                      <Icon name="download" /> Download 720p video (.mp4)
                                    </a>
                                  )}
                                </div>
                              )}
                            </article>
                          )
                        })
                      )}
                      {loading && (
                        <div className="typing-indicator" role="status" aria-label="Tobi is thinking">
                          <span /><span /><span />
                        </div>
                      )}
                      <AnimatePresence>
                        {loading && (
                          <motion.div
                            className="avatar-peek"
                            aria-hidden="true"
                            initial={{ y: 76, opacity: 0, rotate: 5 }}
                            animate={{ y: 0, opacity: 1, rotate: 0 }}
                            exit={{ y: 84, opacity: 0, rotate: -4 }}
                            transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                          >
                            <Suspense fallback={null}>
                              <AnimeAvatar isLoading={loading} reactionTick={reactionTick} />
                            </Suspense>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      {error && <p className="chat-error" role="alert">{error}</p>}
                    </div>

                    {isDragOver && (
                      <div className="drop-overlay" aria-hidden="true">
                        <Icon name="paperclip" />
                        <strong>Drop files to attach</strong>
                        <span>Images, PDFs, audio, documents and code</span>
                      </div>
                    )}
                    {isAuthenticated && (
                      <form className="chat-input" onSubmit={sendMessage}>
                        <div className="composer-tools">
                          <label className="model-selector">
                            <span>Intelligence</span>
                            <select
                              value={modelTier}
                              onChange={(event) => setModelTier(event.target.value as 'low' | 'medium' | 'high')}
                              aria-label="Tobi intelligence level"
                            >
                              <option value="low">Tobi Low</option>
                              <option value="medium">Tobi Medium</option>
                              <option value="high">Tobi High</option>
                            </select>
                          </label>
                          <label className="model-selector">
                            <span>Provider</span>
                            <select
                              value={modelProvider}
                              onChange={(event) => setModelProvider(event.target.value as typeof modelProvider)}
                              aria-label="AI model provider"
                            >
                              <option value="auto">Auto / Best</option>
                              <option value="gemini">Google Gemini</option>
                              <option value="openrouter">OpenRouter (Llama)</option>
                              <option value="groq">Groq</option>
                              <option value="huggingface">Hugging Face</option>
                            </select>
                          </label>
                          {section === 'images' && (
                            <label className="model-selector">
                              <span>Image size</span>
                              <select
                                value={imageResolution}
                                onChange={(event) => setImageResolution(event.target.value as ImageResolution)}
                                aria-label="Requested image resolution"
                              >
                                <option value="standard">Standard · 1024</option>
                                <option value="2k">2K · 2560 × 1440</option>
                                <option value="4k">4K · 3840 × 2160</option>
                                <option value="8k">8K · 7680 × 4320</option>
                              </select>
                            </label>
                          )}
                          <span className="composer-hint">
                            {section === 'images'
                              ? 'Pollinations image generation'
                              : modelProvider === 'auto'
                                ? 'Smart fallback'
                                : section === 'students'
                                  ? 'Study mode'
                                  : 'Ask Tobi'}
                          </span>
                        </div>
                        {attachments.length > 0 && (
                          <div className="attachment-previews" aria-label="Attached files">
                            {attachments.map((attachment) => (
                              <div className="attachment-preview" key={attachment.key}>
                                {attachment.previewUrl
                                  ? <img src={attachment.previewUrl} alt="" />
                                  : <span className="attachment-file-icon"><Icon name="paperclip" /></span>}
                                <span className="attachment-name" title={attachment.name}>{attachment.name}</span>
                                <button
                                  type="button"
                                  aria-label={`Remove ${attachment.name}`}
                                  onClick={() => removeAttachment(attachment.key)}
                                >
                                  <Icon name="close" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="composer-row">
                          <input
                            ref={fileInput}
                            className="file-input-hidden"
                            type="file"
                            multiple
                            accept="image/jpeg,image/png,image/webp,application/pdf,.docx,.txt,.md,.csv,.json,.html,.css,.js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.go,.rs,.xml,audio/*"
                            onChange={handleFileInput}
                            aria-label="Add attachments"
                          />
                          <button
                            className="composer-icon-button"
                            type="button"
                            aria-label="Add files"
                            disabled={loading || attachments.length >= 4}
                            onClick={() => fileInput.current?.click()}
                          >
                            <Icon name="plus" />
                          </button>
                          <label className="visually-hidden" htmlFor="assistant-message">Ask Tobi</label>
                          <textarea
                            id="assistant-message"
                            value={input}
                            onChange={(event) => setInput(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' && !event.shiftKey) {
                                event.preventDefault()
                                event.currentTarget.form?.requestSubmit()
                              }
                            }}
                            placeholder={section === 'images' ? 'Describe an image to generate…' : 'Ask Tobi…'}
                            maxLength={4000}
                            autoComplete="off"
                            rows={1}
                            disabled={loading || historyLoading || !historyIsReady}
                          />
                          <button
                            className={`composer-icon-button voice-button ${isRecording ? 'recording' : ''}`}
                            type="button"
                            aria-label={isRecording ? 'Stop voice input' : 'Start voice input'}
                            onClick={toggleVoiceInput}
                          >
                            <Icon name="mic" />
                          </button>
                          <button
                            className="composer-send"
                            type="submit"
                            aria-label={section === 'images' ? 'Generate image' : 'Send to Tobi'}
                            disabled={loading || historyLoading || !historyIsReady || (!input.trim() && attachments.length === 0)}
                          >
                            {section === 'images' ? <Icon name="sparkle" /> : <Icon name="send" />}
                          </button>
                        </div>
                        <p className="composer-disclaimer">
                          {attachments.length > 0
                            ? 'Files are analyzed by Gemini and saved privately to your account.'
                            : 'Tobi can make mistakes. Check important information.'}
                        </p>
                      </form>
                    )}
                  </>
                )}
              </div>
            </div>
          </section>
        )}

        <button
          className={`assistant-launcher ${open ? 'is-hidden' : ''} ${loading ? 'is-thinking' : ''}`}
          type="button"
          aria-label="Open Tobi assistant"
          aria-expanded={open}
          onClick={() => {
            setReactionTick((current) => current + 1)
            setOpen(true)
          }}
        >
          <span className="thinking-orb" aria-hidden="true"><span /></span>
          <span className="launcher-halo" aria-hidden="true" />
        </button>
      </div>
    </>
  )
}
