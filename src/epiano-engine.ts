import { epianoData } from './epiano-data'

const NVOICES = 32
const SILENCE = 0.0001
const SUSTAIN = 128

interface Voice {
  delta: number
  frac: number
  pos: number
  end: number
  loop: number
  env: number
  dec: number
  f0: number
  f1: number
  ff: number
  outl: number
  outr: number
  note: number
}

interface KeyGroup {
  root: number
  high: number
  pos: number
  end: number
  loop: number
}

function createVoice(): Voice {
  return {
    delta: 0, frac: 0, pos: 0, end: 0, loop: 0,
    env: 0, dec: 0.99, f0: 0, f1: 0, ff: 0,
    outl: 0, outr: 0, note: 0,
  }
}

export interface EPianoParams {
  envelopeDecay: number
  envelopeRelease: number
  hardness: number
  trebleBoost: number
  modulation: number
  lfoRate: number
  velocitySense: number
  stereoWidth: number
  fineTuning: number
  randomTuning: number
  overdrive: number
}

export const DEFAULT_PARAMS: EPianoParams = {
  envelopeDecay: 0.5,
  envelopeRelease: 0.5,
  hardness: 0.5,
  trebleBoost: 0.5,
  modulation: 0.5,
  lfoRate: 0.65,
  velocitySense: 0.25,
  stereoWidth: 0.5,
  fineTuning: 0.5,
  randomTuning: 0.146,
  overdrive: 0,
}

export const PARAM_DEFS: { key: keyof EPianoParams; label: string }[] = [
  { key: 'envelopeDecay', label: 'Envelope Decay' },
  { key: 'envelopeRelease', label: 'Envelope Release' },
  { key: 'hardness', label: 'Hardness' },
  { key: 'trebleBoost', label: 'Treble Boost' },
  { key: 'modulation', label: 'Modulation' },
  { key: 'lfoRate', label: 'LFO Rate' },
  { key: 'velocitySense', label: 'Velocity Sense' },
  { key: 'stereoWidth', label: 'Stereo Width' },
  { key: 'fineTuning', label: 'Fine Tuning' },
  { key: 'randomTuning', label: 'Random Tuning' },
  { key: 'overdrive', label: 'Overdrive' },
]

export class EPianoEngine {
  private ctx: AudioContext | null = null
  private scriptNode: ScriptProcessorNode | null = null

  private waves: Int16Array
  private kgrp: KeyGroup[] = []
  private voice: Voice[] = []
  private activevoices = 0
  private sustain = 0

  private Fs = 44100
  private iFs = 1.0 / 44100

  // Parameters (default preset)
  params: EPianoParams = { ...DEFAULT_PARAMS }

  // Internal state
  private treb = 0
  private tfrq = 0
  private tl = 0
  private tr = 0
  private lfo0 = 0
  private lfo1 = 1
  private dlfo = 0
  private lmod = 0
  private rmod = 0
  private width = 0
  private volume = 0.2
  private muff = 160
  private muffvel = 1.25
  private sizevel = 0
  private velsens = 1
  private size = 0
  private overdriveAmount = 0
  private random = 0

