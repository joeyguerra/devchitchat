import crypto from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(crypto.scrypt)

export const randomToken = (bytes = 24) => {
  return crypto.randomBytes(bytes).toString('base64url')
}

export const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export const hashPassword = async (password) => {
  const salt = crypto.randomBytes(16).toString('hex')
  const buf = await scrypt(password, salt, 64)
  return `${salt}:${buf.toString('hex')}`
}

export const verifyPassword = async (password, hash) => {
  const [salt, key] = hash.split(':')
  const buf = await scrypt(password, salt, 64)
  return buf.toString('hex') === key
}
