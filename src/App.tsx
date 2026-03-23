import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
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
const NOTE_LOW = REF_STEP - STEPS_PER_OCTAVE
const NOTE_HIGH = REF_STEP + STEPS_PER_OCTAVE - 1

const NOTE_RANGE: number[] = []
for (let n = NOTE_HIGH; n >= NOTE_LOW; n--) NOTE_RANGE.push(n)

const NOTE_LENGTH_OPTIONS = [
  { label: '1/16', steps: 1 },
  { label: '1/8', steps: 2 },
  { label: '1/4', steps: 4 },
  { label: '1/2', steps: 8 },
  { label: '1', steps: 16 },
]

interface SeqNote {
  id: number
  col: number
  row: number
  len: number
}

function getNoteName(step: number): string {
  const degree = ((step % STEPS_PER_OCTAVE) + STEPS_PER_OCTAVE) % STEPS_PER_OCTAVE
  const octave = Math.floor(step / STEPS_PER_OCTAVE) - 1
  return `${NOTE_NAMES_31[degree]}${octave}`
}

function getNoteType(step: number): 'natural' | 'sharp' | 'micro' {
  const degree = ((step % STEPS_PER_OCTAVE) + STEPS_PER_OCTAVE) % STEPS_PER_OCTAVE
  return KEY_TYPES_31[degree]
}