  constructor() {
    this.waves = new Int16Array(epianoData.length)
    this.waves.set(epianoData)

    // Initialize keygroups
    for (let i = 0; i < 34; i++) {
      this.kgrp.push({ root: 0, high: 0, pos: 0, end: 0, loop: 0 })
    }

    // Keygroup mapping (root and high notes)
    const roots = [
      [0, 36, 39], [3, 43, 45], [6, 48, 51], [9, 55, 57],
      [12, 60, 63], [15, 67, 69], [18, 72, 75], [21, 79, 81],
      [24, 84, 87], [27, 91, 93], [30, 96, 999],
    ]
    for (const [idx, root, high] of roots) {
      this.kgrp[idx].root = root
      this.kgrp[idx].high = high
    }

    // Sample positions
    const positions: [number, number, number, number][] = [
      [0, 0, 8476, 4400], [1, 8477, 16248, 4903], [2, 16249, 34565, 6398],
      [3, 34566, 41384, 3938], [4, 41385, 45760, 1633], [5, 45761, 65211, 5245],
      [6, 65212, 72897, 2937], [7, 72898, 78626, 2203], [8, 78627, 100387, 6368],
      [9, 100388, 116297, 10452], [10, 116298, 127661, 5217], [11, 127662, 144113, 3099],
      [12, 144114, 152863, 4284], [13, 152864, 173107, 3916], [14, 173108, 192734, 2937],
      [15, 192735, 204598, 4732], [16, 204599, 218995, 4733], [17, 218996, 233801, 2285],
      [18, 233802, 248011, 4098], [19, 248012, 265287, 4099], [20, 265288, 282255, 3609],
      [21, 282256, 293776, 2446], [22, 293777, 312566, 6278], [23, 312567, 330200, 2283],
      [24, 330201, 348889, 2689], [25, 348890, 365675, 4370], [26, 365676, 383661, 5225],
      [27, 383662, 393372, 2811], [28, 383662, 393372, 2811],
      [29, 393373, 406045, 4522], [30, 406046, 414486, 2306], [31, 406046, 414486, 2306],
      [32, 414487, 422408, 2169],
    ]
    for (const [idx, pos, end, loop] of positions) {
      this.kgrp[idx].pos = pos
      this.kgrp[idx].end = end
      this.kgrp[idx].loop = loop
    }

    // Crossfade looping
    for (let k = 0; k < 28; k++) {
      let p0 = this.kgrp[k].end
      let p1 = this.kgrp[k].end - this.kgrp[k].loop
      let xf = 1.0
      const dxf = -0.02
      while (xf > 0.0) {
        this.waves[p0] = Math.round((1.0 - xf) * this.waves[p0] + xf * this.waves[p1])
        p0--
        p1--
        xf += dxf
      }
    }

    // Initialize voices
    for (let v = 0; v < NVOICES; v++) {
      this.voice.push(createVoice())
    }
  }

  updateInternalParams() {
    const p = this.params
    this.size = Math.round(12.0 * p.hardness - 6.0)
    this.treb = 4.0 * p.trebleBoost * p.trebleBoost - 1.0
    this.tfrq = p.trebleBoost > 0.5 ? 14000.0 : 5000.0
    this.tfrq = 1.0 - Math.exp(-this.iFs * this.tfrq)

    this.rmod = this.lmod = p.modulation + p.modulation - 1.0
    if (p.modulation < 0.5) this.rmod = -this.rmod

    this.dlfo = 6.283 * this.iFs * Math.exp(6.22 * p.lfoRate - 2.61)
    this.velsens = 1.0 + p.velocitySense + p.velocitySense
    if (p.velocitySense < 0.25) this.velsens -= 0.75 - 3.0 * p.velocitySense

    this.width = 0.03 * p.stereoWidth
    this.poly = 32
    this.fine = p.fineTuning - 0.5
    this.random = 0.077 * p.randomTuning
    this.overdriveAmount = 1.8 * p.overdrive
  }

  setParam(key: keyof EPianoParams, value: number) {
    this.params[key] = value
    this.updateInternalParams()
  }

  start() {
    if (this.ctx) return

    this.ctx = new AudioContext()
    this.Fs = this.ctx.sampleRate
    this.iFs = 1.0 / this.Fs
    this.updateInternalParams()

    // Use ScriptProcessorNode for direct DSP
    const bufferSize = 1024
    this.scriptNode = this.ctx.createScriptProcessor(bufferSize, 0, 2)
    this.scriptNode.onaudioprocess = (e) => this.process(e)
    this.scriptNode.connect(this.ctx.destination)
  }

  private process(e: AudioProcessingEvent) {
    const outL = e.outputBuffer.getChannelData(0)
    const outR = e.outputBuffer.getChannelData(1)
    const frames = e.outputBuffer.length
    const od = this.overdriveAmount

    for (let s = 0; s < frames; s++) {
      let l = 0, r = 0

      for (let v = 0; v < this.activevoices; v++) {
        const V = this.voice[v]

        // Integer-based linear interpolation
        V.frac += V.delta
        V.pos += V.frac >> 16
        V.frac &= 0xFFFF

        if (V.pos > V.end) V.pos -= V.loop

        // Linear interpolation between samples
        const i = this.waves[V.pos] +
          ((V.frac * (this.waves[V.pos + 1] - this.waves[V.pos])) >> 16)
        let x = V.env * i / 32768.0

        // Envelope decay
        V.env = V.env * V.dec

        // Overdrive
        if (x > 0.0) {
          x -= od * x * x
          if (x < -V.env) x = -V.env
        }

        // First-order LPF (muffle)
        V.f0 += V.ff * (x - V.f0)
        x = V.f0

        l += V.outl * x
        r += V.outr * x
      }

      // Treble boost
      this.tl += this.tfrq * (l - this.tl)
      this.tr += this.tfrq * (r - this.tr)
      r += this.treb * (r - this.tr)
      l += this.treb * (l - this.tl)

      // LFO for tremolo/autopan
      this.lfo0 += this.dlfo * this.lfo1
      this.lfo1 -= this.dlfo * this.lfo0
      l += l * this.lmod * this.lfo1
      r += r * this.rmod * this.lfo1

      outL[s] = l
      outR[s] = r
    }

    // Anti-denormal
    if (Math.abs(this.tl) < 1.0e-10) this.tl = 0
    if (Math.abs(this.tr) < 1.0e-10) this.tr = 0

    // Remove silent voices
    for (let v = 0; v < this.activevoices; v++) {
      if (this.voice[v].env < SILENCE) {
        this.voice[v] = { ...this.voice[--this.activevoices] }
      }
    }
  }

