    // ------------------------------------------------------- settings page ---
    //
    // The bundle's own page on the Plugins screen: `plugins.bundle.config`, keyed by the package name.
    // It is the only place personas are edited now — the capture page shows who is in the room, and
    // nothing else. Styles live here rather than in the panel's STYLES because this component renders
    // while the panel is closed, and a style element is removed when it unmounts.

    const SETTINGS_STYLES = `
.dshn-settings {
  max-width: 680px;
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  line-height: 1.55;
}
.dshn-settings h3 { margin: 0 0 6px; font-size: 15px; font-weight: 600; }
.dshn-settings-intro { margin: 0 0 20px; color: var(--dsw-alias-label-secondary); }
.dshn-setting { display: flex; align-items: flex-start; gap: 18px; padding: 14px 0; border-top: 1px solid var(--dsw-alias-border-l1); }
.dshn-setting-text { flex: 1 1 auto; min-width: 0; }
.dshn-setting-label { font-weight: 500; }
.dshn-setting-hint { margin-top: 2px; color: var(--dsw-alias-label-secondary); font-size: 12px; }
.dshn-setting-side { flex: 0 0 auto; padding-top: 1px; }
.dshn-settings-switch {
  position: relative;
  width: 38px;
  height: 22px;
  padding: 0;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 11px;
  background: var(--dsw-alias-bg-layer-2);
  cursor: pointer;
  transition: background .15s ease;
}
.dshn-settings-switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--dsw-alias-label-secondary);
  transition: transform .15s ease, background .15s ease;
}
.dshn-settings-switch[aria-checked='true'] { background: var(--dsw-alias-brand-primary); border-color: transparent; }
/* The knob is inverted before it is white: in this theme the brand accent itself is light, so a literal
   white knob would vanish into the track. bg-base is the one colour guaranteed to sit against it. */
.dshn-settings-switch[aria-checked='true']::after { transform: translateX(16px); background: var(--dsw-alias-bg-base); }
.dshn-seg { display: inline-flex; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; overflow: hidden; }
.dshn-seg button {
  border: 0;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  padding: 5px 12px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.dshn-seg button[aria-pressed='true'] { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.dshn-settings-select {
  max-width: 220px;
  font: inherit;
  font-size: 12px;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
  padding: 5px 8px;
}
.dshn-lib-head { display: flex; gap: 8px; align-items: center; margin-bottom: 4px; }
.dshn-lib-title { flex: 1 1 auto; font-size: 14px; font-weight: 600; }
.dshn-plist { display: grid; gap: 6px; margin-top: 8px; }
.dshn-prow {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas: 'name tags' 'sub sub';
  gap: 2px 10px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.dshn-prow:hover { background: var(--dsw-alias-bg-layer-2); }
.dshn-prow-name { grid-area: name; font-size: 13px; font-weight: 500; }
.dshn-prow-sub {
  grid-area: sub;
  overflow: hidden;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dshn-prow-tags { grid-area: tags; display: flex; gap: 4px; }
.dshn-edit { display: grid; gap: 4px; margin-top: 12px; }
.dshn-edit .dshn-setting-field:first-child { border-top: none; padding-top: 0; }
.dshn-pbrief { min-height: 130px; resize: vertical; line-height: 1.6; }
.dshn-pcard-tag {
  flex: none;
  padding: 1px 6px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 999px;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  line-height: 1.5;
}
.dshn-settings .dshn-grow { flex: 1 1 auto; }
.dshn-btnm {
  border: 1px solid var(--dsw-alias-border-l1);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  border-radius: 8px;
  padding: 5px 12px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.dshn-btnm:hover { background: var(--dsw-alias-bg-layer-2); }
.dshn-btnm.primary { background: var(--dsw-alias-brand-primary); border-color: transparent; color: var(--dsw-alias-bg-base); font-weight: 500; }
.dshn-btnm:disabled { opacity: .5; cursor: default; }
.dshn-settings-foot { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 14px; }
.dshn-settings-status { color: var(--dsw-alias-label-secondary); font-size: 12px; margin-left: auto; }
.dshn-backup { margin-top: 26px; padding-top: 16px; border-top: 1px solid var(--dsw-alias-border-l1); }
.dshn-backup h4 { margin: 0 0 4px; font-size: 13px; font-weight: 600; }
.dshn-setting-field { display: grid; gap: 5px; padding: 12px 0; border-top: 1px solid var(--dsw-alias-border-l1); }
.dshn-setting-field label { color: var(--dsw-alias-label-secondary); font-size: 12px; }
.dshn-settings-input {
  width: 100%;
  box-sizing: border-box;
  font: inherit;
  font-size: 12px;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
  padding: 6px 8px;
  outline: none;
}
.dshn-settings-input:focus { border-color: var(--dsw-alias-brand-primary); }
.dshn-settings-note { margin-top: 8px; color: var(--dsw-alias-label-secondary); font-size: 12px; }
.dshn-settings-note.bad { color: var(--dsw-alias-label-error, #c0392b); }
`

    function NotesSettingsStyle() {
      return h('style', { 'data-dsh-notes-settings': '' }, SETTINGS_STYLES)
    }

    /** One labelled setting; the control sits at the right edge. */
    function SettingRow({ label, hint, side }) {
      return h(
        'div',
        { className: 'dshn-setting' },
        h(
          'div',
          { className: 'dshn-setting-text' },
          h('div', { className: 'dshn-setting-label' }, label),
          hint === undefined || hint === '' ? null : h('div', { className: 'dshn-setting-hint' }, hint),
        ),
        h('div', { className: 'dshn-setting-side' }, side),
      )
    }

    function SettingsSwitch({ checked, onChange, label }) {
      return h('button', {
        type: 'button',
        role: 'switch',
        'aria-checked': String(checked === true),
        'aria-label': label,
        className: 'dshn-settings-switch',
        onClick: () => onChange(checked !== true),
      })
    }

    /**
     * The writing partner's switch board.
     *
     * Shows `view: 'page'` on the bundle's Plugins page; the same slot renders a one-line summary in
     * row mode, where this returns nothing so the row stays as small as the host drew it.
     */
    function NotesSettings(props) {
      const t = dict()
      const summary = props?.view === 'summary'
      const [settings, setSettings] = useState(null)
      const [personas, setPersonas] = useState([])
      const [view, setView] = useState('main')
      const [card, setCard] = useState(null)
      const [confirmDelete, setConfirmDelete] = useState(false)
      const [personaStatus, setPersonaStatus] = useState('')
      const [status, setStatus] = useState('')
      const [saving, setSaving] = useState(false)
      const [backup, setBackup] = useState(null)
      const [form, setForm] = useState({})
      const [busy, setBusy] = useState('')
      const [notice, setNotice] = useState(null)

      const openLibrary = () => {
        setCard(null)
        setConfirmDelete(false)
        setPersonaStatus('')
        setView('library')
      }

      useEffect(() => {
        if (summary) return undefined
        let cancelled = false
        const read = async () => {
          try {
            const [state, library, backupState] = await Promise.all([
              get('/settings'),
              get('/voice/personas'),
              get('/sync/state').catch(() => null),
            ])
            if (cancelled) return
            setSettings(state?.settings ?? null)
            setBackup(backupState?.sync ?? null)
            const list = Array.isArray(library?.personas) ? library.personas : []
            setPersonas(list)
          } catch {
            if (!cancelled) setStatus(dict().settingsSaveFailed)
          }
        }
        void read()
        return () => {
          cancelled = true
        }
      }, [summary])

      /** The typed destination starts as what is stored; after that the field is the source. */
      useEffect(() => {
        if (settings === null) return
        const sync = settings.sync ?? {}
        setForm((current) =>
          Object.keys(current).length > 0
            ? current
            : { folder: String(sync.folder ?? ''), url: String(sync.url ?? ''), username: String(sync.username ?? ''), password: '', limit: String(settings.history?.limit ?? 50) },
        )
      }, [settings])

      if (summary) return null
      const t0 = t
      const flash = (message) => {
        setStatus(message)
        setTimeout(() => setStatus(''), 1800)
      }

      /** One patch over what is stored; the response is what the panel keeps, not the guess. */
      const saveSettings = async (patch) => {
        setSettings((current) => (current === null ? current : { ...current, ...patch }))
        try {
          const saved = await post('/settings', { settings: patch })
          if (saved?.settings) setSettings(saved.settings)
          flash(t0.settingsSaved)
        } catch {
          flash(t0.settingsSaveFailed)
        }
      }

      /**
       * `sync` and `history` are objects of their own; a patch carries the whole object.
       *
       * The password is never part of the base: the server only sends back whether one is stored, so
       * echoing it would wipe the stored one on every unrelated toggle.
       */
      const patchSync = (patch) => {
        const { password: _password, passwordSet: _passwordSet, ...base } = settings?.sync ?? {}
        void saveSettings({ sync: { ...base, ...patch } })
      }
      const patchHistory = (patch) => saveSettings({ history: { ...(settings?.history ?? {}), ...patch } })

      /** A text field is committed when it loses focus, not on every keystroke. */
      const commitField = (field) => {
        const value = String(form[field] ?? '').trim()
        if (field === 'password') {
          const raw = String(form.password ?? '')
          if (raw === '' && settings?.sync?.passwordSet !== true) return
          void patchSync({ password: raw })
          return
        }
        if (value === String(settings?.sync?.[field] ?? '')) return
        void patchSync({ [field]: value })
      }

      const commitLimit = () => {
        const value = Math.max(1, Math.min(500, Math.round(Number(form.limit ?? 50) || 50)))
        setForm((current) => ({ ...current, limit: String(value) }))
        if (value !== Number(settings?.history?.limit ?? 50)) void patchHistory({ limit: value })
      }

      const runTest = async () => {
        setBusy('test')
        setNotice(null)
        try {
          const result = await post('/sync/test', {})
          const test = result?.test ?? {}
          setNotice({ ok: test.ok === true, text: String(test.message ?? (test.ok ? t0.backupReachable : t0.backupUnreachable)) })
        } catch (error) {
          setNotice({ ok: false, text: String(error?.message ?? t0.backupUnreachable) })
        } finally {
          setBusy('')
        }
      }

      const runSync = async () => {
        setBusy('run')
        setNotice(null)
        try {
          const result = await post('/sync/run', {})
          const next = result?.sync ?? null
          if (next !== null) setBackup(next)
          setNotice({
            ok: next?.lastResult !== 'error',
            text: next?.lastResult === 'error' ? String(next.lastError ?? t0.backupUnreachable) : t0.backupDone,
          })
        } catch (error) {
          setNotice({ ok: false, text: String(error?.message ?? t0.backupUnreachable) })
        } finally {
          setBusy('')
        }
      }

      /** Open one person. A preset's card starts from the shipped text, which is what is stored now. */
      const openPersona = (entry) => {
        setConfirmDelete(false)
        setPersonaStatus('')
        setCard({
          id: entry.id,
          name: String(entry.name ?? ''),
          nameEn: String(entry.nameEn ?? ''),
          welcome: String(entry.welcome ?? ''),
          brief: String(entry.brief ?? ''),
          preset: entry.preset === true,
          custom: entry.custom === true,
          origin: String(entry.origin ?? ''),
          edited: entry.edited === true,
        })
        setView('persona')
      }

      const newPersona = () => {
        setConfirmDelete(false)
        setPersonaStatus('')
        setCard({ id: `own-${Date.now().toString(36)}`, name: '', nameEn: '', welcome: '', brief: '', preset: false, custom: true, edited: false, origin: '' })
        setView('persona')
      }

      /** One card, one request. Saving a preset keeps its id, so the shipped one is overridden, not copied. */
      const savePersona = async () => {
        if (card === null) return
        const name = String(card.name ?? '').trim()
        const brief = String(card.brief ?? '').trim()
        if (name === '' || brief === '') {
          setPersonaStatus(t0.personaRequired)
          return
        }
        setSaving(true)
        setPersonaStatus('')
        try {
          const saved = await post('/voice/personas/save', {
            persona: { id: card.id, name, nameEn: card.nameEn, welcome: card.welcome, brief },
          })
          setPersonas(Array.isArray(saved?.personas) ? saved.personas : [])
          setView('library')
          flash(t0.settingsSaved)
        } catch {
          setPersonaStatus(t0.settingsSaveFailed)
        } finally {
          setSaving(false)
        }
      }

      const resetPersona = async () => {
        if (card === null) return
        setSaving(true)
        setPersonaStatus('')
        try {
          const saved = await post('/voice/personas/reset', { id: card.id })
          setPersonas(Array.isArray(saved?.personas) ? saved.personas : [])
          setView('library')
          flash(t0.personaResetDone)
        } catch {
          setPersonaStatus(t0.settingsSaveFailed)
        } finally {
          setSaving(false)
        }
      }

      /** Two clicks: the first arms it, the second deletes. A mis-click costs one extra click, not a person. */
      const deletePersona = async () => {
        if (card === null) return
        if (confirmDelete !== true) {
          setConfirmDelete(true)
          return
        }
        setSaving(true)
        setPersonaStatus('')
        try {
          const saved = await post('/voice/personas/delete', { id: card.id })
          const list = Array.isArray(saved?.personas) ? saved.personas : []
          setPersonas(list)
          // The notebook may still point at the person that just left; clear the dangling id.
          const ids = new Set(list.map((entry) => entry.id))
          if (settings !== null && settings.personaId !== '' && !ids.has(settings.personaId)) {
            await saveSettings({ personaId: '' })
          }
          setView('library')
          flash(t0.settingsSaved)
        } catch {
          setPersonaStatus(t0.settingsSaveFailed)
        } finally {
          setSaving(false)
        }
      }

      if (settings === null) {
        return h('div', { className: 'dshn-settings' }, h(NotesSettingsStyle), h('div', { className: 'dshn-settings-intro' }, t.settingsIntro))
      }

      const manual = settings.mode !== 'auto'
      const sync = settings.sync ?? {}
      const history = settings.history ?? {}
      const destination = sync.mode ?? 'off'
      const keepHistory = history.keep !== false

      /** One labelled text field; the value is committed when it loses focus. */
      const field = (key, label, placeholder, hint, type = 'text') =>
        h(
          'div',
          { className: 'dshn-setting-field' },
          h('label', { htmlFor: `dshn-sync-${key}` }, label),
          h('input', {
            id: `dshn-sync-${key}`,
            className: 'dshn-settings-input',
            type,
            value: String(form[key] ?? ''),
            placeholder,
            autoComplete: 'off',
            spellCheck: 'false',
            onChange: (event) => setForm((current) => ({ ...current, [key]: event.target.value })),
            onBlur: () => commitField(key),
            onKeyDown: (event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
            },
          }),
          hint === '' ? null : h('div', { className: 'dshn-setting-hint' }, hint),
        )

      /** What the engine last did, in one line: the panel's only honest answer about the NAS. */
      const backupLine = () => {
        if (notice !== null) return notice
        if (backup === null) return null
        if (backup.lastResult === 'error') return { ok: false, text: `${t.backupFailed} ${backup.lastError}` }
        if (backup.lastResult === 'ok' && backup.lastAt) {
          return { ok: true, text: `${t.backupLastOk} ${new Date(backup.lastAt).toLocaleString()}` }
        }
        return { ok: true, text: t.backupNever }
      }
      const line = backupLine()

      const choosePersona = (event) => void saveSettings({ personaId: event.target.value, mode: 'manual' })

      const displayName = (entry) =>
        detectLanguage() === 'zh' ? String(entry.name ?? '') : String(entry.nameEn ?? entry.name ?? '')

      /** The library: presets and own cards alike, one row each. The whole row is the door. */
      const libBody = () =>
        h(
          'div',
          null,
          h(
            'div',
            { className: 'dshn-lib-head' },
            h('button', { type: 'button', className: 'dshn-btnm', onClick: () => setView('main') }, `← ${t0.personaBack}`),
            h('div', { className: 'dshn-lib-title' }, t0.settingsLibrary),
            h('button', { type: 'button', className: 'dshn-btnm', onClick: newPersona }, t0.personaNew),
          ),
          h('div', { className: 'dshn-setting-hint', style: { marginBottom: '10px' } }, t0.settingsLibraryHint),
          h(
            'div',
            { className: 'dshn-plist' },
            ...personas.map((entry) =>
              h(
                'button',
                { type: 'button', key: entry.id, className: 'dshn-prow', onClick: () => openPersona(entry) },
                h('span', { className: 'dshn-prow-name' }, displayName(entry)),
                h('span', { className: 'dshn-prow-sub' }, String(entry.welcome ?? entry.brief ?? '')),
                h(
                  'span',
                  { className: 'dshn-prow-tags' },
                  h(
                    'span',
                    { className: 'dshn-pcard-tag' },
                    entry.origin === 'auto' ? t0.settingsAutoTag : entry.custom === false ? t0.personaPresetTag : t0.personaOwnTag,
                  ),
                  entry.edited === true ? h('span', { className: 'dshn-pcard-tag' }, t0.personaEditedTag) : null,
                ),
              ),
            ),
          ),
        )

      /** One person's card. Name, greeting, and the brief that is the whole behaviour. */
      const editBody = () =>
        h(
          'div',
          null,
          h(
            'div',
            { className: 'dshn-lib-head' },
            h('button', { type: 'button', className: 'dshn-btnm', onClick: () => setView('library') }, `← ${t0.personaBack}`),
            h('div', { className: 'dshn-lib-title' }, card.preset === true ? t0.personaEditPreset : t0.personaEditTitle),
          ),
          h(
            'div',
            { className: 'dshn-edit' },
            h(
              'div',
              { className: 'dshn-setting-field' },
              h('label', { htmlFor: 'dshn-persona-name' }, t0.personaName),
              h('input', {
                id: 'dshn-persona-name',
                className: 'dshn-settings-input',
                value: card.name ?? '',
                placeholder: t0.personaName,
                onChange: (event) => setCard({ ...card, name: event.target.value }),
              }),
            ),
            h(
              'div',
              { className: 'dshn-setting-field' },
              h('label', { htmlFor: 'dshn-persona-welcome' }, t0.personaWelcome),
              h('input', {
                id: 'dshn-persona-welcome',
                className: 'dshn-settings-input',
                value: card.welcome ?? '',
                placeholder: t0.personaWelcomeHint,
                onChange: (event) => setCard({ ...card, welcome: event.target.value }),
              }),
            ),
            h(
              'div',
              { className: 'dshn-setting-field' },
              h('label', { htmlFor: 'dshn-persona-brief' }, t0.personaBrief),
              h('textarea', {
                id: 'dshn-persona-brief',
                className: 'dshn-settings-input dshn-pbrief',
                value: card.brief ?? '',
                placeholder: t0.personaBrief,
                onChange: (event) => setCard({ ...card, brief: event.target.value }),
              }),
              h('div', { className: 'dshn-setting-hint' }, t0.personaBriefHint),
            ),
          ),
          h(
            'div',
            { className: 'dshn-settings-foot' },
            card.custom === true
              ? h(
                  'button',
                  { type: 'button', className: 'dshn-btnm', disabled: saving, onClick: () => void deletePersona() },
                  confirmDelete ? t0.personaDeleteConfirm : t0.personaDelete,
                )
              : card.edited === true
                ? h('button', { type: 'button', className: 'dshn-btnm', disabled: saving, onClick: () => void resetPersona() }, t0.personaReset)
                : null,
            h('span', { className: 'dshn-grow' }),
            personaStatus === '' ? null : h('span', { className: 'dshn-settings-status' }, personaStatus),
            h('button', { type: 'button', className: 'dshn-btnm primary', disabled: saving, onClick: () => void savePersona() }, saving ? t0.personaSaving : t0.personaSave),
          ),
        )

      if (view === 'library') {
        return h('div', { className: 'dshn-settings' }, h(NotesSettingsStyle), libBody())
      }
      if (view === 'persona' && card !== null) {
        return h('div', { className: 'dshn-settings' }, h(NotesSettingsStyle), editBody())
      }

      return h(
        'div',
        { className: 'dshn-settings' },
        h(NotesSettingsStyle),
        h('h3', null, t.settingsTitle),
        h('p', { className: 'dshn-settings-intro' }, t.settingsIntro),

        h(SettingRow, {
          label: t.settingsEnabled,
          hint: t.settingsEnabledHint,
          side: h(SettingsSwitch, {
            checked: settings.enabled === true,
            label: t.settingsEnabled,
            onChange: (next) => void saveSettings({ enabled: next }),
          }),
        }),

        h(SettingRow, {
          label: t.settingsMode,
          hint: manual ? t.settingsModeManualHint : t.settingsModeAutoHint,
          side: h(
            'div',
            { className: 'dshn-seg', role: 'group', 'aria-label': t.settingsMode },
            h(
              'button',
              { type: 'button', 'aria-pressed': String(!manual), onClick: () => void saveSettings({ mode: 'auto' }) },
              t.settingsModeAuto,
            ),
            h(
              'button',
              { type: 'button', 'aria-pressed': String(manual), onClick: () => void saveSettings({ mode: 'manual' }) },
              t.settingsModeManual,
            ),
          ),
        }),

        h(SettingRow, {
          label: t.settingsPersona,
          hint: manual ? '' : t.settingsPersonaAutoHint,
          side: h(
            'select',
            {
              className: 'dshn-settings-select',
              value: settings.personaId ?? '',
              disabled: !manual,
              onChange: choosePersona,
            },
            h('option', { value: '' }, t.settingsPersonaNone),
            ...personas.map((entry) =>
              h('option', { key: entry.id, value: entry.id }, detectLanguage() === 'zh' ? entry.name : (entry.nameEn ?? entry.name)),
            ),
          ),
        }),

        h(SettingRow, {
          label: t.settingsLibrary,
          hint: t.settingsLibraryHint,
          side: h('button', { type: 'button', className: 'dshn-btnm', onClick: openLibrary }, `${t.settingsLibraryManage} →`),
        }),
        status === '' ? null : h('div', { className: 'dshn-settings-status', style: { marginTop: '8px' } }, status),

        // ── the copy that lives somewhere else ───────────────────────────────────────────────
        h(
          'div',
          { className: 'dshn-backup' },
          h('h4', null, t.backupTitle),
          h('div', { className: 'dshn-setting-hint' }, t.backupIntro),

          h(SettingRow, {
            label: t.backupDestination,
            hint: destination === 'folder' ? t.backupFolderHint : destination === 'webdav' ? t.backupWebdavHint : t.backupOffHint,
            side: h(
              'div',
              { className: 'dshn-seg', role: 'group', 'aria-label': t.backupDestination },
              ...[
                ['off', t.backupOff],
                ['folder', t.backupFolder],
                ['webdav', t.backupWebdav],
              ].map(([value, label]) =>
                h(
                  'button',
                  {
                    type: 'button',
                    key: value,
                    'aria-pressed': String(destination === value),
                    onClick: () => void patchSync({ mode: value }),
                  },
                  label,
                ),
              ),
            ),
          }),

          destination === 'folder' ? field('folder', t.backupFolderPath, '\\\\nas\\notes', t.backupFolderPathHint) : null,
          destination === 'webdav'
            ? [
                h('div', { key: 'url' }, field('url', t.backupUrl, 'https://nas.local:5006/dsh-notes', t.backupUrlHint)),
                h('div', { key: 'user' }, field('username', t.backupUser, '', t.backupUserHint)),
                h('div', { key: 'pass' }, field('password', t.backupPass, '••••••', t.backupPassHint, 'password')),
              ]
            : null,

          h(SettingRow, {
            label: t.backupAuto,
            hint: t.backupAutoHint,
            side: h(SettingsSwitch, {
              checked: sync.auto !== false,
              label: t.backupAuto,
              onChange: (next) => void patchSync({ auto: next }),
            }),
          }),

          h(SettingRow, {
            label: t.backupMirror,
            hint: t.backupMirrorHint,
            side: h(SettingsSwitch, {
              checked: sync.mirror !== false,
              label: t.backupMirror,
              onChange: (next) => void patchSync({ mirror: next }),
            }),
          }),

          h(
            'div',
            { className: 'dshn-settings-foot' },
            h(
              'button',
              {
                type: 'button',
                className: 'dshn-btnm',
                disabled: busy !== '' || destination === 'off',
                onClick: () => void runTest(),
              },
              busy === 'test' ? t.backupTesting : t.backupTest,
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'dshn-btnm primary',
                disabled: busy !== '' || destination === 'off',
                onClick: () => void runSync(),
              },
              busy === 'run' ? t.backupRunning : t.backupNow,
            ),
            line === null ? null : h('span', { className: `dshn-settings-note${line.ok ? '' : ' bad'}` }, line.text),
          ),

          // ── what the copies are for ────────────────────────────────────────────────────────
          h('h4', { style: { marginTop: '24px' } }, t.historyTitle),
          h(SettingRow, {
            label: t.historyKeep,
            hint: t.historyKeepHint,
            side: h(SettingsSwitch, {
              checked: keepHistory,
              label: t.historyKeep,
              onChange: (next) => void patchHistory({ keep: next }),
            }),
          }),
          keepHistory
            ? h(SettingRow, {
                label: t.historyLimit,
                hint: t.historyLimitHint,
                side: h('input', {
                  className: 'dshn-settings-input',
                  type: 'number',
                  min: '1',
                  max: '500',
                  value: String(form.limit ?? 50),
                  style: { width: '88px' },
                  'aria-label': t.historyLimit,
                  onChange: (event) => setForm((current) => ({ ...current, limit: event.target.value })),
                  onBlur: () => commitLimit(),
                }),
              })
            : null,
        ),
      )
    }
