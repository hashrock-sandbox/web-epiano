import { useEffect, useRef, useCallback, useState } from 'react'
import { EPianoEngine, DEFAULT_PARAMS, PARAM_DEFS, type EPianoParams, REF_STEP, STEPS_PER_OCTAVE } from './epiano-engine'
import './App.css'

const NOTE_NAMES_31 = [
  'C', '^C', 'C#', 'Db', 'vD',
  'D', '^D', 'D#', 'Eb', 'vE',
  'E', '^E', 'E#',
  'F', '^F', 'F#', 'Gb', 'vG',
  'G', '^G', 'G#', 'Ab', 'vA',
  'A', '^A', 'A#', 'Bb', 'vB',
  'B', '^B', 'B#',
]

const KEY_TYPES_31: ('natural' | 'sharp' | 'micro')[] = [
  'natural', 'micro', 'sharp', 'sharp', 'micro',
  'natural', 'micro', 'sharp', 'sharp', 'micro',
  'natural', 'micro', 'sharp',
  'natural', 'micro', 'sharp', 'sharp', 'micro',
  'natural', 'micro', 'sharp', 'sharp', 'micro',
  'natural', 'micro', 'sharp', 'sharp', 'micro',
  'natural', 'micro', 'sharp',
]

const STEPS_PER_BAR = 16
const NOTE_LOW = REF_STEP - STEPS_PER_OCTAVE  // C3
const NOTE_HIGH = REF_STEP + STEPS_PER_OCTAVE - 1 // B4

// High to low for display
const NOTE_RANGE: number[] = []
for (let n = NOTE_HIGH; n >= NOTE_LOW; n--) NOTE_RANGE.push(n)

function getNoteName(step: number): string {
  const degree = ((step % STEPS_PER_OCTAVE) + STEPS_PER_OCTAVE) % STEPS_PER_OCTAVE
  const octave = Math.floor(step / STEPS_PER_OCTAVE) - 1
  return `${NOTE_NAMES_31[degree]}${octave}`
}

function getNoteType(step: number): 'natural' | 'sharp' | 'micro' {
  const degree = ((step % STEPS_PER_OCTAVE) + STEPS_PER_OCTAVE) % STEPS_PER_OCTAVE
  return KEY_TYPES_31[degree]
}

function noteKey(col: number, row: number) {
  return `${col}-${row}`
}

