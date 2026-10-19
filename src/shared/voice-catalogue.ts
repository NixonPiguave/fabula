import { t, localizeMessage } from './i18n'
import { VOICES, type VoiceInfo } from './types'
export function voiceInfo(id: string, catalogue: VoiceInfo[] = VOICES): VoiceInfo {
  return (
    catalogue.find((voice) => voice.id === id) ?? {
      id,
      name: t('Voz externa no disponible'),
      country: t('Vuelve a importar la voz'),
      accent: t('Local'),
      gender: t('Voz externa'),
      color: 'mint',
      initials: 'V',
      description: t('La narración guardada se puede escuchar aunque su voz ya no esté instalada.'),
      provider: id.startsWith('piper:') ? 'piper' : 'sapi'
    }
  )
}

/** Localize app-owned voice metadata while preserving voice IDs and names. */
export function localizeVoice(voice: VoiceInfo): VoiceInfo {
  return {
    ...voice,
    country: localizeMessage(voice.country),
    accent: localizeMessage(voice.accent),
    gender: localizeMessage(voice.gender),
    description: localizeMessage(voice.description)
  }
}
