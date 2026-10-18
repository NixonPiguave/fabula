import { AudioLines } from 'lucide-react'
import { VOICES } from '../../shared/types'
export default function VoiceArt({
  voice,
  small = false
}: {
  voice: (typeof VOICES)[number]
  small?: boolean
}) {
  return (
    <div className={`voice-art ${voice.color} ${small ? 'small' : ''}`} aria-hidden="true">
      <span>{voice.initials}</span>
      <div className="art-rings" />
      <AudioLines />
    </div>
  )
}
