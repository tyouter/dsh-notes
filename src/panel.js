    // --------------------------------------------------------------- icons ---

    /** The notebook glyph, shared by the sidebar, the composer button, and the overlay. */
    function NoteGlyph({ size = 18 }) {
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
        },
        h('path', { d: 'M6 3.5h8L19 8.5v12h-13z' }),
        h('path', { d: 'M14 3.5V9h5' }),
        h('path', { d: 'M9 13h6' }),
        h('path', { d: 'M9 16.5h4' }),
      )
    }

    // =====================================================================
    // One notebook, three tabs: 记录 / 历史 / 看板.
    //
    // There is no assistant *conversation* any more. The AI surfaces are the
    // structuring card under the capture box,
    // and the dashboard's own chat. Each is a plain streamed model call, so the
    // panel owns no session and nothing must be created before asking.
    // =====================================================================

    /**
     * Keeps a panel crash visible.
     *
     * Without this a thrown render blanks the whole panel, which is
     * indistinguishable from "the plugin did not load" and hides the actual error.
     */
    class PanelBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
      }

      static getDerivedStateFromError(error) {
        return { error }
      }

      render() {
        if (this.state.error !== null) {
          const message = '记事本渲染失败：' + String(this.state.error?.message ?? this.state.error)
          return React.createElement(
            'div',
            { className: 'dshn-root' },
            React.createElement('div', { className: 'dshn-err', style: { padding: 16, fontSize: 12 } }, message),
          )
        }
        return this.props.children
      }
    }

    /** The Client sessions service, captured in apply() for the shell. */
    let sessionsService = null

    /**
     * The panel shell: create the dashboard session, bind it for the native
     * Conversation, and hand everything else down.
     *
     * Only *creation* is ours (it is Host-only). Delivery, streaming, tool cards
     * and approvals are the framework's: the user types into the native composer,
     * so no turn is ever pushed by hand.
     */
    function NotebookShell(props) {
      const [sessionId, setSessionId] = useState('')
      const [sessionReference, setSessionReference] = useState(undefined)
      const [starting, setStarting] = useState(false)
      // Last failure while opening the dashboard conversation, for the board to show.
      const [sessionError, setSessionError] = useState('')
      const heldRef = useRef(null)

      // Bind the created session to a Client reference the conversation can render.
      useEffect(() => {
        if (sessionId === '') {
          setSessionReference(undefined)
          return undefined
        }
        const sessions = sessionsService
        if (sessions === null || sessions === undefined) return undefined
        let disposed = false
        const reference = sessions.retain(sessionId, { source: 'notes-board' })
        reference.ready.then(
          () => {
            if (disposed) {
              reference.release()
              return
            }
            heldRef.current = reference
            setSessionReference(reference)
          },
          () => {
            if (!disposed) setSessionReference(undefined)
          },
        )
        return () => {
          disposed = true
          heldRef.current = null
          setSessionReference(undefined)
          try {
            reference.release()
          } catch {
            /* already released */
          }
        }
      }, [sessionId])

      const openSession = useCallback(async (force) => {
        setStarting(true)
        setSessionError('')
        try {
          if (force !== true) {
            // Reuse the stored link so switching tabs does not spawn sessions.
            const link = await get('/session/link').catch(() => null)
            const existing = String(link?.sessionId ?? '')
            if (existing !== '') {
              setSessionId(existing)
              return { sessionId: existing }
            }
          }
          const created = await post('/session/create', {})
          const id = String(created?.sessionId ?? '')
          if (id !== '') setSessionId(id)
          return created
        } catch (problem) {
          setSessionError(String(problem?.message ?? problem))
          throw problem
        } finally {
          setStarting(false)
        }
      }, [])

      // Create (or reuse) the dashboard session once the panel appears: the board
      // renders the native conversation immediately, so it cannot wait for a click.
      const opened = useRef(false)
      useEffect(() => {
        if (opened.current) return
        opened.current = true
        // Retry a few times with backoff: a failed first attempt should not leave
        // the board without a conversation for the rest of the session.
        const attempt = (remaining) => {
          openSession().catch(() => {
            if (remaining <= 1) return
            setTimeout(() => attempt(remaining - 1), 700)
          })
        }
        attempt(4)
      }, [openSession])

      // A stored link can outlive its session (a restart, a cleared log). Retry once
      // with a fresh one rather than leaving the column empty forever.
      const recovered = useRef(false)
      useEffect(() => {
        if (sessionId === '' || sessionReference !== undefined || starting) return
        if (recovered.current) return
        recovered.current = true
        const timer = setTimeout(() => {
          void openSession(true).catch(() => {})
        }, 1200)
        return () => clearTimeout(timer)
      }, [sessionId, sessionReference, starting, openSession])

      // Do NOT forward children: a stale slot children array reaching the panel
      // blanked it during testing.
      const { children: slotChildren, ...ownerProps } = props ?? {}
      return h(
        PanelBoundary,
        null,
        h(NotebookPanel, {
          ...ownerProps,
          sessionId,
          sessionReference,
          starting,
          sessionError,
          openSession,
        }),
      )
    }

    /**
     * The notebook panel itself.
     *
     *  记录   one box; its toolbar's 「结构化」 button asks the model for a
     *          structured rewrite and shows it as an editable draft card.
     *  历史   the grouped history, search and detail the home page used to hold.
     *  看板   statistics over the notebook, and a chat that can add charts.
     */
    function NotebookPanel(props) {
      const t = dict()
      const [tab, setTab] = useState('capture')
      const [notes, setNotes] = useState([])
      const [tags, setTags] = useState([])
      const [total, setTotal] = useState(0)
      const [location, setLocation] = useState(null)
      const [error, setError] = useState('')
      const [selectedId, setSelectedId] = useState('')
      // Seconds spent on the current structuring request, so the button can say
      // "still writing" instead of looking frozen.
      // Raw text while the model is still writing; replaced by the parsed draft.
      const [presetMissing, setPresetMissing] = useState(false)
      const [status, setStatus] = useState('')
      // Distinguishes "not loaded yet" from "nothing here": the difference between a
      // spinner and an empty notebook.
      const [loading, setLoading] = useState(true)

      const refresh = useCallback(async () => {
        try {
          const data = await get('/list')
          setNotes(Array.isArray(data.notes) ? data.notes : [])
          setTags(Array.isArray(data.tags) ? data.tags : [])
          setTotal(Number(data.total ?? 0))
          setLocation(data.location ?? null)
          setError('')
          setLoading(false)
          return true
        } catch (problem) {
          setError(String(problem?.message ?? problem))
          return false
        }
      }, [])

      useEffect(() => {
        let cancelled = false
        let poll

        // The very first read is the fragile one (the panel can mount before the data
        // plane is listening), so it retries quickly before settling into the poll.
        const boot = async (remaining) => {
          const ok = await refresh()
          if (cancelled) return
          if (!ok && remaining > 0) {
            setTimeout(() => void boot(remaining - 1), 400)
            return
          }
          setLoading(false)
          poll = setInterval(() => void refresh(), POLL_MS)
        }

        void boot(6)
        return () => {
          cancelled = true
          clearInterval(poll)
        }
      }, [refresh])

      // The AI tab probes whether the notebook preset bundle is installed; the
      // conversation still works without it (see lib/sessions.js).
      useEffect(() => {
        if (tab !== 'ai') return undefined
        let cancelled = false
        void get('/preset')
          .then((state) => {
            if (!cancelled && state?.configured === true && state?.installed === false) setPresetMissing(true)
          })
          .catch(() => undefined)
        return () => {
          cancelled = true
        }
      }, [tab])

      const flash = (label) => {
        setStatus(label)
        setTimeout(() => setStatus(''), 1600)
      }

      const tabs = [
        { id: 'capture', label: t.tabCapture },
        { id: 'history', label: t.tabHistory, count: total },
        { id: 'board', label: t.tabBoard },
      ]

      return h(
        'div',
        { className: 'dshn-root' },
        h(Styles, null),
        h(
          'div',
          { className: 'dshn-tabs', role: 'tablist' },
          ...tabs.map((entry) =>
            h(
              'button',
              {
                key: entry.id,
                role: 'tab',
                className: 'dshn-tab',
                'data-active': String(tab === entry.id),
                onClick: () => setTab(entry.id),
              },
              entry.label,
              entry.count === undefined ? null : h('span', { className: 'dshn-tab-count' }, String(entry.count)),
            ),
          ),
          h('span', { className: 'dshn-grow' }),
          error !== '' ? h('span', { className: 'dshn-err', title: error }, error.slice(0, 90)) : null,
          status !== '' ? h('span', { className: 'dshn-ok' }, status) : null,
        ),

        // ------------------------------------------------------------ 记录 ---
        tab === 'capture'
          ? h(
              'div',
              { className: 'dshn-pane dshn-capture-pane' },
              h(CaptureBox, { key: 'capture', t, onSaved: refresh, location, layout: 'page' }),
            )
          : null,

        // ------------------------------------------------------------ 历史 ---
        tab === 'history'
          ? h(HistoryTab, {
              key: 'history',
              t,
              notes,
              tags,
              total,
              loading,
              selectedId,
              onSelect: setSelectedId,
              refresh,
            })
          : null,

        // ------------------------------------------------------------ 看板 ---
        tab === 'board'
          ? h(DashboardTab, {
              key: 'board',
              t,
              notes,
              total,
              sessionId: props.sessionId,
              sessionReference: props.sessionReference,
              starting: props.starting === true,
              sessionError: props.sessionError,
              openSession: props.openSession,
              // Injected by the framework because the panel declares a
              // session-scoped child slot; the board renders it.
              SessionProvider: props.SessionProvider,
              renderSlot: props.renderSlot,
              onSelectNote: (id) => {
                setSelectedId(id)
                setTab('history')
              },
            })
          : null,
      )
    }

    // -------------------------------------------------------------- history ---

    function HistoryTab({ t, notes, tags, total, loading, selectedId, onSelect, refresh }) {
      const [query, setQuery] = useState('')
      const [tagFilter, setTagFilter] = useState('')
      const [showAllTags, setShowAllTags] = useState(false)
      const [editing, setEditing] = useState(false)
      // The drawer: collapsed, the list steps aside and one note fills the pane.
      const [listOpen, setListOpen] = useState(true)
      // The list is a column you can widen: dragged between 200 and 520 px and remembered.
      const [listWidth, setListWidth] = useState(() => {
        try {
          const stored = Number(globalThis.localStorage?.getItem('dshn.history.listWidth'))
          return Number.isFinite(stored) && stored >= 200 && stored <= 520 ? stored : 280
        } catch {
          return 280
        }
      })
      const dragRef = useRef(null)
      // Search and filters run over the list the panel already holds, so
      // switching tabs never waits on the network.
      const filtered = useMemo(() => {
        const needle = norm(query)
        const tagKey = tagFilter.toLowerCase()
        return notes.filter((note) => {
          if (tagKey !== '' && !note.tags.some((tag) => tag.toLowerCase() === tagKey)) return false
          if (needle === '') return true
          return norm(`${note.body} ${note.tags.join(' ')}`).includes(needle)
        })
      }, [notes, query, tagFilter])

      const selected = useMemo(() => notes.find((note) => note.id === selectedId) ?? null, [notes, selectedId])

      useEffect(() => {
        setEditing(false)
      }, [selectedId])

      const groups = useMemo(() => {
        const buckets = { today: [], yesterday: [], earlier: [] }
        for (const note of filtered) buckets[dayBucket(note.updatedAt ?? note.createdAt)].push(note)
        return [
          { key: 'today', label: t.today, notes: buckets.today },
          { key: 'yesterday', label: t.yesterday, notes: buckets.yesterday },
          { key: 'earlier', label: t.earlier, notes: buckets.earlier },
        ].filter((group) => group.notes.length > 0)
      }, [filtered, t])

      const action = async (operation) => {
        try {
          await operation()
          await refresh()
        } catch {
          /* the panel header reports the refresh failure */
        }
      }

      const visibleTags = showAllTags ? tags : tags.slice(0, 10)

      return h(
        'div',
        { className: 'dshn-pane dshn-history' },
        h(
          'div',
          { className: 'dshn-row' },
          // The drawer switch lives here, not inside the list: a control that
          // collapses the list must not disappear with it. It carries a label
          // because an unlabelled 24px icon was not discoverable.
          h(
            'button',
            {
              className: 'dshn-drawer',
              title: listOpen ? t.collapseList : t.expandList,
              'aria-label': listOpen ? t.collapseList : t.expandList,
              'aria-expanded': String(listOpen),
              onClick: () => setListOpen(!listOpen),
            },
            h(
              'svg',
              { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
              h('path', { d: 'M4 5h16v14H4z' }),
              h('path', { d: 'M9 5v14' }),
            ),
            h('span', null, listOpen ? t.collapseList : t.expandList),
          ),
          h('input', {
            className: 'dshn-search',
            value: query,
            placeholder: t.search,
            onChange: (event) => setQuery(event.target.value),
            onKeyDown: (event) => {
              if (event.key === 'Escape') setQuery('')
            },
            'aria-label': t.search,
          }),
          h('span', { className: 'dshn-cap' }, `${t.all} ${total}`),
        ),
        tags.length > 0
          ? h(
              'div',
              { className: 'dshn-row', style: { gap: 4 } },
              h('span', { className: 'dshn-cap', style: { marginRight: 2 } }, t.tags),
              ...visibleTags.map((entry) =>
                h(
                  'button',
                  {
                    key: entry.tag,
                    className: 'dshn-chip',
                    'data-active': String(tagFilter === entry.tag),
                    onClick: () => setTagFilter(tagFilter === entry.tag ? '' : entry.tag),
                  },
                  h('span', { className: 'dshn-tag-name' }, entry.tag),
                  h('span', { className: 'dshn-tag-count' }, String(entry.count)),
                ),
              ),
              tags.length > 10
                ? h(
                    'button',
                    { className: 'dshn-chip dshn-more', onClick: () => setShowAllTags(!showAllTags) },
                    showAllTags ? '…' : `+${tags.length - 10}`,
                  )
                : null,
            )
          : null,
        h(
          'div',
          { className: 'dshn-body', 'data-collapsed': String(!listOpen), style: { '--dshn-list-width': listWidth + 'px' } },
          h(
            'div',
            { className: 'dshn-list', role: 'list', 'data-collapsed': String(!listOpen) },
            h(
              'div',
              { className: 'dshn-list-top' },
              h('span', { className: 'dshn-cap' }, `${filtered.length} / ${total}`),
            ),
            filtered.length === 0
              ? h(
                  'div',
                  { className: 'dshn-empty' },
                  loading === true ? t.loading : query !== '' || tagFilter !== '' ? t.emptySearch : t.empty,
                )
              : groups.map((group) =>
                  h(
                    React.Fragment,
                    { key: group.key },
                    h('div', { className: 'dshn-group' }, group.label),
                    ...group.notes.map((note) => {
                      const preview = previewOf(note)
                      return h(
                        'button',
                        {
                          key: note.id,
                          role: 'listitem',
                          className: 'dshn-item',
                          'data-active': String(!editing && selectedId === note.id),
                          title: titleOf(note, t),
                          onClick: () => onSelect(note.id),
                        },
                        h(
                          'span',
                          { className: 'dshn-item-top' },
                          h('span', { className: 'dshn-item-title' }, titleOf(note, t)),
                          note.pinned ? h('span', { className: 'dshn-pin', title: t.pin }, '📌') : null,
                        ),
                        preview !== '' ? h('span', { className: 'dshn-item-preview' }, preview) : null,
                        h(
                          'span',
                          { className: 'dshn-item-meta' },
                          h('span', {
                            className: 'dshn-dot',
                            'data-source': note.source ?? 'panel',
                            title: sourceLabel(note.source, t),
                          }),
                          h('span', null, formatWhen(note.updatedAt, t)),
                          ...note.tags.slice(0, 2).map((tag) => h('span', { key: tag, className: 'dshn-tag-pill' }, tag)),
                        ),
                      )
                    }),
                  ),
                ),
          ),
          h('div', {
            className: 'dshn-splitter',
            role: 'separator',
            'aria-orientation': 'vertical',
            'aria-label': t.resizeList,
            'data-hidden': String(!listOpen),
            onPointerDown: (event) => {
              event.currentTarget.setPointerCapture?.(event.pointerId)
              dragRef.current = { x: event.clientX, width: listWidth }
            },
            onPointerMove: (event) => {
              if (dragRef.current === null) return
              const next = Math.max(200, Math.min(520, dragRef.current.width + event.clientX - dragRef.current.x))
              setListWidth(next)
            },
            onPointerUp: (event) => {
              dragRef.current = null
              try {
                globalThis.localStorage?.setItem('dshn.history.listWidth', String(listWidth))
              } catch {
                /* storage may be unavailable; the width is cosmetic */
              }
              event.currentTarget.releasePointerCapture?.(event.pointerId)
            },
            onDoubleClick: () => setListWidth(280),
          }),
          h(
            'div',
            { className: 'dshn-detail' },
            selected === null
              ? h(
                  'div',
                  { className: 'dshn-empty', style: { margin: 'auto' } },
                  loading === true ? t.loading : t.selectHint,
                )
              : h(
                  React.Fragment,
                  null,
                  h(
                    'div',
                    { className: 'dshn-detail-bar' },
                    h('span', { className: 'dshn-detail-title', title: titleOf(selected, t) }, titleOf(selected, t)),
                    h('span', { className: 'dshn-grow' }),
                    h(
                      'div',
                      { className: 'dshn-detail-actions' },
                      // Pin is a state, not an action: an icon that fills in when it is on.
                      h(
                        'button',
                        {
                          className: 'dshn-icon-btn',
                          'data-on': String(selected.pinned === true),
                          title: selected.pinned ? t.unpin : t.pin,
                          'aria-label': selected.pinned ? t.unpin : t.pin,
                          'aria-pressed': String(selected.pinned === true),
                          onClick: () => void action(() => post('/update', { id: selected.id, pinned: selected.pinned !== true })),
                        },
                        h(
                          'svg',
                          { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
                          h('path', { d: 'M9 4h6l-1 6 3 3H7l3-3-1-6z' }),
                          h('path', { d: 'M12 13v7' }),
                        ),
                      ),
                      editing
                        ? null
                        : h(
                            'button',
                            { className: 'dshn-btn primary dshn-detail-edit', onClick: () => setEditing(true) },
                            t.edit,
                          ),
                      h(
                        'button',
                        {
                          className: 'dshn-icon-btn dshn-danger',
                          title: t.delete,
                          'aria-label': t.delete,
                          onClick: () => void action(() => del(`/note/${encodeURIComponent(selected.id)}`)),
                        },
                        h(
                          'svg',
                          { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
                          h('path', { d: 'M4 7h16' }),
                          h('path', { d: 'M10 7V5h4v2' }),
                          h('path', { d: 'M6 7l1 13h10l1-13' }),
                        ),
                      ),
                    ),
                  ),
                  // Editing reuses the capture components: source on the left, the laid-out
                  // result on the right, Structure / Cancel / Save in the toolbar.
                  editing
                    ? h(CaptureBox, {
                        key: 'edit-' + selected.id,
                        t,
                        layout: 'page',
                        initial: selected.body ?? '',
                        noteId: selected.id,
                        onCancel: () => setEditing(false),
                        onSaved: () => {
                          setEditing(false)
                          void refresh()
                        },
                      })
                    : h('div', { className: 'dshn-detail-body' }, renderNoteRest(selected.body ?? '')),
                  selected.tags.length > 0
                    ? h(
                        'div',
                        { className: 'dshn-tags' },
                        ...selected.tags.map((tag) => h('span', { key: tag, className: 'dshn-tag-pill', onClick: () => setTagFilter(tag) }, tag)),
                      )
                    : null,
                  h(
                    'div',
                    { className: 'dshn-foot', style: { padding: '0 12px 10px' } },
                    h('span', null, `${t.edited} ${formatWhen(selected.updatedAt, t)}`),
                    h('span', null, t.chars((selected.body ?? '').length)),
                    h('span', null, sourceLabel(selected.source, t)),
                    h('span', { className: 'dshn-grow' }),
                  ),
                ),
          ),
        ),
      )
    }

    // --------------------------------------------------------------- mount ---

    /** Sidebar icon; the list id addresses the `main` panel with the same key. */
    function NotesIcon(props) {
      const size = typeof props?.size === 'number' ? props.size : 18
      return h(React.Fragment, null, h(Styles, null), h(NoteGlyph, { size }))
    }

    /** The child slot: an embedded Conversation, pinned to the Chat view. */
    function BoardConversationView(props) {
      return props.renderSlot('conversation.session', { view: 'chat' })
    }

    /** The embedded occurrence of the native Conversation shell. */
    function BoardSurface(props) {
      return props.renderFactorySlot(
        'conversation.content',
        { variant: 'embedded', phase: 'active', hero: false },
        { slots: { views: BoardConversationView } },
      )
    }

    // Test seam: a smoke test may inspect the renderer; nothing sets this in the page.
    if (typeof globalThis !== 'undefined' && globalThis.__DSH_NOTES_TEST__ === true) {
      globalThis.__dshNotesInternals = { renderMarkdown, PreviewBusy, stripInline, titleOf, previewOf, HistoryTab, DashboardTab, Heatmap, CaptureBox, aiUsageSeries, looksStructured, composeFormattedNote, preserveLabel, sectionLabel, normalizeTranslatedLabel, detectTextLanguage, resolveTranslateTarget, renumberSequence, convertEnumeratorsToArabic, parseEnumerator, convertEnumerators, renumberByTemplate, preserveMarkup, markupOf, normalizeStrayAsterisks, normalizeIndentedBullets, indentLevel, bulletText, lineBounds, lineBulletLevel, continueBulletLine, spaceBurstLine, autoBulletLine, backspaceLine, suggestionChunks, repetitionSuggestion, formatLocally, plainLine, fidelityReport, fidelityIssues, repairCoverage, assembleIndexedLines, isCovered, typographyIssues, outlineLevels, outlineEntries, splitNoteTitle, renderNoteBody, renderNoteRest, clampSideWidth, SIDE_WIDTH_DEFAULT, SIDE_WIDTH_MIN, SIDE_WIDTH_MAX }
    }

    return {
      inject: ['slots', 'sessions'],
      apply(ctx) {
        sessionsService = ctx.sessions ?? null

        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register({ name: 'sidebar.panellist', id: 'notes', order: 25, label: () => dict().title }, NotesIcon),
        )

        // Declaring the session-scoped child is what makes the framework inject
        // SessionProvider + renderSlot into this panel entry.
        ctx.slots.inject('main', () =>
          ctx.slots.register(
            {
              name: 'main',
              key: 'notes',
              children: { 'notes.board.conversation': { kind: 'single', scope: 'session' } },
            },
            NotebookShell,
          ),
        )
        // The slot hosts the surface: only it can render the conversation.content
        // factory. Registering the view here produces a node that renders nothing.
        ctx.slots.inject('notes.board.conversation', () =>
          ctx.slots.register({ name: 'notes.board.conversation' }, BoardSurface),
        )

        // Capture lives inside the panel now (the board's 快速记录 button), so the
        // composer icon, the Alt+N shortcut and the floating card are all gone.
      },
    }
