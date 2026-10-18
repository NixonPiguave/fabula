import { VOICES, type VoiceInfo } from './types'
export function voiceInfo(id: string, catalogue: VoiceInfo[] = VOICES): VoiceInfo {
  return (
    catalogue.find((voice) => voice.id === id) ?? {
      id,
      name: 'Voz externa no disponible',
      country: 'Vuelve a importar la voz',
      accent: 'Local',
      gender: 'Voz externa',
      color: 'mint',
      initials: 'V',
      description: 'La narración guardada se puede escuchar aunque su voz ya no esté instalada.',
      provider: id.startsWith('piper:') ? 'piper' : 'sapi'
    }
  )
}
