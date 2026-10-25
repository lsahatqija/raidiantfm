import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSpeech } from './useSpeech'

function createSpeechService() {
  return {
    cancel: vi.fn(),
    setVoiceConfig: vi.fn(),
    speak: vi.fn().mockResolvedValue(undefined),
  }
}

describe('useSpeech account isolation', () => {
  beforeEach(() => window.localStorage.clear())

  it('switches preferences by user and resets them while signed out', async () => {
    const service = createSpeechService()
    const { result, rerender } = renderHook(
      ({ sessionKey }) => useSpeech(sessionKey, service),
      { initialProps: { sessionKey: 'user-a' } },
    )

    act(() => {
      result.current.setActiveVoice('Voice A')
      result.current.setSpeechRate(1.25)
    })

    rerender({ sessionKey: 'user-b' })
    expect(result.current.activeVoiceName).toBeNull()
    expect(result.current.speechRate).toBe(1)

    act(() => result.current.setActiveVoice('Voice B'))
    rerender({ sessionKey: null })
    expect(result.current.activeVoiceName).toBeNull()
    expect(result.current.speechRate).toBe(1)
    expect(service.cancel).toHaveBeenCalled()

    rerender({ sessionKey: 'user-a' })
    await waitFor(() => expect(result.current.activeVoiceName).toBe('Voice A'))
    expect(result.current.speechRate).toBe(1.25)
  })
})
