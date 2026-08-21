import { describe, expect, it } from 'vitest'
import { PianoStorageError } from '../errors'
import { clearLocalDataSafely, removeRepertoireSafely } from '../mutations'

describe('recoverable persistence mutations', () => {
  it('surfaces failed Repertoire removal without claiming success', async () => {
    const result = await removeRepertoireSafely({ removeFromRepertoire: async () => { throw new PianoStorageError('TRANSACTION_FAILED', 'Remove failed safely.') } }, 'arr-1')
    expect(result).toMatchObject({ ok: false, value: null, error: { code: 'TRANSACTION_FAILED', message: 'Remove failed safely.' } })
  })

  it('surfaces failed clear-all without an unhandled rejection or success result', async () => {
    const result = await clearLocalDataSafely({ clearAll: async () => { throw new Error('Database refused the clear.') } })
    expect(result).toMatchObject({ ok: false, value: null, error: { code: 'TRANSACTION_FAILED', message: 'Database refused the clear.' } })
  })
})