  noteOn(note: number, velocity: number) {
    if (!this.ctx) this.start()

    if (velocity > 0) {
      let vl = 0

      if (this.activevoices < this.poly) {
        vl = this.activevoices
        this.activevoices++
        this.voice[vl].f0 = this.voice[vl].f1 = 0
      } else {
        // Steal quietest voice
        let minEnv = 99
        for (let v = 0; v < this.poly; v++) {
          if (this.voice[v].env < minEnv) {
            minEnv = this.voice[v].env
            vl = v
          }
        }
      }

      const k2 = (note - 60) * (note - 60)
      let l = this.fine + this.random * ((k2 % 13) - 6.5)

      let s = this.size
      let k = 0
      while (note > (this.kgrp[k].high + s)) k += 3 // find keygroup

      l += note - this.kgrp[k].root // pitch
      l = 32000.0 * this.iFs * Math.exp(0.05776226505 * l)
      this.voice[vl].delta = Math.round(65536.0 * l)
      this.voice[vl].frac = 0

      if (velocity > 48) k++ // mid velocity sample
      if (velocity > 80) k++ // high velocity sample
      this.voice[vl].pos = this.kgrp[k].pos
      this.voice[vl].end = this.kgrp[k].end - 1
      this.voice[vl].loop = this.kgrp[k].loop

      // Velocity
      this.voice[vl].env = (3.0 + 2.0 * this.velsens) *
        Math.pow(0.0078 * velocity, this.velsens)

      // High notes quieter
      if (note > 60) {
        this.voice[vl].env *= Math.exp(0.01 * (60 - note))
      }

      // Muffle filter
      l = 50.0 + this.params.modulation * this.params.modulation * this.muff +
        this.muffvel * (velocity - 64)
      if (l < (55.0 + 0.4 * note)) l = 55.0 + 0.4 * note
      if (l > 210.0) l = 210.0
      this.voice[vl].ff = l * l * this.iFs

      // Stereo panning based on note position
      this.voice[vl].note = note
      let n = note
      if (n < 12) n = 12
      if (n > 108) n = 108
      const vol = this.volume
      this.voice[vl].outr = vol + vol * this.width * (n - 60)
      this.voice[vl].outl = vol + vol - this.voice[vl].outr

      // Decay rate
      if (n < 44) n = 44
      this.voice[vl].dec = Math.exp(
        -this.iFs * Math.exp(-1.0 + 0.03 * n - 2.0 * this.params.envelopeDecay)
      )
    } else {
      // Note off
      for (let v = 0; v < NVOICES; v++) {
        if (this.voice[v].note === note) {
          if (this.sustain === 0) {
            this.voice[v].dec = Math.exp(
              -this.iFs * Math.exp(6.0 + 0.01 * note - 5.0 * this.params.envelopeRelease)
            )
          } else {
            this.voice[v].note = SUSTAIN
          }
        }
      }
    }
  }

  noteOff(note: number) {
    this.noteOn(note, 0)
  }

  setSustain(on: boolean) {
    this.sustain = on ? 64 : 0
    if (!on) {
      this.noteOn(SUSTAIN, 0) // release all sustained notes
    }
  }

  resume() {
    if (this.ctx?.state === 'suspended') {
      this.ctx.resume()
    }
  }

  dispose() {
    this.scriptNode?.disconnect()
    this.ctx?.close()
    this.ctx = null
    this.scriptNode = null
  }
}
