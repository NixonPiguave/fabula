export type VoiceInfo = {
  id: string
  name: string
  country: string
  accent: string
  gender: string
  color: string
  initials: string
  description: string
  provider: 'sapi' | 'piper'
  locale?: string
}
// Voices are discovered from Windows or imported Piper models.
export const VOICES: VoiceInfo[] = []

export type VoiceId = string
export type VoiceSettings = { voice: VoiceId; speed: number; pitch: number; volume: number }
export const DEFAULT_SETTINGS: VoiceSettings = {
  voice: 'system-default',
  speed: 1,
  pitch: 0,
  volume: 1
}
export type Draft = {
  title: string
  text: string
  settings: VoiceSettings
  projectId?: string | null
  pauseMs?: number
  blockOverrides?: Record<string, import('./studio').BlockOverride>
}
export type JobStatus =
  'generating' | 'merging' | 'completed' | 'cancelled' | 'failed' | 'interrupted'
export type JobSummary = {
  id: string
  title: string
  settings: VoiceSettings
  status: JobStatus
  completedChunks: number
  totalChunks: number
  createdAt: string
  characters: number
  words: number
  preview: boolean
  error?: string
  chapters?: import('./studio').AudioChapter[]
  cachedChunks?: number
}
export type JobRecord = JobSummary &
  Draft & { chunkVersion: 1 | 2; pronunciations?: import('./studio').Pronunciation[] }
export type BootState = {
  draft: Draft
  jobs: JobSummary[]
  warnings: string[]
  voices: VoiceInfo[]
  library: import('./library').LibraryState
  preferences: import('./studio').Preferences
  playback: import('./studio').PlaybackState
  modules: import('./studio').ModuleState[]
  transcripts: import('./studio').Transcript[]
}
export type ImportResult = {
  title: string
  text: string
  pages?: number
  pdf?: import('./pdf').PdfDocument
}
export type StartInput = Draft & { preview?: boolean }
export type DesktopApi = {
  confirm: (message: string) => Promise<boolean>
  boot: () => Promise<BootState>
  refreshVoices: () => Promise<VoiceInfo[]>
  importVoice: (input: { name?: string; speaker?: number }) => Promise<VoiceInfo[] | null>
  removeVoice: (id: string) => Promise<boolean>
  onVoices: (callback: (voices: VoiceInfo[]) => void) => () => void
  saveDraft: (draft: Draft) => Promise<void>
  importDocument: (options?: { ocr?: boolean }) => Promise<ImportResult | null>
  start: (input: StartInput) => Promise<JobSummary>
  cancel: (id: string) => Promise<void>
  resume: (id: string) => Promise<void>
  openJob: (id: string) => Promise<Draft>
  exportMp3: (id: string) => Promise<string | null>
  deleteJob: (id: string) => Promise<boolean>
  saveProject: (
    input: import('./library').ProjectInput
  ) => Promise<import('./library').LibraryState>
  deleteProject: (id: string) => Promise<boolean>
  assignProject: (id: string, projectId: string | null) => Promise<import('./library').LibraryState>
  onLibrary: (callback: (state: import('./library').LibraryState) => void) => () => void
  onJobRemoved: (callback: (id: string) => void) => () => void
  onJob: (callback: (job: JobSummary) => void) => () => void
  savePreferences: (preferences: import('./studio').Preferences) => Promise<void>
  chooseExportFolder: () => Promise<string | null>
  exportChapters: (id: string) => Promise<string | null>
  savePlayback: (state: import('./studio').PlaybackState) => Promise<void>
  installModule: (kind: import('./studio').ModuleKind) => Promise<void>
  cancelModule: () => Promise<void>
  onModule: (callback: (state: import('./studio').ModuleState) => void) => () => void
  onTask: (callback: (state: import('./studio').TaskProgress) => void) => () => void
  cancelTask: () => Promise<void>
  transcribeFile: (language: string) => Promise<import('./studio').Transcript | null>
  requestMicrophone: () => Promise<boolean>
  transcribeRecording: (
    data: Uint8Array,
    language: string
  ) => Promise<import('./studio').Transcript>
  exportTranscript: (
    transcript: import('./studio').Transcript,
    format: 'txt' | 'docx' | 'srt' | 'vtt'
  ) => Promise<string | null>
  saveTranscript: (transcript: import('./studio').Transcript) => Promise<void>
}

export function summary(job: JobRecord): JobSummary {
  const {
    text: _text,
    chunkVersion: _version,
    pronunciations: _dictionary,
    blockOverrides: _overrides,
    pauseMs: _pause,
    ...rest
  } = job
  return rest
}
