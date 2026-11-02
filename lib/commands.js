/**
 * A chat command, so the notebook is reachable without leaving the composer:
 * `/note 今天下午跟 A 组对齐`, `/note` (list the most recent).
 *
 * A command is a human action; it calls the same `NoteStore` methods the panel
 * and the tool use.
 */

export function registerNotesCommands(ctx, store, logger) {
  // Cordis surfaces a missing declared service as a throwing property read, so
  // the registry is reached through `get` (which returns undefined) and this
  // registration stays optional.
  const commands = ctx.get?.('commands')
  if (commands === undefined || typeof commands.register !== 'function') {
    return () => {}
  }
  try {
    return commands.register({
      name: 'note',
      description: '记一条笔记到「记事本」；不带内容时列出最近的笔记。',
      input: { hint: '想记下的内容' },
      async handler(invocation) {
        const text = String(invocation?.rawInput ?? '').trim()
        if (text === '') {
          const { notes, total } = await store.list({ limit: 10 })
          return {
            kind: 'success',
            text:
              notes.length === 0
                ? '记事本还是空的。用 `/note 内容` 记第一条。'
                : `最近 ${notes.length} 条（共 ${total} 条）：\n${notes.map((note) => `- ${note.title || '无标题'}`).join('\n')}`,
          }
        }
        const { note } = await store.save({ body: text, source: 'command' })
        logger?.info?.(`[notes] command saved ${note.id}`)
        return { kind: 'success', text: `已记到记事本：${note.title || note.body.slice(0, 40)}` }
      },
    })
  } catch (error) {
    // A host whose command definition differs is not a reason to fail activation.
    logger?.warn?.(`[notes] command registration skipped: ${error?.message ?? error}`)
    return () => {}
  }
}
