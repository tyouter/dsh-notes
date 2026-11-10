/**
 * The notebook's bridge to the Host's speech recognition.
 *
 * The notebook does not recognise anything itself. It asks `speechToText` — the same registry the built-in
 * voice input uses — for the recognizer the user already selected, and hands it the audio the browser
 * recorded. When the voice bundle is not enabled the service is absent and the panel shows no microphone at
 * all, which is the "automatic" part: enabling voice input in DSH is what turns it on here.
 */

/** PCM16 WAV, 16 kHz mono: the one shape the Host recognizers accept. */
export const SPEECH_SAMPLE_RATE = 16000

/** Shown to the panel when there is nothing to talk to, so it can stay quiet instead of failing. */
const UNAVAILABLE = { available: false, providers: [], selection: null }

/**
 * A WAV the recognizer will accept, or a reason it will not.
 *
 * The browser is the only source of this audio, so the header is a sanity check rather than a security
 * boundary — but a blob that is not a WAV would otherwise travel to a provider and fail there with a much
 * less useful message.
 */
export function readWavHeader(bytes) {
  const audio = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes ?? [])
  if (audio.length < 44) return { ok: false, reason: 'too-short' }
  const text = (at) => String.fromCharCode(audio[at], audio[at + 1], audio[at + 2], audio[at + 3])
  if (text(0) !== 'RIFF' || text(8) !== 'WAVE') return { ok: false, reason: 'not-wav' }
  const view = new DataView(audio.buffer, audio.byteOffset, audio.byteLength)
  const channels = view.getUint16(22, true)
  const sampleRate = view.getUint32(24, true)
  const bits = view.getUint16(34, true)
  if (channels !== 1 || bits !== 16 || sampleRate !== SPEECH_SAMPLE_RATE) {
    return { ok: false, reason: 'wrong-format', channels, sampleRate, bits }
  }
  const dataBytes = view.getUint32(40, true)
  return { ok: true, seconds: dataBytes / (sampleRate * channels * (bits / 8)) }
}

/** Decode the panel's base64 without relying on a browser-only decoder. */
export function decodeBase64(value) {
  const text = String(value ?? '')
  if (text === '') return new Uint8Array(0)
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(text, 'base64'))
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export class SpeechBridge {
  constructor(ctx) {
    this.ctx = ctx
  }

  /** The Host registry, or undefined when the voice bundle is off. */
  service() {
    try {
      return this.ctx?.get?.('speechToText') ?? this.ctx?.speechToText
    } catch {
      return undefined
    }
  }

  /** What the panel needs to decide whether to draw a microphone. */
  state() {
    const service = this.service()
    if (service === undefined || service === null || typeof service.snapshot !== 'function') {
      return { ...UNAVAILABLE, reason: 'no-service' }
    }
    let snapshot = {}
    try {
      snapshot = service.snapshot() ?? {}
    } catch (error) {
      return { ...UNAVAILABLE, reason: 'snapshot-failed', message: String(error?.message ?? error) }
    }
    const providers = (Array.isArray(snapshot.providers) ? snapshot.providers : []).map((provider) => ({
      id: String(provider?.id ?? ''),
      name: String(provider?.name ?? ''),
      languages: Array.isArray(provider?.languages) ? provider.languages.map(String) : [],
      phase: String(provider?.preparation?.phase ?? 'ready'),
    }))
    return {
      available: providers.length > 0,
      providers,
      selection: snapshot.selection ?? null,
      reason: providers.length > 0 ? undefined : 'no-provider',
    }
  }

  /** Warm the selected recognizer (download/load); the panel shows the phase while this runs. */
  prepare() {
    const service = this.service()
    if (service === null || service === undefined || typeof service.prepare !== 'function') {
      throw Object.assign(new Error('语音识别不可用'), { code: 'SPEECH_UNAVAILABLE', status: 503 })
    }
    const selection = this.state().selection
    if (selection === null || selection === undefined || selection.providerId === undefined) {
      throw Object.assign(new Error('没有选中的识别器'), { code: 'SPEECH_NO_SELECTION', status: 409 })
    }
    service.prepare(selection.providerId)
    return this.state()
  }

  /**
   * Transcribe one recording with the recognizer the user chose in DSH.
   *
   * `language` is optional and usually omitted: the selection already carries the language the user picked
   * for voice input, and passing nothing is how the notebook stays consistent with it.
   */
  async transcribe({ audioBase64, language } = {}) {
    const service = this.service()
    if (service === null || service === undefined || typeof service.transcribe !== 'function') {
      throw Object.assign(new Error('语音识别不可用'), { code: 'SPEECH_UNAVAILABLE', status: 503 })
    }
    const audio = decodeBase64(audioBase64)
    const header = readWavHeader(audio)
    if (header.ok !== true) {
      throw Object.assign(new Error(`录音格式不对：${header.reason}`), { code: 'SPEECH_BAD_AUDIO', status: 400 })
    }
    const request = { audio }
    if (typeof language === 'string' && language.trim() !== '') request.language = language.trim()
    const spec = service.resolve(request)
    const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(120000) : undefined
    const transcript = await service.transcribe(spec, signal)
    const text = String(transcript?.text ?? '').trim()
    if (text === '') {
      throw Object.assign(new Error('没有识别出文字'), { code: 'SPEECH_EMPTY', status: 422 })
    }
    return {
      text,
      audioSeconds: Number(transcript?.audioSeconds ?? header.seconds ?? 0),
      inferenceSeconds: Number(transcript?.inferenceSeconds ?? 0),
    }
  }
}
