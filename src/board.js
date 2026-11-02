    // ------------------------------------------------------------- charts ---
    //
    // The dashboard draws its own charts from data. Every renderer here takes a
    // validated `{ label, value }` series, which is why the model may propose
    // charts but can never inject markup: it can only produce numbers.

    /** Shared geometry: the widest label drives the gutter. */
    function barGeometry(data, width) {
      const rows = Array.isArray(data) ? data : []
      const max = rows.reduce((peak, row) => Math.max(peak, Number(row.value) || 0), 0) || 1
      return { rows, max, width }
    }

    /** Horizontal bars: readable for both 30 days and a tag ranking. */
    function BarChart({ data, height = 190 }) {
      const { rows, max } = barGeometry(data)
      if (rows.length === 0) return h('div', { className: 'dshn-cap' }, '暂无数据')
      return h(
        'div',
        { className: 'dshn-bars', style: { maxHeight: `${height}px` } },
        ...rows.map((row, index) =>
          h(
            'div',
            { key: `${row.label}-${index}`, className: 'dshn-bar-row' },
            h('span', { className: 'dshn-bar-label', title: row.label }, row.label),
            h(
              'span',
              { className: 'dshn-bar-track' },
              h('span', {
                className: 'dshn-bar-fill',
                style: { width: `${Math.max(2, Math.round((Number(row.value) / max) * 100))}%` },
              }),
            ),
            h('span', { className: 'dshn-bar-value' }, String(row.value)),
          ),
        ),
      )
    }

    /** A line for ordered series (a month of days). */
    function LineChart({ data, height = 96 }) {
      const rows = Array.isArray(data) ? data : []
      if (rows.length < 2) return h(BarChart, { data: rows, height })
      const max = rows.reduce((peak, row) => Math.max(peak, Number(row.value) || 0), 0) || 1
      const width = 100
      const points = rows.map((row, index) => {
        const x = (index / (rows.length - 1)) * width
        const y = height - (Number(row.value) / max) * (height - 8) - 2
        return `${x.toFixed(2)},${y.toFixed(2)}`
      })
      return h(
        'svg',
        {
          className: 'dshn-line',
          viewBox: `0 0 ${width} ${height}`,
          preserveAspectRatio: 'none',
          role: 'img',
          'aria-label': '趋势',
        },
        h('polyline', {
          points: points.join(' '),
          fill: 'none',
          stroke: 'var(--dsw-alias-brand-primary)',
          strokeWidth: 1.4,
          vectorEffect: 'non-scaling-stroke',
          strokeLinejoin: 'round',
        }),
      )
    }

    /** A donut for shares; the legend carries the numbers. */
    function PieChart({ data }) {
      const rows = (Array.isArray(data) ? data : []).filter((row) => Number(row.value) > 0)
      const total = rows.reduce((sum, row) => sum + Number(row.value), 0)
      if (total === 0) return h('div', { className: 'dshn-cap' }, '暂无数据')
      const radius = 36
      const circumference = 2 * Math.PI * radius
      let offset = 0
      return h(
        'div',
        { className: 'dshn-pie' },
        h(
          'svg',
          { viewBox: '0 0 100 100', className: 'dshn-pie-svg', role: 'img', 'aria-label': '占比' },
          ...rows.map((row, index) => {
            const share = Number(row.value) / total
            const dash = share * circumference
            const circle = h('circle', {
              key: `${row.label}-${index}`,
              cx: 50,
              cy: 50,
              r: radius,
              fill: 'none',
              stroke: `var(--dshn-series-${index % 6})`,
              strokeWidth: 13,
              strokeDasharray: `${dash} ${circumference - dash}`,
              strokeDashoffset: -offset,
              transform: 'rotate(-90 50 50)',
            })
            offset += dash
            return circle
          }),
        ),
        h(
          'div',
          { className: 'dshn-pie-legend' },
          ...rows.map((row, index) =>
            h(
              'span',
              { key: `${row.label}-${index}`, className: 'dshn-legend-item' },
              h('span', { className: 'dshn-legend-dot', style: { background: `var(--dshn-series-${index % 6})` } }),
              `${row.label} ${row.value}`,
            ),
          ),
        ),
      )
    }

    /**
     * A contribution matrix, GitHub style.
     *
     * One column per week, one cell per day, intensity by count. Month labels sit
     * above the columns where the month changes, weekday labels on the left. The
     * data arrives as a flat, Sunday-aligned series, so the renderer needs no date
     * arithmetic beyond padding the first column.
     */
    function Heatmap({ data }) {
      const cells = Array.isArray(data) ? data : []
      if (cells.length === 0) return h('div', { className: 'dshn-cap' }, '暂无数据')

      const firstWeekday = new Date(cells[0].label).getDay()
      // Pad the leading column so the seventh row is always Saturday.
      const padded = [...Array(Number.isFinite(firstWeekday) ? firstWeekday : 0).fill(null), ...cells]
      const weeks = []
      for (let index = 0; index < padded.length; index += 7) weeks.push(padded.slice(index, index + 7))

      // Quartile thresholds over the non-zero days, as GitHub does: the ramp then
      // describes this notebook's distribution instead of its maximum.
      const counts = cells.map((cell) => cell.value).filter((value) => value > 0).sort((left, right) => left - right)
      const at = (fraction) => (counts.length === 0 ? 0 : counts[Math.min(counts.length - 1, Math.floor(counts.length * fraction))])
      const thresholds = [at(0.25), at(0.5), at(0.75)]
      const flat = counts.length > 0 && counts[0] === counts[counts.length - 1]
      const peak = counts.length === 0 ? 0 : counts[counts.length - 1]
      const levelOf = (value) => {
        if (value <= 0) return 0
        // One shade for every day when they all carry the same count.
        if (flat) return 2
        // The busiest day is always the darkest, which a strictly-greater quartile
        // comparison would otherwise never reach.
        if (value >= peak) return 4
        let level = 1
        for (const threshold of thresholds) if (value > threshold) level += 1
        return level
      }

      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      const monthAt = []
      let previousMonth = ''
      for (const [index, week] of weeks.entries()) {
        const first = week.find((cell) => cell !== null)
        const month = first === undefined ? '' : String(first.label).slice(5, 7)
        if (month !== '' && month !== previousMonth) {
          monthAt[index] = monthNames[Number(month) - 1] ?? ''
          previousMonth = month
        }
      }

      const weekdayLabels = ['', 'Mon', '', 'Wed', '', 'Fri', '']

      return h(
        'div',
        { className: 'dshn-heat' },
        h(
          'div',
          { className: 'dshn-heat-scroll' },
          h(
            'div',
            { className: 'dshn-heat-months' },
            ...weeks.map((week, index) =>
              h('span', { key: 'm' + index, className: 'dshn-heat-month' }, monthAt[index] ?? ''),
            ),
          ),
          h(
            'div',
            { className: 'dshn-heat-body' },
            h(
              'div',
              { className: 'dshn-heat-days' },
              ...weekdayLabels.map((label, index) => h('span', { key: 'd' + index, className: 'dshn-heat-day' }, label)),
            ),
            h(
              'div',
              { className: 'dshn-heat-weeks' },
              ...weeks.map((week, weekIndex) =>
                h(
                  'div',
                  { key: 'w' + weekIndex, className: 'dshn-heat-col' },
                  ...week.map((cell, dayIndex) =>
                    h('span', {
                      key: dayIndex,
                      className: 'dshn-heat-cell',
                      'data-level': cell === null ? 'blank' : String(levelOf(cell.value)),
                      title: cell === null ? '' : cell.label + ' · ' + cell.value,
                    }),
                  ),
                ),
              ),
            ),
          ),
        ),
        h(
          'div',
          { className: 'dshn-heat-legend' },
          h('span', { className: 'dshn-cap' }, 'Less'),
          ...[0, 1, 2, 3, 4].map((level) =>
            h('span', { key: level, className: 'dshn-heat-cell', 'data-level': String(level) }),
          ),
          h('span', { className: 'dshn-cap' }, 'More'),
        ),
      )
    }

    /** One number, big: the "stat" chart type. */
    function StatChart({ data }) {
      const first = Array.isArray(data) && data.length > 0 ? data[0] : undefined
      const value = first === undefined ? '—' : String(first.value)
      return h(
        'div',
        { className: 'dshn-stat' },
        h('span', { className: 'dshn-stat-value' }, value),
        h('span', { className: 'dshn-stat-label' }, first?.label ?? ''),
      )
    }

    /** Dispatch on the validated type; unknown types fall back to bars. */
    function Chart({ chart, onRemove, wide }) {
      const type = String(chart?.type ?? 'bar')
      const body =
        type === 'heatmap' ? h(Heatmap, { data: chart.data })
          : type === 'line' ? h(LineChart, { data: chart.data })
          : type === 'pie' ? h(PieChart, { data: chart.data })
            : type === 'stat' ? h(StatChart, { data: chart.data })
              : h(BarChart, { data: chart.data })
      return h(
        'div',
        { className: 'dshn-chart', 'data-wide': wide === true ? 'true' : undefined },
        h(
          'div',
          { className: 'dshn-chart-head' },
          h('span', { className: 'dshn-chart-title' }, chart.title ?? '图表'),
          chart.note ? h('span', { className: 'dshn-cap' }, chart.note) : null,
          h('span', { className: 'dshn-grow' }),
          onRemove === undefined
            ? null
            : h(
                'button',
                { className: 'dshn-icon-btn', title: '移除', 'aria-label': '移除', onClick: () => onRemove(chart) },
                '×',
              ),
        ),
        h('div', { className: 'dshn-chart-body' }, body),
        chart.source ? h('div', { className: 'dshn-chart-source' }, chart.source) : null,
      )
    }

    /**
     * Keeps a failure inside the conversation visible.
     *
     * The native shell deciding not to render is indistinguishable from a blank
     * column without this, and a blank column is exactly what makes this hard to
     * diagnose.
     */
    class ChatBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
      }

      static getDerivedStateFromError(error) {
        return { error }
      }

      render() {
        if (this.state.error !== null) {
          const message = this.props.failureLabel + ' ' + String(this.state.error?.message ?? this.state.error)
          return h('div', { className: 'dshn-err', style: { padding: '8px 4px' } }, message)
        }
        return this.props.children
      }
    }

    /**
     * The capture box, shared by the 记录 tab and the board's quick-note pane.
     *
     * One implementation on purpose: the quick pane is supposed to be "the capture
     * page, in smaller space". Duplicating it is how the structuring button went
     * missing the first time.
     */
    function CaptureBox(props) {
      const t = props.t
      const [draft, setDraft] = useState('')
      const [enhance, setEnhance] = useState(null)
      const [enhancing, setEnhancing] = useState(false)
      const [enhanceSeconds, setEnhanceSeconds] = useState(0)
      const [formatSeconds, setFormatSeconds] = useState(0)
      const [streaming, setStreaming] = useState('')
      const [enhanceError, setEnhanceError] = useState('')
      const [status, setStatus] = useState('')
      // Target language for the structured result; '' means "follow the source".
      const [targetLang, setTargetLang] = useState(() => storedTargetLanguage())
      // No mode: the textarea is the source, and a rendered mirror below it updates
      // live. Nothing has to be clicked to see the result.
      // Format rewrites the text in place, so its result has to survive until save.
      const [pendingTags, setPendingTags] = useState('')
      // Translation happens on the structured draft, right before saving.
      const [translating, setTranslating] = useState(false)
      // Elapsed seconds while translating: a slow first token must still show progress.
      const [translateSeconds, setTranslateSeconds] = useState(0)
      // The in-flight structuring/format call, so it can be cancelled.
      const abortRef = useRef(null)
      // The highlight layer behind the textarea; kept in sync so the mark stays under the
      // right characters when the text scrolls.
      const marksRef = useRef(null)
      // A Format proposal: shown in the render area until applied or discarded, so the
      // source stays the single place you edit.
      // A translation made from the preview: the note itself is only replaced on Apply.
      const [preview, setPreview] = useState(null)
      // Which call is running ("structure" / "translate"), and a counter that changes whenever a
      // result lands — the counter is the wipe animation's key.
      const [busy, setBusy] = useState('')
      const [wipe, setWipe] = useState(0)
      // The preview is derived from the draft on every render, so there is no Format state.
      // The textarea's current selection, used to format just that part.
      const [selected, setSelected] = useState({ start: 0, end: 0 })

      const flash = (label) => {
        setStatus(label)
        setTimeout(() => setStatus(''), 1600)
      }

      const saveDraft = async () => {
        // The preview page shows the laid-out note, so that is what gets stored; writing the raw
        // text would make the promise on the right untrue.
        const body = formatLocally(draft).trim()
        if (body === '') return
        setStatus(t.saving)
        try {
          await post('/note', { body: draft, tags: parseTags(pendingTags), source: 'panel' })
          setDraft('')
          flash(t.saved)
          await props.onSaved?.()
        } catch (problem) {
          setStatus('')
          setEnhanceError(String(problem?.message ?? problem))
        }
      }

      /** One streamed rewrite: the card appears at once and fills as tokens land. */
      /**
       * Ask once more, naming the defects.
       *
       * Streaming gives the fastest first answer; when that answer is not up to standard this
       * second, non-streamed request carries the specific problems, and its result is used if it is
       * cleaner. A failed repair keeps the first answer, so the user is never left with nothing.
       */
      const repairStructure = async (issues, acceptFirst) => {
        const range = editorRange()
        const source = (range === null ? draft : draft.slice(range.start, range.end)).trim()
        try {
          const data = await post('/enhance', {
            text: source,
            instruction: '上一版有以下问题，请修正后重新输出整篇：\n- ' + issues.join('\n- '),
          })
          const repaired = data?.draft
          const body = String(repaired?.body ?? '').trim()
          if (body === '') {
            acceptFirst()
            return
          }
          const span = range === null ? draft : draft.slice(range.start, range.end)
          const cleaned = repairCoverage(span, preserveMarkup(span, body))
          const repairedTitle = String(repaired?.title ?? '')
          const composedRepair = range === null ? composeFormattedNote(repairedTitle, cleaned) : preserveLabel(span, cleaned)
          const remaining = typographyIssues(span, composedRepair, { title: repairedTitle })
          // A repair that is not better than the first answer is discarded.
          if (remaining.length >= issues.length) {
            acceptFirst()
            return
          }
          setWipe((current) => current + 1)
          setEnhance({
            title: range === null ? String(repaired?.title ?? '') : '',
            body: range === null ? composeFormattedNote(String(repaired?.title ?? ''), cleaned) : preserveLabel(span, cleaned),
            tags: Array.isArray(repaired?.tags) ? repaired.tags.join(', ') : '',
            notes: Array.isArray(repaired?.notes) ? repaired.notes : [],
            range,
            keepSource: false,
            sentChars: source.length,
            draftText: composeFormattedNote(String(repaired?.title ?? ''), cleaned),
          })
          setStreaming('')
        } catch {
          acceptFirst()
        }
      }

      const runEnhance = async () => {
        // Same rule as Format: one helper decides the span.
        const range = editorRange()
        const source = range === null ? draft : draft.slice(range.start, range.end)
        const text = source.trim()
        if (text === '' || enhancing) return
        const startedAt = Date.now()
        // No target language here on purpose: structuring keeps the note's own language. The
        // picker only feeds Translate, and passing it here produced an English title above a
        // Chinese body.
        setEnhancing(true)
        setBusy('structure')
        setEnhanceSeconds(0)
        setEnhanceError('')
        setEnhance(null)
        setStreaming('')
        const ticker = setInterval(() => setEnhanceSeconds(Math.round((Date.now() - startedAt) / 1000)), 250)
        const signal = beginCall()
        try {
          await streamEvents('/enhance/stream', { text }, (event, payload) => {
            if (event === 'delta') {
              // Deltas still arrive (that is how the call is tracked); they are not painted: a
              // half-written answer reads as broken Markdown.
              return
            }
            if (event === 'error') {
              setEnhanceError(String(payload?.message ?? t.enhanceFailed))
              return
            }
            if (event === 'done') {
              const parsed = payload?.draft ?? {}
              const rawTitle = String(parsed.title ?? '')
              // Re-attach markers the model dropped (## headings, > quotes, - bullets) using the
              // text that was sent, so a plain-text heading cannot silently replace a real one.
              const sourceSpan = range === null ? draft : draft.slice(range.start, range.end)
              // Markup first, then re-insert any source line the rewrite dropped: the result must
              // contain everything the author wrote, without asking the user to notice.
              const rawBody = repairCoverage(sourceSpan, preserveMarkup(sourceSpan, String(parsed.body ?? '')))
              // Check what the user would apply: the body alone is missing the title line by design.
              const composedCheck = range === null ? composeFormattedNote(rawTitle, rawBody) : preserveLabel(sourceSpan, rawBody)
              const issues = typographyIssues(sourceSpan, composedCheck, { title: rawTitle })
              const accept = (body) => {
                // The key changes here, so the reveal animation runs once on the new text.
                setWipe((current) => current + 1)
                setEnhance({
                  // A ranged result has no separate title: the source's label stands in for it.
                  title: range === null ? rawTitle : '',
                  body,
                  tags: Array.isArray(parsed.tags) ? parsed.tags.join(', ') : '',
                  notes: Array.isArray(parsed.notes) ? parsed.notes : [],
                  range,
                  keepSource: false,
                  sentChars: text.length,
                  draftText: composeFormattedNote(rawTitle, body),
                })
                setStreaming('')
                setStatus(t.translated === undefined ? '' : '')
              }
              if (issues.length === 0) {
                accept(range === null ? composeFormattedNote(rawTitle, rawBody) : preserveLabel(draft.slice(range.start, range.end), rawBody))
                return
              }
              // Say what was wrong and ask once more; the second answer replaces the first.
              void repairStructure(issues, () => accept(range === null ? composeFormattedNote(rawTitle, rawBody) : preserveLabel(draft.slice(range.start, range.end), rawBody)))
            }
          })
        } catch (problem) {
          setEnhanceError(problem?.name === 'AbortError' ? t.enhanceStopped : String(problem?.message ?? problem))
        } finally {
          endCall()
          clearInterval(ticker)
          setEnhancing(false)
          setBusy('')
          setStreaming('')
        }
      }

      /**
       * One-click Format.
       *
       * Formats the selection when there is one, otherwise the whole draft, and keeps
       * the answer as a proposal. The source is never touched here: Apply is what
       * writes a proposal back, which is also what makes "format again" safe.
       */
      /**
       * The range a structured action should work on.
       *
       * One implementation for both actions, so Format and Structure can never disagree
       * about what "the selection" means.
       */
      const editorRange = () =>
        selected.end > selected.start ? { start: selected.start, end: selected.end } : null

      /** Cancel whatever structured call is running. */
      const stopStructured = () => {
        const controller = abortRef.current
        abortRef.current = null
        if (controller !== null && controller !== undefined) controller.abort()
      }

      const beginCall = () => {
        stopStructured()
        const controller = new AbortController()
        abortRef.current = controller
        return controller.signal
      }

      const endCall = () => {
        abortRef.current = null
      }

      /**
       * Translate the structuring draft.
       *
       * This is the only translation entry point: there is no "translate the source" path.
       * The draft is what gets translated, and the translation replaces the draft's body, so
       * Apply / Save as note then operate on the translation. Deltas paint as they arrive.
       */
      const runTranslate = async () => {
        if (enhance === null || translating) return
        const structureRange = enhance.range !== null && enhance.range !== undefined ? enhance.range : null
        const partial = structureRange !== null
        const sourceText = enhance.body.trim()
        if (sourceText === '') return
        const target = resolveTranslateTarget(
          TARGET_LANGUAGES.find((entry) => entry.id === targetLang)?.value ?? '',
          sourceText,
        )
        const spanText = structureRange === null ? '' : draft.slice(structureRange.start, structureRange.end)
        const latinTarget = /^[A-Za-z]/.test(target)
        const finish = (raw) => {
          if (partial) return normalizeTranslatedLabel(spanText, raw)
          // The structuring draft is the template: it knows how deep every item was, so the
          // translation keeps its hierarchy instead of collapsing into one flat sequence.
          return renumberByTemplate(enhance.draftText ?? enhance.body, raw, { latin: latinTarget })
        }

        setTranslating(true)
        setBusy('translate')
        setTranslateSeconds(0)
        setEnhanceError('')
        const ticker = setInterval(() => setTranslateSeconds((current) => current + 1), 1000)
        const signal = beginCall()
        let buffer = ''
        let lastPaint = 0
        // Set when the indexed request is rejected, so the next pass uses the plain-text form.
        let rejectedIndexed = false

        const handler = (event, payload) => {
          if (event === 'delta') {
            // Buffered, not painted: the reveal animation shows the result as one movement.
            buffer += String(payload?.text ?? '').replace(/<<\d+>>\s?/g, '')
            return
          }
          if (event === 'error') {
            if (useIndexed === true) {
              rejectedIndexed = true
              return
            }
            setEnhanceError(String(payload?.message ?? t.enhanceFailed))
            return
          }
          if (event !== 'done') return
          const indexedLines = Array.isArray(payload?.lines) ? payload.lines : null
          const plain = String(payload?.text ?? '').trim()
          if (indexedLines === null && plain === '') return
          const assembled = indexedLines === null ? finish(plain) : finish(assembleIndexedLines(sourceText, indexedLines))
          setWipe((current) => current + 1)
          setEnhance({ ...enhance, title: '', body: assembled })
          setStatus(t.translated)
          setTimeout(() => setStatus(''), 1600)
        }

        // The draft goes out as numbered lines; a host without that mode rejects them, and the
        // same request is repeated as plain text so translation works before a restart.
        const draftLines = sourceText.split(/\r?\n/)
        let useIndexed = true
        try {
          for (let pass = 0; pass < 2; pass += 1) {
            rejectedIndexed = false
            buffer = ''
            await streamEvents(
              '/translate/stream',
              useIndexed
                ? { lines: draftLines, target, keepNumbering: partial }
                : { text: sourceText, target, keepNumbering: partial },
              handler,
              signal,
            )
            if (rejectedIndexed === true) {
              useIndexed = false
              setEnhanceError('')
              continue
            }
            break
          }
        } catch (problem) {
          setEnhanceError(problem?.name === 'AbortError' ? t.enhanceStopped : String(problem?.message ?? problem))
        } finally {
          endCall()
          clearInterval(ticker)
          setTranslating(false)
          setBusy('')
        }
      }

      /**
       * Translate what the preview shows: the selection when there is one, the whole note otherwise.
       *
       * This is the second translate entry point. The structuring draft has its own (it translates
       * the draft in place); this one works on the note as typed, because a user who never runs
       * Structure still needs to turn the note into another language.
       */
      const runPreviewTranslate = async () => {
        if (translating) return
        const range = editorRange()
        const span = range === null ? draft : draft.slice(range.start, range.end)
        const sourceText = span.trim()
        if (sourceText === '') return
        const target = resolveTranslateTarget(
          TARGET_LANGUAGES.find((entry) => entry.id === targetLang)?.value ?? '',
          sourceText,
        )
        setTranslating(true)
        setBusy('translate')
        setTranslateSeconds(0)
        setEnhanceError('')
        setPreview(null)
        const ticker = setInterval(() => setTranslateSeconds((current) => current + 1), 1000)
        const signal = beginCall()
        try {
          const lines = sourceText.split(/\r?\n/)
          await streamEvents(
            '/translate/stream',
            { lines, target, keepNumbering: range !== null },
            (event, payload) => {
              if (event === 'error') {
                setEnhanceError(String(payload?.message ?? t.enhanceFailed))
                return
              }
              if (event !== 'done') return
              const translatedLines = Array.isArray(payload?.lines) ? payload.lines : null
              const plain = String(payload?.text ?? '').trim()
              if (translatedLines === null && plain === '') return
              const resultText = translatedLines === null ? plain : assembleIndexedLines(sourceText, translatedLines)
              setWipe((current) => current + 1)
              setPreview({
                text: resultText,
                mode: range === null ? 'all' : 'selection',
                range,
              })
              setStatus(t.translated)
              setTimeout(() => setStatus(''), 1600)
            },
            signal,
          )
        } catch (problem) {
          setEnhanceError(problem?.name === 'AbortError' ? t.enhanceStopped : String(problem?.message ?? problem))
        } finally {
          endCall()
          clearInterval(ticker)
          setTranslating(false)
          // Whatever happened, the running state has to end — this is the bug that left the chip
          // spinning forever.
          setBusy('')
        }
      }

      /** Write the preview translation back into the source. */
      const applyPreview = () => {
        if (preview === null) return
        if (preview.mode === 'selection' && preview.range !== null) {
          const { start, end } = preview.range
          setDraft(spliceRange(draft, start, end, preview.text))
          setSelected({ start, end: start + preview.text.length })
        } else {
          setDraft(preview.text)
          setSelected({ start: 0, end: 0 })
        }
        setPreview(null)
        setStatus(t.applied)
        setTimeout(() => setStatus(''), 1600)
      }

      /** Write a structuring result back into the source, replacing only its range. */
      const applyEnhance = () => {
        if (enhance === null) return
        // The body already contains the title line (whole note) or the source's label (range).
        const text = enhance.body
        if (enhance.range === null || enhance.range === undefined) {
          setDraft(text)
        } else {
          setDraft(draft.slice(0, enhance.range.start) + text + draft.slice(enhance.range.end))
        }
        if (enhance.tags !== '') setPendingTags(enhance.tags)
        setEnhance(null)
        setSelected({ start: 0, end: 0 })
        setStatus(t.applied)
        setTimeout(() => setStatus(''), 1600)
      }

      const saveEnhance = async () => {
        if (enhance === null) return
        const body = enhance.keepSource
          ? enhance.body +
            '\n\n---\n\n## 原始记录\n\n' +
            String(draft)
              .split(/\r?\n/)
              .map((line) => '> ' + line)
              .join('\n')
          : enhance.body
        try {
          await post('/note', { body, tags: parseTags(enhance.tags), source: 'ai' })
          setEnhance(null)
          setDraft('')
          flash(t.saved)
          await props.onSaved?.()
        } catch (problem) {
          setEnhanceError(String(problem?.message ?? problem))
        }
      }

      // The source page. The structured/format result renders in the preview page, so
      // there is nothing to place above or below the composer any more.
      // Highlight the live selection, or the span a pending proposal would replace.
      const enhanceRange = enhance !== null && enhance.range !== null && enhance.range !== undefined ? enhance.range : null
      const activeRange =
        enhanceRange !== null
          ? enhanceRange
          : selected.end > selected.start
            ? { start: selected.start, end: selected.end }
            : null

      // The preview page always shows the laid-out note. formatLocally is pure and cheap, so this
      // runs on every keystroke rather than behind a button.
      const laidOut = formatLocally(draft)
      const layoutChanged = laidOut !== draft.trim()
      /**
       * Replace a character range, keeping the line break at each boundary.
       *
       * A translated span is usually a whole line, so when the original had a break after it the
       * replacement needs one too — otherwise the next line is glued onto the translation.
       */
      const spliceRange = (value, start, end, insert) => {
        const before = value.slice(0, start)
        const after = value.slice(end)
        const needsBreak = after !== '' && after.startsWith('\n') === false && insert.endsWith('\n') === false
        return before + insert + (needsBreak ? '\n' : '') + after
      }

      /**
       * The plainLine() keys of the lines a character range covers.
       *
       * Line-level rather than character-level: layout may trim or renumber a line, but a touched
       * line stays a touched line, so the highlight cannot drift.
       */
      const linesInRange = (value, start, end) => {
        const marks = new Set()
        if (start === null || end === null || end <= start) return marks
        const first = value.slice(0, start).split(/\r?\n/).length - 1
        const endLine = value.slice(0, end).split(/\r?\n/).length - 1
        // Ending right before a line break means the next line is not touched yet.
        const last = value[end - 1] === '\n' ? endLine - 1 : endLine
        value.split(/\r?\n/).forEach((line, index) => {
          if (index >= first && index <= last) marks.add(plainLine(line))
        })
        return marks
      }

      // Which lines of the laid-out text fall inside the editor selection. Line-level rather than
      // character-level: formatLocally may trim or renumber a line, but a selected line stays a
      // selected line, so the preview highlight cannot drift.
      const markSet = selected.end > selected.start ? linesInRange(draft, selected.start, selected.end) : new Set()

      // The running chip: the spinner plus a marquee label. It sits in a toolbar, never over the
      // document, so the page can be read (and the reveal compared) while a call is in flight.
      const busyChip = (task) =>
        h(PreviewBusy, {
          label:
            (task === 'translate' ? t.translating : t.enhancing) +
            (enhanceSeconds + translateSeconds > 2 ? ' ' + Math.max(enhanceSeconds, translateSeconds) + 's' : ''),
        })

      // What the translate proposal would apply: the whole note with the span replaced.
      const previewSpliced =
        preview === null
          ? ''
          : preview.mode === 'selection' && preview.range !== null
            ? spliceRange(draft, preview.range.start, preview.range.end, preview.text)
            : preview.text
      const previewLayout = preview === null ? '' : formatLocally(previewSpliced)
      const previewMarks =
        preview === null
          ? undefined
          : preview.mode === 'selection' && preview.range !== null
            ? linesInRange(previewSpliced, preview.range.start, preview.range.start + preview.text.length)
            : undefined

      const structured = looksStructured(draft)
      // A Format proposal always previews; otherwise only structured text does.
      const showRender =
        enhance !== null ||
        // Generating counts: the page appears immediately so streaming is visible from the
        // first token instead of after the answer lands.
        enhancing ||
        draft.trim() !== '' ||
        enhanceError !== ''

      // The source sheet: the textarea and the toolbar, exactly as before a preview
      // exists. Keeping the toolbar here is what leaves the left sheet unchanged.
      const editorSheet = h(
        'div',
        { className: 'dshn-sheet', 'data-role': 'source' },
        h(
          'div',
          { className: 'dshn-composer', 'data-structured': String(structured) },
          // A persistent mark for the range that actions will use: the native selection
          // disappears as soon as the toolbar button takes focus. The textarea draws on top
          // of this layer with a transparent background, so the text is identical.
          activeRange === null
            ? null
            : h(
                'div',
                { className: 'dshn-editor-marks', 'aria-hidden': 'true', ref: marksRef },
                draft.slice(0, activeRange.start),
                h('mark', { className: 'dshn-editor-mark' }, draft.slice(activeRange.start, activeRange.end)),
                draft.slice(activeRange.end),
              ),
          h('textarea', {
            className: 'dshn-textarea',
            value: draft,
            placeholder: t.composePlaceholder,
            spellCheck: false,
            autoFocus: props.autoFocus === true,
            onChange: (event) => setDraft(event.target.value),
            onScroll: (event) => {
              if (marksRef.current !== null) marksRef.current.scrollTop = event.target.scrollTop
            },
            // Remember the selection so Format can work on just that part.
            onSelect: (event) =>
              setSelected({ start: event.target.selectionStart ?? 0, end: event.target.selectionEnd ?? 0 }),
            onKeyUp: (event) =>
              setSelected({ start: event.target.selectionStart ?? 0, end: event.target.selectionEnd ?? 0 }),
            onMouseUp: (event) =>
              setSelected({ start: event.target.selectionStart ?? 0, end: event.target.selectionEnd ?? 0 }),
            onKeyDown: (event) => {
              const modifier = event.ctrlKey || event.metaKey
              if (modifier && event.shiftKey && (event.key === 'F' || event.key === 'f')) {
                event.preventDefault()
                void runFormat()
                return
              }
              if (modifier && event.key === 'Enter') {
                event.preventDefault()
                void saveDraft()
              }
            },
            'aria-label': t.composePlaceholder,
          }),
        ),
        h(
          'div',
          { className: 'dshn-row dshn-capture-tools' },
          h('span', { className: 'dshn-cap' }, t.chars(draft.length) + '　Ctrl/⌘+Enter'),
          h('span', { className: 'dshn-grow' }),
          h(
            'button',
            {
              className: 'dshn-btn enhance',
              disabled: draft.trim() === '' || enhancing,
              onClick: () => void runEnhance(),
              title: t.enhanceHint,
            },
            enhancing
              ? enhanceSeconds > 2
                ? t.enhanceSlow(enhanceSeconds)
                : t.enhancing
              : '✦ ' + (selected.end > selected.start ? t.structureSelection : t.enhance),
          ),
          enhancing
            ? h('button', { className: 'dshn-btn ghost', onClick: stopStructured }, t.enhanceStop)
            : h('button', { className: 'dshn-btn ghost', onClick: () => setDraft(''), disabled: draft === '' }, t.cancel),
          h('button', { className: 'dshn-btn primary', onClick: () => void saveDraft(), disabled: draft.trim() === '' }, t.save),
        ),
      )

      // The preview page shows, in priority order: a structuring result, the text arriving from
      // the model, or the live laid-out mirror of the source. All three render the same way, so the
      // page never changes shape between them.
      // Already composed when the result arrived (title line for a whole note, the source's
      // label for a range), so it is used as-is here.
      const structureText = enhance === null ? '' : enhance.body

      /**
       * Render the document with the rewritten span tinted.
       *
       * The three parts are rendered in order so the replaced region can carry the same
       * green as the source range; content and order are unchanged, and a proposal with no
       * range renders as one plain document.
       */
      const renderProposalDocument = (proposal, range) => {
        if (range === null || range === undefined) return renderNoteBody(proposal)
        const before = draft.slice(0, range.start)
        const after = draft.slice(range.end)
        const mark = h(
          'div',
          { className: 'dshn-proposal-mark', 'data-mark': 'true' },
          before.trim() === '' ? renderNoteBody(proposal) : renderMarkdown(proposal),
        )
        return h(
          'div',
          { className: 'dshn-note' },
          before.trim() === '' ? null : h('div', { className: 'dshn-note-before' }, renderNoteBody(before)),
          mark,
          after.trim() === '' ? null : h('div', { className: 'dshn-note-after' }, renderMarkdown(after)),
        )
      }

      const enhanceDocument = enhance === null ? '' : structureText
      // The raw proposal only: renderProposalDocument does the splicing, so doing it here as
      // well would duplicate the untouched parts around the tinted block.

      const renderNode =
        enhance === null && enhanceError !== ''
          ? h(
              'div',
              { className: 'dshn-page-render' },
              h('div', { className: 'dshn-page-render-label' }, t.enhanceTitle),
              h('div', { className: 'dshn-err' }, enhanceError),
            )
          : enhance !== null
            ? h(
                'div',
                // The key is what restarts the wipe: a new result means a new animation.
                { key: 'draft-' + wipe, className: 'dshn-page-render dshn-wipe', 'data-proposal': 'true' },
                h(
                  'div',
                  { className: 'dshn-page-render-label' },
                  (translating
                    ? t.translating + ' ' + translateSeconds + 's'
                    : enhance.range === null
                      ? t.enhanceTitle
                      : t.enhanceTitle + ' · ' + t.enhanceSelectionScope) +
                    ' · ' +
                    t.chars(enhance.sentChars ?? 0) +
                    ' / ' +
                    t.chars(draft.length) +
                    (enhance.title === '' ? '' : ' · ' + enhance.title),
                ),
                enhanceDocument.trim() === ''
                  ? h('div', { className: 'dshn-cap' }, t.enhanceSub)
                  : renderProposalDocument(enhanceDocument, enhance.range),
              )
              : h(
                  'div',
                  {
                    key: 'page-' + wipe,
                    className: 'dshn-page-render' + (preview === null ? '' : ' dshn-wipe'),
                    'data-proposal': preview === null ? undefined : 'true',
                  },
                  h(
                    'div',
                    { className: 'dshn-page-render-label' },
                    // The label doubles as the state: unchanged, already tidied, or a translation
                    // waiting for a decision.
                    preview !== null
                      ? (preview.mode === 'selection' ? t.translatedSelection : t.translated) +
                        ' · ' +
                        t.chars(preview.text.length)
                      : (layoutChanged ? t.formattedPreview : t.rendered) + ' · ' + t.chars(laidOut.length),
                  ),
                  preview !== null
                    ? renderNoteBody(previewLayout, previewMarks)
                    : laidOut.trim() === ''
                      ? h('div', { className: 'dshn-cap' }, t.enhanceSub)
                      : renderNoteBody(laidOut, markSet),
                )

      // The preview page's toolbar: the same shape as the editing page's, so the two
      // pages line up and the actions sit where the eye already is.
      const renderTools =
        enhance !== null
          ? h(
              'div',
              { className: 'dshn-row dshn-capture-tools' },
              h(
                'label',
                { className: 'dshn-lang', title: t.translateTarget },
                h(
                  'select',
                  {
                    value: targetLang,
                    onChange: (event) => {
                      setTargetLang(event.target.value)
                      try {
                        localStorage.setItem('notes.targetLang', event.target.value)
                      } catch {
                        /* storage may be unavailable */
                      }
                    },
                    'aria-label': t.translateTarget,
                  },
                  ...TARGET_LANGUAGES.map((entry) =>
                    h('option', { key: entry.id, value: entry.id }, entry.id === 'auto' ? t.translateAuto : entry.label),
                  ),
                ),
              ),
              translating
                ? busyChip('translate')
                : h(
                    'button',
                    {
                      className: 'dshn-btn',
                      onClick: () => void runTranslate(),
                      title: t.translateHint,
                    },
                    t.translate,
                  ),
              busy === '' && enhance.keepSource !== undefined
                ? h(
                    'label',
                    { className: 'dshn-cap', style: { display: 'inline-flex', gap: 4, alignItems: 'center', cursor: 'pointer' } },
                    h('input', {
                      type: 'checkbox',
                      checked: enhance.keepSource === true,
                      onChange: (event) => setEnhance({ ...enhance, keepSource: event.target.checked }),
                    }),
                    t.enhanceKeepSource,
                  )
                : null,
              busy === '' ? null : busyChip(busy),
              h('span', { className: 'dshn-grow' }),
              enhanceError !== '' ? h('span', { className: 'dshn-cap dshn-err-inline' }, enhanceError) : null,
              h('button', { className: 'dshn-btn ghost', onClick: () => setEnhance(null) }, t.enhanceDiscard),
              h('button', { className: 'dshn-btn primary', onClick: applyEnhance, title: t.applyHint }, t.apply),
              h(
                'button',
                { className: 'dshn-btn', onClick: () => void saveEnhance(), title: t.enhanceSaveHint },
                t.enhanceSave,
              ),
            )
          // The live preview keeps a translate action of its own: a note can be translated without
          // being structured first. A pending translation is applied or discarded here.
          : preview !== null
            ? h(
                'div',
                { className: 'dshn-row dshn-capture-tools' },
                h('span', { className: 'dshn-cap' }, preview.mode === 'selection' ? t.translatedSelection : t.translated),
                h('span', { className: 'dshn-grow' }),
                enhanceError !== '' ? h('span', { className: 'dshn-cap dshn-err-inline' }, enhanceError) : null,
                h('button', { className: 'dshn-btn ghost', onClick: () => setPreview(null) }, t.enhanceDiscard),
                h('button', { className: 'dshn-btn primary', onClick: applyPreview, title: t.applyHint }, t.apply),
              )
            : h(
                'div',
                { className: 'dshn-row dshn-capture-tools' },
                h(
                  'label',
                  { className: 'dshn-lang', title: t.translateTarget },
                  h(
                    'select',
                    {
                      value: targetLang,
                      onChange: (event) => {
                        setTargetLang(event.target.value)
                        try {
                          localStorage.setItem('notes.targetLang', event.target.value)
                        } catch {
                          /* storage may be unavailable */
                        }
                      },
                      'aria-label': t.translateTarget,
                    },
                    ...TARGET_LANGUAGES.map((entry) =>
                      h('option', { key: entry.id, value: entry.id }, entry.id === 'auto' ? t.translateAuto : entry.label),
                    ),
                  ),
                ),
                translating
                  ? busyChip('translate')
                  : h(
                      'button',
                      {
                        className: 'dshn-btn',
                        disabled: draft.trim() === '',
                        onClick: () => void runPreviewTranslate(),
                        title: t.translateHint,
                      },
                      selected.end > selected.start ? t.translateSelection : t.translate,
                    ),
                h('span', { className: 'dshn-grow' }),
                enhanceError !== '' ? h('span', { className: 'dshn-cap dshn-err-inline' }, enhanceError) : null,
              )

      const renderSheet =
        showRender || renderTools !== null
          ? h('div', { className: 'dshn-sheet', 'data-role': 'render' }, renderNode, renderTools)
          : null

      // Only transient messages here ("saved", "applied"). The storage location used to be
      // printed permanently under the page, which read as stray text, so it is gone.
      const statusLine = status !== '' ? h('div', { className: 'dshn-cap' }, status) : null

      return h(
        'div',
        {
          className: 'dshn-capture-box',
          'data-layout': props.layout === 'page' ? 'page' : 'compact',
          'data-split': showRender ? 'true' : 'false',
        },
        // Two independent sheets side by side; the source keeps its own size.
        h('div', { className: 'dshn-sheets' }, editorSheet, renderSheet),
        statusLine,
      )
    }

    // ---------------------------------------------------------- dashboard ---

    /** How each AI action kind reads in the chart. */
    const AI_KIND_LABELS = {
      enhance: '结构化',
      'copilot.complete': '续写',
      'copilot.polish': '润色',
      'copilot.translate': '翻译',
      'copilot.ask': '提问',
      'copilot.explain': '解释',
    }

    /** The AI-usage series for the chart, with kinds translated for display. */
    function aiUsageSeries(byKind) {
      return (Array.isArray(byKind) ? byKind : []).map((entry) => ({
        label: AI_KIND_LABELS[entry?.label] ?? String(entry?.label ?? ''),
        value: Number(entry?.value) || 0,
      }))
    }

    /**
     * 看板: what the notebook contains and how it is being used.
     *
     * The right-hand column is the host's own Conversation, driven by the
     * `notes-board` agent preset. That agent has `notes_query`, `notes_analyze`
     * and `dashboard_chart`, so it reads the database instead of receiving a
     * truncated dump of the text in its prompt.
     */
    /**
     * Give a collapsed wrapper an explicit height.
     *
     * The host conversation is a component we do not own: if any wrapper between the column and it
     * lacks a height, the column collapses and the composer jumps to the top. Walk a few levels
     * down and write the measured height onto whatever collapsed — this needs no knowledge of the
     * host markup, which is exactly what the CSS-only versions kept getting wrong.
     */
    function repairChain(dock) {
      if (dock === null || dock === undefined || typeof dock.querySelector !== 'function') return
      const column = dock.querySelector('.dshn-side-chat')
      if (column === null) return
      const target = column.clientHeight
      if (target <= 0) return
      let node = column.firstElementChild
      for (let depth = 0; depth < 10 && node !== null; node = node.firstElementChild, depth += 1) {
        // Within 24px of the column is fine: margins and borders explain the rest.
        if (node.clientHeight >= target - 24) continue
        node.style.height = target + 'px'
        node.style.minHeight = '0'
        node.style.display = 'flex'
        node.style.flexDirection = 'column'
        node.style.flex = '1 1 auto'
      }
    }

    function DashboardTab(props) {
      const t = props.t
      const { SessionProvider, renderSlot, sessionReference, starting, openSession } = props
      const [stats, setStats] = useState(null)
      const [error, setError] = useState('')
      const [pinned, setPinned] = useState([])
      // The quick-note pane replaces the conversation; the conversation stays
      // mounted underneath so closing the pane restores it untouched.
      // Side-column width: remembered, clamped, drag-resizable.
      const [sideWidth, setSideWidth] = useState(() => storedSideWidth())
      const sideWidthRef = useRef(sideWidth)
      const [quickNote, setQuickNote] = useState(false)
      // The dock's measured height. Percentage chains break as soon as the host conversation
      // inserts a wrapper, so the height is written down explicitly instead.
      const dockRef = useRef(null)
      const [dockHeight, setDockHeight] = useState(0)
      useEffect(() => {
        const node = dockRef.current
        if (node === null || node === undefined) return undefined
        const measure = () => {
          setDockHeight(node.clientHeight)
          // Fix a collapsed wrapper in the host's conversation tree, if there is one.
          repairChain(node)
        }
        measure()
        if (typeof ResizeObserver === 'undefined') return undefined
        const observer = new ResizeObserver(measure)
        observer.observe(node)
        return () => observer.disconnect()
      }, [quickNote])
      const [quickText, setQuickText] = useState('')
      const [quickTags, setQuickTags] = useState('')
      const [quickStatus, setQuickStatus] = useState('')

      const load = useCallback(async () => {
        try {
          const data = await get('/stats?days=30')
          setStats(data)
          setPinned(Array.isArray(data?.pinned) ? data.pinned : [])
          setError('')
          return true
        } catch (problem) {
          setError(String(problem?.message ?? problem))
          return false
        }
      }, [])

      // Load, then poll: the agent may save a chart mid-conversation, and the
      // dashboard should show it without the user reloading anything.
      useEffect(() => {
        let cancelled = false
        let poll
        // Same reasoning as the panel's first load: retry quickly a couple of times,
        // then settle into the slow poll that picks up charts the agent saves.
        const boot = async (remaining) => {
          const ok = await load()
          if (cancelled) return
          // Only an unsuccessful first read is retried; a good one goes straight to the
          // poll instead of firing three identical requests.
          if (!ok && remaining > 0) {
            setTimeout(() => void boot(remaining - 1), 500)
            return
          }
          poll = setInterval(() => void load(), BOARD_POLL_MS)
        }
        void boot(3)
        return () => {
          cancelled = true
          clearInterval(poll)
        }
      }, [load, props.total])

      const saveQuick = useCallback(async () => {
        const body = quickText.trim()
        if (body === '') return
        try {
          await post('/note', { body, tags: quickTags, source: 'panel' })
          setQuickText('')
          setQuickTags('')
          setQuickStatus(t.saved)
          void load()
        } catch (problem) {
          setQuickStatus(String(problem?.message ?? problem))
        }
      }, [quickText, quickTags, t, load])

      /** Drag the divider: the column width follows the pointer, within its limits. */
      const startResize = useCallback(
        (event) => {
          event.preventDefault()
          const startX = event.clientX
          const startWidth = sideWidth
          const move = (moveEvent) => {
            // Dragging left makes the column wider, so the delta is inverted.
            setSideWidth(clampSideWidth(startWidth - (moveEvent.clientX - startX)))
          }
          const finish = () => {
            window.removeEventListener('pointermove', move)
            window.removeEventListener('pointerup', finish)
            persistSideWidth(sideWidthRef.current)
          }
          window.addEventListener('pointermove', move)
          window.addEventListener('pointerup', finish)
        },
        [sideWidth, sideWidthRef],
      )

      // The pointerup handler runs after the last state update, so it reads the ref.
      sideWidthRef.current = sideWidth

      const unpin = useCallback(
        async (chart) => {
          try {
            const result = await post('/charts/remove', { id: chart.id })
            setPinned(Array.isArray(result?.charts) ? result.charts : [])
          } catch (problem) {
            setError(String(problem?.message ?? problem))
          }
        },
        [],
      )

      const totals = stats?.totals
      const ai = stats?.ai
      const tiles = [
        { label: t.statNotes, value: totals?.notes ?? '—' },
        { label: t.statTags, value: totals?.tags ?? '—' },
        { label: t.statChars, value: totals?.chars ?? '—' },
        { label: t.statStreak, value: totals?.streak ?? '—' },
        { label: t.statActiveDays, value: totals?.daysActive ?? '—' },
        { label: t.statAiCalls, value: ai?.calls ?? '—' },
        // Token spend, with cache reads called out: they are what make a long
        // context affordable, so they belong next to the total.
        { label: t.statTokens, value: stats?.tokens?.total ?? '—' },
        { label: t.statCacheRead, value: stats?.tokens?.cacheRead ?? '—' },
      ]

      /**
       * The quick-note pane: the capture box, in place of the conversation.
       *
       * It is an overlay in the same column rather than a dialog, so nothing the
       * user was reading moves.
       */
      const charts = stats?.charts

      // The conversation is the column's default state. Only a real failure shows a
      // status line, and even then the retry is offered, not a "start" step.
      let side
      if (SessionProvider === undefined || renderSlot === undefined) {
        side = h('div', { className: 'dshn-side-hint' }, t.boardNoHost)
      } else if (sessionReference === undefined || sessionReference === null) {
        side = h(
          'div',
          { className: 'dshn-side-hint' },
          props.sessionError !== undefined && props.sessionError !== ''
            ? t.boardFailed + ' ' + String(props.sessionError).slice(0, 120)
            : t.boardStarting,
          openSession === undefined
            ? null
            : h(
                'div',
                { style: { marginTop: 8 } },
                h(
                  'button',
                  {
                    className: 'dshn-btn ghost',
                    disabled: starting === true,
                    onClick: () => void openSession(true),
                  },
                  starting === true ? t.boardStarting : t.boardRetry,
                ),
              ),
        )
      } else {
        const slotContent = renderSlot('notes.board.conversation', {})
        const shape =
          slotContent === null
            ? 'null'
            : Array.isArray(slotContent)
              ? 'array(' + slotContent.length + ')'
              : typeof slotContent
        side =
          slotContent === null || slotContent === undefined
            ? h(
                'div',
                { className: 'dshn-err', style: { fontSize: 11 } },
                '子槽没有返回内容：会话没有绑定到这个面板。',
              )
            : h(
                SessionProvider,
                { session: sessionReference },
                h(
                  ChatBoundary,
                  { failureLabel: t.boardRenderFailed },
                  h(
                    'div',
                    {
                      className: 'dshn-side-chat',
                      style: {
                        // A number, not a percentage: definite regardless of ancestors.
                        height: dockHeight > 0 ? dockHeight + 'px' : '100%',
                        flex: 1,
                        minHeight: 0,
                        display: 'flex',
                        flexDirection: 'column',
                      },
                    },
                    slotContent,
                  ),
                ),
              )
      }

      return h(
        'div',
        { className: 'dshn-pane dshn-board' },
        error !== '' ? h('div', { className: 'dshn-err' }, error) : null,
        h(
          'div',
          { className: 'dshn-board-main' },
          h(
            'div',
            { className: 'dshn-tiles' },
            ...tiles.map((tile) =>
              h(
                'div',
                { key: tile.label, className: 'dshn-tile' },
                h('span', { className: 'dshn-tile-value' }, String(tile.value)),
                h('span', { className: 'dshn-tile-label' }, tile.label),
              ),
            ),
          ),
          h(
            'div',
            { className: 'dshn-chart-grid' },
            h(Chart, { chart: { id: 'calendar', title: t.chartCalendar, type: 'heatmap', data: charts?.calendar ?? [] }, wide: true }),
            h(Chart, { chart: { id: 'tokens', title: t.chartTokens, type: 'bar', data: (charts?.tokens ?? []).filter((point) => point.value > 0) } }),
            h(Chart, { chart: { id: 'tags', title: t.chartTags, type: 'bar', data: charts?.tags ?? [] } }),
            h(Chart, { chart: { id: 'sources', title: t.chartSources, type: 'pie', data: charts?.sources ?? [] } }),
            h(Chart, { chart: { id: 'terms', title: t.chartTerms, type: 'bar', data: charts?.terms ?? [] } }),
            h(Chart, { chart: { id: 'lengths', title: t.chartLengths, type: 'bar', data: charts?.lengths ?? [] } }),
            h(Chart, {
              chart: {
                id: 'ai',
                title: t.chartAi,
                type: 'bar',
                data: aiUsageSeries(ai?.byKind),
              },
            }),
          ),
          pinned.length > 0
            ? h(
                'div',
                { className: 'dshn-section' },
                h('span', { className: 'dshn-section-title' }, t.boardPinnedCharts),
                h(
                  'div',
                  { className: 'dshn-chart-grid' },
                  ...pinned.map((chart) => h(Chart, { key: chart.id, chart, onRemove: unpin })),
                ),
              )
            : null,
        ),
        h('div', {
          className: 'dshn-side-resizer',
          role: 'separator',
          'aria-orientation': 'vertical',
          'aria-label': t.boardResize,
          title: t.boardResize,
          onPointerDown: startResize,
          onDoubleClick: () => {
            setSideWidth(SIDE_WIDTH_DEFAULT)
            persistSideWidth(SIDE_WIDTH_DEFAULT)
          },
        }),
        h(
          'div',
          { className: 'dshn-board-side', style: { width: sideWidth + 'px' } },
          h(
            'div',
            { className: 'dshn-side-head' },
            h('span', { className: 'dshn-side-title' }, t.boardChatTitle),
            h('span', { className: 'dshn-grow' }),
            h(
              'button',
              {
                className: 'dshn-btn ghost dshn-quick-btn',
                onClick: () => {
                  setQuickStatus('')
                  setQuickNote(!quickNote)
                },
                title: t.quickNote,
              },
              quickNote ? t.quickNoteClose : t.quickNote,
            ),
          ),
          h(
            'div',
            { className: 'dshn-side-dock', ref: dockRef },
            quickNote
              ? h(
                  'div',
                  { className: 'dshn-quick-box' },
                  // The same capture box the 记录 tab uses, in the column's space.
                  h(CaptureBox, { t, onSaved: load, autoFocus: true }),
                )
              : h('div', { className: 'dshn-chat-box' }, side),
          ),
        ),
      )
    }

    // ------------------------------------------------------------- copilot ---
    //
    // Beside an open note: pick an action, get streamed text, put it where it
    // belongs. Selection comes from the editor's own caret, so "划线" here means
    // "the text you have selected" with no separate annotation layer.

    function CopilotSidebar({ t, note, editing, draft, selectionRef, onApply }) {
      const [output, setOutput] = useState('')
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState('')
      const [question, setQuestion] = useState('')
      const [open, setOpen] = useState(true)
      const [meta, setMeta] = useState(null)

      const document = editing ? draft : String(note?.body ?? '')
      const range = selectionRef?.current ?? { start: 0, end: 0 }
      const selected = document.slice(Math.min(range.start, range.end), Math.max(range.start, range.end))
      const hasSelection = selected.trim() !== ''

      const run = useCallback(
        async (action) => {
          if (busy) return
          setBusy(true)
          setOutput('')
          setError('')
          setMeta(null)
          try {
            await streamEvents(
              '/copilot/stream',
              {
                action,
                selection: hasSelection ? selected : '',
                document,
                title: note?.title ?? '',
                instruction: action === 'ask' ? question : '',
              },
              (event, payload) => {
                if (event === 'delta') {
                  setOutput((current) => current + String(payload?.text ?? ''))
                  return
                }
                if (event === 'error') {
                  setError(String(payload?.message ?? '调用失败'))
                  return
                }
                if (event === 'done') setMeta({ model: payload?.model, elapsedMs: payload?.elapsedMs })
              },
            )
          } catch (problem) {
            setError(String(problem?.message ?? problem))
          } finally {
            setBusy(false)
          }
        },
        [busy, document, hasSelection, note, question, selected],
      )

      if (note === null || note === undefined) return null

      const actions = [
        ['complete', t.copilotComplete],
        ['polish', t.copilotPolish],
        ['translate', t.copilotTranslate],
        ['expand', t.copilotExpand],
        ['summarize', t.copilotSummarize],
      ]

      return h(
        'div',
        { className: 'dshn-copilot', 'data-open': String(open) },
        h(
          'div',
          { className: 'dshn-side-head' },
          h(
            'button',
            {
              className: 'dshn-icon-btn',
              title: open ? t.copilotHide : t.copilotShow,
              'aria-label': open ? t.copilotHide : t.copilotShow,
              'aria-expanded': String(open),
              onClick: () => setOpen(!open),
            },
            open ? '›' : '‹',
          ),
          h('span', { className: 'dshn-side-title' }, t.copilotTitle),
          h('span', { className: 'dshn-grow' }),
          h(
            'span',
            { className: 'dshn-cap', title: hasSelection ? t.copilotSelectionHint : t.copilotWholeHint },
            hasSelection ? t.copilotSelection(selected.length) : t.copilotWhole,
          ),
        ),
        open
          ? h(
              React.Fragment,
              null,
              h(
                'div',
                { className: 'dshn-copilot-actions' },
                ...actions.map(([id, label]) =>
                  h(
                    'button',
                    {
                      key: id,
                      className: 'dshn-btn ghost',
                      disabled: busy,
                      onClick: () => void run(id),
                    },
                    label,
                  ),
                ),
              ),
              h(
                'div',
                { className: 'dshn-copilot-ask' },
                h('input', {
                  value: question,
                  placeholder: t.copilotAskPlaceholder,
                  onChange: (event) => setQuestion(event.target.value),
                  onKeyDown: (event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void run('ask')
                    }
                  },
                  'aria-label': t.copilotAskPlaceholder,
                }),
                h('button', { className: 'dshn-btn ghost', disabled: busy, onClick: () => void run('ask') }, t.copilotAsk),
              ),
              error !== '' ? h('div', { className: 'dshn-err' }, error) : null,
              h(
                'div',
                { className: 'dshn-copilot-output' },
                output === ''
                  ? h('div', { className: 'dshn-side-hint' }, busy ? t.thinking : t.copilotHint)
                  : h('div', { className: 'dshn-md' }, renderMarkdown(output)),
              ),
              output === '' && !busy
                ? null
                : h(
                    'div',
                    { className: 'dshn-copilot-foot' },
                    h('span', { className: 'dshn-cap' }, meta === null ? '' : `${meta.elapsedMs}ms`),
                    h('span', { className: 'dshn-grow' }),
                    h(
                      'button',
                      { className: 'dshn-btn ghost', disabled: busy || output === '', onClick: () => setOutput('') },
                      t.copilotClear,
                    ),
                    h(
                      'button',
                      {
                        className: 'dshn-btn ghost',
                        disabled: busy || output === '',
                        onClick: () => onApply(output, 'append'),
                      },
                      t.copilotAppend,
                    ),
                    h(
                      'button',
                      {
                        className: 'dshn-btn ghost',
                        disabled: busy || output === '' || !hasSelection,
                        onClick: () => onApply(output, 'replace-selection'),
                      },
                      t.copilotReplaceSelection,
                    ),
                    h(
                      'button',
                      { className: 'dshn-btn primary', disabled: busy || output === '', onClick: () => onApply(output, 'replace-all') },
                      t.copilotReplaceAll,
                    ),
                  ),
            )
          : null,
      )
    }
