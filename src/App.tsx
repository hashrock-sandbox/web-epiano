import { useEffect, useRef, useCallback, useState } from 'react'
import { EPianoEngine, DEFAULT_PARAMS, PARAM_DEFS, type EPianoParams, REF_STEP, STEPS_PER_OCTAVE } from './epiano-engine'
import './App.css'

// 31-EDO note names within one octave
const NOTE_NAMES_31 = [
  'C', '^C', 'C#', 'Db', 'vD',
  'D', '^D', 'D#', 'Eb', 'vE',
  'E', '^E', 'E#',
  'F', '^F', 'F#', 'Gb', 'vG',
  'G', '^G', 'G#', 'Ab', 'vA',
  'A', '^A', 'A#', 'Bb', 'vB',
  'B', '^B', 'B#',
]

// Key type: 'natural' | 'sharp' | 'micro'
type KeyType = 'natural' | 'sharp' | 'micro'

const KEY_TYPES_31: KeyType[] = [
  'natural', 'micro', 'sharp', 'sharp', 'micro',   // C .. vD
  'natural', 'micro', 'sharp', 'sharp', 'micro',   // D .. vE
  'natural', 'micro', 'sharp',                       // E .. E#
  'natural', 'micro', 'sharp', 'sharp', 'micro',   // F .. vG
  'natural', 'micro', 'sharp', 'sharp', 'micro',   // G .. vA
  'natural', 'micro', 'sharp', 'sharp', 'micro',   // A .. vB
  'natural', 'micro', 'sharp',                       // B .. B#
]

// Computer keyboard binding for 31 keys (one octave from C4)
const KEY_BINDINGS = [
  'z', 'a', 'x', 's', 'c',
  'v', 'd', 'b', 'f', 'n',
  'm', 'g', ',',
  '.', 'h', '/', 'j', 'q',
  'w', 'k', 'e', 'l', 'r',
  't', ';', 'y', "'", 'u',
  'i', 'o', 'p',
]

interface KeyConfig {
  key: string
  note: string
  step: number  // 31-EDO step number
  keyType: KeyType
}

function buildKeys(): KeyConfig[] {
  const startStep = REF_STEP  // C4
  return KEY_BINDINGS.map((key, i) => {
    const octave = Math.floor((startStep + i) / STEPS_PER_OCTAVE)
    const degreeInOctave = (startStep + i) % STEPS_PER_OCTAVE
    const noteName = NOTE_NAMES_31[degreeInOctave]
    return {
      key,
      note: `${noteName}${octave - 4}`,  // relative octave label
      step: startStep + i,
      keyType: KEY_TYPES_31[degreeInOctave],
    }
  })
}

const KEYS = buildKeys()

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
    engine.noteOn(keyConfig.step, 80)
    setActiveKeys(prev => new Set(prev).add(keyConfig.key))
  }, [getEngine])

  const noteOff = useCallback((keyConfig: KeyConfig) => {
    const engine = getEngine()
    engine.noteOff(keyConfig.step)
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
      const keyConfig = KEYS.find(k => k.key === e.key.toLowerCase() || k.key === e.key)
      if (keyConfig) {
        e.preventDefault()
        noteOn(keyConfig)
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      const keyConfig = KEYS.find(k => k.key === e.key.toLowerCase() || k.key === e.key)
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

  return (
    <div className="piano-app">
      <h1>Web ePiano <span className="edo-badge">31-EDO</span></h1>
      <p className="subtitle">31平均律キーボード（Z〜Pキーで1オクターブ演奏）</p>
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
          <div className="keys-container-31">
            {KEYS.map(k => (
              <div
                key={k.key}
                className={`key-31 key-31--${k.keyType} ${activeKeys.has(k.key) ? 'active' : ''}`}
                onPointerDown={() => noteOn(k)}
                onPointerUp={() => noteOff(k)}
                onPointerLeave={() => noteOff(k)}
              >
                <span className="key-label">{k.note}</span>
                <span className="key-bind">{k.key === ';' ? ';' : k.key === "'" ? "'" : k.key.toUpperCase()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
