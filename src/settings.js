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
.dshn-library { margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--dsw-alias-border-l1); }
.dshn-library h4 { margin: 0 0 4px; font-size: 13px; font-weight: 600; }
.dshn-pcard {
  display: grid;
  gap: 8px;
  padding: 12px;
  margin-bottom: 10px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1);
}
.dshn-pcard input,
.dshn-pcard textarea {
  width: 100%;
  box-sizing: border-box;
  font: inherit;
  color: inherit;
  background: transparent;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
  padding: 6px 8px;
  outline: none;
}
.dshn-pcard textarea { min-height: 64px; resize: vertical; }
.dshn-pcard input:focus,
.dshn-pcard textarea:focus { border-color: var(--dsw-alias-brand-primary); }
.dshn-pcard-head { display: flex; gap: 8px; align-items: center; }
.dshn-pcard-head input { flex: 1 1 auto; min-width: 0; width: auto; }
.dshn-pcard-head .dshn-btnm { flex: none; white-space: nowrap; }
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
.dshn-presets { display: grid; gap: 6px; }
.dshn-preset { color: var(--dsw-alias-label-secondary); font-size: 12px; }
.dshn-preset b { color: var(--dsw-alias-label-primary); font-weight: 500; margin-right: 6px; }
.dshn-settings-foot { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 14px; }
.dshn-settings-status { color: var(--dsw-alias-label-secondary); font-size: 12px; margin-left: auto; }
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
      const [draft, setDraft] = useState(null)
      const [status, setStatus] = useState('')
      const [saving, setSaving] = useState(false)

      const customOf = (list) => (Array.isArray(list) ? list : []).filter((entry) => entry.custom !== false)

      useEffect(() => {
        if (summary) return undefined
        let cancelled = false
        const read = async () => {
          try {
            const [state, library] = await Promise.all([get('/settings'), get('/voice/personas')])
            if (cancelled) return
            setSettings(state?.settings ?? null)
            const list = Array.isArray(library?.personas) ? library.personas : []
            setPersonas(list)
            setDraft(customOf(list))
          } catch {
            if (!cancelled) setStatus(dict().settingsSaveFailed)
          }
        }
        void read()
        return () => {
          cancelled = true
        }
      }, [summary])

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

      const saveDraft = async () => {
        const payload = (draft ?? [])
          .map((entry) => ({ id: entry.id, name: String(entry.name ?? '').trim(), brief: String(entry.brief ?? '').trim(), custom: true }))
          .filter((entry) => entry.name !== '' && entry.brief !== '')
        setSaving(true)
        try {
          const saved = await post('/voice/personas', { personas: payload })
          const list = Array.isArray(saved?.personas) ? saved.personas : []
          setPersonas(list)
          setDraft(customOf(list))
          // A persona deleted here may still be the one the notebook points at; clear a dangling id.
          const ids = new Set(list.map((entry) => entry.id))
          if (settings !== null && settings.personaId !== '' && !ids.has(settings.personaId)) {
            await saveSettings({ personaId: '' })
          }
          flash(t0.settingsSaved)
        } catch {
          flash(t0.settingsSaveFailed)
        } finally {
          setSaving(false)
        }
      }

      if (settings === null) {
        return h('div', { className: 'dshn-settings' }, h(NotesSettingsStyle), h('div', { className: 'dshn-settings-intro' }, t.settingsIntro))
      }

      const presets = personas.filter((entry) => entry.custom === false)
      const manual = settings.mode !== 'auto'
      const choosePersona = (event) => void saveSettings({ personaId: event.target.value, mode: 'manual' })

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

        h(
          'div',
          { className: 'dshn-library' },
          h('h4', null, t.settingsLibrary),
          h('div', { className: 'dshn-setting-hint' }, t.settingsLibraryHint),
          (draft ?? []).map((entry, index) =>
            h(
              'div',
              { className: 'dshn-pcard', key: String(entry.id ?? index), style: { marginTop: '12px' } },
              h(
                'div',
                { className: 'dshn-pcard-head' },
                h('input', {
                  value: entry.name ?? '',
                  placeholder: t.personaName,
                  'aria-label': t.personaName,
                  onChange: (event) =>
                    setDraft((current) => {
                      const list = (current ?? []).slice()
                      list[index] = { ...list[index], name: event.target.value }
                      return list
                    }),
                }),
                entry.origin === 'auto' ? h('span', { className: 'dshn-pcard-tag' }, t.settingsAutoTag) : null,
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dshn-btnm',
                    onClick: () => setDraft((current) => (current ?? []).filter((_, at) => at !== index)),
                  },
                  t.personaDelete,
                ),
              ),
              h('textarea', {
                value: entry.brief ?? '',
                placeholder: t.personaBrief,
                'aria-label': t.personaBrief,
                onChange: (event) =>
                  setDraft((current) => {
                    const list = (current ?? []).slice()
                    list[index] = { ...list[index], brief: event.target.value }
                    return list
                  }),
              }),
            ),
          ),
          (draft ?? []).length === 0 ? h('div', { className: 'dshn-setting-hint', style: { marginTop: '10px' } }, t.settingsEmptyCustom) : null,
          h(
            'div',
            { className: 'dshn-settings-foot' },
            h(
              'button',
              {
                type: 'button',
                className: 'dshn-btnm',
                onClick: () =>
                  setDraft((current) => [...(current ?? []), { id: `own-${Date.now().toString(36)}`, name: '', brief: '', custom: true }]),
              },
              t.settingsAdd,
            ),
            h('span', { className: 'dshn-grow' }),
            h('span', { className: 'dshn-settings-status' }, status),
            h('button', { type: 'button', className: 'dshn-btnm primary', disabled: saving, onClick: () => void saveDraft() }, saving ? t.personaSaving : t.personaSave),
          ),
          h(
            'div',
            { style: { marginTop: '18px' } },
            h('div', { className: 'dshn-setting-hint' }, t.settingsPresets),
            h(
              'div',
              { className: 'dshn-presets', style: { marginTop: '8px' } },
              ...presets.map((entry) =>
                h(
                  'div',
                  { className: 'dshn-preset', key: entry.id },
                  h('b', null, detectLanguage() === 'zh' ? entry.name : (entry.nameEn ?? entry.name)),
                  String(entry.welcome ?? ''),
                ),
              ),
            ),
          ),
        ),
      )
    }
