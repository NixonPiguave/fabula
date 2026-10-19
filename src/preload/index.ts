import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopApi, JobSummary } from '../shared/types'

const api: DesktopApi = {
  confirm: (message) => ipcRenderer.invoke('app:confirm', message),
  boot: () => ipcRenderer.invoke('app:boot'),
  refreshVoices: () => ipcRenderer.invoke('voices:refresh'),
  importVoice: (input) => ipcRenderer.invoke('voices:import', input),
  removeVoice: (id) => ipcRenderer.invoke('voices:remove', id),
  onVoices: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      voices: import('../shared/types').VoiceInfo[]
    ) => callback(voices)
    ipcRenderer.on('voices:changed', listener)
    return () => ipcRenderer.removeListener('voices:changed', listener)
  },
  saveDraft: (draft) => ipcRenderer.invoke('draft:save', draft),
  importDocument: (options) => ipcRenderer.invoke('document:import', options ?? {}),
  start: (input) => ipcRenderer.invoke('job:start', input),
  cancel: (id) => ipcRenderer.invoke('job:cancel', id),
  resume: (id) => ipcRenderer.invoke('job:resume', id),
  openJob: (id) => ipcRenderer.invoke('job:open', id),
  exportMp3: (id) => ipcRenderer.invoke('job:export', id),
  deleteJob: (id) => ipcRenderer.invoke('job:delete', id),
  saveProject: (input) => ipcRenderer.invoke('project:save', input),
  deleteProject: (id) => ipcRenderer.invoke('project:delete', id),
  assignProject: (id, project) => ipcRenderer.invoke('project:assign', id, project),
  onLibrary: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      value: import('../shared/library').LibraryState
    ) => callback(value)
    ipcRenderer.on('library:changed', listener)
    return () => ipcRenderer.removeListener('library:changed', listener)
  },
  onJobRemoved: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, id: string) => callback(id)
    ipcRenderer.on('job:removed', listener)
    return () => ipcRenderer.removeListener('job:removed', listener)
  },
  savePreferences: (value) => ipcRenderer.invoke('preferences:save', value),
  chooseExportFolder: () => ipcRenderer.invoke('preferences:export-folder'),
  savePlayback: (value) => ipcRenderer.invoke('playback:save', value),
  exportChapters: (id) => ipcRenderer.invoke('job:export-chapters', id),
  installModule: (kind) => ipcRenderer.invoke('module:install', kind),
  cancelModule: () => ipcRenderer.invoke('module:cancel'),
  cancelTask: () => ipcRenderer.invoke('task:cancel'),
  transcribeFile: (language) => ipcRenderer.invoke('transcription:file', language),
  requestMicrophone: () => ipcRenderer.invoke('recording:allow'),
  transcribeRecording: (data, language) =>
    ipcRenderer.invoke('transcription:recording', data, language),
  exportTranscript: (transcript, format) =>
    ipcRenderer.invoke('transcription:export', transcript, format),
  saveTranscript: (transcript) => ipcRenderer.invoke('transcription:save', transcript),
  onModule: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      state: import('../shared/studio').ModuleState
    ) => callback(state)
    ipcRenderer.on('module:changed', listener)
    return () => ipcRenderer.removeListener('module:changed', listener)
  },
  onTask: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      state: import('../shared/studio').TaskProgress
    ) => callback(state)
    ipcRenderer.on('task:changed', listener)
    return () => ipcRenderer.removeListener('task:changed', listener)
  },
  onJob: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, job: JobSummary) => callback(job)
    ipcRenderer.on('job:changed', listener)
    return () => ipcRenderer.removeListener('job:changed', listener)
  }
}
contextBridge.exposeInMainWorld('fabula', api)
