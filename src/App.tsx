import { useEffect, useRef, useCallback, useState } from 'react'
import './App.css'

interface KeyConfig {
  key: string
  note: string
  freq: number
  isBlack: boolean
}

const KEYS: KeyConfig[] = [
  { key: 'a', note: 'C4', freq: 261.63, isBlack: false },
  { key: 'w', note: 'C#4', freq: 277.18, isBlack: true },
  { key: 's', note: 'D4', freq: 293.66, isBlack: false },
  { key: 'e', note: 'D#4', freq: 311.13, isBlack: true },
  { key: 'd', note: 'E4', freq: 329.63, isBlack: false },
  { key: 'f', note: 'F4', freq: 349.23, isBlack: false },
  { key: 't', note: 'F#4', freq: 369.99, isBlack: true },
  { key: 'g', note: 'G4', freq: 392.0, isBlack: false },
  { key: 'y', note: 'G#4', freq: 415.3, isBlack: true },
  { key: 'h', note: 'A4', freq: 440.0, isBlack: false },
  { key: 'u', note: 'A#4', freq: 466.16, isBlack: true },
  { key: 'j', note: 'B4', freq: 493.88, isBlack: false },
  { key: 'k', note: 'C5', freq: 523.25, isBlack: false },
  { key: 'o', note: 'C#5', freq: 554.37, isBlack: true },
  { key: 'l', note: 'D5', freq: 587.33, isBlack: false },
  { key: 'p', note: 'D#5', freq: 622.25, isBlack: true },
  { key: ';', note: 'E5', freq: 659.25, isBlack: false },
]

function App() {
  const audioCtxRef = useRef<AudioContext | null>(null)
  const activeOscillators = useRef<Map<string, { osc: OscillatorNode; gain: GainNode }>>(new Map())
  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set())

  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext()
    }
    return audioCtxRef.current
  }, [])

  const noteOn = useCallback((keyConfig: KeyConfig) => {
    if (activeOscillators.current.has(keyConfig.key)) return

    const ctx = getAudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.value = keyConfig.freq
    gain.gain.value = 0.3

    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()

    activeOscillators.current.set(keyConfig.key, { osc, gain })
    setActiveKeys(prev => new Set(prev).add(keyConfig.key))
  }, [getAudioCtx])

  const noteOff = useCallback((key: string) => {
    const entry = activeOscillators.current.get(key)
    if (!entry) return

    const { osc, gain } = entry
    const ctx = getAudioCtx()
    gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05)
    setTimeout(() => {
      osc.stop()
      osc.disconnect()
      gain.disconnect()
    }, 200)

    activeOscillators.current.delete(key)
    setActiveKeys(prev => {
      const next = new Set(prev)
      next.delete(key)
      return next
    })
  }, [getAudioCtx])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return
      const keyConfig = KEYS.find(k => k.key === e.key.toLowerCase())
      if (keyConfig) {
        e.preventDefault()
        noteOn(keyConfig)
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      const keyConfig = KEYS.find(k => k.key === e.key.toLowerCase())
      if (keyConfig) {
        noteOff(keyConfig.key)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [noteOn, noteOff])

  const whiteKeys = KEYS.filter(k => !k.isBlack)
  const blackKeys = KEYS.filter(k => k.isBlack)

  // 黒鍵の位置を白鍵基準で計算
  const getBlackKeyLeft = (blackKey: KeyConfig) => {
    const blackIndex = KEYS.indexOf(blackKey)
    // この黒鍵より前にある白鍵の数を数える
    const whiteCount = KEYS.slice(0, blackIndex).filter(k => !k.isBlack).length
    return whiteCount * 60 - 18
  }

  return (
    <div className="piano-app">
      <h1>Web ePiano</h1>
      <p className="subtitle">キーボードで演奏できます（A〜;キー）</p>
      <div className="piano">
        <div className="keys-container">
          {whiteKeys.map(k => (
            <div
              key={k.key}
              className={`white-key ${activeKeys.has(k.key) ? 'active' : ''}`}
              onPointerDown={() => noteOn(k)}
              onPointerUp={() => noteOff(k.key)}
              onPointerLeave={() => noteOff(k.key)}
            >
              <span className="key-label">{k.note}</span>
              <span className="key-bind">{k.key.toUpperCase()}</span>
            </div>
          ))}
          {blackKeys.map(k => (
            <div
              key={k.key}
              className={`black-key ${activeKeys.has(k.key) ? 'active' : ''}`}
              style={{ left: getBlackKeyLeft(k) }}
              onPointerDown={() => noteOn(k)}
              onPointerUp={() => noteOff(k.key)}
              onPointerLeave={() => noteOff(k.key)}
            >
              <span className="key-label">{k.note}</span>
              <span className="key-bind">{k.key.toUpperCase()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default App