function App() {
  const engineRef = useRef<EPianoEngine | null>(null)
  const [params, setParams] = useState<EPianoParams>({ ...DEFAULT_PARAMS })
  const [notes, setNotes] = useState<SeqNote[]>([])
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentStep, setCurrentStep] = useState(-1)
  const [bpm, setBpm] = useState(120)
  const [numBars, setNumBars] = useState(4)
  const [selectedLength, setSelectedLength] = useState(4)

  const nextIdRef = useRef(1)
  const intervalRef = useRef<number | null>(null)
  const stepRef = useRef(0)
  const prevSoundingRef = useRef<Set<number>>(new Set())
  const notesRef = useRef(notes)
  notesRef.current = notes
  const labelsRef = useRef<HTMLDivElement>(null)
  const gridScrollRef = useRef<HTMLDivElement>(null)
  const beatMarkersRef = useRef<HTMLDivElement>(null)

  const dragRef = useRef<{
    noteId: number
    row: number
    startCol: number
    cellWidth: number
    gridLeft: number
    scrollLeft: number
  } | null>(null)

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

  // --- Note lookup helpers ---
  const findNoteAt = useCallback((col: number, row: number): SeqNote | undefined => {
    // Search in reverse so latest note is found first
    for (let i = notes.length - 1; i >= 0; i--) {
      const n = notes[i]
      if (n.row === row && col >= n.col && col < n.col + n.len) return n
    }
    return undefined
  }, [notes])

  // Notes indexed by row for rendering
  const notesByRow = useMemo(() => {
    const map = new Map<number, SeqNote[]>()
    for (const note of notes) {
      let arr = map.get(note.row)
      if (!arr) { arr = []; map.set(note.row, arr) }
      arr.push(note)
    }
    return map
  }, [notes])

  // --- Playback ---
  const getSoundingPitches = useCallback((step: number): Set<number> => {
    const result = new Set<number>()
    for (const n of notesRef.current) {
      if (step >= n.col && step < n.col + n.len) result.add(n.row)
    }
    return result
  }, [])

  const getStartingPitches = useCallback((step: number): Set<number> => {
    const result = new Set<number>()
    for (const n of notesRef.current) {
      if (n.col === step) result.add(n.row)
    }
    return result
  }, [])

  const stopPlayback = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    const engine = getEngine()
    for (const p of prevSoundingRef.current) engine.noteOff(p)
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

    const stepMs = (60 / bpm / 4) * 1000

    // Play first step
    const curr = getSoundingPitches(0)
    const starting = getStartingPitches(0)
    for (const p of starting) engine.noteOn(p, 80)
    prevSoundingRef.current = curr

    intervalRef.current = window.setInterval(() => {
      stepRef.current = (stepRef.current + 1) % totalStepsRef.current
      const step = stepRef.current
      setCurrentStep(step)

      const curr = getSoundingPitches(step)
      const starting = getStartingPitches(step)
      const prev = prevSoundingRef.current

      // noteOff: stopped or retriggering
      for (const p of prev) {
        if (!curr.has(p) || starting.has(p)) engine.noteOff(p)
      }
      // noteOn: newly sounding or retriggering
      for (const p of curr) {
        if (!prev.has(p) || starting.has(p)) engine.noteOn(p, 80)
      }
      prevSoundingRef.current = curr
    }, stepMs)
  }, [bpm, getEngine, getSoundingPitches, getStartingPitches])

  const togglePlayback = useCallback(() => {
    if (isPlaying) stopPlayback()
    else startPlayback()
  }, [isPlaying, stopPlayback, startPlayback])

  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current)
      engineRef.current?.dispose()
    }
  }, [])

  useEffect(() => {
    if (isPlaying) {
      stopPlayback()
      requestAnimationFrame(() => startPlayback())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bpm])

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
  const handleCellPointerDown = useCallback((col: number, row: number, e: React.PointerEvent) => {
    e.preventDefault()

    const existing = findNoteAt(col, row)
    if (existing) {
      // Delete existing note
      setNotes(prev => prev.filter(n => n.id !== existing.id))
      return
    }

    // Create new note
    const engine = getEngine()
    engine.resume()
    engine.noteOn(row, 80)

    const id = nextIdRef.current++
    const len = Math.min(selectedLength, totalSteps - col)
    const newNote: SeqNote = { id, col, row, len }
    setNotes(prev => [...prev, newNote])

    // Start drag for length adjustment
    const gridEl = gridScrollRef.current
    if (gridEl) {
      const cell = e.currentTarget as HTMLElement
      const cellRect = cell.getBoundingClientRect()
      const cellWidth = cellRect.width
      const gridRect = gridEl.getBoundingClientRect()
      dragRef.current = {
        noteId: id,
        row,
        startCol: col,
        cellWidth,
        gridLeft: gridRect.left,
        scrollLeft: gridEl.scrollLeft,
      }
    }
  }, [findNoteAt, getEngine, selectedLength, totalSteps])

  const handlePointerMove = useCallback((e: PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return

    const gridEl = gridScrollRef.current
    if (!gridEl) return

    const x = e.clientX - drag.gridLeft + gridEl.scrollLeft
    const col = Math.floor(x / drag.cellWidth)
    const newLen = Math.max(1, Math.min(col - drag.startCol + 1, totalStepsRef.current - drag.startCol))

    setNotes(prev => prev.map(n =>
      n.id === drag.noteId ? { ...n, len: newLen } : n
    ))
  }, [])

  const handlePointerUp = useCallback(() => {
    if (dragRef.current) {
      const engine = getEngine()
      engine.noteOff(dragRef.current.row)
      dragRef.current = null
    }
  }, [getEngine])

  useEffect(() => {
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [handlePointerMove, handlePointerUp])

  // Sync scroll
  const handleGridScroll = useCallback(() => {
    const grid = gridScrollRef.current
    if (!grid) return
    if (labelsRef.current) labelsRef.current.scrollTop = grid.scrollTop
    if (beatMarkersRef.current) beatMarkersRef.current.scrollLeft = grid.scrollLeft
  }, [])

  // Trim notes when reducing bars
  useEffect(() => {
    setNotes(prev => {
      const trimmed = prev
        .map(n => {
          if (n.col >= totalSteps) return null
          if (n.col + n.len > totalSteps) return { ...n, len: totalSteps - n.col }
          return n
        })
        .filter((n): n is SeqNote => n !== null)
      return trimmed
    })
  }, [totalSteps])

  const clearAll = useCallback(() => {
    if (isPlaying) stopPlayback()
    setNotes([])
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
            <div className="transport-group">
              <label>Length</label>
              <div className="len-btns">
                {NOTE_LENGTH_OPTIONS.map(opt => (
                  <button
                    key={opt.steps}
                    className={`len-btn ${selectedLength === opt.steps ? 'active' : ''}`}
                    onClick={() => setSelectedLength(opt.steps)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <button className="transport-btn clear-btn" onClick={clearAll}>Clear</button>
          </div>

          {/* Piano Roll */}
          <div className="roll-wrapper">
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

            <div className="roll-body">
              <div className="note-labels" ref={labelsRef}>
                {NOTE_RANGE.map(n => (
                  <div key={n} className={`note-label note-label--${getNoteType(n)}`}>
                    {getNoteName(n)}
                  </div>
                ))}
              </div>

              <div className="grid-scroll" ref={gridScrollRef} onScroll={handleGridScroll}>
                {NOTE_RANGE.map(noteStep => {
                  const rowNotes = notesByRow.get(noteStep) || []
                  return (
                    <div key={noteStep} className={`grid-row grid-row--${getNoteType(noteStep)}`}>
                      {/* Background cells (interaction layer) */}
                      {Array.from({ length: totalSteps }, (_, col) => (
                        <div
                          key={col}
                          className={
                            'grid-cell' +
                            (col === currentStep ? ' playhead' : '') +
                            (col % STEPS_PER_BAR === 0 ? ' bar-line' : col % 4 === 0 ? ' beat-line' : '')
                          }
                          onPointerDown={e => handleCellPointerDown(col, noteStep, e)}
                        />
                      ))}
                      {/* Note blocks (visual overlay) */}
                      {rowNotes.map(note => (
                        <div
                          key={note.id}
                          className={
                            'note-block' +
                            (currentStep >= note.col && currentStep < note.col + note.len ? ' sounding' : '')
                          }
                          style={{
                            left: `calc(${note.col} * var(--cell-w))`,
                            width: `calc(${note.len} * var(--cell-w) - 1px)`,
                          }}
                        />
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