function App() {
  const engineRef = useRef<EPianoEngine | null>(null)
  const [params, setParams] = useState<EPianoParams>({ ...DEFAULT_PARAMS })
  const [notes, setNotes] = useState<Set<string>>(new Set())
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentStep, setCurrentStep] = useState(-1)
  const [bpm, setBpm] = useState(120)
  const [numBars, setNumBars] = useState(4)

  const paintModeRef = useRef<'add' | 'remove' | null>(null)
  const lastCellRef = useRef<string | null>(null)
  const intervalRef = useRef<number | null>(null)
  const stepRef = useRef(0)
  const prevSoundingRef = useRef<Set<number>>(new Set())
  const notesRef = useRef(notes)
  notesRef.current = notes
  const labelsRef = useRef<HTMLDivElement>(null)
  const gridScrollRef = useRef<HTMLDivElement>(null)
  const beatMarkersRef = useRef<HTMLDivElement>(null)

  const totalSteps = numBars * STEPS_PER_BAR
  const totalStepsRef = useRef(totalSteps)
  totalStepsRef.current = totalSteps

  const getEngine = useCallback(() => {
    if (!engineRef.current) {
      engineRef.current = new EPianoEngine()
    }
    return engineRef.current
  }, [])

  const handleParamChange = useCallback((key: keyof EPianoParams, value: number) => {
    const engine = getEngine()
    engine.setParam(key, value)
    setParams(prev => ({ ...prev, [key]: value }))
  }, [getEngine])

  // --- Playback ---
  const getActiveNotesAtStep = useCallback((step: number): Set<number> => {
    const result = new Set<number>()
    for (const key of notesRef.current) {
      const [s, n] = key.split('-').map(Number)
      if (s === step) result.add(n)
    }
    return result
  }, [])

  const stopPlayback = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    const engine = getEngine()
    for (const n of prevSoundingRef.current) {
      engine.noteOff(n)
    }
    prevSoundingRef.current.clear()
    setIsPlaying(false)
    setCurrentStep(-1)
    stepRef.current = 0
  }, [getEngine])

  const startPlayback = useCallback(() => {
    const engine = getEngine()
    engine.resume()
    stepRef.current = 0
    setIsPlaying(true)
    setCurrentStep(0)
    prevSoundingRef.current.clear()

    const stepMs = (60 / bpm / 4) * 1000 // 16th note duration

    // Play first step immediately
    const first = getActiveNotesAtStep(0)
    for (const n of first) engine.noteOn(n, 80)
    prevSoundingRef.current = first

    intervalRef.current = window.setInterval(() => {
      stepRef.current = (stepRef.current + 1) % totalStepsRef.current
      const step = stepRef.current
      setCurrentStep(step)

      const curr = getActiveNotesAtStep(step)
      const prev = prevSoundingRef.current

      // Note off for notes no longer active
      for (const n of prev) {
        if (!curr.has(n)) engine.noteOff(n)
      }
      // Note on for newly active notes
      for (const n of curr) {
        if (!prev.has(n)) engine.noteOn(n, 80)
      }
      prevSoundingRef.current = curr
    }, stepMs)
  }, [bpm, getEngine, getActiveNotesAtStep])

  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      stopPlayback()
    } else {
      startPlayback()
    }
  }, [isPlaying, stopPlayback, startPlayback])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current)
      engineRef.current?.dispose()
    }
  }, [])

  // Restart playback when bpm changes during play
  useEffect(() => {
    if (isPlaying) {
      stopPlayback()
      // Small delay to allow state to settle
      requestAnimationFrame(() => startPlayback())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bpm])

  // Keyboard shortcut: space = play/stop
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault()
        togglePlayback()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [togglePlayback])

  // --- Grid interaction ---
  const toggleNote = useCallback((col: number, row: number) => {
    const key = noteKey(col, row)
    setNotes(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }, [])

  const handleCellPointerDown = useCallback((col: number, row: number) => {
    const key = noteKey(col, row)
    const isActive = notes.has(key)
    paintModeRef.current = isActive ? 'remove' : 'add'
    lastCellRef.current = key
    toggleNote(col, row)
  }, [notes, toggleNote])

  const handleCellPointerEnter = useCallback((col: number, row: number) => {
    if (paintModeRef.current === null) return
    const key = noteKey(col, row)
    if (key === lastCellRef.current) return
    lastCellRef.current = key

    setNotes(prev => {
      const next = new Set(prev)
      if (paintModeRef.current === 'add') {
        next.add(key)
      } else {
        next.delete(key)
      }
      return next
    })
  }, [])

  const handlePointerUp = useCallback(() => {
    paintModeRef.current = null
    lastCellRef.current = null
  }, [])

  useEffect(() => {
    window.addEventListener('pointerup', handlePointerUp)
    return () => window.removeEventListener('pointerup', handlePointerUp)
  }, [handlePointerUp])

  // Sync scroll between labels/beat-markers and grid
  const handleGridScroll = useCallback(() => {
    const grid = gridScrollRef.current
    if (!grid) return
    if (labelsRef.current) labelsRef.current.scrollTop = grid.scrollTop
    if (beatMarkersRef.current) beatMarkersRef.current.scrollLeft = grid.scrollLeft
  }, [])

  // Trim notes when reducing bars
  useEffect(() => {
    setNotes(prev => {
      const next = new Set<string>()
      for (const key of prev) {
        const col = parseInt(key.split('-')[0])
        if (col < totalSteps) next.add(key)
      }
      return next
    })
  }, [totalSteps])

  const clearAll = useCallback(() => {
    if (isPlaying) stopPlayback()
    setNotes(new Set())
  }, [isPlaying, stopPlayback])

  return (
    <div className="piano-app">
      <h1>Web ePiano <span className="edo-badge">31-EDO</span></h1>
      <p className="subtitle">ピアノロールシーケンサー（スペースキーで再生/停止）</p>

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

        <div className="sequencer">
          {/* Transport */}
          <div className="transport">
            <button className="transport-btn" onClick={togglePlayback}>
              {isPlaying ? '■ Stop' : '▶ Play'}
            </button>
            <div className="transport-group">
              <label>BPM</label>
              <input
                type="number"
                className="bpm-input"
                min={40}
                max={300}
                value={bpm}
                onChange={e => setBpm(Math.max(40, Math.min(300, parseInt(e.target.value) || 120)))}
              />
            </div>
            <div className="transport-group">
              <label>Bars</label>
              <div className="bar-btns">
                {[1, 2, 3, 4].map(n => (
                  <button
                    key={n}
                    className={`bar-btn ${numBars === n ? 'active' : ''}`}
                    onClick={() => setNumBars(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <button className="transport-btn clear-btn" onClick={clearAll}>Clear</button>
          </div>

          {/* Piano Roll */}
          <div className="roll-wrapper">
            {/* Header row: corner + beat markers */}
            <div className="roll-header">
              <div className="corner-cell" />
              <div className="beat-markers-scroll" ref={beatMarkersRef}>
                {Array.from({ length: totalSteps }, (_, i) => (
                  <div
                    key={i}
                    className={`beat-marker ${i % STEPS_PER_BAR === 0 ? 'bar' : i % 4 === 0 ? 'beat' : ''}`}
                  >
                    {i % STEPS_PER_BAR === 0 ? `${Math.floor(i / STEPS_PER_BAR) + 1}` : i % 4 === 0 ? '·' : ''}
                  </div>
                ))}
              </div>
            </div>

            {/* Body row: note labels + grid */}
            <div className="roll-body">
              <div className="note-labels" ref={labelsRef}>
                {NOTE_RANGE.map(n => (
                  <div key={n} className={`note-label note-label--${getNoteType(n)}`}>
                    {getNoteName(n)}
                  </div>
                ))}
              </div>

              <div className="grid-scroll" ref={gridScrollRef} onScroll={handleGridScroll}>
                {NOTE_RANGE.map(noteStep => (
                  <div key={noteStep} className={`grid-row grid-row--${getNoteType(noteStep)}`}>
                    {Array.from({ length: totalSteps }, (_, col) => {
                      const key = noteKey(col, noteStep)
                      const isActive = notes.has(key)
                      const isPlayhead = col === currentStep
                      return (
                        <div
                          key={col}
                          className={
                            'grid-cell' +
                            (isActive ? ' on' : '') +
                            (isPlayhead ? ' playhead' : '') +
                            (col % STEPS_PER_BAR === 0 ? ' bar-line' : col % 4 === 0 ? ' beat-line' : '')
                          }
                          onPointerDown={e => { e.preventDefault(); handleCellPointerDown(col, noteStep) }}
                          onPointerEnter={() => handleCellPointerEnter(col, noteStep)}
                        />
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
