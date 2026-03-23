import { useEffect, useRef, useCallback, useState } from 'react'
import { EPianoEngine, DEFAULT_PARAMS, PARAM_DEFS, type EPianoParams } from './epiano-engine'
import './App.css'

interface KeyConfig {
  key: string
  note: string
  midi: number
  isBlack: boolean
}

const KEYS: KeyConfig[] = [
  { key: 'a', note: 'C4', midi: 60, isBlack: false },
  { key: 'w', note: 'C#4', midi: 61, isBlack: true },
  { key: 's', note: 'D4', midi: 62, isBlack: false },
  { key: 'e', note: 'D#4', midi: 63, isBlack: true },
  { key: 'd', note: 'E4', midi: 64, isBlack: false },
  { key: 'f', note: 'F4', midi: 65, isBlack: false },
  { key: 't', note: 'F#4', midi: 66, isBlack: true },
  { key: 'g', note: 'G4', midi: 67, isBlack: false },
  { key: 'y', note: 'G#4', midi: 68, isBlack: true },
  { key: 'h', note: 'A4', midi: 69, isBlack: false },
  { key: 'u', note: 'A#4', midi: 70, isBlack: true },
  { key: 'j', note: 'B4', midi: 71, isBlack: false },
  { key: 'k', note: 'C5', midi: 72, isBlack: false },
  { key: 'o', note: 'C#5', midi: 73, isBlack: true },
  { key: 'l', note: 'D5', midi: 74, isBlack: false },
  { key: 'p', note: 'D#5', midi: 75, isBlack: true },
  { key: ';', note: 'E5', midi: 76, isBlack: false },
]

function App() {
  const engineRef = useRef<EPianoEngine | null>(null)
  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set())
  const [params, setParams] = useState<EPianoParams>({ ...DEFAULT_PARAMS })

  const getEngine = useCallback(() => {
    if (!engineRef.current) {
      engineRef.current = new EPianoEngine()
    }
    return engineRef.current
  }, [])

  const noteOn = useCallback((keyConfig: KeyConfig) => {
    const engine = getEngine()
    engine.resume()
    engine.noteOn(keyConfig.midi, 80)
    setActiveKeys(prev => new Set(prev).add(keyConfig.key))
  }, [getEngine])

  const noteOff = useCallback((keyConfig: KeyConfig) => {
    const engine = getEngine()
    engine.noteOff(keyConfig.midi)
    setActiveKeys(prev => {
      const next = new Set(prev)
      next.delete(keyConfig.key)
      return next
    })
  }, [getEngine])

  const handleParamChange = useCallback((key: keyof EPianoParams, value: number) => {
    const engine = getEngine()
    engine.setParam(key, value)
    setParams(prev => ({ ...prev, [key]: value }))
  }, [getEngine])

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
        noteOff(keyConfig)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [noteOn, noteOff])

  useEffect(() => {
    return () => {
      engineRef.current?.dispose()
    }
  }, [])

  const whiteKeys = KEYS.filter(k => !k.isBlack)
  const blackKeys = KEYS.filter(k => k.isBlack)

  const getBlackKeyLeft = (blackKey: KeyConfig) => {
    const blackIndex = KEYS.indexOf(blackKey)
    const whiteCount = KEYS.slice(0, blackIndex).filter(k => !k.isBlack).length
    return whiteCount * 60 - 18
  }

  return (
    <div className="piano-app">
      <h1>Web ePiano</h1>
      <p className="subtitle">キーボードで演奏できます（A〜;キー）</p>
      <div className="main-layout">
        <div className="params-panel">
          <h2>Parameters</h2>
          {PARAM_DEFS.map(({ key, label }) => (
            <div key={key} className="param-row">
              <label>{label}</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={params[key]}
                onChange={e => handleParamChange(key, parseFloat(e.target.value))}
              />
              <span className="param-value">{Math.round(params[key] * 100)}</span>
            </div>
          ))}
        </div>
        <div className="piano">
          <div className="keys-container">
            {whiteKeys.map(k => (
              <div
                key={k.key}
                className={`white-key ${activeKeys.has(k.key) ? 'active' : ''}`}
                onPointerDown={() => noteOn(k)}
                onPointerUp={() => noteOff(k)}
                onPointerLeave={() => noteOff(k)}
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
                onPointerUp={() => noteOff(k)}
                onPointerLeave={() => noteOff(k)}
              >
                <span className="key-label">{k.note}</span>
                <span className="key-bind">{k.key.toUpperCase()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
