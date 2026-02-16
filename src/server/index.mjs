import { ChatServer } from './ChatServer.mjs'
import { openDatabase } from './db/openDb.mjs'
import { initDb } from './db/initDb.mjs'
import { createLogger } from './util/logger.mjs'
import fs from 'node:fs'

const logger = createLogger()
const port = Number(process.env.PORT || 3000)
const dbPath = process.env.DB_PATH || './data/chat.db'
const certPath = process.env.HTTPS_CERT_FILE || null
const keyPath = process.env.HTTPS_KEY_FILE || null

let tls = null
if (certPath || keyPath) {
  if (!certPath || !keyPath) {
    throw new Error('Both HTTPS_CERT_FILE and HTTPS_KEY_FILE must be set to enable HTTPS')
  }
  tls = {
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath)
  }
}

const db = openDatabase(dbPath)
initDb(db)

const server = new ChatServer({ db, logger, tls })

server.listen(port)

logger.info('server.start', { port, dbPath, protocol: tls ? 'https' : 'http' })
