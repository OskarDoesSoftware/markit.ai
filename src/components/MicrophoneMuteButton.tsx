import { Microphone, MicrophoneSlash } from '@gravity-ui/icons'
import { Button } from '@heroui/react'

export function MicrophoneMuteButton({
  isMuted,
  onToggle,
}: {
  isMuted: boolean
  onToggle: () => void
}) {
  const label = isMuted ? 'Unmute microphone' : 'Mute microphone'

  return (
    <Button
      isIconOnly
      size="sm"
      variant="secondary"
      className="mic-mute-button"
      data-muted={isMuted}
      aria-label={label}
      aria-pressed={isMuted}
      onPress={onToggle}
    >
      {isMuted ? <MicrophoneSlash aria-hidden="true" /> : <Microphone aria-hidden="true" />}
    </Button>
  )
}
