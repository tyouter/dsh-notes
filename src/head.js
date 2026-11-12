    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useMemo, useCallback, useRef } = React

    const API = '/notes/api'
    /** How often the notebook re-reads its data; the tools and the AI may write meanwhile. */
    const POLL_MS = 5000

    /**
     * The client root context, kept so `detectLanguage()` can ask the host's locale
     * service on every call (that service is what the language switch writes, and the
     * language may arrive after this plugin's apply() runs).
     */
    let clientCtx = null

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
        boardReadOnly: '能查询，也能按你说的新建和修改笔记（删除除外）',

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
    boardFocus: '专注对话（收起看板）',
    boardFocusExit: '显示看板',
        boardChatHint: '问任何关于笔记的问题，比如「我最近写得怎么样」「哪些标签我最少用」。合适的图表会显示在左边。',
        boardChatPlaceholder: '我最近一周写得怎么样？',
        boardChatHintKeys: 'Ctrl/⌘+Enter 发送',
        boardAvgFirst: '平均首字',
        ask: '提问',
        thinking: '思考中…',

        previewShow: '展开预览',
        previewHide: '收起预览',
        autoWrite: '自动写作',
        autoWriteHint: '自动写作已关闭：不产生推荐，也不消耗 token',
        autoWriteOnHint: '停顿 1 秒后自动给出下一句',
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
        enhanceJson: '模型这次返回了 JSON 而不是笔记正文，已丢弃；再点一次结构化即可',
        enhanceSlow: (seconds) => `已等 ${seconds} 秒，模型还在写⬦`,
        collapseList: '收起列表',
        resizeList: '拖动调整列表宽度',
    copyMarkdown: '复制 Markdown',
    copied: '已复制',
    immersive: '沉浸模式',
    immersiveExit: '退出沉浸',
    immersiveFailed: '浏览器拒绝了全屏',
    voice: '语音输入',
    voiceStop: '停止录音',
    voiceBusy: '识别中…',
    voicePrepare: '准备识别模型…',
    voiceFailed: '语音识别失败',
    voiceEmpty: '没有识别出文字',
    voiceListening: '正在听…说完了停一下就写进来',
    voiceHeard: '刚才听到',
    voiceWrote: '已写入',
    voiceUnusable: '这台设备没有可用的麦克风',
    personaLabel: '写作伙伴',
    personaNone: '不选',
    personaManage: '管理',
    personaHint: '开启麦克风后可选：它会偶尔插一句（以引文写在正文里）；你也可以主动呼叫它。',
    personaName: '称呼',
    personaBrief: '提示词：它关注什么、怎么说话',
    personaNew: '新增人格',
    personaSave: '保存',
    personaClose: '关闭',
    personaDelete: '删除',
    personaSaving: '保存中…',
    personaSeated: '在座',
    personaOff: '已关闭',
    personaAutoTbd: '自动挑选中',
    partnerJoined: '新请来',
    convenorThinking: '召唤师在看这一桌…',
    convenorName: '召唤师',
    personaWhy: '它只在你停下来时偶尔插一句，写成一段引用；喊它的名字再加一句求意见的话，它就会答。',
    settingsTitle: '写作伙伴',
    settingsIntro: '谁在场、怎么选，都在这里定。写的时候它不打断你，只在停顿处说一句。',
    settingsEnabled: '启用写作伙伴',
    settingsEnabledHint: '关掉之后不再插话，也不产生任何模型调用。',
    settingsMode: '谁在场',
    settingsModeAuto: '自动',
    settingsModeManual: '指定',
    settingsModeAutoHint: '按你正在写的内容挑一位；挑不出合适的就安静。',
    settingsModeManualHint: '固定用下面这一位。',
    settingsPersona: '指定人格',
    settingsPersonaNone: '不选（它不会开口）',
    settingsPersonaAutoHint: '自动模式下由它自己挑；想固定某一位就切到「指定」。',
    settingsLibrary: '人格库',
    settingsLibraryHint: '点一位进去改：名字、开场白、提示词。预设也能改，改乱了可以还原。',
    settingsLibraryManage: '管理',
    settingsPresets: '预设',
    personaBack: '返回',
    personaEditTitle: '编辑人格',
    personaEditPreset: '编辑预设',
    personaWelcome: '开场白',
    personaWelcomeHint: '刚被叫到时说的第一句；留空就让它自己说。',
    personaBriefHint: '它关注什么、怎么说话——这一栏决定它像不像那个人。',
    personaReset: '还原预设',
    personaResetDone: '已还原',
    personaDeleteConfirm: '再点一次删除',
    personaRequired: '名字和提示词都要填',
    personaPresetTag: '预设',
    personaOwnTag: '自建',
    personaEditedTag: '已改',
    settingsCustom: '我的',
    settingsAdd: '新增人格',
    settingsSaved: '已保存',
    settingsSaveFailed: '保存失败',
    settingsEmptyCustom: '还没有自建人格。',
    settingsAutoTag: '自动',

    backupTitle: '备份与历史',
    backupIntro: '把笔记另存一份到你自己的地方：一个 NAS 共享、一个同步盘、一块移动硬盘，或者 NAS 上的 WebDAV。这里只往外写，不会把外面的东西读回来覆盖你的编辑。',
    backupDestination: '备份到',
    backupOff: '关闭',
    backupFolder: '文件夹',
    backupWebdav: 'WebDAV',
    backupOffHint: '不备份。笔记只在这台机器上。',
    backupFolderHint: '填一个这台机器看得见的目录；NAS 共享先映射成盘符或 UNC 路径。',
    backupWebdavHint: '填 NAS 上的 WebDAV 目录地址，例如群晖的 https://nas.local:5006/notes。',
    backupFolderPath: '文件夹路径',
    backupFolderPathHint: '路径不存在时会自动创建。',
    backupUrl: 'WebDAV 地址',
    backupUrlHint: '要指到目录，不是首页；第一次同步会自动创建子目录。',
    backupUser: '用户名',
    backupUserHint: '留空表示匿名访问。',
    backupPass: '密码',
    backupPassHint: '以明文存在 settings.json 里，和笔记放在同一个目录。',
    backupAuto: '自动备份',
    backupAutoHint: '每次保存笔记后几秒推一次，只写变化的文件。',
    backupMirror: '同步删除',
    backupMirrorHint: '笔记进了回收站或彻底删掉时，备份里的对应文件也删。关掉则只增不删。',
    backupTest: '测试连接',
    backupTesting: '测试中…',
    backupNow: '立即备份',
    backupRunning: '备份中…',
    backupReachable: '连接正常',
    backupUnreachable: '连不上',
    backupDone: '备份完成',
    backupNever: '还没有备份过',
    backupLastOk: '上次备份',
    backupFailed: '上次失败：',
    historyTitle: '历史版本',
    historyKeep: '保留修改记录',
    historyKeepHint: '每次保存前把上一版存进本地 history/ 目录，可以随时翻回去看一眼。',
    historyLimit: '每篇保留',
    historyLimitHint: '版本数上限，超出的从最旧的开始丢。',
    partnerSummon: '呼叫',
    partnerSummonHint: '让它现在就说一句',
    partnerSilent: '它这次没说话',
    imageUploading: '图片保存中…',
    imageInserted: '图片已插入',
    imageFailed: '这张图片没能保存',
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
    versions: '历史版本',
    versionsLoading: '读取历史…',
    versionsEmpty: '这篇还没有历史版本；在设置里打开「保留修改记录」以后，每次保存都会先留下上一版。',
    versionRestore: '恢复',
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
        boardReadOnly: 'Answers, and writes the notes you ask for — except deleting them',

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
    boardFocus: 'Focus the chat (hide the dashboard)',
    boardFocusExit: 'Show the dashboard',
        boardChatHint: 'Ask anything about your notes — "how did I write last week", "which tags do I use least". Suitable charts appear on the left.',
        boardChatPlaceholder: 'How did I write last week?',
        boardChatHintKeys: 'Ctrl/⌘+Enter to send',
        boardAvgFirst: 'Avg first token',
        ask: 'Ask',
        thinking: 'Thinking…',

        previewShow: 'Show preview',
        previewHide: 'Hide preview',
        autoWrite: 'Auto-write',
        autoWriteHint: 'Auto-write is off: no suggestions, no tokens spent',
        autoWriteOnHint: 'Suggests the next sentence after a 1s pause',
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
        enhanceJson: 'The model answered with JSON instead of a note, so it was discarded — run Structure again',
        enhanceSlow: (seconds) => `Still writing after ${seconds}s⬦`,
        collapseList: 'Collapse list',
        resizeList: 'Drag to resize the note list',
    copyMarkdown: 'Copy Markdown',
    copied: 'Copied',
    immersive: 'Immersive',
    immersiveExit: 'Leave immersive',
    immersiveFailed: 'Fullscreen was refused',
    voice: 'Voice input',
    voiceStop: 'Stop recording',
    voiceBusy: 'Transcribing…',
    voicePrepare: 'Preparing the recognizer…',
    voiceFailed: 'Speech recognition failed',
    voiceEmpty: 'Nothing was recognised',
    voiceListening: 'Listening… pause and it lands on the page',
    voiceHeard: 'Heard',
    voiceWrote: 'Written',
    voiceUnusable: 'No usable microphone on this device',
    personaLabel: 'Writing partner',
    personaNone: 'none',
    personaManage: 'Manage',
    personaHint: 'Available while the microphone is on: it may add one quoted line, and you can call it yourself.',
    personaName: 'Name',
    personaBrief: 'Brief: what it notices, how it speaks',
    personaNew: 'New persona',
    personaSave: 'Save',
    personaClose: 'Close',
    personaDelete: 'Delete',
    personaSaving: 'Saving…',
    personaSeated: 'In the room',
    personaOff: 'Off',
    personaAutoTbd: 'Choosing…',
    partnerJoined: 'Joined',
    convenorThinking: 'The host is looking at the room…',
    convenorName: 'Host',
    personaWhy: 'It speaks only when you pause, as a quoted passage. Say its name with a request for an opinion and it answers.',
    settingsTitle: 'Writing partner',
    settingsIntro: 'Who is in the room, and how it is chosen, is settled here. It never interrupts; it speaks at a pause.',
    settingsEnabled: 'Enable the writing partner',
    settingsEnabledHint: 'With this off it says nothing and spends no tokens.',
    settingsMode: 'Who is in the room',
    settingsModeAuto: 'Automatic',
    settingsModeManual: 'Chosen',
    settingsModeAutoHint: 'Picks the best fit for what you are writing; stays quiet when nobody fits.',
    settingsModeManualHint: 'Always use the one selected below.',
    settingsPersona: 'Persona',
    settingsPersonaNone: 'None (it stays quiet)',
    settingsPersonaAutoHint: 'In automatic mode it chooses; switch to Chosen to pin one.',
    settingsLibrary: 'Personas',
    settingsLibraryHint: 'Open one to edit its name, greeting, and brief. Presets can be edited too, and reset if you break them.',
    settingsLibraryManage: 'Manage',
    settingsPresets: 'Presets',
    personaBack: 'Back',
    personaEditTitle: 'Edit persona',
    personaEditPreset: 'Edit preset',
    personaWelcome: 'Greeting',
    personaWelcomeHint: 'The first line when summoned; leave it empty and it improvises.',
    personaBriefHint: 'What it notices and how it talks — this line is what makes it that person.',
    personaReset: 'Reset preset',
    personaResetDone: 'Reset',
    personaDeleteConfirm: 'Click again to delete',
    personaRequired: 'A name and a brief are both needed',
    personaPresetTag: 'Preset',
    personaOwnTag: 'Mine',
    personaEditedTag: 'Edited',
    settingsCustom: 'Mine',
    settingsAdd: 'New persona',
    settingsSaved: 'Saved',
    settingsSaveFailed: 'Could not save',
    settingsEmptyCustom: 'No personas of your own yet.',
    settingsAutoTag: 'Auto',

    backupTitle: 'Backup and history',
    backupIntro: 'Keep a copy of the notebook in a place of your own: a NAS share, a synced drive, an external disk, or WebDAV on the NAS. This only ever writes out; it never reads the other way and overwrites an edit.',
    backupDestination: 'Back up to',
    backupOff: 'Off',
    backupFolder: 'Folder',
    backupWebdav: 'WebDAV',
    backupOffHint: 'No copy. The notes stay on this machine.',
    backupFolderHint: 'A directory this machine can see; map the NAS share to a drive letter or use its UNC path.',
    backupWebdavHint: 'The WebDAV directory URL on the NAS, e.g. https://nas.local:5006/notes.',
    backupFolderPath: 'Folder path',
    backupFolderPathHint: 'Created if it does not exist yet.',
    backupUrl: 'WebDAV URL',
    backupUrlHint: 'Point it at a directory, not the landing page; subfolders are created on the first run.',
    backupUser: 'Username',
    backupUserHint: 'Empty means anonymous.',
    backupPass: 'Password',
    backupPassHint: 'Stored in plain text in settings.json, next to the notes.',
    backupAuto: 'Back up automatically',
    backupAutoHint: 'A few seconds after each save; only the files that changed are written.',
    backupMirror: 'Mirror deletions',
    backupMirrorHint: 'When a note is trashed or deleted, remove its copy too. Off means the backup only grows.',
    backupTest: 'Test connection',
    backupTesting: 'Testing…',
    backupNow: 'Back up now',
    backupRunning: 'Backing up…',
    backupReachable: 'Reachable',
    backupUnreachable: 'Not reachable',
    backupDone: 'Backed up',
    backupNever: 'Never backed up',
    backupLastOk: 'Last backup',
    backupFailed: 'Last attempt failed: ',
    historyTitle: 'History',
    historyKeep: 'Keep versions',
    historyKeepHint: 'Store the previous version under history/ before each save, so an earlier draft is always one click away.',
    historyLimit: 'Keep per note',
    historyLimitHint: 'Upper bound; the oldest versions go first.',
    partnerSummon: 'Ask',
    partnerSummonHint: 'Have it say something now',
    partnerSilent: 'It stayed quiet',
    imageUploading: 'Saving the picture…',
    imageInserted: 'Picture inserted',
    imageFailed: 'That picture could not be saved',
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
    versions: 'Versions',
    versionsLoading: 'Reading history…',
    versionsEmpty: 'No earlier version yet; turn on "Keep versions" in settings and each save keeps the one it replaces.',
    versionRestore: 'Restore',
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

    /**
     * Whether the dashboard is showing beside the conversation.
     *
     * `false` gives the whole pane to the chat — the reason the toggle exists. It is remembered like
     * the column width, so a conversation that needs the room stays that way after a reload.
     */
    function storedBoardFocus() {
      try {
        return localStorage.getItem('notes.boardFocus') === '1'
      } catch {
        return false
      }
    }

    function persistBoardFocus(value) {
      try {
        localStorage.setItem('notes.boardFocus', value === true ? '1' : '0')
      } catch {
        /* storage may be unavailable */
      }
    }

    /** The remembered target language id; Chinese unless the user chose otherwise. */
    /** Auto-write is a preference, not note state: it survives a reload. */
    function storedAutoWrite() {
      try {
        const stored = localStorage.getItem('notes.autoWrite')
        if (stored === 'off') return false
      } catch {
        /* storage may be unavailable */
      }
      return true
    }

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
      // A note that starts with a blank line deliberately has no title line. Dictation uses this: the
      // spoken text is body, and the title stays the author's business rather than the microphone's.
      if (lines.length > 1 && lines[0].trim() === '') return { title: '', rest: String(text ?? '') }
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

    /** Does this line already carry a list marker or another block marker? */
    function hasMarker(line) {
      // Any outline marker the enumerator parser understands, plus the block markers it does not.
      return parseEnumerator(line) !== null || /^\s*(?:[-*+·•—–]\s+|#{1,6}\s+|>\s?)/.test(line)
    }

    /**
     * A run of leading spaces with no marker is an item, not a paragraph.
     *
     * People write a list by indenting:
     *
     *     标题
     *     　　第一点
     *     　　第二点
     *
     * The first indented line after prose becomes "- 第一点"; a line that follows an existing item is
     * a continuation of that item, which is how wrapped bullets stay together.
     */
    /** Width of a line's leading whitespace, tabs counted as two spaces. */
    function indentWidth(rawIndent) {
      return String(rawIndent ?? '').replace(/\t/g, '  ').length
    }

    /**
     * One indent step is one level, relative to the item above.
     *
     * The rule is about typing, not about counting spaces: 2 spaces under a paragraph is a top-level
     * bullet, 2 spaces under a bullet is its child, and a deeper indent under a child is the next
     * level down again. Levels are clamped so a page cannot drift into a staircase.
     */
    function indentLevel(rawIndent) {
      const width = indentWidth(rawIndent)
      if (width < 2) return 1
      return Math.min(4, 1 + Math.floor(width / 2))
    }

    /** The bullet text for a level: "- " prefixed by 2 spaces per level below the first. */
    function bulletText(level, content) {
      return '  '.repeat(Math.max(0, level - 1)) + '- ' + String(content ?? '').trim()
    }

    /**
     * An indented line is an item at that depth.
     *
     * It used to be a continuation of the item above when it was deeper, which merged two items into
     * one bullet — the bug where "安安卓 / 喵喵喵" came out as a single line.
     */
    function normalizeIndentedBullets(text) {
      // Level of the previous item and the indent it was written with, so one indent step means one
      // level regardless of how many spaces were typed.
      let prevLevel = 0
      let prevWidth = 0
      let prevWasItem = false
      return String(text ?? '')
        .split(/\r?\n/)
        .map((line) => {
          if (line.trim() === '') {
            prevWasItem = false
            prevLevel = 0
            prevWidth = 0
            return line
          }
          const width = indentWidth(line.match(/^\s*/)?.[0] ?? '')
          if (hasMarker(line)) {
            prevWasItem = true
            prevLevel = Math.max(1, indentLevel(line.match(/^\s*/)?.[0] ?? ''))
            prevWidth = width
            return line
          }
          const indented = line.match(/^(\t| {2,})(\S.*)$/)
          if (indented === null) {
            prevWasItem = false
            prevLevel = 0
            prevWidth = 0
            return line
          }
          let level
          if (prevWasItem === false) level = 1
          else if (width > prevWidth) level = Math.min(4, prevLevel + 1)
          else if (width === prevWidth) level = prevLevel
          else level = Math.max(1, prevLevel - 1)
          prevWasItem = true
          prevLevel = level
          prevWidth = width
          return bulletText(level, indented[2])
        })
        .join('\n')
    }

    /**
     * Split a suggestion into accept units.
     *
     * One TAB takes a phrase; a sentence is the unit when the phrase is short; a paragraph stays as
     * as many units as it has sentences. This is what makes a wrong guess cost one TAB, not one undo.
     */
    function suggestionChunks(text) {
      const source = String(text ?? '').trim()
      if (source === '') return []
      const units = []
      const pieces = source.split(/(?<=[。！？!?；;\n])/)
      for (const piece of pieces) {
        const trimmed = piece.trim()
        if (trimmed === '') continue
        // A long clause is offered in two steps: up to the first comma, then the rest.
        const comma = trimmed.search(/[，,]/)
        if (trimmed.length > 24 && comma > 3 && comma < trimmed.length - 1) {
          units.push(trimmed.slice(0, comma + 1))
          units.push(trimmed.slice(comma + 1).trim())
        } else {
          units.push(trimmed)
        }
      }
      return units.filter((unit) => unit !== '')
    }

    /**
     * The document's own wording, first.
     *
     * "产品上线会议" typed twice already is a better guess than anything a model would invent: the
     * user is repeating themselves, that is exactly the typing worth saving. Looks for the longest
     * run ending at the caret that also appears earlier in the document, and returns what followed
     * it there.
     */
    function repetitionSuggestion(draft, caret, options = {}) {
      const source = String(draft ?? '')
      const at = Math.max(0, Math.min(caret, source.length))
      const maxTail = Math.min(12, options.maxTail ?? 12)
      const maxLength = options.maxLength ?? 40
      const minTail = options.minTail ?? 2
      const before = source.slice(0, at)
      // Only the tail of the current line matters; a new line is a new thought.
      const lineStart = before.lastIndexOf('\n') + 1
      const tail = before.slice(lineStart)
      for (let size = Math.min(maxTail, tail.length); size >= minTail; size -= 1) {
        const needle = tail.slice(tail.length - size)
        if (needle.trim() === '') continue
        // Where else does the same run appear, followed by more text?
        let found = -1
        let from = 0
        for (;;) {
          const index = source.indexOf(needle, from)
          if (index < 0) break
          const isCurrent = index + size >= lineStart && index < at
          if (!isCurrent && source.slice(index + size).trim() !== '') {
            found = index
            break
          }
          from = index + 1
        }
        if (found < 0) continue
        const after = source.slice(found + size)
        const stop = after.search(/[。！？!?\n]/)
        const candidate = (stop < 0 ? after : after.slice(0, stop)).trim()
        if (candidate === '' || candidate.length > maxLength) continue
        // The suggestion must continue this word, not repeat it.
        if (candidate === needle) continue
        return { text: candidate, source: 'document', matched: needle }
      }
      return null
    }

    /** Where the line around `index` starts and ends. */
    function lineBounds(text, index) {
      const source = String(text ?? '')
      const at = Math.max(0, Math.min(index, source.length))
      const start = source.lastIndexOf('\n', at - 1) + 1
      const breakAt = source.indexOf('\n', at)
      return { start, end: breakAt < 0 ? source.length : breakAt }
    }

    /** The bullet level of a line, or null when the line is not an item. */
    function lineBulletLevel(line) {
      const match = String(line ?? '').match(/^(\s*)-\s+\S?/)
      if (match === null) return null
      return indentLevel(match[1])
    }

    /**
     * A line that is nothing but two or more spaces becomes a bullet immediately.
     *
     * This is the timing-independent half of 极简写: the burst detector is for going deeper, but
     * turning spaces into a bullet must not depend on how fast the keys were tapped.
     */
    function autoBulletLine(text, caret) {
      const source = String(text ?? '')
      const at = Math.max(0, Math.min(caret, source.length))
      const { start, end } = lineBounds(source, at)
      const line = source.slice(start, end)
      // Already an item, holding nothing but the marker and spaces: the spaces mean "one level down".
      const emptyItem = line.match(/^(\s*)-\s+( {2,})$/)
      if (emptyItem !== null) {
        const level = Math.min(4, Math.max(1, indentLevel(emptyItem[1])) + 1)
        const replaced = bulletText(level, '')
        return { text: source.slice(0, start) + replaced + source.slice(end), caret: start + replaced.length }
      }
      if (hasMarker(line)) return null
      const leading = line.match(/^ {2,}/)?.[0] ?? ''
      if (leading === '') return null
      // The caret has to be inside this line's text (after the spaces); mid-line edits stay put.
      if (at < start + leading.length) return null
      const rest = line.slice(leading.length)
      const level = Math.max(1, Math.min(4, Math.floor(leading.length / 2)))
      const prefix = bulletText(level, '')
      const replaced = bulletText(level, rest === '' ? '' : rest)
      // Keep the caret where it was relative to the text, not relative to the spaces.
      const caretOffset = Math.max(0, at - start - leading.length)
      const newLine = rest === '' ? prefix : replaced
      return { text: source.slice(0, start) + newLine + source.slice(end), caret: start + prefix.length + caretOffset }
    }

    /**
     * What the mark layer draws behind the textarea, as a list of segments.
     *
     * The layer sits under the textarea, so its plain text must be *exactly* the textarea's text:
     * one extra character and the glyphs stop lining up, which is what "blurred double text" looked
     * like. Only three things may be added, each at a position that fits the draft:
     *   {kind:'accepted'} the span the last TAB inserted
     *   {kind:'ghost'}    the pending suggestion (never together with a range)
     *   {kind:'range'}    the author's current selection
     *
     * Priority: range > accepted > ghost. A range means the author is pointing at text, so the
     * suggestion (a continuation at the caret) and the accepted mark both step aside.
     */
    function mirrorSegments({ draft, ghost, accepted, range }) {
      const text = String(draft ?? '')
      const fits = (span) =>
        span !== null &&
        span !== undefined &&
        Number.isFinite(span.start) &&
        Number.isFinite(span.end) &&
        span.start >= 0 &&
        span.end >= span.start &&
        span.end <= text.length
      const ghostText = ghost === null || ghost === undefined ? '' : String((ghost.chunks ?? [])[ghost.index] ?? '')
      const ghostAt = ghost === null || ghost === undefined ? 0 : Number(ghost.at)
      const liveGhost = ghostText !== '' && Number.isFinite(ghostAt) && ghostAt >= 0 && ghostAt <= text.length ? { at: ghostAt, text: ghostText } : null
      const liveRange = fits(range) && range.end > range.start ? range : null
      const liveAccepted = fits(accepted) && accepted.end > accepted.start && liveRange === null ? accepted : null

      if (liveRange !== null) {
        return [
          { kind: 'text', text: text.slice(0, liveRange.start) },
          { kind: 'range', text: text.slice(liveRange.start, liveRange.end) },
          { kind: 'text', text: text.slice(liveRange.end) },
        ].filter((segment) => segment.text !== '')
      }
      if (liveAccepted !== null) {
        const segments = [
          { kind: 'text', text: text.slice(0, liveAccepted.start) },
          { kind: 'accepted', text: text.slice(liveAccepted.start, liveAccepted.end) },
        ]
        const ghostAfter = liveGhost !== null && liveGhost.at >= liveAccepted.end ? liveGhost : null
        if (ghostAfter !== null) {
          segments.push({ kind: 'text', text: text.slice(liveAccepted.end, ghostAfter.at) })
          segments.push({ kind: 'ghost', text: ghostAfter.text })
          segments.push({ kind: 'text', text: text.slice(ghostAfter.at) })
        } else {
          segments.push({ kind: 'text', text: text.slice(liveAccepted.end) })
        }
        return segments.filter((segment) => segment.text !== '')
      }
      if (liveGhost !== null) {
        return [
          { kind: 'text', text: text.slice(0, liveGhost.at) },
          { kind: 'ghost', text: liveGhost.text },
          { kind: 'text', text: text.slice(liveGhost.at) },
        ].filter((segment) => segment.text !== '')
      }
      return []
    }

    /**
     * Place a suggestion chunk into the note.
     *
     * A chunk is model output, so it may start with a list marker even though the caret sits at the end
     * of a sentence. Pasted verbatim that produces "...管理。 - 你的笔记…" — a marker inside a line, which
     * is not a list and not a sentence. Three cases:
     *   - the caret is already on a marker ("- " alone)  -> drop the chunk's own marker;
     *   - the caret is mid-line and the chunk has a marker -> start a new line;
     *   - anything else                                     -> insert as-is.
     */
    function insertChunkAt(value, at, chunk) {
      const text = String(value ?? '')
      const position = Math.max(0, Math.min(Number(at) || 0, text.length))
      const source = String(chunk ?? '')
      if (source === '') return { value: text, start: position, end: position }
      const lineStart = text.lastIndexOf('\n', position - 1) + 1
      const before = text.slice(lineStart, position)
      const marker = source.match(/^(\s*)(?:[-*+·•—–]|\d+[.)])\s+/)
      let insert = source
      if (marker !== null) {
        if (/^\s*(?:[-*+·•—–]|\d+[.)])\s*$/.test(before)) {
          insert = source.slice(marker[0].length)
        } else if (before.trim() !== '') {
          insert = '\n' + source.replace(/^[ \t]+/, '')
        }
      }
      return {
        value: text.slice(0, position) + insert + text.slice(position),
        start: position,
        end: position + insert.length,
      }
    }

    /**
     * The colour a chart point should be drawn in.
     *
     * The value comes from a chart file, which the model writes and a person can edit, so it is checked
     * here too: hex, rgb()/hsl() or a theme variable, nothing else. An unusable value falls back to the
     * colour the renderer would have used anyway.
     */
    function chartColor(point, fallback) {
      const value = String(point?.color ?? '').trim()
      const safe =
        /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value) ||
        /^(?:rgb|rgba|hsl|hsla)\([0-9.,%\s/+-]{3,40}\)$/i.test(value) ||
        /^var\(--[a-z0-9-]{1,60}\)$/i.test(value)
      return safe ? value : fallback
    }

    /** A comparison key: markers, punctuation and spacing removed, Latin lowercased. */
    function compareKey(value) {
      return String(value ?? '')
        .replace(/^\s*(?:[-*+·•—–]|\d+[.)、]|\(\d+\)|[①-⑳])\s*/, '')
        .replace(/[\s，。．！？!?,.;:；：、“”"'（）()《》【】\-—–]/g, '')
        .toLowerCase()
    }

    /**
     * Would this suggestion repeat something already in the note?
     *
     * The completion is supposed to add, not restate: a duplicate is worse than nothing, because the
     * author has to find it and delete it. Compares against every line and against the whole tail.
     */
    function duplicateSuggestion(draft, suggestion) {
      const key = compareKey(suggestion)
      if (key.length < 2) return false
      const lines = String(draft ?? '').split(/\r?\n/)
      for (const line of lines) {
        const lineKey = compareKey(line)
        if (lineKey === '') continue
        if (lineKey === key) return true
        if (lineKey.includes(key)) return true
      }
      return compareKey(draft).includes(key)
    }

    /**
     * Split speech into sentences.
     *
     * The recognizer punctuates; this only trusts that punctuation. A trailing fragment without a terminator
     * is still a sentence — speech often stops mid-thought and the next segment continues it.
     */
    function spokenSentences(text) {
      const source = String(text ?? '').trim()
      if (source === '') return []
      const parts = source.match(/[^。！？!?；;]+[。！？!?；;]?/g) ?? []
      return parts.map((part) => part.trim()).filter((part) => part !== '')
    }

    /** Cues that really start a list. "然后 / 接着 / 另外" are narrative, and stay in the paragraph. */
    const ORDINAL_CUE = /^(?:第[一二三四五六七八九十\d]+[、.，,：:]?|首先|其次|再次|最后|一[、.]|二[、.]|三[、.]|\d+[.)、])/
    /** Cues that introduce an example or a reason for the line above. */
    const SUB_CUE = /^(?:比如|例如|具体来说|具体是|也就是|就是说)/

    /** A pause this long between segments starts a new paragraph instead of continuing the line. */
    const DICTATION_PARAGRAPH_PAUSE_MS = 2000

    /** How long one dictated paragraph may grow before it is broken anyway. */
    const DICTATION_PARAGRAPH_CHARS = 180

    /** Does this text end in something a script does not separate with a space? */
    const CJK_TAIL = /[\u3000-\u9fff\uff00-\uffef]$/

    /**
     * Lay dictated text out without a model.
     *
     * Speech runs on, so prose stays one paragraph: sentences follow each other exactly as they were spoken,
     * with no line break between them. Structure only appears where it was actually signalled — an ordinal
     * cue starts a list item, a continuation cue ("比如 / 也就是 / 因为") is indented under the line before,
     * and a paragraph longer than a comfortable measure is broken. Wording is never touched.
     */
    function arrangeDictation(text) {
      const sentences = spokenSentences(text)
      if (sentences.length === 0) return ''
      const lines = []
      for (const sentence of sentences) {
        const last = lines.length - 1
        if (SUB_CUE.test(sentence) && last >= 0) {
          lines.push(`  - ${sentence}`)
          continue
        }
        if (ORDINAL_CUE.test(sentence)) {
          lines.push(`- ${sentence}`)
          continue
        }
        // Prose: append to the paragraph in progress, separated the way the script separates sentences.
        if (last >= 0 && !/^\s*-/.test(lines[last]) && lines[last].length < DICTATION_PARAGRAPH_CHARS) {
          lines[last] += /\.$/.test(lines[last]) ? ` ${sentence}` : sentence
        } else {
          lines.push(sentence)
        }
      }
      return lines.join('\n')
    }

    /**
     * What goes between what is already on the page and the next dictated piece.
     *
     * A short pause is just a breath: the words continue the same paragraph, separated the way the script
     * separates them (Chinese needs nothing, English needs a space). A long pause — the one that means "new
     * thought" — starts a new line, and so does a line that is already full.
     */
    function dictationJoiner(existing, gapMs = 0) {
      const value = String(existing ?? '')
      if (value === '') return ''
      const tail = value.slice(-1)
      if (/\n$/.test(tail)) return ''
      if (Number(gapMs) >= DICTATION_PARAGRAPH_PAUSE_MS) return '\n'
      const line = value.slice(value.lastIndexOf('\n') + 1)
      if (line.length >= DICTATION_PARAGRAPH_CHARS) return '\n'
      if (CJK_TAIL.test(tail)) return ''
      return ' '
    }

        /**
     * PCM16 WAV from mono samples, which is the one shape every Host recognizer accepts.
     *
     * The built-in voice input encodes the same header; keeping to it means the notebook records, not
     * recognises — the recognizer and its language stay whatever the user configured in DSH.
     */
    function encodeWave(samples, sampleRate = 16000) {
      const pcm = new Int16Array(samples.length)
      for (let i = 0; i < samples.length; i += 1) {
        const clamped = Math.max(-1, Math.min(1, Number(samples[i]) || 0))
        pcm[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff
      }
      const bytes = new Uint8Array(44 + pcm.length * 2)
      const view = new DataView(bytes.buffer)
      const text = (at, value) => {
        for (let i = 0; i < value.length; i += 1) bytes[at + i] = value.charCodeAt(i)
      }
      text(0, 'RIFF')
      view.setUint32(4, bytes.length - 8, true)
      text(8, 'WAVE')
      text(12, 'fmt ')
      view.setUint32(16, 16, true)
      view.setUint16(20, 1, true)
      view.setUint16(22, 1, true)
      view.setUint32(24, sampleRate, true)
      view.setUint32(28, sampleRate * 2, true)
      view.setUint16(32, 2, true)
      view.setUint16(34, 16, true)
      text(36, 'data')
      view.setUint32(40, pcm.length * 2, true)
      for (let i = 0; i < pcm.length; i += 1) view.setInt16(44 + i * 2, pcm[i], true)
      return bytes
    }

    /** Linear resampling to 16 kHz mono: enough for speech, and no dependency to load. */
    function resampleMono(channel, fromRate, toRate = 16000) {
      const input = channel ?? new Float32Array(0)
      const sourceRate = Number(fromRate) > 0 ? Number(fromRate) : toRate
      if (sourceRate === toRate || input.length === 0) return input
      const ratio = sourceRate / toRate
      const length = Math.max(1, Math.round(input.length / ratio))
      const output = new Float32Array(length)
      for (let i = 0; i < length; i += 1) {
        const at = i * ratio
        const left = Math.floor(at)
        const right = Math.min(input.length - 1, left + 1)
        const weight = at - left
        output[i] = input[left] * (1 - weight) + input[right] * weight
      }
      return output
    }

        /** Enter on a bullet continues at the same level, marker included. */
    function continueBulletLine(text, index) {
      const source = String(text ?? '')
      const { start, end } = lineBounds(source, index)
      const level = lineBulletLevel(source.slice(start, end))
      if (level === null) return null
      const insert = '\n' + '  '.repeat(Math.max(0, level - 1)) + '- '
      return { text: source.slice(0, index) + insert + source.slice(index), caret: index + insert.length }
    }

    /**
     * Two spaces in one burst at the start of a line promote it: a plain line becomes a bullet, a
     * bullet line goes one level deeper.
     */
    function spaceBurstLine(text, index) {
      const source = String(text ?? '')
      const { start, end } = lineBounds(source, index)
      const line = source.slice(start, end)
      const level = lineBulletLevel(line)
      if (level === null) {
        if (source.slice(start, index).trim() !== '') return null
        const content = line.trim()
        const replaced = bulletText(1, content)
        return { text: source.slice(0, start) + replaced + source.slice(end), caret: start + 2 + content.length }
      }
      const content = line.replace(/^\s*-\s+/, '')
      const replaced = bulletText(Math.min(3, level + 1), content)
      return { text: source.slice(0, start) + replaced + source.slice(end), caret: start + replaced.length }
    }

    /**
     * Backspace at the front of a bullet backs out: one level up, and at the first level the marker
     * goes away so the line is prose again.
     *
     * `index` is the caret. It only fires while the caret is inside the marker (leading indent plus
     * "- "), so deleting characters inside the text still deletes characters.
     */
    function backspaceLine(text, index) {
      const source = String(text ?? '')
      const { start, end } = lineBounds(source, index)
      const line = source.slice(start, end)
      const level = lineBulletLevel(line)
      if (level === null) return null
      const markerEnd = line.match(/^\s*-\s+/)?.[0].length ?? 0
      if (index - start > markerEnd) return null
      const content = line.replace(/^\s*-\s+/, '')
      if (level <= 1) {
        // The last backspace: bullet -> prose, caret at the start of the line.
        return { text: source.slice(0, start) + content + source.slice(end), caret: start }
      }
      const replaced = bulletText(level - 1, content)
      const caret = start + Math.max(0, (index - start) - 2)
      return { text: source.slice(0, start) + replaced + source.slice(end), caret }
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
     * Whether a structuring result is a JSON object rather than the note itself.
     *
     * The host already refuses to hand JSON to the page, so this is the last line of defence: a
     * brace and one of the note's field names is enough to know the model answered in the old
     * schema. Painting that into the page turns a draft into a wall of escaped quotes.
     */
    function looksLikeJsonDraft(text) {
      const value = String(text ?? '').trim()
      if (value === '') return false
      const head = value.replace(/^```[a-zA-Z]*\s*/, '')
      if (!head.startsWith('{')) return false
      return /"(?:title|body|tags|notes)"\s*:/.test(head)
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

      // 2. Stray "*"/"**"/"***" separators are bullets too, and an indented line is an item.
      const starred = normalizeIndentedBullets(normalizeStrayAsterisks(dashed))

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
      // The title is the first line shown in a larger style, not a separate document: when the
      // selection covers that line, the title carries the same mark the body lines do.
      const titleMarked = title !== '' && marks instanceof Set && marks.has(plainLine(title))
      return h(
        'div',
        { className: 'dshn-note' },
        title === ''
          ? null
          : h(
              'div',
              { className: 'dshn-note-title' + (titleMarked ? ' dshn-preview-mark' : '') },
              ...inlineSpans(title, 'note-title'),
            ),
        rest.trim() === '' ? null : h('div', { className: 'dshn-md' }, renderMarkdown(rest, marks)),
      )
    }

    /**
     * The note as standard Markdown, for pasting into another agent or a repository.
     *
     * The notebook keeps the author's numbering — 「一、」「1、」「①」 all mean an item — but those
     * markers are plain text to a Markdown parser elsewhere. This converts the title to `# …`,
     * outline numbering to `1.`, and symbolic markers to `-`, keeping indentation as nesting.
     */
    function toStandardMarkdown(text) {
      const raw = String(text ?? '').replace(/\r\n/g, '\n').trim()
      if (raw === '') return ''
      const { title, rest } = splitNoteTitle(raw)
      const lines = normalizeIndentedBullets(rest).split('\n')
      const counters = new Map()
      const output = []
      for (const line of lines) {
        if (line.trim() === '') {
          output.push('')
          continue
        }
        const indent = line.match(/^\s*/)?.[0] ?? ''
        const enumerator = parseEnumerator(line)
        if (enumerator !== null && /^\s*[-*+·•—–]\s+/.test(line) === false) {
          const depth = Math.floor(indent.replace(/\t/g, '  ').length / 2)
          const kind = enumerator.style
          if (kind === 'arabic' && enumerator.close === '.') {
            // Already standard.
            const current = (counters.get(depth) ?? 0) + 1
            counters.set(depth, current)
            output.push(`${indent}${current}. ${enumerator.rest}`)
            continue
          }
          if (kind === 'symbol' || kind === 'circled') {
            counters.delete(depth)
            output.push(`${indent}- ${enumerator.rest}`)
            continue
          }
          const current = (counters.get(depth) ?? 0) + 1
          counters.set(depth, current)
          output.push(`${indent}${current}. ${enumerator.rest}`)
          continue
        }
        // A plain line ends the running list.
        counters.clear()
        output.push(line.replace(/^\s*[-*+·•—–]\s+/, (match) => match))
      }
      const body = output.join('\n').replace(/\n{3,}/g, '\n\n').trim()
      const heading = title === '' ? '' : `# ${title}`
      if (heading === '') return body
      return body === '' ? heading : `${heading}\n\n${body}`
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

    /**
     * Which language the panel speaks.
     *
     * The host's `locale` service is the source of truth: the language switch writes
     * it, and the sidebar re-syncs panel labels on `locale` changes, so reading it at
     * call time (not once at load) keeps the sidebar name in step. Older hosts without
     * that service fall back to the legacy storage keys, then the browser.
     */
    function detectLanguage() {
      try {
        const service = clientCtx !== null && typeof clientCtx.get === 'function' ? clientCtx.get('locale') : null
        const active = typeof service?.getLocale === 'function' ? service.getLocale()?.active : undefined
        if (typeof active === 'string' && active !== '') {
          const id = active.toLowerCase()
          if (id.startsWith('en')) return 'en'
          if (id.startsWith('zh')) return 'zh'
        }
      } catch {
        /* a locale read must never break rendering */
      }
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

    /**
     * Who reads as "in the room" on the capture strip.
     *
     * The capture page no longer lets anyone choose: the ids come from the convenor, and in `auto` mode
     * the room stays empty until somebody has been seated.
     */
    function partnerSeatLabel(t, personas, seated, settings) {
      if (settings !== null && settings !== undefined && settings.enabled === false) return t.personaOff
      const ids = Array.isArray(seated) ? seated : seated === '' || seated === undefined ? [] : [seated]
      const names = ids.map((id) => {
        const found = (Array.isArray(personas) ? personas : []).find((entry) => entry.id === id)
        if (found === undefined) return ''
        return detectLanguage() === 'zh' ? found.name : (found.nameEn ?? found.name)
      }).filter((name) => name !== '')
      if (names.length > 0) return names.join('、')
      return settings !== null && settings !== undefined && settings.mode === 'auto' ? t.personaAutoTbd : t.personaNone
    }

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
    const post = (path, body, signal) =>
      api(path, { method: 'POST', body: JSON.stringify(body ?? {}), signal })
    const put = (path, body) => api(path, { method: 'PUT', body: JSON.stringify(body ?? {}) })
    const del = (path) => api(path, { method: 'DELETE' })

    /**
     * Where an image in a note actually loads from.
     *
     * Only two shapes are allowed: a vault asset (`assets/x.png`, served by the host) and an
     * absolute http(s) URL. A note is untrusted text, so `file:`, `javascript:` and bare local
     * paths get nothing back — the caller then shows the text instead of an image.
     */
    function imageUrl(source) {
      const raw = String(source ?? '').trim()
      if (/^https?:\/\/\S+$/i.test(raw)) return raw
      const clean = raw.replace(/^\.\//, '').replace(/^\//, '')
      if (!/^assets\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(clean)) return ''
      return `${API}/asset?path=${encodeURIComponent(clean)}`
    }

    /** A picked or pasted file as bare base64 — the host decodes it, so the prefix would confuse it. */
    function fileBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(reader.error ?? new Error('read failed'))
        reader.onload = () => resolve(String(reader.result ?? '').replace(/^data:[^,]*;base64,/, ''))
        reader.readAsDataURL(file)
      })
    }

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

    /** Inline spans: ![image](src), [link](href), `code`, **bold**, *italic*. */
    function inlineSpans(text, keyBase) {
      // Images first, then links: an image's alt text may contain anything, and a URL may contain
      // characters the emphasis patterns would otherwise eat.
      const pattern = /(!\[[^\]\n]*\]\([^)\s]+\)|\[[^\]\n]+\]\([^)\s]+\)|`[^`]+`|\*\*[^*]+\*\*|\*[^*\n]+\*)/g
      const out = []
      let last = 0
      let index = 0
      let match
      while ((match = pattern.exec(text)) !== null) {
        if (match.index > last) out.push(text.slice(last, match.index))
        const token = match[0]
        const key = `${keyBase}-i${index++}`
        if (token.startsWith('![')) {
          const parts = token.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/)
          const url = parts === null ? '' : imageUrl(parts[2])
          if (url === '') out.push(parts === null ? token : parts[1])
          else
            out.push(
              h('img', {
                key,
                className: 'dshn-md-image dshn-md-inline',
                src: url,
                alt: parts[1],
                loading: 'lazy',
              }),
            )
        } else if (token.startsWith('[')) {
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

    /** One table row as cells: leading, trailing and inner pipes all optional in practice. */
    function tableCells(line) {
      return String(line ?? '')
        .replace(/^\s*\|/, '')
        .replace(/\|\s*$/, '')
        .split('|')
        .map((cell) => cell.trim())
    }

    /** `| --- | :--: |` — the line that makes the line above it a header. */
    function isTableDivider(line) {
      const cells = tableCells(line)
      return cells.length > 0 && cells.every((cell) => /^:?-{2,}:?$/.test(cell))
    }

    function tableAlign(cell) {
      const left = cell.startsWith(':')
      const right = cell.endsWith(':')
      if (left && right) return 'center'
      if (right) return 'right'
      if (left) return 'left'
      return undefined
    }

    function alignStyle(align) {
      return align === undefined ? undefined : { textAlign: align }
    }

    /** Render a note body as Markdown blocks.
     *
     * `marks` is an optional Set of plainLine() strings: those lines render inside a <mark>, which
     * is how the preview mirrors the editor's selection.
     */
    function renderMarkdown(source, marks) {
      const lines = normalizeIndentedBullets(normalizeStrayAsterisks(String(source ?? ''))).split(/\r?\n/)
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
                  {
                    key: index,
                    'data-task': item.task === undefined ? undefined : String(item.task),
                    'data-depth': item.level > 1 ? String(item.level) : undefined,
                  },
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
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        const raw = lines[lineIndex]
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
        // An image on its own line is a picture with a caption, not a paragraph.
        const picture = line.trim().match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/)
        if (picture !== null) {
          const url = imageUrl(picture[2])
          if (url === '') {
            paragraph.push(line.trim())
            continue
          }
          flushParagraph()
          flushList()
          itemStack.length = 0
          blocks.push(
            h(
              'figure',
              { key: `f${blocks.length}`, className: 'dshn-md-figure' },
              h('img', { className: 'dshn-md-image', src: url, alt: picture[1], loading: 'lazy' }),
              picture[1] === '' ? null : h('figcaption', { className: 'dshn-md-caption' }, picture[1]),
            ),
          )
          continue
        }
        // A table: a row of pipes, a divider under it, then rows until the pipes stop.
        if (line.includes('|') && lineIndex + 1 < lines.length && isTableDivider(lines[lineIndex + 1])) {
          const header = tableCells(line)
          const aligns = tableCells(lines[lineIndex + 1]).map(tableAlign)
          const rows = []
          let cursor = lineIndex + 2
          while (cursor < lines.length && lines[cursor].includes('|') && lines[cursor].trim() !== '') {
            rows.push(tableCells(lines[cursor]))
            cursor += 1
          }
          flushParagraph()
          flushList()
          itemStack.length = 0
          const key = `t${blocks.length}`
          blocks.push(
            h(
              'div',
              { key, className: 'dshn-md-table-wrap' },
              h(
                'table',
                { className: 'dshn-md-table' },
                h(
                  'thead',
                  null,
                  h(
                    'tr',
                    null,
                    ...header.map((cell, column) =>
                      h('th', { key: column, style: alignStyle(aligns[column]) }, ...inlineSpans(cell, `${key}-h${column}`)),
                    ),
                  ),
                ),
                rows.length === 0
                  ? null
                  : h(
                      'tbody',
                      null,
                      ...rows.map((row, rowIndex) =>
                        h(
                          'tr',
                          { key: rowIndex },
                          ...header.map((_, column) =>
                            h(
                              'td',
                              { key: column, style: alignStyle(aligns[column]) },
                              ...inlineSpans(row[column] ?? '', `${key}-r${rowIndex}c${column}`),
                            ),
                          ),
                        ),
                      ),
                    ),
              ),
            ),
          )
          lineIndex = cursor - 1
          continue
        }
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
          // Depth comes from the indent, so nesting survives into the page.
          list.items.push({ text: content, task, level: Math.max(1, indentLevel(line.match(/^\s*/)?.[0] ?? '')) })
          continue
        }
        // A deeper indented line is its own nested item: indent is meaning.
        if (list !== null && /^\s{2,}\S/.test(raw)) {
          list.items.push({ text: line.trim(), task: undefined, level: Math.max(1, indentLevel(raw.match(/^\s*/)?.[0] ?? '')) })
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
  flex-wrap: nowrap;
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
  /* One height for every control in a toolbar row: padding alone made the buttons 28px, the icon
     buttons 24px and the switch 17px, which is why the footer read as three uneven rows. */
  height: 28px;
  padding: 0 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font: inherit;
  font-size: 12px;
  line-height: 1;
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
/* ---- history: a column you can widen, cards two lines long ---- */
.dshn-history .dshn-list { width: var(--dshn-list-width, 288px); }
.dshn-splitter {
  width: 8px;
  cursor: col-resize;
  border-radius: 4px;
  background: transparent;
  position: relative;
  touch-action: none;
}
.dshn-splitter::after {
  content: '';
  position: absolute;
  inset: 8px 3px;
  border-radius: 3px;
  background: var(--dsw-alias-border-l1);
  transition: background .12s ease;
}
.dshn-splitter:hover::after,
.dshn-splitter:active::after { background: var(--dsw-alias-brand-primary); }
.dshn-splitter[data-hidden="true"] { display: none; }
.dshn-item-preview {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  line-height: 1.5;
}
/* ---- history detail bar: a title, then one quiet action group on the right ---- */
/* The pane itself: the remaining width, the full height, and the same top line as the list. */
.dshn-detail {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: hidden;
  /* The list spends its first two rows on "11 / 11" and the day label; the detail starts level with
     the first card instead of hugging the tab bar. One number, easy to tune. */
  padding: var(--dshn-detail-top, 40px) 2px 12px 4px;
}
.dshn-detail-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
  width: 100%;
  /* Narrow panes must not push Pin / Copy / Edit onto a second row. */
  flex-wrap: nowrap;
  min-width: 0;
}
.dshn-detail-bar .dshn-detail-actions .dshn-btn { padding: 3px 10px; font-size: 12px; }
.dshn-detail-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}
.dshn-detail-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: none;
  /* Belt and braces: even without the spacer, the group sits at the right edge. */
  margin-left: auto;
}
/* Kept versions: one row per version, right under the note's own bar. */
.dshn-versions {
  max-height: 40%;
  overflow: auto;
  padding: 6px 0 8px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.dshn-version-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 3px 2px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
.dshn-version-when { flex: none; font-variant-numeric: tabular-nums; }
.dshn-version-title {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-primary);
}
.dshn-version-chars { flex: none; font-variant-numeric: tabular-nums; opacity: 0.75; }
.dshn-version-empty { padding: 4px 2px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dshn-icon-btn {
  width: 28px;
  height: 28px;
  display: inline-grid;
  place-items: center;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--dshn-r-sm);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  transition: background .12s ease, color .12s ease, border-color .12s ease;
}
.dshn-icon-btn:hover {
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
}
.dshn-icon-btn:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}
.dshn-icon-btn[data-on="true"] {
  color: var(--dsw-alias-brand-primary);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent);
}
.dshn-icon-btn[data-copied="true"] {
  color: var(--dsw-alias-state-success-primary);
  background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%, transparent);
}
/* The tick lands rather than appears: a short pop, then the button settles. */
.dshn-copy-check { animation: dshn-copy-pop 300ms cubic-bezier(.2, .9, .3, 1.2); transform-origin: 50% 50%; }
@keyframes dshn-copy-pop {
  0% { transform: scale(.55); opacity: 0; }
  60% { transform: scale(1.18); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .dshn-copy-check { animation: none; }
}
.dshn-icon-btn.dshn-danger:hover {
  color: var(--dsw-alias-state-error-primary);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent);
}
.dshn-detail-edit {
  padding: 5px 14px;
  border-radius: var(--dshn-r-sm);
  font-weight: 600;
  letter-spacing: .01em;
}
.dshn-detail-bar .dshn-detail-edit:hover { filter: brightness(1.15); }
.dshn-detail-bar .dshn-btn:not(.primary) {
  padding: 5px 12px;
  font-size: 12.5px;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
  border-radius: var(--dshn-r-sm);
}
.dshn-detail-bar .dshn-btn:not(.primary):hover {
  border-color: var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
}
.dshn-detail-bar .dshn-btn.danger { color: var(--dsw-alias-state-error-primary); }
.dshn-detail-bar .dshn-btn.primary {
  padding: 6px 16px;
  font-size: 12.5px;
  font-weight: 600;
  border-radius: var(--dshn-r-sm);
  box-shadow: 0 1px 2px rgb(0 0 0 / 12%);
}
.dshn-detail-bar .dshn-btn.primary:hover { filter: brightness(1.08); }
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
  width: 28px;
  height: 28px;
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
/* Nesting: each level steps in and changes the marker, so a sub-item reads as a sub-item. */
.dshn-md-list li[data-depth="2"] { margin-left: 1.15em; list-style-type: circle; }
.dshn-md-list li[data-depth="3"] { margin-left: 2.3em; list-style-type: square; }
.dshn-md-list li[data-depth="4"] { margin-left: 3.45em; list-style-type: '–  '; }
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
/* A table is wide by nature: it scrolls sideways inside the page instead of shrinking the text. */
.dshn-md-table-wrap {
  margin: 4px 0 14px;
  overflow-x: auto;
}
.dshn-md-table {
  border-collapse: collapse;
  width: 100%;
  font-size: 0.95em;
  line-height: 1.5;
}
.dshn-md-table th,
.dshn-md-table td {
  padding: 6px 10px;
  vertical-align: top;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  text-align: left;
}
.dshn-md-table th {
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-2);
  white-space: nowrap;
}
.dshn-md-table tbody tr:last-child td { border-bottom: none; }
.dshn-md-figure { margin: 4px 0 14px; }
.dshn-md-image {
  display: block;
  max-width: 100%;
  height: auto;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l1);
}
.dshn-md-caption {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--dsw-alias-label-secondary);
}
.dshn-md-inline.dshn-md-image {
  display: inline-block;
  max-height: 1.5em;
  border: none;
  border-radius: 3px;
  vertical-align: text-bottom;
}
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
/* Chat-only: the dashboard steps aside and the conversation owns the pane. */
.dshn-board-focus {
  padding: 12px 16px 16px;
}
.dshn-board-focus .dshn-board-side {
  min-width: 0;
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
/* The read view scrolls as one column: note, tags, footer. The bar above stays put. */
.dshn-detail-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.dshn-detail-body {
  flex: 0 0 auto;
}
.dshn-side-dock {
  /* The quick-note layer covers this box, so it stays a containing block. */
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
/* Both layers cover the dock exactly, so switching between them never moves the composer. */
.dshn-quick-box {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}
.dshn-chat-box {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
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
/* One flex child, nothing else: the host lays out its own conversation inside it. */
.dshn-chat-box > * {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
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
/* ---- persona: the listener bar, its manager, and the quoted line it writes ---- */
.dshn-voice-dock {
  /* Inside the footer, hanging off its top edge: the same width, exactly above the border, and out of the
     sheet's layout, so it cannot push the text around when it appears. */
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(100% - 2px);
  z-index: 3;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-bottom: 8px;
  pointer-events: none;
}
.dshn-voice-dock > * { pointer-events: auto; }
.dshn-persona-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  min-width: 0;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: var(--dshn-r-sm);
  background: var(--dsw-alias-bg-layer-1);
  box-shadow: 0 4px 14px rgb(0 0 0 / 8%);
}
.dshn-persona-bar .dshn-cap { flex: 0 0 auto; }
.dshn-persona-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
}
/* The interjection itself: a quote line, set slightly larger and in italics by the markdown renderer. */
.dshn-md-quote {
  margin: 12px 0;
  padding: 2px 0 2px 12px;
  border-left: 2px solid var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-label-primary);
  font-size: 1.06em;
  line-height: 1.7;
}

/* ---- dictation strip: what the microphone just heard, above the footer ---- */
/* Nothing to say means no strip at all: an empty state used to render "undefined". */
.dshn-voice-strip:empty { display: none; }
.dshn-voice-strip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: var(--dshn-r-sm);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  min-width: 0;
}
.dshn-voice-dot {
  width: 6px;
  height: 6px;
  flex: none;
  border-radius: 50%;
  background: var(--dsw-alias-label-secondary);
}
.dshn-voice-strip[data-live='true'] .dshn-voice-dot {
  background: var(--dsw-alias-brand-primary);
  animation: dshn-voice-pulse 1.2s ease-in-out infinite;
}
.dshn-voice-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
@keyframes dshn-voice-pulse {
  0%, 100% { opacity: .35; transform: scale(.85); }
  50% { opacity: 1; transform: scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .dshn-voice-strip[data-live='true'] .dshn-voice-dot { animation: none; }
}

/* ---- immersive: this page alone, on the whole screen ---- */
.dshn-capture-pane:fullscreen {
  background: var(--dsw-alias-bg-base);
  padding: 32px 48px 24px;
  overflow-y: auto;
}
.dshn-capture-pane:fullscreen .dshn-sheets {
  flex: 1 1 auto;
  min-height: 0;
}
.dshn-capture-pane:fullscreen .dshn-capture-box[data-layout='page'] .dshn-sheet {
  height: auto;
  flex: 1 1 0;
}
.dshn-capture-pane:fullscreen .dshn-capture-tools {
  padding-top: 12px;
}
/* History mounts the editor without a capture pane, so there the box is the fullscreen element. */
.dshn-capture-box:fullscreen {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 28px 40px 20px;
  background: var(--dsw-alias-bg-base);
  overflow-y: auto;
}
.dshn-capture-box:fullscreen .dshn-sheets {
  flex: 1 1 auto;
  min-height: 0;
}
.dshn-capture-box:fullscreen .dshn-sheet {
  height: auto;
  flex: 1 1 0;
}
.dshn-capture-box[data-layout='page'] {
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
  min-width: 0;
  /* Fills the pane, so the paper can take the whole height. */
  flex: 1 1 auto;
  min-height: 0;
}
.dshn-capture-box[data-layout='page'] > .dshn-sheets {
  flex: 1 1 auto;
  min-height: 0;
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
  /* The pane hands down its height, so the page grows with the window. A fixed 78vh cap left the
     toolbar halfway up the screen and a field of empty space under it. */
  height: auto;
  flex: 1 1 0;
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
/* A suggestion, not text: it sits in the mirror layer, behind the textarea's transparent text. */
.dshn-ghost {
  color: var(--dsw-alias-label-secondary);
  opacity: .55;
  pointer-events: none;
}
.dshn-ghost[data-source="document"] {
  /* Repeating the note's own words is a stronger promise than a guess: a touch more ink. */
  opacity: .72;
}
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
.dshn-mark-accepted {
  /* Same green as an action range: the chunk is in the note already, and one Backspace takes it out. */
  color: transparent;
  background: var(--dshn-heat-1);
  border-radius: 2px;
  box-shadow: 0 0 0 1px var(--dshn-heat-1);
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
  /* Two groups, so a narrow page wraps the actions onto their own line instead of clipping the
     button that happens to be last. Nothing may be hidden: every control stays reachable. */
  flex-wrap: wrap;
  row-gap: 8px;
  min-width: 0;
  overflow: visible;
}
.dshn-capture-tools .dshn-btn { height: 28px; padding: 0 12px; font-size: 12px; }
/* The footer in two halves: what you are writing (left) and what you can do to it (right). */
.dshn-tool-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
  row-gap: 8px;
}
.dshn-tool-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  row-gap: 8px;
  /* Replaces the old spacer: the actions own their alignment, so wrapping keeps them right-aligned. */
  margin-left: auto;
}
.dshn-capture-tools .dshn-btn,
.dshn-capture-tools .dshn-switch { flex: 0 0 auto; white-space: nowrap; }
/* The counter and the key hint yield first, then the hint goes away entirely. */
.dshn-capture-tools .dshn-chars { flex: 0 0 auto; white-space: nowrap; }
.dshn-capture-tools .dshn-hint {
  /* Whole or gone: "Ctrl/⌘..." reads as a broken control rather than a shortened hint. */
  flex: 0 0 auto;
  white-space: nowrap;
}
.dshn-capture-pane { container-type: inline-size; }
@container (max-width: 760px) {
  .dshn-capture-tools .dshn-hint { display: none; }
}
/* Narrower than a comfortable row: the actions move to their own line rather than shrink. */
@container (max-width: 560px) {
  .dshn-tool-actions {
    margin-left: 0;
    width: 100%;
    justify-content: flex-end;
  }
}
/* ---- preview drawer handle: a tab on the seam between the pages ---- */
.dshn-sheets { position: relative; }
.dshn-preview-handle {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 3;
  width: 18px;
  height: 44px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  box-shadow: 0 1px 3px rgb(0 0 0 / 8%);
  transition: color .12s ease, border-color .12s ease, background .12s ease;
}
.dshn-preview-handle:hover {
  color: var(--dsw-alias-label-primary);
  border-color: var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
}
.dshn-preview-handle:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.dshn-preview-handle[data-open="false"] { color: var(--dsw-alias-label-primary); }
/* A hidden page keeps its column: hiding changes what you see, not the layout. */
.dshn-sheet[data-hidden='true'] { visibility: hidden; pointer-events: none; }
/* Stacked layout: an empty half would be dead space, so the editor takes the height there. */
.dshn-capture-box[data-layout='compact'] .dshn-sheets[data-mode='single'] .dshn-sheet { flex: 1 1 auto; }
/* The preview toggle: quiet until hovered, pressed-looking state when the page is open. */
.dshn-capture-tools [data-role='preview-toggle'] { padding: 4px 10px; font-size: 11.5px; }
.dshn-capture-tools [data-role='preview-toggle'][data-on='true'] { color: var(--dsw-alias-label-primary); }
/* ---- auto-write switch: a small track that turns green when suggestions are live ---- */
.dshn-switch {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  /* The same 28px box as the buttons beside it. */
  height: 28px;
  padding: 0 6px;
  border: none;
  border-radius: var(--dshn-r-sm);
  background: transparent;
  cursor: pointer;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  transition: background .12s ease, color .12s ease;
}
.dshn-switch:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.dshn-switch:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; border-radius: 999px; }
.dshn-switch-track {
  position: relative;
  width: 30px;
  height: 17px;
  border-radius: 999px;
  background: var(--dsw-alias-border-l2);
  transition: background .16s ease;
  flex: none;
}
.dshn-switch-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: var(--dsw-alias-bg-base);
  box-shadow: 0 1px 2px rgb(0 0 0 / 25%);
  transition: transform .16s ease;
}
.dshn-switch[data-on="true"] .dshn-switch-track { background: var(--dsw-alias-state-success-primary); }
.dshn-switch[data-on="true"] .dshn-switch-knob { transform: translateX(13px); }
.dshn-switch[data-on="true"] { color: var(--dsw-alias-label-primary); }
/* Small enough that four controls and two labels fit one line on a narrow pane. */
.dshn-capture-tools .dshn-btn { padding: 3px 10px; font-size: 12px; font-weight: 500; }
.dshn-capture-tools .dshn-btn.primary { padding: 4px 13px; font-size: 12px; font-weight: 600; }
.dshn-capture-tools {
  /* Both pages carry a footer strip on the same line, so the two toolbars sit at the
     same height and the pages stay symmetrical. */
  position: relative;
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  flex: none;
  align-items: center;
  gap: 8px;
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
@container (max-width: 1180px) {
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
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
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
