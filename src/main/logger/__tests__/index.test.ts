import { describe, expect, it } from 'vitest'
import { isIgnorableStreamWriteError } from '../index'

describe('logger stream write error guard', () => {
  it('should treat common stdio teardown errors as ignorable', () => {
    expect(isIgnorableStreamWriteError({ code: 'EPIPE' } as NodeJS.ErrnoException)).toBe(true)
    expect(isIgnorableStreamWriteError({ code: 'EIO' } as NodeJS.ErrnoException)).toBe(true)
    expect(isIgnorableStreamWriteError({ code: 'ERR_STREAM_DESTROYED' } as NodeJS.ErrnoException)).toBe(true)
  })

  it('should keep unknown errors non-ignorable', () => {
    expect(isIgnorableStreamWriteError({ code: 'EINVAL' } as NodeJS.ErrnoException)).toBe(false)
    expect(isIgnorableStreamWriteError({} as NodeJS.ErrnoException)).toBe(false)
  })
})
