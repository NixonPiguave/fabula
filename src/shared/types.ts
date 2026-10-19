export type VoiceInfo = {
  id: string
  name: string
  country: string
  accent: string
  gender: string
  color: string
  initials: string
  description: string
  provider: 'edge' | 'sapi' | 'piper'
  locale?: string
}
const EDGE_VOICES = [
  {
    id: 'es-MX-JorgeNeural',
    name: 'Jorge',
    country: 'México',
    accent: 'Latinoamericano',
    gender: 'Masculina',
    color: 'mint',
    initials: 'J',
    description: 'Clara y cálida, con acento de México.'
  },
  {
    id: 'es-MX-DaliaNeural',
    name: 'Dalia',
    country: 'México',
    accent: 'Latinoamericano',
    gender: 'Femenina',
    color: 'rose',
    initials: 'D',
    description: 'Suave y cercana, para dejarte llevar por la historia.'
  },
  {
    id: 'es-ES-AlvaroNeural',
    name: 'Álvaro',
    country: 'España',
    accent: 'Castellano',
    gender: 'Masculina',
    color: 'blue',
    initials: 'Á',
    description: 'Expresiva y definida, con acento de España.'
  },
  {
    id: 'es-ES-ElviraNeural',
    name: 'Elvira',
    country: 'España',
    accent: 'Castellano',
    gender: 'Femenina',
    color: 'amber',
    initials: 'E',
    description: 'Una narración serena, con personalidad propia.'
  },
  {
    id: 'es-AR-TomasNeural',
    name: 'Tomás',
    country: 'Argentina',
    accent: 'Rioplatense',
    gender: 'Masculina',
    color: 'violet',
    initials: 'T',
    description: 'Cercana y expresiva, con acento argentino.'
  },
  {
    id: 'es-AR-ElenaNeural',
    name: 'Elena',
    country: 'Argentina',
    accent: 'Rioplatense',
    gender: 'Femenina',
    color: 'teal',
    initials: 'E',
    description: 'Una voz luminosa para tus próximas historias.'
  },
  {
    id: 'es-EC-LuisNeural',
    name: 'Luis',
    country: 'Ecuador',
    accent: 'Latinoamericano',
    gender: 'Masculina',
    color: 'blue',
    initials: 'L',
    description: 'Una alternativa en español de Ecuador para relatos y novelas.'
  },
  {
    id: 'es-EC-AndreaNeural',
    name: 'Andrea',
    country: 'Ecuador',
    accent: 'Latinoamericano',
    gender: 'Femenina',
    color: 'rose',
    initials: 'A',
    description: 'Español de Ecuador para escuchar tus historias.'
  },
  {
    id: 'es-CO-GonzaloNeural',
    name: 'Gonzalo',
    country: 'Colombia',
    accent: 'Latinoamericano',
    gender: 'Masculina',
    color: 'teal',
    initials: 'G',
    description: 'Español de Colombia, una opción para narraciones extensas.'
  },
  {
    id: 'es-CO-SalomeNeural',
    name: 'Salomé',
    country: 'Colombia',
    accent: 'Latinoamericano',
    gender: 'Femenina',
    color: 'violet',
    initials: 'S',
    description: 'Otra voz neural para novelas, relatos y lecturas personales.'
  },
  {
    id: 'es-PE-AlexNeural',
    name: 'Alex',
    country: 'Perú',
    accent: 'Latinoamericano',
    gender: 'Masculina',
    color: 'amber',
    initials: 'A',
    description: 'Una voz peruana para explorar distintos estilos de lectura.'
  },
  {
    id: 'es-PE-CamilaNeural',
    name: 'Camila',
    country: 'Perú',
    accent: 'Latinoamericano',
    gender: 'Femenina',
    color: 'mint',
    initials: 'C',
    description: 'Español de Perú para audiolibros y documentos.'
  },
  {
    id: 'es-CL-LorenzoNeural',
    name: 'Lorenzo',
    country: 'Chile',
    accent: 'Latinoamericano',
    gender: 'Masculina',
    color: 'blue',
    initials: 'L',
    description: 'Añade una voz de Chile a tus narraciones.'
  },
  {
    id: 'es-CL-CatalinaNeural',
    name: 'Catalina',
    country: 'Chile',
    accent: 'Latinoamericano',
    gender: 'Femenina',
    color: 'rose',
    initials: 'C',
    description: 'Una opción chilena para escuchar ficción y otros textos.'
  },
  {
    id: 'es-ES-XimenaNeural',
    name: 'Ximena',
    country: 'España',
    accent: 'Castellano',
    gender: 'Femenina',
    color: 'teal',
    initials: 'X',
    description: 'Otra opción neural de España para comparar con Elvira.'
  }
] as const
export const VOICES: VoiceInfo[] = EDGE_VOICES.map((voice) => ({
  ...voice,
  provider: 'edge',
  locale: voice.id.slice(0, 5)
}))

export type VoiceId = string
export type VoiceSettings = { voice: VoiceId; speed: number; pitch: number; volume: number }
export const DEFAULT_SETTINGS: VoiceSettings = {
  voice: 'es-MX-JorgeNeural',
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
