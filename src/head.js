    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useMemo, useCallback, useRef } = React

    const API = '/notes/api'
    /** How often the notebook re-reads its data; the tools and the AI may write meanwhile. */
    const POLL_MS = 5000

    // ------------------------------------------------------------------ i18n ---

    const STRINGS = {
      zh: {
        title: '记事本',
        subtitle: '随手记 · Ctrl/⌘+Enter 保存',
        tabCapture: '记录',
        tabHistory: '历史',
        tabAi: 'AI 处理',
        tabBoard: '看板',
        chartTerms: '高频词',
        boardNoHost: '宿主没有注入会话组件，看板问答不可用。',
        boardStarting: '正在准备会话…',
        boardNotReady: '还没有会话。创建后即可提问。',
        boardFailed: '对话没能打开：',
        boardRetry: '重试',
        boardRenderFailed: '对话渲染失败：',
        boardResize: '拖动调整宽度（双击复位）',
        quickNote: '快速记录',
        quickNoteClose: '返回对话',
        quickNoteTags: '标签，用逗号分隔',
        quickNoteHint: 'Ctrl/⌘+Enter 保存',
        boardReadOnly: '只读：可以查询和分析，不会改动笔记',

        // ---- 看板 ----
        statNotes: '笔记',
        statTags: '标签',
        statChars: '总字数',
        statStreak: '连续天数',
        statActiveDays: '30 天活跃',
        statAiCalls: 'AI 调用',
        statTokens: 'Token 总量',
        statCacheRead: '缓存命中',
        chartTokens: '每天 Token 用量',
        chartCreated: '最近 30 天新增',
        chartCalendar: '最近一年的记录',
        chartTags: '标签分布',
        chartSources: '来源分布',
        chartLengths: '篇幅分布',
        chartHours: '活跃时段',
        chartAi: 'AI 使用',
        boardTempCharts: '本次对话新增的图表',
        boardPinnedCharts: '已固定的图表',
        boardChatTitle: '问数据',
        boardChatHint: '问任何关于笔记的问题，比如「我最近写得怎么样」「哪些标签我最少用」。合适的图表会显示在左边。',
        boardChatPlaceholder: '我最近一周写得怎么样？',
        boardChatHintKeys: 'Ctrl/⌘+Enter 发送',
        boardAvgFirst: '平均首字',
        ask: '提问',
        thinking: '思考中…',

        // ---- copilot ----
        copilotTitle: 'Copilot',
        copilotHide: '收起 Copilot',
        copilotShow: '展开 Copilot',
        copilotComplete: '续写',
        copilotPolish: '润色',
        copilotTranslate: '翻译',
        copilotExpand: '展开',
        copilotSummarize: '摘要',
        copilotAsk: '提问',
        copilotAskPlaceholder: '针对这段问 AI…',
        copilotHint: '选中正文里的文字，再点一个动作；不选就处理整篇。',
        copilotSelectionHint: '将只处理选中的文字',
        copilotWholeHint: '没有选中文字，将处理整篇笔记',
        copilotSelection: (count) => '已选 ' + count + ' 字',
        copilotWhole: '整篇',
        copilotClear: '清空',
        copilotAppend: '加到文末',
        copilotReplaceSelection: '替换选中',
        copilotReplaceAll: '替换全文',
        composePlaceholder: '写点什么… 第一行会成为标题',
        enhance: '结构化',
        format: 'Format',
        formatting: '整理中…',
        formatHint: '把整篇整理成结构化笔记，结果显示在下方（Ctrl/⌘+Shift+F）',
        formatSelection: 'Format 选中',
        formatSelectionHint: '只整理选中的内容（Ctrl/⌘+Shift+F）',
        renderedSelection: '选中部分的整理结果',
        apply: '应用',
        applyHint: '用整理结果替换源文本（只替换被格式化的部分）',
        applied: '已应用到源文本',
        discardFormatted: '放弃',
        formatted: '已整理',
        formattedPreview: '排版后',
        rendered: '渲染',
        translate: '翻译',
        translating: '翻译中…',
        translateTarget: '翻译目标语言',
        translateAuto: '自动（中英互译）',
        translateHint: '把选中的内容翻译成目标语言；没有选中就翻译整篇',
        translateSelection: 'Translate 选中',
        translated: '译文',
        translatedSelection: '选中部分的译文',
        preview: '预览',
        previewHint: '预览渲染效果（Ctrl/⌘+P）',
        editSource: '编辑',
        clickToEdit: '点击回到编辑',

        targetLang: '输出语言',
        langAuto: '跟随原文',
        enhancing: '整理中…',
        enhanceStop: '停止',
        structureSelection: 'Structure 选中',
        enhanceSelectionScope: '选中内容',
        enhanceStopped: '已停止',
        enhanceHint: '让 AI 把这段整理成标题、正文和标签；整理结果可以编辑后再保存',
        enhanceFailed: '整理失败',
        enhanceSlow: (seconds) => `已等 ${seconds} 秒，模型还在写⬦`,
        collapseList: '收起列表',
        expandList: '展开列表',
        preview: '预览',
        markdown: 'Markdown',
        search: '搜索笔记（全文）',
        save: '保存',
        saving: '保存中…',
        saved: '已保存',
        all: '全部',
        trash: '回收站',
        tags: '标签',
        untitled: '无标题',
        pin: '置顶',
        unpin: '取消置顶',
        delete: '移到回收站',
        restore: '恢复',
        loading: '加载中…',
        empty: '这里还没有笔记。在上面写第一句，按 Ctrl/⌘+Enter 保存。',
        emptySearch: '没有匹配的笔记。',
        emptyTrash: '回收站是空的。',
        selectHint: '在左侧选择一条笔记，或回到「记录」写新的。',
        today: '今天',
        yesterday: '昨天',
        earlier: '更早',
        edited: '已编辑',
        edit: '编辑',
        cancel: '取消',
        chars: (n) => `${n} 字`,
        sourcePanel: '面板',
        sourceCommand: '命令',
        sourceAgent: '助手',
        sourceAi: 'AI',
        savedIn: '保存在',
        failed: (message) => `出错了：${message}`,
        composerLabel: '记丬条',
        composerTitle: '记一条笔记：打开随手记卡片（也可以直接用 /note 内容）',
        enhanceTitle: 'AI 整理结果',
        enhanceSub: '确认无误再保存；保存后原始文本不会单独再存一条。',
        enhanceTags: '标签（逗号分隔）',
        enhanceNotes: 'AI 的说明',
        enhanceSave: '保存为笔记',
        enhanceDiscard: '放弃',
        enhanceOpenSession: '打开这次对话',
        enhanceKeepSource: '同时保留我的原始内容',
        aiTitle: '记事本助手',
        aiIntro: '它认识你现在的笔记：可以帮你找、整理、改标签、合并，或把几条合成一份新笔记。',
        aiStart: '开始对话',
        aiStarting: '正在打开会话…',
        aiRebuild: '重建会话',
        aiPresetMissing: '记事本助手预设未安装：对话会以「你的笔记现状」作为首条消息开始，能力稍弱但可用。',
        aiPromptPlaceholder: '问它：上周关于接口的笔记有哪些？或者：把这几条会议记录合并成一份',
        aiContext: '它启动时看到的是这些笔记；之后可以用工具继续查。',
        aiFeatures: [
          '「我的笔记都记了什么？」——按时间或主题概括',
          '「找出重复或可以合并的」——给出合并草案',
          '「把这些标签统一」——草案 + 一键应用',
          '「把这条整理成待办」——结构化后直接保存',
        ],
      },
      en: {
        title: 'Notebook',
        subtitle: 'Quick notes · Ctrl/⌘+Enter to save',
        tabCapture: 'Capture',
        tabHistory: 'History',
        tabAi: 'AI',
        tabBoard: 'Board',
        chartTerms: 'Top terms',
        boardNoHost: 'The host did not inject the conversation component.',
        boardStarting: 'Preparing the session…',
        boardNotReady: 'No session yet. Create one to ask questions.',
        boardFailed: 'The conversation did not open: ',
        boardRetry: 'Retry',
        boardRenderFailed: 'The conversation failed to render:',
        boardResize: 'Drag to resize (double-click to reset)',
        quickNote: 'Quick note',
        quickNoteClose: 'Back to chat',
        quickNoteTags: 'Tags, comma separated',
        quickNoteHint: 'Ctrl/⌘+Enter to save',
        boardReadOnly: 'Read-only: queries and analysis, never edits',

        // ---- board ----
        statNotes: 'Notes',
        statTags: 'Tags',
        statChars: 'Characters',
        statStreak: 'Day streak',
        statActiveDays: 'Active in 30d',
        statAiCalls: 'AI calls',
        statTokens: 'Tokens',
        statCacheRead: 'Cache reads',
        chartTokens: 'Tokens per day',
        chartCreated: 'Created in the last 30 days',
        chartCalendar: 'The last year',
        chartTags: 'Tags',
        chartSources: 'Sources',
        chartLengths: 'Length',
        chartHours: 'Active hours',
        chartAi: 'AI usage',
        boardTempCharts: 'Charts from this conversation',
        boardPinnedCharts: 'Pinned charts',
        boardChatTitle: 'Ask the data',
        boardChatHint: 'Ask anything about your notes — "how did I write last week", "which tags do I use least". Suitable charts appear on the left.',
        boardChatPlaceholder: 'How did I write last week?',
        boardChatHintKeys: 'Ctrl/⌘+Enter to send',
        boardAvgFirst: 'Avg first token',
        ask: 'Ask',
        thinking: 'Thinking…',

        // ---- copilot ----
        copilotTitle: 'Copilot',
        copilotHide: 'Hide Copilot',
        copilotShow: 'Show Copilot',
        copilotComplete: 'Continue',
        copilotPolish: 'Polish',
        copilotTranslate: 'Translate',
        copilotExpand: 'Expand',
        copilotSummarize: 'Summarize',
        copilotAsk: 'Ask',
        copilotAskPlaceholder: 'Ask about this text…',
        copilotHint: 'Select text in the note, then pick an action; with no selection the whole note is used.',
        copilotSelectionHint: 'Only the selected text will be used',
        copilotWholeHint: 'No selection: the whole note will be used',
        copilotSelection: (count) => count + ' chars selected',
        copilotWhole: 'Whole note',
        copilotClear: 'Clear',
        copilotAppend: 'Append',
        copilotReplaceSelection: 'Replace selection',
        copilotReplaceAll: 'Replace note',
        composePlaceholder: 'Write something⬦ the first line becomes the title',
        enhance: 'Structure',
        format: 'Format',
        formatting: 'Formatting…',
        formatHint: 'Format the whole note; the result appears below (Ctrl/⌘+Shift+F)',
        formatSelection: 'Format selection',
        formatSelectionHint: 'Format only the selected text (Ctrl/⌘+Shift+F)',
        renderedSelection: 'Formatted selection',
        apply: 'Apply',
        applyHint: 'Replace the source with the result (only the formatted part changes)',
        applied: 'Applied to the source',
        discardFormatted: 'Discard',
        formatted: 'Formatted',
        formattedPreview: 'Formatted',
        rendered: 'Rendered',
        translate: 'Translate',
        translating: 'Translating…',
        translateTarget: 'Translate to',
        translateAuto: 'Auto (Chinese ↔ English)',
        translateHint: 'Translate the selection, or the whole note when nothing is selected',
        translateSelection: 'Translate selection',
        translated: 'Translation',
        translatedSelection: 'Translated selection',
        preview: 'Preview',
        previewHint: 'Preview the rendered note (Ctrl/⌘+P)',
        editSource: 'Edit',
        clickToEdit: 'Click to edit',

        targetLang: 'Output language',
        langAuto: 'Follow the source',
        enhancing: 'Structuring⬦',
        enhanceStop: 'Stop',
        structureSelection: 'Structure selection',
        enhanceSelectionScope: 'selection',
        enhanceStopped: 'Stopped',
        enhanceHint: 'Let the AI turn this into a title, body and tags; edit the result before saving',
        enhanceFailed: 'Structuring failed',
        enhanceSlow: (seconds) => `Still writing after ${seconds}s⬦`,
        collapseList: 'Collapse list',
        expandList: 'Expand list',
        preview: 'Preview',
        markdown: 'Markdown',
        search: 'Search notes',
        save: 'Save',
        saving: 'Saving⬦',
        saved: 'Saved',
        all: 'All',
        trash: 'Trash',
        tags: 'Tags',
        untitled: 'Untitled',
        pin: 'Pin',
        unpin: 'Unpin',
        delete: 'Move to trash',
        restore: 'Restore',
        loading: 'Loading…',
        empty: 'No notes yet. Write the first line above and press Ctrl/⌘+Enter.',
        emptySearch: 'Nothing matches.',
        emptyTrash: 'The trash is empty.',
        selectHint: 'Pick a note on the left, or go back to Capture to write one.',
        today: 'Today',
        yesterday: 'Yesterday',
        earlier: 'Earlier',
        edited: 'Edited',
        edit: 'Edit',
        cancel: 'Cancel',
        chars: (n) => `${n} characters`,
        sourcePanel: 'Panel',
        sourceCommand: 'Command',
        sourceAgent: 'Assistant',
        sourceAi: 'AI',
        savedIn: 'Saved in',
        failed: (message) => `Error: ${message}`,
        composerLabel: 'Note',
        composerTitle: 'Take a note: open the quick-note card (or type /note text)',
        enhanceTitle: 'AI draft',
        enhanceSub: 'Check it before saving; the raw text is not stored as a second note.',
        enhanceTags: 'Tags (comma separated)',
        enhanceNotes: 'From the AI',
        enhanceSave: 'Save as note',
        enhanceDiscard: 'Discard',
        enhanceOpenSession: 'Open this conversation',
        enhanceKeepSource: 'Keep my original text too',
        aiTitle: 'Notebook assistant',
        aiIntro: 'It knows the notebook as it is now: it can find, organize, retag, merge, or turn notes into a new one.',
        aiStart: 'Start a conversation',
        aiStarting: 'Opening the conversation⬦',
        aiRebuild: 'Rebuild conversation',
        aiPresetMissing: 'The notebook preset is not installed: the conversation starts with a briefing of your notes instead of a persona.',
        aiPromptPlaceholder: 'Ask: which notes mention the API? Or: merge these meeting notes into one',
        aiContext: 'It started from the notes below; it can look further with its tools.',
        aiFeatures: [
          'What have I written lately? - summarize by time or topic',
          'Find duplicates or notes to merge - propose a merge',
          'Unify these tags - propose, then apply in one click',
          'Turn this into a todo list - structured and saved',
        ],
      },
    }

    /**
     * Languages offered for structuring output.
     *
     * 'auto' is the default and sends nothing, so the model keeps the source
     * language and behaviour is unchanged for anyone who ignores the picker.
     */
    const TARGET_LANGUAGES = [
      { id: 'auto', label: '', value: '' },
      { id: 'zh', label: '中文', value: '中文（简体）' },
      { id: 'en', label: 'English', value: 'English' },
      { id: 'ja', label: '日本語', value: '日本語' },
      { id: 'ko', label: '한국어', value: '한국어' },
      { id: 'de', label: 'Deutsch', value: 'Deutsch' },
      { id: 'fr', label: 'Français', value: 'Français' },
      { id: 'es', label: 'Español', value: 'Español' },
    ]

    /** How often the dashboard re-reads its statistics while it is open. */
    const BOARD_POLL_MS = 6000

    /** Side-column width: a comfortable default, with limits that keep both panes usable. */
    const SIDE_WIDTH_DEFAULT = 400
    const SIDE_WIDTH_MIN = 300
    const SIDE_WIDTH_MAX = 720

    /** Keep a dragged width inside the limits (and integral, for a stable layout). */
    function clampSideWidth(value) {
      const numeric = Number(value)
      if (!Number.isFinite(numeric)) return SIDE_WIDTH_DEFAULT
      return Math.round(Math.min(SIDE_WIDTH_MAX, Math.max(SIDE_WIDTH_MIN, numeric)))
    }

    /** The remembered column width. */
    function storedSideWidth() {
      try {
        const stored = Number(localStorage.getItem('notes.sideWidth'))
        if (Number.isFinite(stored) && stored > 0) return clampSideWidth(stored)
      } catch {
        /* storage may be unavailable */
      }
      return SIDE_WIDTH_DEFAULT
    }

    /** Remember the column width for the next visit. */
    function persistSideWidth(value) {
      try {
        localStorage.setItem('notes.sideWidth', String(clampSideWidth(value)))
      } catch {
        /* storage may be unavailable */
      }
    }

    /** The remembered target language id; Chinese unless the user chose otherwise. */
    function storedTargetLanguage() {
      try {
        const stored = localStorage.getItem('notes.targetLang')
        if (typeof stored === 'string' && TARGET_LANGUAGES.some((entry) => entry.id === stored)) return stored
      } catch {
        /* storage may be unavailable */
      }
      // Default to following the text: 中→英 / 英→中 without a manual choice.
      return 'auto'
    }

    /** Lines that are only Markdown furniture cannot be a title. */
    function isFurnitureLine(line) {
      const value = String(line ?? '').trim()
      if (value === '') return true
      if (/^(?:[-*_]\s*){3,}$/.test(value)) return true
      if (/^`{3,}/.test(value)) return true
      return false
    }

    /**
     * Split a note body into its title line and everything after it.
     *
     * The first line that is neither empty nor Markdown furniture is the title, with any
     * heading marks removed. Everything after it is the body — including the furniture,
     * so a leading rule still renders where the user put it.
     */
    function splitNoteTitle(text) {
      const lines = String(text ?? '').split(/\r?\n/)
      let index = -1
      for (let i = 0; i < lines.length; i += 1) {
        if (isFurnitureLine(lines[i])) continue
        index = i
        break
      }
      if (index < 0) return { title: '', rest: String(text ?? '') }
      // A note that starts with an outline item has no title line; promoting 「1. 报销」 to a
      // heading would invent one.
      if (lines[index].trim().startsWith('#') === false && parseEnumerator(lines[index]) !== null) {
        return { title: '', rest: String(text ?? '') }
      }
      const title = lines[index].replace(/^#{1,6}\s+/, '').replace(/^\s*[-*+·•—–]\s+/, '').trim()
      const before = lines.slice(0, index).join('\n')
      const after = lines.slice(index + 1).join('\n')
      const rest = [before, after].filter((part) => part.trim() !== '').join('\n\n')
      return { title, rest }
    }

    /**
     * Which language a text is mostly written in.
     *
     * A crude but predictable heuristic: count CJK characters against latin letters. Used to
     * pick the translation target automatically (中→英, 英→中) instead of asking the user.
     */
    function detectTextLanguage(text) {
      const value = String(text ?? '')
      const cjk = (value.match(/[\u4e00-\u9fff]/g) ?? []).length
      const latin = (value.match(/[A-Za-z]/g) ?? []).length
      if (cjk === 0 && latin === 0) return 'unknown'
      return cjk >= latin ? 'zh' : 'en'
    }

    /** The language to translate into: the picker's value, or the opposite of the source. */
    function resolveTranslateTarget(selected, text) {
      const chosen = String(selected ?? '')
      if (chosen !== '' && chosen !== 'auto') return chosen
      return detectTextLanguage(text) === 'zh' ? 'English' : '中文（简体）'
    }

    /** Chinese numerals used as list markers, up to a practical limit. */
    const CHINESE_NUMERALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
    const CHINESE_VALUES = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
    /** Circled digits, the other common outline style. */
    const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳'

    /** Roman numerals for the numbers an outline uses. */
    function toRoman(value) {
      const table = [
        [10, 'X'],
        [9, 'IX'],
        [5, 'V'],
        [4, 'IV'],
        [1, 'I'],
      ]
      let rest = Number(value)
      let out = ''
      for (const [size, glyph] of table) {
        while (rest >= size) {
          out += glyph
          rest -= size
        }
      }
      return out
    }

    /** a, b, … z, aa, ab … for lettered outlines. */
    function toLetters(value) {
      let rest = Number(value)
      let out = ''
      while (rest > 0) {
        const remainder = (rest - 1) % 26
        out = String.fromCharCode(97 + remainder) + out
        rest = Math.floor((rest - 1) / 26)
      }
      return out
    }

    /**
     * Parse a leading list marker on one line.
     *
     * Handles Chinese numerals, Arabic, Roman, lettered and circled styles, with or without
     * brackets, so the same code can renumber any outline the model or the user writes.
     * Returns null for a line that does not start with one — bullets and prose are untouched.
     */
    function parseEnumerator(line) {
      const raw = String(line ?? '')
      // A marker is: optional opening bracket, the number, optional closing bracket or separator.
      const match = raw.match(
        /^(\s*)(\(|（|\[)?\s*([一二三四五六七八九十]+|[IVXLCDM]+|\d+|[A-Za-z]|[①-⑳])\s*(\)|）|\]|[.、．:：])?\s*(.*)$/,
      )
      if (match === null) return null
      const [, space, open = '', token, close = '', rest] = match
      // "9:40 站会" is a time, not an outline item; "1:2" is a ratio. Both would otherwise read as
      // "number + colon". A marker needs a non-digit right after the colon.
      if ((close === ':' || close === '：') && /^\d{1,2}$/.test(token) && /^\d/.test(rest)) return null
      let style = 'arabic'
      let value
      if (CHINESE_VALUES[token] !== undefined) {
        style = 'chinese'
        value = CHINESE_VALUES[token]
      } else if (CIRCLED.includes(token)) {
        style = 'circled'
        value = CIRCLED.indexOf(token) + 1
      } else if (/^\d+$/.test(token)) {
        style = 'arabic'
        value = Number(token)
      } else if (/^[IVXLCDM]+$/.test(token)) {
        style = 'roman'
        value = romanValue(token)
      } else if (/^[A-Za-z]$/.test(token)) {
        style = 'latin'
        value = token.toLowerCase().charCodeAt(0) - 96
      } else {
        return null
      }
      // Require a closing separator or a bracket pair, so "2026 年计划" and plain prose are not
      // treated as list items. Circled digits are self-delimiting, and lettered markers need
      // punctuation to be distinguishable from a word starting with one letter.
      if (style !== 'circled') {
        if (close === '' && open === '') return null
        if (style === 'latin' && close === '') return null
      }
      if (!Number.isFinite(value) || value <= 0) return null
      return { space, open, close, style, value, token, rest: String(rest ?? '').trim(), raw }
    }

    /** The numeric value of a Roman numeral (small outlines only). */
    function romanValue(token) {
      const values = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 }
      let total = 0
      const letters = String(token).toUpperCase()
      for (let i = 0; i < letters.length; i += 1) {
        const current = values[letters[i]] ?? 0
        const next = values[letters[i + 1]] ?? 0
        total += current < next ? -current : current
      }
      return total
    }

    /** Render a marker in the style it was parsed from. */
    function formatEnumerator(parsed, value) {
      const style = parsed.style
      let token
      if (style === 'chinese') token = CHINESE_NUMERALS[value - 1] ?? String(value)
      else if (style === 'circled') token = CIRCLED[value - 1] ?? String(value)
      else if (style === 'roman') token = toRoman(value)
      else if (style === 'latin') token = toLetters(value)
      else token = String(value)
      // A CJK separator already separates: 「一、已统计」 keeps no space after 、
      const separator = /[、．。；：]/.test(parsed.close) ? '' : ' '
      return parsed.space + parsed.open + token + parsed.close + separator + parsed.rest
    }

    /**
     * Rebuild a numbered outline so the numbers run 1, 2, 3…
     *
     * Works on any style, keeping each line's own marker style: 一、二、 stays Chinese, (1) (2)
     * stays bracketed, a) b) stays lettered. Bullets and prose are left alone.
     */
    function renumberSequence(text) {
      const lines = String(text ?? '').split(/\r?\n/)
      let seen = 0
      let any = false
      const parsedLines = lines.map((line) => {
        const parsed = parseEnumerator(line)
        if (parsed === null) return null
        any = true
        seen += 1
        return { parsed, index: seen }
      })
      if (!any) return String(text ?? '')
      return lines
        .map((line, index) => {
          const entry = parsedLines[index]
          if (entry === null) return line
          return formatEnumerator(entry.parsed, entry.index)
        })
        .join('\n')
    }

    /**
     * Rewrite every leading marker into one style.
     *
     * Used when translating into a Latin-script language: a Chinese 一、 in front of English text
     * is a typographic mistake, so the marker is rendered as Arabic. The text is untouched.
     */
    function convertEnumerators(text, style = 'arabic') {
      return String(text ?? '')
        .split(/\r?\n/)
        .map((line) => {
          const parsed = parseEnumerator(line)
          if (parsed === null) return line
          return formatEnumerator({ ...parsed, style, open: '', close: '.' }, parsed.value)
        })
        .join('\n')
    }

    /** Every line's marker, in order, with its indent. */
    function outlineEntries(text) {
      return String(text ?? '')
        .split(/\r?\n/)
        .map((line) => (parseEnumerator(line) === null ? null : parseEnumerator(line)))
        .filter((entry) => entry !== null)
    }

    /**
     * Which outline level each marker belongs to.
     *
     * A level is identified by its marker style plus its brackets plus its indentation, so
     * 一、/(1)/a)/① read as four levels while a repeated 一、 returns to the first one. The stack
     * makes "二、" after a nested block come back to the top level instead of continuing deeper.
     */
    function outlineLevels(entries) {
      const stack = []
      const levels = []
      for (const entry of entries) {
        const key = [entry.style, entry.open, entry.close, entry.space.length].join('|')
        let index = stack.indexOf(key)
        if (index < 0) {
          stack.push(key)
          index = stack.length - 1
        } else {
          stack.length = index + 1
        }
        levels.push(index)
      }
      return levels
    }

    /**
     * Renumber a rewrite using the source's outline as the template.
     *
     * The model may flatten or renumber arbitrarily; the source still knows how deep each item
     * was. Levels come from the source, counters run per level, and each translated marker keeps
     * its own style — except Chinese numerals in a Latin-script target, which become Arabic.
     */
    function renumberByTemplate(templateText, text, { latin = false } = {}) {
      const template = outlineEntries(templateText)
      const target = outlineEntries(text)
      if (template.length === 0) return renumberSequence(text)
      const shapeKey = (entry) => [entry.style, entry.open, entry.close, entry.space.length].join('|')
      // Each shape owns a counter, and returning to a shallower shape resets the deeper ones:
      // (1) … ① … then (2) must not continue from the circled counter.
      const stack = []
      const counters = new Map()
      let index = 0
      return String(text ?? '')
        .split(/\r?\n/)
        .map((line) => {
          // A heading starts a new section: levels and counters start over there.
          if (/^\s{0,3}#{1,6}\s+/.test(line)) {
            stack.length = 0
            counters.clear()
            return line
          }
          const parsed = parseEnumerator(line)
          if (parsed === null) return line
          const shape = template[index] ?? parsed
          index += 1
          const key = shapeKey(shape)
          const position = stack.indexOf(key)
          if (position >= 0) {
            stack.length = position + 1
            for (const dropped of [...counters.keys()]) {
              if (!stack.includes(dropped)) counters.delete(dropped)
            }
          } else {
            stack.push(key)
          }
          const next = (counters.get(key) ?? 0) + 1
          counters.set(key, next)
          const convertChinese = latin && shape.style === 'chinese'
          return formatEnumerator(
            {
              ...parsed,
              style: convertChinese ? 'arabic' : shape.style,
              open: convertChinese ? '' : shape.open,
              close: convertChinese ? '.' : shape.close,
            },
            next,
          )
        })
        .join('\n')
    }

    /** Backwards-compatible name: Chinese markers to Arabic. */
    function convertEnumeratorsToArabic(text) {
      return convertEnumerators(text, 'arabic')
    }

    /** The section label at the start of a text: 「二、」 「1.」 「##」. */
    function sectionLabel(text) {
      const first = String(text ?? '')
        .split(/\r?\n/)
        .find((line) => line.trim() !== '')
      if (first === undefined) return null
      // A heading marker is a label too, and so is any bracketed or circled enumerator.
      const heading = first.trim().match(/^(#{1,6})\s+(.*)$/)
      if (heading !== null) return { raw: first.trim(), prefix: heading[1], rest: String(heading[2] ?? '').trim() }
      const parsed = parseEnumerator(first)
      if (parsed === null) return null
      // The marker as written, brackets and separator included: 「二、」 「(1)」 「a)」 「①」.
      const prefix = (parsed.open + parsed.token + parsed.close).trim()
      return { raw: first.trim(), prefix, rest: parsed.rest, parsed }
    }

    /** Any leading enumerator: Roman, Arabic, lettered, or a heading. */
    const LEADING_ENUMERATOR = /^([IVXLCDM]+[.)、．]|\d+[.)、．]|[A-Za-z][.)、．]|#{1,6})\s+/

    /**
     * Keep the source's outline style in a translated span.
     *
     * A translation tends to render 「二、」 as 「II.」, which mixes two numbering systems in
     * one document. The translation's own enumerator is dropped and the source's label
     * prefix is used instead, so 一、二、三 stays 一、二、三.
     */
    function normalizeTranslatedLabel(originalText, translated) {
      const label = sectionLabel(originalText)
      const body = String(translated ?? '')
      if (label === null || body.trim() === '') return body
      const lines = body.split(/\r?\n/)
      const index = lines.findIndex((line) => line.trim() !== '')
      if (index < 0) return body
      const first = lines[index].trim()
      if (first.startsWith(label.prefix) || first.startsWith(label.raw)) return body
      const translatedLabel = parseEnumerator(first)
      if (translatedLabel === null) {
        // No marker at all: put the source's label back on its own line.
        return label.raw + '\n\n' + body.trim()
      }
      // Keep the source's marker style and number, but the translation's text.
      lines[index] = formatEnumerator(
        {
          ...translatedLabel,
          space: label.parsed.space,
          open: label.parsed.open,
          close: label.parsed.close,
          style: label.parsed.style,
        },
        label.parsed.value,
      )
      return lines.join('\n').trim()
    }

    /**
     * Re-attach the original label to a rewritten span.
     *
     * "二、部署脚本" becomes "部署脚本：回滚与日志待定" after a rewrite, which loses the
     * numbering. When the proposal's first line already starts with the label's text the
     * line is rewritten in place; otherwise the label is prepended as its own line.
     */
    function preserveLabel(originalText, proposal) {
      const label = sectionLabel(originalText)
      const body = String(proposal ?? '').trim()
      if (label === null || body === '') return body
      const lines = body.split(/\r?\n/)
      const firstIndex = lines.findIndex((line) => line.trim() !== '')
      if (firstIndex < 0) return body
      const firstLine = lines[firstIndex].trim().replace(/^#{1,6}\s+/, '')
      if (firstLine.startsWith(label.raw) || firstLine.startsWith(label.prefix + label.rest)) return body
      if (label.rest !== '' && firstLine.startsWith(label.rest)) {
        lines[firstIndex] = label.prefix + ' ' + firstLine
        return lines.join('\n').trim()
      }
      return label.raw + '\n\n' + body
    }

    /**
     * Turn a line-leading run of asterisks into a bullet.
     *
     * Notes often use "*" or "***" as separators. A rewrite turns some of them into bullets and
     * leaves others behind, which then render as literal asterisks ("** 风险 环境不稳定"). One or
     * more stars followed by text is a bullet, not emphasis — emphasis never starts a line without
     * text on both sides.
     */
    function normalizeStrayAsterisks(text) {
      return String(text ?? '')
        .split(/\r?\n/)
        .map((line) => {
          const match = line.match(/^\s*(\*{1,4})\s*(\S.*)$/)
          if (match === null) return line
          // Emphasis opens and closes before any text continues: "**bold** and more".
          if (/^\s*\*\*[^*]+\*\*/.test(line)) return line
          return '- ' + match[2]
        })
        .join('\n')
    }

    /** The markers a source text used, per line, for restoring what a rewrite dropped. */
    function markupOf(text) {
      const headings = []
      const quotes = []
      const bullets = []
      for (const line of String(text ?? '').split(/\r?\n/)) {
        const heading = line.match(/^(#{1,6})\s+(.*)$/)
        if (heading !== null) {
          headings.push({ level: heading[1].length, text: heading[2].trim() })
          continue
        }
        const quote = line.match(/^>\s?(.*)$/)
        if (quote !== null) {
          quotes.push(quote[1].trim())
          continue
        }
        const bullet = line.match(/^\s*[-*+·•—–]\s+(.*)$/)
        if (bullet !== null) bullets.push(bullet[1].trim())
      }
      return { headings, quotes, bullets }
    }

    /**
     * Put back the markers a rewrite dropped.
     *
     * The structuring pass is allowed to reorder and rewrap, not to remove typography: a heading
     * that comes back as plain text, or a quote that loses its bar, is a regression. Applied only
     * when the same text appears in the result, so nothing is invented.
     */
    function preserveMarkup(sourceText, outputText) {
      const source = markupOf(sourceText)
      const has = new Set()
      for (const entry of source.headings) has.add(entry.text)
      for (const entry of source.quotes) has.add(entry)
      for (const entry of source.bullets) has.add(entry)
      if (has.size === 0) return String(outputText ?? '')

      const used = new Set()
      return String(outputText ?? '')
        .split(/\r?\n/)
        .map((line) => {
          const trimmed = line.trim()
          if (trimmed === '') return line
          // Already carries a marker: leave it.
          if (/^(#{1,6}\s|>|\s*[-*+·•—–]\s)/.test(line)) return line
          const heading = source.headings.find((entry) => entry.text === trimmed && used.has(entry.text) === false)
          if (heading !== undefined) {
            used.add(heading.text)
            return '#'.repeat(heading.level) + ' ' + trimmed
          }
          if (source.quotes.includes(trimmed) && used.has('q:' + trimmed) === false) {
            used.add('q:' + trimmed)
            return '> ' + trimmed
          }
          if (source.bullets.includes(trimmed) && used.has('b:' + trimmed) === false) {
            used.add('b:' + trimmed)
            return '- ' + trimmed
          }
          return line
        })
        .join('\n')
    }

    /** Lines with their markers stripped, for comparing two versions of a text. */
    function contentLines(text) {
      return String(text ?? '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line !== '')
    }

    /** Lower-case, no spaces, no emphasis marks: rough but stable for "did this survive". */
    function comparableText(text) {
      return String(text ?? '')
        .replace(/^\s*(#{1,6}\s+|>\s?|[-*+·•—–]\s+)/, '')
        .replace(/[\s*_`~>#+•]+/g, '')
        .replace(/^([一二三四五六七八九十]+|[0-9]+|[A-Za-z])[.、)）]/, '')
        .toLowerCase()
    }

    /**
     * What a rewrite lost, in comparable terms.
     *
     * sameLanguage: every source line's content must still appear somewhere (structure must not
     * drop the author's sentences). Otherwise only the shape is compared: line count, headings,
     * markers — a translation is expected to change the words.
     */
    function fidelityReport(sourceText, outputText, { sameLanguage = true } = {}) {
      const source = contentLines(sourceText)
      const output = contentLines(outputText)
      const flatOutput = comparableText(outputText)
      const missing = []
      if (sameLanguage) {
        for (const line of source) {
          // Short or purely numeric lines are too ambiguous to compare meaningfully.
          if (comparableText(line).length < 4) continue
          // Same measure as repairCoverage: most of the line's character pairs must survive.
          if (!isCovered(line, flatOutput)) missing.push(line)
        }
      }
      const markersOf = (value) => (value.match(/(^|\s)(\(?[一二三四五六七八九十]+[、.．)]|\d+[.)、]|[A-Za-z][.)]|①|②|③|④|⑤)/g) ?? []).length
      return {
        missing,
        sourceLines: source.length,
        outputLines: output.length,
        lineDelta: output.length - source.length,
        headingDelta:
          (outputText.match(/^#{1,6}\s+/gm) ?? []).length - (sourceText.match(/^#{1,6}\s+/gm) ?? []).length,
        markerDelta: markersOf(outputText) - markersOf(sourceText),
      }
    }

    /**
     * True when a report found a *loss*.
     *
     * More lines or more headings than the source is normal — restructuring splits items. Fewer
     * lines, fewer headings or missing content is not.
     */
    function fidelityIssues(report) {
      if (report === null || report === undefined) return false
      return report.missing.length > 0 || report.lineDelta < 0 || report.headingDelta < 0
    }

    /** Character pairs of a text, without markers or spaces: a cheap similarity unit. */
    function pairSet(text) {
      const value = comparableText(text)
      const pairs = new Set()
      for (let i = 0; i < value.length - 1; i += 1) pairs.add(value.slice(i, i + 2))
      return pairs
    }

    /** Does the rewrite contain most of this line's content? */
    function isCovered(line, flatOutput) {
      const pairs = pairSet(line)
      if (pairs.size === 0) return true
      let hit = 0
      for (const pair of pairs) if (flatOutput.includes(pair)) hit += 1
      return hit / pairs.size >= 0.6
    }

    /**
     * Re-insert every source line the rewrite dropped.
     *
     * The line goes back where it belongs: after the output line that covers the source line before
     * it. Nothing is invented, nothing is reordered, and the caller never has to decide.
     */
    function repairCoverage(sourceText, outputText) {
      const source = contentLines(sourceText)
      const flat = comparableText(outputText)
      const missing = source.filter((line) => comparableText(line).length >= 4 && !isCovered(line, flat))
      if (missing.length === 0) return String(outputText ?? '')
      const output = String(outputText ?? '').split(/\r?\n/)
      const outputFlat = comparableText(outputText)

      for (const line of missing) {
        // Anchor: the last source line before this one that the output does cover.
        const at = source.indexOf(line)
        let anchorIndex = -1
        for (let i = at - 1; i >= 0; i -= 1) {
          const key = comparableText(source[i])
          if (key.length < 4 || !isCovered(source[i], outputFlat)) continue
          // Find the output line that carries it.
          const found = output.findIndex((candidate) => isCovered(source[i], comparableText(candidate)))
          if (found >= 0) {
            anchorIndex = found
            break
          }
        }
        output.splice(anchorIndex + 1, 0, line)
      }
      return output.join('\n')
    }

    /**
     * Put translated lines back together by index.
     *
     * `translations` is indexed like the draft's lines; a null keeps the original line, so a missing
     * translation degrades to the source text instead of disappearing. The newline structure is
     * copied from the draft, which is what makes a merge impossible.
     */
    function assembleIndexedLines(draftText, translations) {
      const lines = String(draftText ?? '').split(/\r?\n/)
      return lines
        .map((line, index) => {
          if (line.trim() === '') return line
          const translated = Array.isArray(translations) ? translations[index] : undefined
          return typeof translated === 'string' && translated.trim() !== '' ? translated : line
        })
        .join('\n')
    }

    /**
     * How many list markers a line carries.
     *
     * A marker is a number/chinese numeral/letter/circled digit that starts the line or follows a
     * space and is itself followed by a space or the line end. "2.4.0" therefore contributes none,
     * while "1. 现状" contributes one.
     */
    function markerCount(line) {
      const pattern = /(^|\s)(\(?[一二三四五六七八九十]{1,3}[、.．)]|\d{1,3}[.)、]|[A-Za-z][.)]|[①-⑳])(?=\s|$)/g
      return (String(line ?? '').match(pattern) ?? []).length
    }

    /**
     * Concrete typography defects in a structuring result.
     *
     * Each entry is a sentence that can be handed straight back to the model, so a repair pass needs
     * no interpretation: it is told exactly what was wrong.
     */
    function typographyIssues(sourceText, outputText, { title = '' } = {}) {
      const report = fidelityReport(sourceText, outputText, { sameLanguage: true })
      const issues = []
      if (report.missing.length > 0) {
        issues.push('以下原文内容在结果里没有出现，必须原样保留：' + report.missing.slice(0, 3).join(' / '))
      }
      if (report.lineDelta < 0) {
        issues.push('结果比原文少了 ' + Math.abs(report.lineDelta) + ' 行：原文分行的条目必须各占一行，不要合并成一段。')
      }
      // A line carrying two markers means two items were merged.
      const doubleMarked = contentLines(outputText).filter((line) => markerCount(line) > 1)
      if (doubleMarked.length > 0) {
        issues.push('有两行被合并了，例如：' + doubleMarked[0].slice(0, 30) + '。每条独立成行。')
      }
      // Meta commentary is not part of a note.
      const firstLine = contentLines(outputText)[0] ?? ''
      if (/^(以下是|这是|整理|Here is|Below is)/i.test(firstLine)) {
        issues.push('不要输出「以下是…」这类说明，直接从标题开始。')
      }
      // A title that merely repeats the opening sentence is not a summary. "今天好累" said
      // nothing about a note covering meetings, a load test and an expense; "Release 计划讨论"
      // is a title the author wrote, and is left alone.
      const sourceFirst = contentLines(sourceText)[0] ?? ''
      const sentenceLike =
        /(我|我们|咱们|今天|昨天|明天|今早|刚才|最近)/.test(sourceFirst) || /[，。！？、；]$/.test(sourceFirst)
      if (
        sentenceLike &&
        title.trim() !== '' &&
        /^\s{0,3}#/.test(sourceFirst) === false &&
        comparableText(title) === comparableText(sourceFirst)
      ) {
        issues.push(
          '标题直接照抄了原文第一句（"' +
            sourceFirst.slice(0, 18) +
            '…"）。请用一句话概括整篇内容作为标题，不要复制正文句子。',
        )
      }
      // The title must not be repeated inside the body.
      const heading = comparableText(title)
      if (heading !== '' && contentLines(outputText).filter((line) => comparableText(line) === heading).length > 1) {
        issues.push('标题在正文里重复出现了，标题只写第一行一次。')
      }
      return issues
    }

    /**
     * Mechanical layout of a note, with no model involved.
     *
     * Normalises what a person types into tidy Markdown: dashes to "-", stray stars to bullets,
     * numbering per style made continuous, at most one blank line, a blank line before a section
     * heading or a "标签：" line, and no trailing spaces. It never rewrites wording, never splits a
     * sentence, and never invents a title — that is Structure's job.
     */
    function formatLocally(source) {
      const raw = String(source ?? '')
      if (raw.trim() === '') return raw

      // 1. The dashes people actually type become the one bullet character the renderer knows.
      const dashed = raw
        .split(/\r?\n/)
        .map((line) => line.replace(/^(\s*)[—–·•]\s+/, '$1- ').replace(/\s+$/, ''))
        .join('\n')

      // 2. Stray "*"/"**"/"***" separators are bullets too.
      const starred = normalizeStrayAsterisks(dashed)

      // 3. Numbering: each style counts continuously, keeping the author's style.
      const numbered = renumberSequence(starred)

      // 4. Blank lines: at most one, and always one before a heading or a colon label.
      const lines = numbered.split('\n')
      const out = []
      const isHeading = (line) => /^\s{0,3}#{1,6}\s+\S/.test(line)
      const isLabel = (line) => /^\s*[^\s].{0,23}[：:]\s*$/.test(line) && !/^\s*[-*+·•—–]\s/.test(line)
      for (const line of lines) {
        const trimmed = line.replace(/\s+$/, '')
        if (trimmed.trim() === '') {
          // Never start with a blank line and never keep two in a row.
          if (out.length > 0 && out[out.length - 1].trim() !== '') out.push('')
          continue
        }
        if (out.length > 0 && out[out.length - 1].trim() !== '' && (isHeading(trimmed) || isLabel(trimmed))) {
          out.push('')
        }
        out.push(trimmed)
      }
      while (out.length > 0 && out[out.length - 1].trim() === '') out.pop()
      return out.join('\n')
    }

    /**
     * The running state of an AI call: a spinner plus a marquee label.
     *
     * A streamed partial answer reads as broken Markdown while it arrives; motion says "working"
     * without pretending the text is final.
     */
    function PreviewBusy({ label }) {
      return h(
        'div',
        { className: 'dshn-busy', role: 'status', 'aria-live': 'polite' },
        // A real circle: the border trick leaves jagged edges at small sizes and odd scales.
        h(
          'svg',
          { className: 'dshn-busy-spinner', viewBox: '0 0 24 24', width: 14, height: 14, 'aria-hidden': 'true' },
          h('circle', { cx: 12, cy: 12, r: 9, fill: 'none', stroke: 'currentColor', strokeWidth: 2.4, opacity: 0.18 }),
          h('circle', {
            cx: 12,
            cy: 12,
            r: 9,
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 2.4,
            strokeLinecap: 'round',
            strokeDasharray: '16 41',
          }),
        ),
        // Static text: a moving label reads as two labels fighting, and a spinner already says
        // "working". The caller appends the elapsed seconds.
        h('span', { className: 'dshn-busy-label' }, label),
      )
    }

    /** A note with its title rendered in first-level heading style. */
    function renderNoteBody(text, marks) {
      const { title, rest } = splitNoteTitle(text)
      return h(
        'div',
        { className: 'dshn-note' },
        title === '' ? null : h('div', { className: 'dshn-note-title' }, title),
        rest.trim() === '' ? null : h('div', { className: 'dshn-md' }, renderMarkdown(rest, marks)),
      )
    }

    /** The note without its title line, for views that already show the title. */
    function renderNoteRest(text) {
      const { rest } = splitNoteTitle(text)
      return h('div', { className: 'dshn-md' }, renderMarkdown(rest))
    }

    /**
     * Assemble a formatted note from the model's title and body.
     *
     * The note's first line IS its title, so the title has to be part of the result —
     * dropping it is what made "# headline" disappear. It is skipped only when the body
     * already opens with the same words, which is what produced a duplicated first line.
     */
    function composeFormattedNote(title, body) {
      const heading = String(title ?? '').trim()
      const text = String(body ?? '').trim()
      if (heading === '') return text
      const firstLine = (text.split(/\r?\n/).find((line) => line.trim() !== '') ?? '')
        .replace(/^#{1,6}\s+/, '')
        .trim()
      const restates = firstLine === heading || firstLine.startsWith(heading)
      return restates ? text : heading + '\n\n' + text
    }

    /**
     * Does this text already carry Markdown structure?
     *
     * Used to decide whether the capture box can render instead of showing source.
     * Deliberately conservative: a marker has to be present (heading, list, quote,
     * bold or inline code). Plain prose with line breaks is NOT structured — that is
     * exactly the case Format exists for.
     */
    function looksStructured(text) {
      const value = String(text ?? '')
      if (value.trim() === '') return false
      const markers = [
        /^#{1,6}\s+\S/m,
        /^\s*[-*+·•—–]\s+\S/m,
        /^\s*\d+[.)]\s+\S/m,
        /^\s*>\s?\S/m,
        /\*\*[^*\n]+\*\*/,
        /\`[^\`\n]+\`/,
        /^\s*(?:-{3,}|\*{3,})\s*$/m,
      ]
      return markers.some((pattern) => pattern.test(value))
    }

    /** Which locale the panel speaks: the stored one, else the browser's. */
    function detectLanguage() {
      try {
        const stored = localStorage.getItem('dsh.locale') ?? localStorage.getItem('dsw.locale')
        if (typeof stored === 'string') {
          const id = stored.toLowerCase()
          if (id.startsWith('en')) return 'en'
          if (id.startsWith('zh')) return 'zh'
        }
      } catch {
        /* storage may be unavailable */
      }
      const nav = typeof navigator !== 'undefined' ? navigator.language ?? '' : ''
      return nav.toLowerCase().startsWith('zh') || nav === '' ? 'zh' : 'en'
    }

    const dict = () => STRINGS[detectLanguage()]

    // ----------------------------------------------------------------- api ---

    async function api(path, init) {
      const response = await fetch(`${API}${path}`, {
        headers: init?.body ? { 'content-type': 'application/json' } : undefined,
        ...init,
      })
      let payload = null
      try {
        payload = await response.json()
      } catch {
        throw new Error(`HTTP ${response.status}`)
      }
      if (!payload?.ok) throw new Error(payload?.error?.message ?? `HTTP ${response.status}`)
      return payload.data
    }

    const get = (path) => api(path)
    const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body ?? {}) })
    const put = (path, body) => api(path, { method: 'PUT', body: JSON.stringify(body ?? {}) })
    const del = (path) => api(path, { method: 'DELETE' })

    /**
     * Read one Server-Sent-Events response, one frame at a time.
     *
     * `onEvent(name, payload)` is called as frames arrive; the promise settles
     * when the server closes. Used by the structuring button so text appears
     * while the model is still writing.
     */
    async function streamEvents(path, body, onEvent, signal) {
      const response = await fetch(`${API}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {}),
        signal,
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      if (!response.body) throw new Error('服务器没有返回可读的流。')
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let boundary = buffer.indexOf('\n\n')
        while (boundary !== -1) {
          const frame = buffer.slice(0, boundary)
          buffer = buffer.slice(boundary + 2)
          let event = 'message'
          let data = ''
          for (const line of frame.split('\n')) {
            if (line.startsWith('event:')) event = line.slice(6).trim()
            else if (line.startsWith('data:')) data += line.slice(5).trim()
          }
          if (data === '') continue
          try {
            onEvent(event, JSON.parse(data))
          } catch {
            /* a malformed frame is dropped rather than killing the stream */
          }
          boundary = buffer.indexOf('\n\n')
        }
      }
    }

    // --------------------------------------------------------------- helpers ---

    const pad2 = (value) => String(value).padStart(2, '0')
    const midnightOf = (value) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()

    function daysAgo(iso) {
      const date = new Date(iso)
      if (Number.isNaN(date.getTime())) return Number.NaN
      return Math.round((midnightOf(new Date()) - midnightOf(date)) / 86_400_000)
    }

    function formatWhen(iso, t) {
      if (typeof iso !== 'string' || iso === '') return ''
      const date = new Date(iso)
      const days = daysAgo(iso)
      if (Number.isNaN(days)) return ''
      const time = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
      if (days <= 0) return time
      if (days === 1) return `${t.yesterday} ${time}`
      return date.getFullYear() === new Date().getFullYear()
        ? `${date.getMonth() + 1}月${date.getDate()}日`
        : `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
    }

    function dayBucket(iso) {
      const days = daysAgo(iso)
      if (Number.isNaN(days)) return 'earlier'
      if (days <= 0) return 'today'
      if (days === 1) return 'yesterday'
      return 'earlier'
    }

    /**
     * Strip inline Markdown for places that cannot render it: list titles,
     * previews, the detail bar, window titles. Markers in a title read as bugs,
     * not as formatting.
     */
    function stripInline(text) {
      return String(text ?? '')
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/(\*\*|__)(.*?)\1/g, '$2')
        .replace(/(\*|_)([^*_]+)\1/g, '$2')
        .replace(/`([^`]*)`/g, '$1')
        .replace(/^#{1,6}\s+/, '')
        .replace(/^>\s*/, '')
        .replace(/^[-*+·•—–]\s+/, '')
        .replace(/^\d+[.)]\s+/, '')
        .trim()
    }

    function titleOf(note, t) {
      const title = stripInline(note.title ?? '')
      return title !== '' ? title : t.untitled
    }

    /**
     * One snippet of body without repeating the title.
     *
     * Structure is dropped, not flattened: a line that is only a heading or only
     * **bold** is a section label ("待办", "待补"), and pasting those into the
     * preview is what made two lines read as a wall of words. What remains is
     * the content itself, joined with a separator so sections stay distinguishable.
     */
    function previewOf(note) {
      const lines = String(note.body ?? '').split(/\r?\n/)
      const content = []
      for (const [index, raw] of lines.entries()) {
        const trimmed = raw.trim()
        // A rule marks the appendix ("原始记录"); the snippet stops there.
        if (trimmed === '---') break
        if (trimmed === '') continue
        // A heading, or a line that is entirely bold, is a label.
        if (/^#{1,6}\s/.test(trimmed)) continue
        if (/^\*\*[^*]+\*\*$/.test(trimmed) || /^__[^_]+__$/.test(trimmed)) continue
        const plain = stripInline(trimmed)
        if (plain === '') continue
        // The first content line is the title, already shown above the snippet.
        if (index === 0) continue
        content.push(plain)
      }
      // Four beats is enough for two lines; more reads as a wall of text.
      const head = content.slice(0, 4)
      return head.join(' · ') + (content.length > head.length ? ' …' : '')
    }

    function parseTags(raw) {
      return String(raw ?? '')
        .split(/[,，\s]+/)
        .map((tag) => tag.trim().replace(/^#+/, ''))
        .filter((tag) => tag !== '')
    }

    const sourceLabel = (source, t) =>
      source === 'command' ? t.sourceCommand : source === 'agent' ? t.sourceAgent : source === 'ai' ? t.sourceAi : t.sourcePanel

    const norm = (text) => String(text ?? '').toLowerCase().replace(/\s+/g, '')

    // ------------------------------------------------------------ markdown ---
    //
    // Notes are Markdown, so the detail pane renders it instead of showing raw
    // `#` and `-`. This is a small, deliberately limited renderer: headings,
    // bullet and numbered lists, quotes, task boxes, inline code, bold, italic.
    // It never falls back to HTML, so nothing in a note can inject markup.

    /** Inline spans: `code`, **bold**, *italic*. */
    function inlineSpans(text, keyBase) {
      // Links first: their label may contain other marks, and a URL may contain
      // characters the emphasis patterns would otherwise eat.
      const pattern = /(\[[^\]\n]+\]\([^)\s]+\)|`[^`]+`|\*\*[^*]+\*\*|\*[^*\n]+\*)/g
      const out = []
      let last = 0
      let index = 0
      let match
      while ((match = pattern.exec(text)) !== null) {
        if (match.index > last) out.push(text.slice(last, match.index))
        const token = match[0]
        const key = `${keyBase}-i${index++}`
        if (token.startsWith('[')) {
          const parts = token.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)
          const label = parts === null ? token : parts[1]
          const href = parts === null ? '' : parts[2]
          // Only navigable schemes: a note body is untrusted text.
          const safe = /^(?:https?:|mailto:)/i.test(href)
          out.push(
            safe
              ? h('a', { key, className: 'dshn-md-link', href, target: '_blank', rel: 'noreferrer noopener' }, label)
              : label,
          )
        } else if (token.startsWith('`')) out.push(h('code', { key, className: 'dshn-md-code' }, token.slice(1, -1)))
        else if (token.startsWith('**')) out.push(h('strong', { key }, token.slice(2, -2)))
        else out.push(h('em', { key }, token.slice(1, -1)))
        last = match.index + token.length
      }
      if (last < text.length) out.push(text.slice(last))
      return out.filter((piece) => piece !== '')
    }

    /** The text of a line without its markers, for matching a selection against the preview. */
    function plainLine(line) {
      const raw = String(line ?? '')
      // An outline marker ("一、", "(1)", "a)") is part of the typography, not the text.
      const parsed = parseEnumerator(raw)
      if (parsed !== null) return parsed.rest.replace(/\s+/g, '').trim()
      return raw
        .replace(/^\s{0,3}#{1,6}\s+/, '')
        .replace(/^\s*[-*+·•—–]\s+/, '')
        .replace(/^\s*>\s?/, '')
        .replace(/\s+/g, '')
        .trim()
    }

    /** Wrap one rendered line in the selection mark when it is part of the selected span. */
    // Always returns an array: callers spread it, and a single element would not be iterable.
    function marked(children, marks, key) {
      if (marks === undefined || marks === null) return children
      return [h('mark', { key, className: 'dshn-preview-mark' }, ...children)]
    }

    /** Render a note body as Markdown blocks.
     *
     * `marks` is an optional Set of plainLine() strings: those lines render inside a <mark>, which
     * is how the preview mirrors the editor's selection.
     */
    function renderMarkdown(source, marks) {
      const lines = normalizeStrayAsterisks(String(source ?? '')).split(/\r?\n/)
      const blocks = []
      let paragraph = []
      let list = null
      // Marker shapes seen so far in the current block: their order gives the outline depth.
      const itemStack = []
      const flushParagraph = () => {
        if (paragraph.length > 0) {
          const joined = paragraph.join(' ')
          // A line that is only **bold** is a section label in practice.
          const boldOnly = joined.trim().match(/^\*\*([^*]+)\*\*$/)
          if (boldOnly !== null) {
            blocks.push(h('h4', { key: `h${blocks.length}`, className: 'dshn-md-h' }, boldOnly[1].trim()))
          } else {
            // One newline is one line the author wrote: keep it. Blank lines still separate
            // paragraphs; inside a paragraph the breaks are explicit.
            const children = []
            paragraph.forEach((line, index) => {
              if (index > 0) children.push(h('br', { key: `br${index}` }))
              const spans = inlineSpans(line, `p${blocks.length}-${index}`)
              children.push(...marked(spans, marks?.has(plainLine(line)) ? marks : undefined, `m${blocks.length}-${index}`))
            })
            blocks.push(h('p', { key: `p${blocks.length}`, className: 'dshn-md-p' }, ...children))
          }
        }
        paragraph = []
      }
      const flushList = () => {
        if (list !== null) {
          blocks.push(
            h(
              list.ordered ? 'ol' : 'ul',
              { key: `${list.ordered ? 'o' : 'u'}${blocks.length}`, className: 'dshn-md-list' },
              ...list.items.map((item, index) =>
                h(
                  'li',
                  { key: index, 'data-task': item.task === undefined ? undefined : String(item.task) },
                  ...marked(
                    inlineSpans(item.text, `li${blocks.length}-${index}`),
                    marks?.has(plainLine(item.text)) ? marks : undefined,
                    `mli${blocks.length}-${index}`,
                  ),
                ),
              ),
            ),
          )
        }
        list = null
      }

      // Tracks whether the previous line was a quote, so consecutive ">" lines merge.
      let inQuote = false
      for (const raw of lines) {
        const line = raw.replace(/\s+$/, '')
        // Was the previous line a quote? Cleared here, restored only by the quote branch.
        const continuingQuote = inQuote
        inQuote = false
        if (line.trim() === '') {
          flushParagraph()
          flushList()
          itemStack.length = 0
          continue
        }
        // A horizontal rule: ---, ***, ___ (three or more, spaces allowed).
        if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
          flushParagraph()
          flushList()
          blocks.push(h('hr', { key: `r${blocks.length}`, className: 'dshn-md-rule' }))
          continue
        }
        // An enumerated line with a non-plain marker keeps its own line: bullets stay lists,
        // "1." stays an ordered list, but (1) / a) / ① / 一、 are outline levels that must not be
        // merged into the paragraph below.
        const enumerator = parseEnumerator(line)
        // Bullets are checked first below; every other enumerated line keeps its marker as text so
        // numbering can never be restarted by a separate <ol>.
        if (enumerator !== null && !/^\s*[-*+·•—–]\s+/.test(line)) {
          flushParagraph()
          flushList()
          const shapeKey = [enumerator.style, enumerator.open, enumerator.close].join('|')
          const seenAt = itemStack.indexOf(shapeKey)
          if (seenAt >= 0) itemStack.length = seenAt + 1
          else itemStack.push(shapeKey)
          const level = Math.min(4, itemStack.length - 1 + Math.floor(enumerator.space.length / 2))
          blocks.push(
            h(
              'div',
              {
                key: `i${blocks.length}`,
                className: 'dshn-md-item',
                'data-level': String(level),
              },
              h('span', { className: 'dshn-md-marker' }, enumerator.open + enumerator.token + enumerator.close),
              h(
                'span',
                { className: 'dshn-md-item-text' },
                ...marked(
                  inlineSpans(enumerator.rest, `i${blocks.length}`),
                  marks?.has(plainLine(line)) ? marks : undefined,
                  `mi${blocks.length}`,
                ),
              ),
            ),
          )
          continue
        }
        const heading = line.match(/^(#{1,4})\s+(.*)$/)
        if (heading !== null) {
          flushParagraph()
          flushList()
          // A new section: outline depth starts over, so 「一、」 under a new heading is level 1.
          itemStack.length = 0
          const level = Math.min(heading[1].length + 2, 6)
          // The title owns the top of the page, so a body "#" is a section: shift by two, clamp at h6.
          blocks.push(h(`h${level}`, { key: `h${blocks.length}`, className: 'dshn-md-h' }, ...inlineSpans(heading[2], `h${blocks.length}`)))
          continue
        }
        const quote = line.match(/^>\s?(.*)$/)
        if (quote !== null) {
          flushParagraph()
          flushList()
          const previous = blocks[blocks.length - 1]
          if (continuingQuote === true && previous !== undefined && previous.node === 'blockquote') {
            previous.children.push(h('br', { key: 'qbr' }), ...inlineSpans(quote[1], `q${blocks.length}`))
            continue
          }
          blocks.push(h('blockquote', { key: `q${blocks.length}`, className: 'dshn-md-quote' }, ...inlineSpans(quote[1], `q${blocks.length}`)))
          inQuote = true
          continue
        }
        const bullet = line.match(/^\s*[-*+·•—–]\s+(.*)$/)
        const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/)
        if (bullet !== null || numbered !== null) {
          flushParagraph()
          const ordered = numbered !== null
          if (list === null || list.ordered !== ordered) {
            flushList()
            list = { ordered, items: [] }
          }
          let content = ordered ? numbered[1] : bullet[1]
          let task
          // Any bracket token is a task marker: done, open, or undecided ("?"), in progress ("~").
          const box = content.match(/^\[([ xX?~\-_.])\]\s+(.*)$/)
          if (box !== null) {
            const mark = box[1].toLowerCase()
            if (mark === 'x') task = true
            else if (mark === ' ') task = false
            else task = 'pending'
            content = box[2]
          }
          list.items.push({ text: content, task })
          continue
        }
        // An indented continuation belongs to the previous list item.
        if (list !== null && /^\s{2,}\S/.test(raw)) {
          const item = list.items[list.items.length - 1]
          if (item !== undefined) item.text += ` ${line.trim()}`
          continue
        }
        flushList()
        // A short label line heads the text under it: 「一、报销」「(2) 配色」「小结：」.
        // Without this the label was merged into the paragraph below and read as prose.
        const value = line.trim()
        const isLabel =
          value.length <= 24 &&
          (/^[一二三四五六七八九十百]+[、.．]/.test(value) ||
            /^\(?\d+[、.．)]/.test(value) ||
            /[：:]$/.test(value))
        if (isLabel) {
          flushParagraph()
          blocks.push(h('h4', { key: `l${blocks.length}`, className: 'dshn-md-h' }, ...inlineSpans(value, `l${blocks.length}`)))
          continue
        }
        paragraph.push(value)
      }
      flushParagraph()
      flushList()
      if (blocks.length === 0) return h('p', { className: 'dshn-md-empty' }, ' ')
      return blocks
    }

    // ------------------------------------------------------------- styles ---
    //
    // One token layer, one scale per axis: every color is a --dsw-alias-* token,
    // so a renamed token degrades the look but never breaks rendering.

    const STYLES = `
.dshn-root {
  /* Categorical series for pie shares: theme-driven, so the chart follows the
     active light/dark scheme instead of pinning literal colors. */
  /* GitHub's contribution palette, verbatim: empty day, then four greens. Fixed
     values on purpose — this ramp is the feature, not a theme accent. The dark
     variant below is GitHub's own dark palette. */
  --dshn-heat-0: #ebedf0;
  --dshn-heat-1: #9be9a8;
  --dshn-heat-2: #40c463;
  --dshn-heat-3: #30a14e;
  --dshn-heat-4: #216e39;
  --dshn-series-0: var(--dsw-alias-brand-primary);
  --dshn-series-1: var(--dsw-alias-state-success-primary);
  --dshn-series-2: var(--dsw-alias-state-warning-primary);
  --dshn-series-3: var(--dsw-alias-state-error-primary);
  --dshn-series-4: var(--dsw-alias-label-secondary);
  --dshn-series-5: var(--dsw-alias-border-l2);
  --dshn-r-sm: 6px;
  --dshn-r-md: 10px;
  --dshn-r-lg: 14px;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-base);
  font-size: 13px;
  line-height: 1.55;
}
.dshn-tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 10px 20px 0;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.dshn-tab {
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 13px;
  padding: 6px 12px 8px;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  cursor: pointer;
}
.dshn-tab:hover { color: var(--dsw-alias-label-primary); }
.dshn-tab[data-active="true"] {
  color: var(--dsw-alias-label-primary);
  font-weight: 600;
  border-bottom-color: var(--dsw-alias-brand-primary);
}
.dshn-tab-count { margin-left: 6px; font-size: 11px; color: var(--dsw-alias-label-secondary); font-weight: 400; }
.dshn-pane { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }

.dshn-capture-pane { padding: 20px; gap: 14px; overflow-y: auto; }
.dshn-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.dshn-title { font-size: 16px; font-weight: 600; letter-spacing: .01em; }
.dshn-cap { font-size: 11.5px; color: var(--dsw-alias-label-secondary); }
.dshn-ok { color: var(--dsw-alias-state-success-primary); font-size: 11.5px; }
.dshn-err { color: var(--dsw-alias-state-error-primary); font-size: 11.5px; }
.dshn-grow { flex: 1 1 auto; }

.dshn-composer {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border-radius: var(--dshn-r-md);
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
  transition: border-color .15s ease;
}
.dshn-composer[data-focus="true"] { border-color: var(--dsw-alias-brand-primary); }
.dshn-textarea {
  width: 100%;
  min-height: 150px;
  /* The overlay has neither padding nor a scrollbar gutter; without this the two layers wrap at
     different widths and the highlight drifts on long lines. */
  padding: 0;
  scrollbar-width: none;
  resize: vertical;
  border: 0;
  outline: none;
  background: transparent;
  color: inherit;
  font-size: inherit;
  line-height: inherit;
  font-family: inherit;
}
.dshn-textarea::-webkit-scrollbar,
.dshn-editor-marks::-webkit-scrollbar {
  width: 0;
  height: 0;
}
.dshn-textarea::placeholder { color: var(--dsw-alias-label-secondary); opacity: .85; }
.dshn-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

.dshn-btn {
  appearance: none;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  border-radius: var(--dshn-r-sm);
  padding: 3px 10px;
  font: inherit;
  font-size: 12px;
  line-height: 20px;
  cursor: pointer;
  transition: background .12s ease, border-color .12s ease;
  white-space: nowrap;
}
.dshn-btn:hover { background: var(--dsw-alias-bg-layer-2); border-color: var(--dsw-alias-border-l2); }
.dshn-btn:disabled { opacity: .45; cursor: default; }
.dshn-btn.primary {
  background: var(--dsw-alias-brand-primary);
  border-color: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-bg-base);
  font-weight: 600;
}
.dshn-btn.ghost { border-color: transparent; background: transparent; color: var(--dsw-alias-label-secondary); }
.dshn-btn.ghost:hover { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-2); }
.dshn-btn.danger { color: var(--dsw-alias-state-error-primary); }
.dshn-btn.enhance { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); background: transparent; font-weight: 600; }
.dshn-btn.enhance:hover { background: var(--dsw-alias-bg-layer-2); }

.dshn-search {
  flex: 1 1 180px;
  box-sizing: border-box;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
  color: inherit;
  font: inherit;
  font-size: 12.5px;
  border-radius: var(--dshn-r-sm);
  padding: 5px 10px;
  outline: none;
}
.dshn-search:focus { border-color: var(--dsw-alias-brand-primary); }
.dshn-chip {
  appearance: none;
  border: 1px solid transparent;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 11.5px;
  border-radius: 999px;
  padding: 1px 9px;
  cursor: pointer;
  white-space: nowrap;
}
.dshn-chip:hover { color: var(--dsw-alias-label-primary); }
.dshn-chip[data-active="true"] { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-2); border-color: var(--dsw-alias-border-l1); }

/* ---- enhance result card ---- */
.dshn-enhance {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-radius: var(--dshn-r-md);
  border: 1px solid var(--dsw-alias-brand-primary);
  background: var(--dsw-alias-bg-layer-1);
  padding: 12px 14px;
}
.dshn-enhance-title { font-size: 13px; font-weight: 600; }
.dshn-enhance textarea {
  width: 100%;
  min-height: 180px;
  box-sizing: border-box;
  resize: vertical;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: var(--dshn-r-sm);
  background: var(--dsw-alias-bg-layer-2);
  color: inherit;
  font: inherit;
  font-size: 13px;
  line-height: 1.7;
  padding: 8px 10px;
  outline: none;
}
.dshn-enhance input {
  flex: 1 1 200px;
  box-sizing: border-box;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: var(--dshn-r-sm);
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12px;
  padding: 4px 8px;
  outline: none;
}
.dshn-enhance-notes { font-size: 11.5px; color: var(--dsw-alias-label-secondary); }
/* The live frame: raw model output while it is still being written. */
.dshn-stream-text {
  margin: 0;
  max-height: 220px;
  overflow-y: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-2);
  border-radius: var(--dshn-r-sm);
  padding: 8px 10px;
}

/* ---- history ---- */
.dshn-history { padding: 14px 20px 16px; gap: 10px; }
.dshn-body { display: flex; gap: 14px; flex: 1 1 auto; min-height: 0; }
.dshn-list {
  width: 288px;
  flex: none;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 6px 12px 2px;
  border-right: 1px solid var(--dsw-alias-border-l1);
  transition: width .16s ease, opacity .16s ease;
}
/* The drawer: the list slides away so one note fills the pane. */
.dshn-list[data-collapsed="true"] {
  width: 0;
  padding: 0;
  border-right-color: transparent;
  overflow: hidden;
  opacity: 0;
}
.dshn-list-top {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 4px 6px;
  background: var(--dsw-alias-bg-base);
}
.dshn-group {
  position: sticky;
  top: 30px;
  z-index: 1;
  padding: 16px 9px 6px;
  font-size: 10.5px;
  font-weight: 650;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-base);
}
.dshn-item {
  position: relative;
  text-align: left;
  width: 100%;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
  color: inherit;
  font: inherit;
  border-radius: var(--dshn-r-md);
  padding: 10px 12px 10px 14px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 0;
  transition: background .12s ease, border-color .12s ease;
}
.dshn-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 12px;
  bottom: 12px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: transparent;
  transition: background .12s ease;
}
.dshn-item:hover { background: var(--dsw-alias-bg-layer-2); border-color: var(--dsw-alias-border-l2); }
.dshn-item[data-active="true"] { background: var(--dsw-alias-bg-layer-2); border-color: var(--dsw-alias-border-l2); }
.dshn-item[data-active="true"]::before { background: var(--dsw-alias-brand-primary); }
.dshn-item-top { display: flex; align-items: center; gap: 6px; min-width: 0; margin-bottom: 4px; }
.dshn-item-title {
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1 1 auto;
}
.dshn-item-spacer { flex: 1 1 auto; }
.dshn-pin { font-size: 10px; line-height: 1; }
.dshn-item-meta {
  font-size: 10.5px;
  color: var(--dsw-alias-label-secondary);
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;
  white-space: nowrap;
  opacity: .9;
}
.dshn-item-preview {
  font-size: 11.5px;
  color: var(--dsw-alias-label-secondary);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  line-height: 1.7;
  margin-bottom: 7px;
  overflow-wrap: anywhere;
}
/* Tags are data, not Markdown: they render as pills, with no hash sign in front. */
.dshn-tag-pill,
.dshn-tag-name {
  font-size: 11px;
  line-height: 17px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-2);
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dshn-tag-pill { display: inline-block; vertical-align: middle; }
.dshn-tag-pill[onclick] { cursor: pointer; }
.dshn-tag-pill[onclick]:hover {
  color: var(--dsw-alias-label-primary);
  border-color: var(--dsw-alias-border-l2);
}
.dshn-tag-count {
  font-size: 10.5px;
  line-height: 15px;
  min-width: 16px;
  padding: 0 4px;
  border-radius: 999px;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-base);
}
.dshn-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex: none;
  align-self: center;
  background: var(--dsw-alias-border-l2);
}
.dshn-dot[data-source="command"] { background: var(--dsw-alias-brand-primary); }
.dshn-dot[data-source="agent"], .dshn-dot[data-source="ai"] { background: var(--dsw-alias-state-success-primary); }
.dshn-dot[data-source="panel"] { background: var(--dsw-alias-label-secondary); }
.dshn-icon-btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 1px solid transparent;
  border-radius: var(--dshn-r-sm);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  flex: none;
}
.dshn-icon-btn:hover { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-2); }
/* The drawer switch: a labelled control with real contrast, so it reads as a
   button rather than as decoration. */
.dshn-drawer {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: var(--dshn-r-sm);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}
.dshn-drawer:hover {
  border-color: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-brand-primary);
}
.dshn-drawer[aria-expanded="true"] {
  color: var(--dsw-alias-label-primary);
}
.dshn-drawer svg { display: block; opacity: .9; }

/* ---- rendered Markdown in the detail pane ---- */
.dshn-md {
  font-size: 14px;
  line-height: 1.85;
  overflow-wrap: anywhere;
  /* A reading measure: full-width text on a wide pane is what made this read
     like a debug view instead of a document. */
  max-width: 46rem;
  letter-spacing: .002em;
}
.dshn-md-h {
  margin: 26px 0 10px;
  line-height: 1.35;
  font-weight: 650;
  letter-spacing: -.005em;
}
.dshn-md-h:first-child { margin-top: 0; }
h3.dshn-md-h { font-size: 19px; }
h4.dshn-md-h { font-size: 16.5px; }
h5.dshn-md-h, h6.dshn-md-h { font-size: 14.5px; }
.dshn-md-p { margin: 0 0 12px; }
.dshn-md-list { margin: 6px 0 14px; padding-left: 24px; }
.dshn-md-list li { margin: 3px 0; padding-left: 2px; }
.dshn-md-list li::marker { color: var(--dsw-alias-label-secondary); }
.dshn-md-list li[data-task]::marker { content: ''; }
.dshn-md-list li[data-task="true"] { color: var(--dsw-alias-label-secondary); text-decoration: line-through; }
/* The marker is cleared for task items, so the box itself has to be drawn — otherwise an
   unchecked item reads as indented plain text. */
.dshn-md-list li[data-task]::before {
  display: inline-block;
  width: 1.1em;
  margin-right: 2px;
  font-size: 12px;
  line-height: 1;
  color: var(--dsw-alias-label-secondary);
}
.dshn-md-list li[data-task="true"]::before { content: '☑'; color: var(--dsw-alias-brand-primary); }
.dshn-md-list li[data-task="false"] { color: var(--dsw-alias-label-primary); }
.dshn-md-list li[data-task="false"]::before { content: '☐'; }
/* Undecided or in-progress items: hollow diamond, normal colour, no strikethrough. */
.dshn-md-list li[data-task="pending"] { color: var(--dsw-alias-label-primary); }
.dshn-md-list li[data-task="pending"]::before { content: '◇'; color: var(--dsw-alias-label-secondary); }
.dshn-md-quote {
  margin: 8px 0 12px;
  padding: 4px 12px;
  border-left: 3px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary);
}
.dshn-md-link {
  color: var(--dsw-alias-brand-primary);
  text-decoration: none;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
}
.dshn-md-link:hover { text-decoration: underline; }
.dshn-md-item {
  display: flex;
  gap: 8px;
  align-items: baseline;
  margin: 3px 0;
  padding-left: calc(var(--dshn-item-indent, 0) * 16px);
}
/* The marker keeps the document's own numbering, so the outline reads as written. */
.dshn-md-marker {
  flex: none;
  min-width: 1.5em;
  color: var(--dsw-alias-label-secondary);
  font-variant-numeric: tabular-nums;
}
.dshn-md-item[data-level='1'] { padding-left: 16px; }
.dshn-md-item[data-level='2'] { padding-left: 32px; }
.dshn-md-item[data-level='3'] { padding-left: 48px; }
.dshn-md-item[data-level='4'] { padding-left: 64px; }
.dshn-md-item-text { min-width: 0; }
.dshn-md-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12.5px;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--dsw-alias-bg-layer-2);
}
.dshn-md-empty { margin: 0; }

/* GitHub's dark contribution palette, so the matrix stays faithful in dark mode. */
@media (prefers-color-scheme: dark) {
  .dshn-root {
    --dshn-heat-0: #161b22;
    --dshn-heat-1: #0e4429;
    --dshn-heat-2: #006d32;
    --dshn-heat-3: #26a641;
    --dshn-heat-4: #39d353;
  }
}

/* ---- the dashboard ---- */
.dshn-board {
  flex-direction: row;
  gap: 16px;
  padding: 16px 20px 20px;
  align-items: stretch;
  min-height: 0;
}
.dshn-board-main {
  flex: 1 1 auto;
  min-width: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.dshn-tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
  gap: 8px;
}
.dshn-tile {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: var(--dshn-r-md);
  background: var(--dsw-alias-bg-layer-1);
}
.dshn-tile-value {
  font-size: 20px;
  font-weight: 650;
  letter-spacing: -.02em;
  font-variant-numeric: tabular-nums;
}
.dshn-tile-label {
  font-size: 10.5px;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: var(--dsw-alias-label-secondary);
}
.dshn-chart-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 10px;
}
.dshn-chart {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: var(--dshn-r-md);
  background: var(--dsw-alias-bg-layer-1);
  /* A hairline lift: the cards should read as surfaces, not as table cells. */
  box-shadow: 0 1px 2px var(--dsw-alias-border-l1);
  min-width: 0;
}
.dshn-chart-head { display: flex; align-items: center; gap: 6px; min-width: 0; }
/* Provenance: a quiet line that says where the numbers came from. */
.dshn-chart-source {
  font-size: 10px;
  color: var(--dsw-alias-label-secondary);
  opacity: .8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dshn-chart-title {
  font-size: 12.5px;
  font-weight: 650;
  letter-spacing: -.005em;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dshn-chart-body { min-height: 0; }
.dshn-section { display: flex; flex-direction: column; gap: 8px; }
.dshn-section-title {
  font-size: 10.5px;
  font-weight: 650;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--dsw-alias-label-secondary);
}

/* bars */
/* ---- bar charts ---- */
.dshn-bars {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
  /* Room for the hover highlight, which would otherwise clip at the edges. */
  margin: 0 -6px;
  padding: 2px 6px;
}
.dshn-bar-row {
  display: grid;
  grid-template-columns: 74px 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 3px 4px;
  border-radius: 6px;
  transition: background .12s ease;
}
.dshn-bar-row:hover { background: var(--dsw-alias-bg-layer-2); }
.dshn-bar-label {
  font-size: 11px;
  color: var(--dsw-alias-label-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dshn-bar-row:hover .dshn-bar-label { color: var(--dsw-alias-label-primary); }
/* A pill track rather than a hairline: it gives the fill a place to sit. */
.dshn-bar-track {
  height: 8px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-2);
  overflow: hidden;
  position: relative;
}
.dshn-bar-fill {
  display: block;
  height: 100%;
  min-width: 4px;
  border-radius: 999px;
  background: var(--dsw-alias-brand-primary);
  transition: width .35s cubic-bezier(.2, .8, .3, 1);
}
/* The value reads as a badge, so the eye can find the number without hunting. */
.dshn-bar-value {
  min-width: 22px;
  padding: 0 6px;
  border-radius: 999px;
  font-size: 10.5px;
  line-height: 16px;
  text-align: center;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-2);
  font-variant-numeric: tabular-nums;
}
.dshn-bar-row:hover .dshn-bar-value {
  color: var(--dsw-alias-label-primary);
}

/* line, pie, stat */
.dshn-line { width: 100%; height: 96px; display: block; }
.dshn-line polyline { stroke: var(--dsw-alias-brand-primary); }
.dshn-pie { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.dshn-pie-svg { width: 84px; height: 84px; flex: none; }
.dshn-pie-legend { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.dshn-legend-item { font-size: 10.5px; color: var(--dsw-alias-label-secondary); display: inline-flex; align-items: center; gap: 5px; }
.dshn-legend-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }
.dshn-stat { display: flex; flex-direction: column; gap: 2px; }
.dshn-stat-value { font-size: 26px; font-weight: 650; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
.dshn-stat-label { font-size: 10.5px; color: var(--dsw-alias-label-secondary); }

/* ---- contribution matrix ---- */
.dshn-chart[data-wide="true"] { grid-column: 1 / -1; }
.dshn-heat { display: flex; flex-direction: column; gap: 6px; }
.dshn-heat-scroll { overflow-x: auto; padding-bottom: 2px; }
.dshn-heat-months,
.dshn-heat-weeks { display: flex; gap: 2px; }
.dshn-heat-months { margin-left: 26px; }
.dshn-heat-body { display: flex; gap: 4px; }
.dshn-heat-days { display: flex; flex-direction: column; gap: 2px; width: 22px; flex: none; }
.dshn-heat-day {
  height: 9px;
  font-size: 8.5px;
  line-height: 9px;
  color: var(--dsw-alias-label-secondary);
  text-align: right;
}
.dshn-heat-col { display: flex; flex-direction: column; gap: 2px; }
.dshn-heat-month {
  width: 9px;
  font-size: 8.5px;
  line-height: 10px;
  color: var(--dsw-alias-label-secondary);
  white-space: nowrap;
  overflow: visible;
}
.dshn-heat-cell {
  width: 9px;
  height: 9px;
  border-radius: 2px;
  display: block;
  background: var(--dsw-alias-bg-layer-2);
}
.dshn-heat-cell[data-level="blank"] { background: transparent; }
.dshn-heat-cell[data-level="0"] { background: var(--dshn-heat-0); }
.dshn-heat-cell[data-level="1"] { background: var(--dshn-heat-1); }
.dshn-heat-cell[data-level="2"] { background: var(--dshn-heat-2); }
.dshn-heat-cell[data-level="3"] { background: var(--dshn-heat-3); }
.dshn-heat-cell[data-level="4"] { background: var(--dshn-heat-4); }
.dshn-heat-legend {
  display: flex;
  align-items: center;
  gap: 3px;
  justify-content: flex-end;
}
.dshn-heat-legend .dshn-cap { margin: 0 4px; }

/* the dashboard's chat column */
.dshn-board-side {
  /* Width is set inline from the dragged value; this is the fallback. */
  width: 400px;
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: var(--dshn-r-md);
  background: var(--dsw-alias-bg-layer-1);
  padding: 10px 6px 6px;
  min-height: 0;
}
/* The dock owns the definite height: the native shell measures against its box,
   and an absolutely-positioned inset needs no percentage chain to resolve. */
/* One grid cell holds both layers: they overlap without absolute positioning, so
   neither the dock nor its children can collapse to zero height.

   The dock also carries its own definite height and is pushed to the bottom of the
   column. The host conversation root is height:100%, so it needs a parent with a
   real height; a viewport-relative height provides one regardless of what the
   ancestors do. */
/* The drag handle between the dashboard and the conversation column. */
.dshn-side-resizer {
  flex: none;
  width: 6px;
  margin: 0 -3px;
  align-self: stretch;
  cursor: col-resize;
  border-radius: 3px;
  background: transparent;
  transition: background .12s ease;
  /* A wide hit area without a wide visual: the bar itself stays a hairline. */
  position: relative;
}
.dshn-side-resizer::after {
  content: '';
  position: absolute;
  inset: 0 2px;
  border-radius: 2px;
  background: var(--dsw-alias-border-l1);
  opacity: 0;
  transition: opacity .12s ease;
}
.dshn-side-resizer:hover::after,
.dshn-side-resizer:active::after {
  opacity: 1;
  background: var(--dsw-alias-brand-primary);
}
.dshn-side-resizer:hover { background: var(--dsw-alias-bg-layer-2); }

/* ---- scrollbars ---- */
/* Charts and panels scroll, but a permanent OS scrollbar reads as clutter. Thin,
   transparent until the pointer is over the area, so it appears when it is needed. */
.dshn-page-render,
.dshn-capture-pane,
.dshn-bars,
.dshn-heat-scroll,
.dshn-side-log,
.dshn-board-main,
.dshn-quick-box,
.dshn-detail-body,
.dshn-copilot-output {
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}
.dshn-page-render:hover,
.dshn-capture-pane:hover,
.dshn-bars:hover,
.dshn-heat-scroll:hover,
.dshn-side-log:hover,
.dshn-board-main:hover,
.dshn-quick-box:hover,
.dshn-detail-body:hover,
.dshn-copilot-output:hover {
  scrollbar-color: var(--dsw-alias-border-l2) transparent;
}
.dshn-page-render::-webkit-scrollbar,
.dshn-capture-pane::-webkit-scrollbar,
.dshn-bars::-webkit-scrollbar,
.dshn-heat-scroll::-webkit-scrollbar,
.dshn-side-log::-webkit-scrollbar,
.dshn-board-main::-webkit-scrollbar,
.dshn-quick-box::-webkit-scrollbar,
.dshn-detail-body::-webkit-scrollbar,
.dshn-copilot-output::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.dshn-page-render::-webkit-scrollbar-track,
.dshn-capture-pane::-webkit-scrollbar-track,
.dshn-bars::-webkit-scrollbar-track,
.dshn-heat-scroll::-webkit-scrollbar-track,
.dshn-side-log::-webkit-scrollbar-track,
.dshn-board-main::-webkit-scrollbar-track,
.dshn-quick-box::-webkit-scrollbar-track,
.dshn-detail-body::-webkit-scrollbar-track,
.dshn-copilot-output::-webkit-scrollbar-track {
  background: transparent;
}
.dshn-page-render::-webkit-scrollbar-thumb,
.dshn-capture-pane::-webkit-scrollbar-thumb,
.dshn-bars::-webkit-scrollbar-thumb,
.dshn-heat-scroll::-webkit-scrollbar-thumb,
.dshn-side-log::-webkit-scrollbar-thumb,
.dshn-board-main::-webkit-scrollbar-thumb,
.dshn-quick-box::-webkit-scrollbar-thumb,
.dshn-detail-body::-webkit-scrollbar-thumb,
.dshn-copilot-output::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 999px;
}
.dshn-page-render:hover::-webkit-scrollbar-thumb,
.dshn-capture-pane:hover::-webkit-scrollbar-thumb,
.dshn-bars:hover::-webkit-scrollbar-thumb,
.dshn-heat-scroll:hover::-webkit-scrollbar-thumb,
.dshn-side-log:hover::-webkit-scrollbar-thumb,
.dshn-board-main:hover::-webkit-scrollbar-thumb,
.dshn-quick-box:hover::-webkit-scrollbar-thumb,
.dshn-detail-body:hover::-webkit-scrollbar-thumb,
.dshn-copilot-output:hover::-webkit-scrollbar-thumb {
  background: var(--dsw-alias-border-l2);
}

.dshn-side-dock {
  /* The containing block for the docked layers. Absolute positioning is what makes the
     height definite: no chain of wrappers can collapse it, and the composer stays at the
     bottom however the host conversation is nested. */
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
/* Both layers cover the dock exactly, so switching between them never moves the composer. */
.dshn-chat-box,
.dshn-quick-box {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}
/* The host conversation root is height:100%, so every wrapper between this box and
   that root has to hand down a real height. Stretching three levels with flex covers
   the wrapper chain without absolute positioning (which would break sibling flow). */
.dshn-chat-box {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}
.dshn-chat-box > *,
.dshn-chat-box > * > *,
.dshn-chat-box > * > * > * {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
}
/* The host composer's "add files or commands" button is host UI: the only way to
   drop it inside this dock is by its accessible name, in each locale. Scoped to
   .dshn-chat-box so every other composer in the app is untouched. */
.dshn-chat-box [aria-label='添加文件或调用指令'],
.dshn-chat-box [title='添加文件或调用指令'],
.dshn-chat-box [aria-label='Add files or run commands'],
.dshn-chat-box [title='Add files or run commands'] {
  display: none !important;
}
/* The provider (and any boundary) between the box and the shell must pass the
   height through, or the conversation collapses again. */
.dshn-chat-box > *,
.dshn-side-chat,
.dshn-side-chat > * {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
/* The quick-note layer sits on top and is opaque, so it really covers the chat. */
.dshn-quick-box {
  /* Fills the dock and splits it, rather than sitting at the bottom of a mostly empty column. */
  min-height: 0;
  background: var(--dsw-alias-bg-layer-1);
  overflow: hidden;
  padding: 2px;
  border-radius: var(--dshn-r-sm);
}
.dshn-quick-box > .dshn-capture-box {
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
}
/* The compact pane owns the column's height: the two sheets share it half each. */
.dshn-capture-box[data-layout='compact'] {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.dshn-capture-box[data-layout='compact'] .dshn-sheets {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}
/* The compact sheet has no frame of its own: it lives inside the board column. */
.dshn-capture-box[data-layout='compact'] .dshn-sheet {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  min-width: 0;
  /* Half of the pane, and each half scrolls its own content. */
  flex: 1 1 50%;
  overflow: hidden;
}

/* In the board's narrow column the two pages stack instead of squeezing. */
/* The compact pane orders by DOM, so the preview can sit above the input. */
.dshn-capture-box[data-layout='compact'] .dshn-sheets[data-order='render-first'] .dshn-sheet[data-role='render'] {
  order: 1;
}
.dshn-capture-box[data-layout='compact'] .dshn-sheets[data-order='render-first'] .dshn-sheet[data-role='source'] {
  order: 2;
}
.dshn-capture-box[data-layout='compact'] .dshn-sheets {
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
}
.dshn-capture-box[data-layout='compact'] .dshn-sheet[data-role='render'] .dshn-page-render {
  /* The sheet's toolbar (translate) sits below this, so the page itself takes the rest. */
  flex: 1 1 auto;
  max-height: none;
  min-height: 0;
  overflow-y: auto;
}
.dshn-capture-box[data-layout='compact'] .dshn-sheet[data-role='source'] .dshn-composer {
  flex: 1 1 auto;
  min-height: 0;
}
.dshn-capture-box[data-layout='compact'] .dshn-sheet[data-role='source'] .dshn-textarea {
  flex: 1 1 auto;
  min-height: 84px;
  height: auto;
  resize: none;
}

/* A draft card above the composer makes the pane taller; it grows up to the dock's
   cap and then scrolls, so the card stays reachable. */
.dshn-quick-box[data-draft='above'] .dshn-enhance {
  max-height: 46vh;
  overflow-y: auto;
}
.dshn-quick-btn { font-size: 11.5px; padding: 3px 9px; }

/* The shared capture box: roomy on the page, compact in the column. */
.dshn-capture-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}
/* ---- the capture page ---- */
/* A writing surface, not a form: centered, portrait, and roomy, so the page reads
   like paper instead of a wide empty band. */
.dshn-capture-pane {
  align-items: center;
  padding: 28px 24px;
  overflow-y: auto;
}
.dshn-capture-box[data-layout='page'] {
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
  min-width: 0;
}
/* ---- sheets ---- */
/* A sheet is one page: its own frame, its own A4-ish height. Two of them sit side by
   side when there is a preview, so neither is distorted by the split. */
.dshn-sheets {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  justify-content: center;
  gap: 26px;
  min-width: 0;
}
.dshn-capture-box[data-layout='page'] .dshn-sheet {
  /* Equal basis with equal shrink: the pair squeezes symmetrically rather than one
     sheet winning. */
  flex: 0 1 820px;
  min-width: 0;
  /* A definite height, not a minimum: both pages end on the same line, and content that
     does not fit scrolls inside its own page. */
  height: min(78vh, 980px);
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 44px 52px 28px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: var(--dshn-r-lg);
  background: var(--dsw-alias-bg-layer-1);
  overflow: hidden;
}
/* One frame only: the sheet is the page, so the composer inside draws none. */
/* ---- selection highlight behind the editor ---- */
.dshn-composer {
  position: relative;
  /* The text metrics live here, on the one element both layers inherit from, so the highlight can
     never disagree with the text it sits under. */
  font-size: 13.5px;
  line-height: 1.7;
}
/* One box holds the highlight layer and the textarea, so the composer's padding and gap cannot
   offset one from the other. */
.dshn-editor-area {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
}
/* Identical metrics to the textarea, so the mark sits under the right characters. */
.dshn-editor-marks {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  scrollbar-width: none;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  word-break: break-word;
  font-size: inherit;
  line-height: inherit;
  font-family: inherit;
  color: transparent;
  z-index: 0;
}
.dshn-editor-mark {
  /* A highlighter stroke rather than an underline: the light green from the heat palette,
     which already exists in both themes. Text stays transparent — the textarea draws it. */
  color: transparent;
  background: var(--dshn-heat-1);
  border-radius: 2px;
  /* Slight breathing room so consecutive lines do not look like a solid block. */
  box-shadow: 0 0 0 1px var(--dshn-heat-1);
}
/* The textarea draws the real text on top of that layer. */
.dshn-composer .dshn-textarea {
  position: relative;
  z-index: 1;
  background: transparent;
}

.dshn-capture-box[data-layout='page'] .dshn-composer {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  font-size: 14px;
  line-height: 1.85;
  min-height: 0;
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  gap: 10px;
}
/* ---- two sheets ---- */
/* The toolbar stays inside the source sheet, so the left page keeps the exact layout it
   had before a preview existed. */
.dshn-capture-box[data-layout='page'] .dshn-sheet[data-role='source'] .dshn-capture-tools,
.dshn-capture-box[data-layout='page'] .dshn-sheet[data-role='render'] .dshn-capture-tools {
  /* Both pages carry a footer strip on the same line, so the two toolbars sit at the
     same height and the pages stay symmetrical. */
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  flex: none;
}
/* An inline error must not push the footer buttons around. */
.dshn-err-inline {
  color: var(--dsw-alias-label-secondary);
  max-width: 46%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dshn-capture-box[data-layout='page'] .dshn-sheet[data-role='render'] .dshn-page-render {
  overflow-x: hidden;
  /* Fills the rest of its page and scrolls there: the two pages stay the same height and
     the preview is reachable without scrolling the whole panel. The base rule's 42vh cap
     and its top margin/padding are reset here — they were written for the old inline
     mirror and were still clipping the preview. */
  flex: 1 1 auto;
  min-height: 0;
  max-height: none;
  margin-top: 0;
  padding-top: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 4px;
  border-top: none;
}
/* Narrow windows keep the single column: two canvases need room to be worth it. */
@media (max-width: 1180px) {
  /* Not enough room for two pages: stack them, each full width of the pane. */
  .dshn-sheets {
    flex-direction: column;
    align-items: stretch;
  }
  .dshn-capture-box[data-layout='page'] .dshn-sheet {
    flex: 0 0 auto;
    width: 100%;
    height: min(70vh, 820px);
  }
  .dshn-capture-box[data-layout='page'] .dshn-sheet[data-role='render'] {
    height: min(56vh, 640px);
  }
  .dshn-capture-box[data-layout='page'] .dshn-sheet[data-role='render'] .dshn-page-render {
    overflow-y: auto;
  }
}
/* The toolbar reads as the foot of the page rather than as a strip inside it. */
.dshn-capture-box[data-layout='page'] .dshn-capture-tools {
  padding-top: 10px;
  border-top: 1px solid var(--dsw-alias-border-l1);
}
.dshn-capture-box[data-layout='page'] .dshn-textarea {
  flex: 1 1 auto;
  min-height: 360px;
  border: none;
  background: transparent;
  padding: 0;
  resize: none;
}
/* The live mirror sits under the source, separated by a hairline — one frame, two
   regions, so the page never looks like nested boxes. */
.dshn-page-render {
  flex: 0 1 auto;
  min-height: 0;
  max-height: 42vh;
  overflow-y: auto;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--dsw-alias-border-l1);
}
.dshn-page-render .dshn-md { max-width: none; }
/* The first line of a note is its title; it gets heading weight so it does not read as
   a stray paragraph. */
.dshn-note-title {
  font-size: 19px;
  font-weight: 680;
  letter-spacing: -.012em;
  line-height: 1.35;
  margin: 0 0 10px;
  color: var(--dsw-alias-label-primary);
}
.dshn-note .dshn-md > :first-child { margin-top: 0; }
.dshn-page-render-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
/* The rewritten span is tinted with the same green as the source range, so the two panes
   agree about what changed. No border and no shadow: a marker stroke that bleeds a little
   past the text instead of framing it. */
.dshn-preview-mark {
  background: var(--dshn-heat-1);
  color: inherit;
  border-radius: 3px;
  padding: 1px 3px;
  box-decoration-break: clone;
}
.dshn-proposal-mark {
  background: var(--dshn-heat-1);
  border-radius: 3px;
  /* No negative margin: it pushed the block past the page and produced a horizontal
     scrollbar. The tint stays inside the text column. */
  padding: 2px 6px;
  margin: 2px 0;
  max-width: 100%;
  overflow-wrap: break-word;
}
/* Kept for older proposals that may still carry the class. */
.dshn-format-mark {
  display: block;
}
/* ---- progress and reveal ------------------------------------------------------------- */
.dshn-busy {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: var(--dsw-alias-label-secondary);
}
.dshn-busy-spinner {
  /* The width/height attributes are not enough once the element is a flex item. */
  width: 14px;
  height: 14px;
  flex: none;
  color: var(--dsw-alias-brand-primary);
  animation: dshn-spin 900ms linear infinite;
  transform-origin: 50% 50%;
  shape-rendering: geometricPrecision;
}
@keyframes dshn-spin {
  to { transform: rotate(360deg); }
}
/* A fixed label next to the ring: the seconds do the moving, not the text. */
.dshn-busy-label {
  white-space: nowrap;
  font-size: 12px;
  letter-spacing: .02em;
  font-variant-numeric: tabular-nums;
}
/* The reveal: an ink wipe from left to right, once, on the new text. */
.dshn-wipe {
  animation: dshn-wipe 520ms cubic-bezier(.2, .7, .2, 1) both;
}
@keyframes dshn-wipe {
  from {
    clip-path: inset(0 100% 0 0);
    opacity: .35;
  }
  to {
    clip-path: inset(0 0 0 0);
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .dshn-busy-spinner,
  .dshn-wipe {
    animation: none;
  }
  .dshn-wipe { opacity: 1; }
}
.dshn-fidelity {
  font-size: 11px;
  color: var(--dsw-alias-label-secondary);
  border-left: 2px solid var(--dsw-alias-border-l2);
  padding: 2px 0 2px 8px;
  margin: 0 0 8px;
}
.dshn-page-render-label {
  font-size: 10px;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--dsw-alias-label-secondary);
  margin-bottom: 6px;
}
/* Format is the primary action of this page, so it carries the accent. */
.dshn-btn.format {
  border-color: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-brand-primary);
}
.dshn-btn.format:hover:not(:disabled) {
  background: var(--dsw-alias-bg-layer-2);
}

.dshn-capture-tools {
  flex-wrap: wrap;
  row-gap: 6px;
}
/* Target-language picker: compact, bordered, and quiet next to the primary action. */
.dshn-lang {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: none;
}
.dshn-lang select {
  appearance: none;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: var(--dshn-r-sm);
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 11.5px;
  line-height: 18px;
  padding: 2px 20px 2px 8px;
  cursor: pointer;
  outline: none;
  /* The chevron is drawn with gradients so no icon font or literal image is needed. */
  background-image: linear-gradient(45deg, transparent 50%, currentColor 50%),
    linear-gradient(135deg, currentColor 50%, transparent 50%);
  background-position: calc(100% - 11px) 8px, calc(100% - 7px) 8px;
  background-size: 4px 4px, 4px 4px;
  background-repeat: no-repeat;
}
.dshn-lang select:hover { border-color: var(--dsw-alias-border-l2); }
.dshn-lang select:focus-visible { border-color: var(--dsw-alias-brand-primary); }
/* In the narrow column the label would push the buttons onto their own row. */
.dshn-quick-box .dshn-lang > .dshn-cap { display: none; }
.dshn-quick-box .dshn-capture-box { gap: 6px; }
.dshn-quick-box .dshn-composer {
  font-size: 12.5px;
}
.dshn-quick-box .dshn-textarea {
  min-height: 120px;
}
.dshn-quick-box .dshn-capture-tools .dshn-cap {
  display: none;
}
.dshn-side-head { display: flex; align-items: center; gap: 6px; min-width: 0; }
.dshn-side-title { font-size: 12.5px; font-weight: 650; }
.dshn-side-log { flex: 1 1 auto; overflow-y: auto; min-height: 0; }
.dshn-side-hint { font-size: 11.5px; line-height: 1.7; color: var(--dsw-alias-label-secondary); }
.dshn-side-answer { font-size: 13px; }
.dshn-side-input { display: flex; flex-direction: column; gap: 6px; flex: none; }
.dshn-side-input .dshn-textarea { min-height: 56px; }
.dshn-side-input .dshn-composer { font-size: 12.5px; }
/* The native conversation inside the board column: it owns its own scrolling and
   composer, so it only needs to fill the space. */
/* Mirrors the learning plugin's working embedded-conversation container: the
   height must be definite on both the box and its direct child, because the
   native shell measures itself against 100% of its parent. */
.dshn-side-chat {
  width: 100%;
  height: 100%;
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  /* The containing block for the host conversation: whatever wrapper the host puts first gets a
     definite box, so its own height:100% resolves no matter how deep the nesting goes. */
  position: relative;
}
.dshn-side-chat > :first-child {
  position: absolute;
  inset: 0;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
/* Belt and braces for the usual wrapper chain: flex-stretch the first three levels. */
.dshn-side-chat > *,
.dshn-side-chat > * > *,
.dshn-side-chat > * > * > * {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.dshn-side-sub {
  font-size: 10.5px;
  line-height: 1.5;
  color: var(--dsw-alias-label-secondary);
  margin-top: -2px;
}

/* ---- the editor copilot ---- */
.dshn-detail-split { display: flex; flex: 1 1 auto; min-height: 0; min-width: 0; }
.dshn-detail-split .dshn-detail-body { flex: 1 1 auto; min-width: 0; }
.dshn-copilot {
  width: 268px;
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-left: 1px solid var(--dsw-alias-border-l1);
  padding: 10px 12px;
  min-height: 0;
  background: var(--dsw-alias-bg-base);
}
.dshn-copilot[data-open="false"] { width: 40px; padding: 10px 4px; align-items: center; }
.dshn-copilot-actions { display: flex; flex-wrap: wrap; gap: 4px; flex: none; }
.dshn-copilot-actions .dshn-btn { padding: 3px 9px; font-size: 11.5px; }
.dshn-copilot-ask { display: flex; gap: 4px; flex: none; }
.dshn-copilot-ask input {
  flex: 1 1 auto;
  min-width: 0;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: var(--dshn-r-sm);
  background: var(--dsw-alias-bg-layer-1);
  color: inherit;
  font: inherit;
  font-size: 11.5px;
  padding: 4px 8px;
  outline: none;
}
.dshn-copilot-output {
  flex: 1 1 auto;
  overflow-y: auto;
  min-height: 0;
  font-size: 12.5px;
  line-height: 1.75;
  border-radius: var(--dshn-r-sm);
}
.dshn-copilot-foot { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; flex: none; }
.dshn-copilot-foot .dshn-btn { padding: 3px 8px; font-size: 11.5px; }
.dshn-md-rule {
  border: 0;
  border-top: 1px solid var(--dsw-alias-border-l1);
  margin: 22px 0;
}

.dshn-detail {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: var(--dshn-r-md);
  background: var(--dsw-alias-bg-layer-1);
  overflow: hidden;
}
.dshn-detail-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  flex-wrap: wrap;
}
.dshn-detail-title { font-weight: 650; font-size: 14.5px; letter-spacing: -.005em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1 1 120px; }
.dshn-detail-body { flex: 1 1 auto; overflow-y: auto; padding: 22px 30px 28px; min-height: 0; }
.dshn-body-text { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13.5px; line-height: 1.75; margin: 0; font-family: inherit; }
.dshn-tags { display: flex; gap: 6px; flex-wrap: wrap; padding: 0 12px 10px; }
.dshn-tag {
  font-size: 11px;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 999px;
  padding: 0 8px;
  line-height: 18px;
  cursor: pointer;
}
.dshn-tag:hover { color: var(--dsw-alias-label-primary); }
.dshn-foot { display: flex; gap: 10px; align-items: center; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.dshn-empty { color: var(--dsw-alias-label-secondary); font-size: 12.5px; padding: 24px 12px; text-align: center; }
.dshn-more { margin-left: 6px; }

/* ---- AI tab: chat left, context and starters right ---- */
.dshn-ai { display: flex; flex: 1 1 auto; min-height: 0; }
.dshn-ai-chat { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; border-right: 1px solid var(--dsw-alias-border-l1); }
.dshn-ai-side {
  width: 300px;
  flex: none;
  padding: 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 12px;
}
.dshn-ai-side h4 { margin: 0; font-size: 12.5px; font-weight: 600; }
.dshn-ai-feature {
  text-align: left;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
  color: inherit;
  font: inherit;
  font-size: 12px;
  border-radius: var(--dshn-r-sm);
  padding: 6px 9px;
  cursor: pointer;
}
.dshn-ai-feature:hover { background: var(--dsw-alias-bg-layer-2); }
.dshn-ai-note { border: 0; background: transparent; color: inherit; font: inherit; font-size: 12px; text-align: left; padding: 3px 0; cursor: pointer; }
.dshn-ai-note:hover { color: var(--dsw-alias-brand-primary); }
.dshn-notice {
  margin: 12px 20px 0;
  padding: 8px 12px;
  border-radius: var(--dshn-r-sm);
  border: 1px solid var(--dsw-alias-state-warn-primary);
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
}

/* ---- composer control and capture card ---- */
.dshn-cta {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 28px;
  width: 30px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  transition: color .12s ease, background .12s ease;
}
.dshn-cta:hover { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-2); }
.dshn-cta svg { display: block; }

.dshn-capture { position: fixed; inset: 0; z-index: 60; pointer-events: none; }
.dshn-card {
  position: fixed;
  right: 24px;
  bottom: 104px;
  width: 380px;
  max-width: calc(100vw - 32px);
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-radius: var(--dshn-r-lg);
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-overlay);
  box-shadow: 0 12px 32px rgba(0, 0, 0, .18);
}
.dshn-card-title { font-size: 12.5px; font-weight: 600; }
.dshn-card textarea {
  width: 100%;
  min-height: 72px;
  box-sizing: border-box;
  resize: vertical;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: var(--dshn-r-sm);
  background: var(--dsw-alias-bg-layer-1);
  color: inherit;
  font: inherit;
  font-size: 13px;
  padding: 6px 8px;
  outline: none;
}
.dshn-card input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid transparent;
  border-radius: var(--dshn-r-sm);
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12px;
  padding: 2px 4px;
  outline: none;
}
.dshn-card input:focus { border-color: var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); }

@media (max-width: 760px) {
  .dshn-body { flex-direction: column; }
  .dshn-list { width: auto; max-height: 42%; }
  .dshn-ai { flex-direction: column; }
  .dshn-ai-side { width: auto; max-height: 40%; border-top: 1px solid var(--dsw-alias-border-l1); }
}
`

    function Styles() {
      return h('style', { 'data-dsh-notes': '' }, STYLES)
    }
