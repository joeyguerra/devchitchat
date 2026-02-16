import crypto from 'node:crypto'

export const newId = (prefix) => {
  return `${prefix}_${crypto.randomUUID()}`
}
