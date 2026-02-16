import { DatabaseSync } from 'node:sqlite'
import { initDb } from '../src/server/db/initDb.mjs'
import { AuthService } from '../src/server/services/AuthService.mjs'
import { HubService } from '../src/server/services/HubService.mjs'
import { ChannelService } from '../src/server/services/ChannelService.mjs'
import { MessageService } from '../src/server/services/MessageService.mjs'
import { DeliveryService } from '../src/server/services/DeliveryService.mjs'
import { SearchService } from '../src/server/services/SearchService.mjs'

export const createTestContext = () => {
  let now = 1
  const nowFn = () => now

  const db = new DatabaseSync(':memory:')
  initDb(db)

  const auth = new AuthService({ db, nowFn, sessionTtlMs: 60 * 60 * 1000 })
  const hubService = new HubService({ db, nowFn })
  const channelService = new ChannelService({ db, nowFn, hubService })
  const searchService = new SearchService({ db })
  const messageService = new MessageService({ db, nowFn, channelService, searchService })
  const deliveryService = new DeliveryService({ db, nowFn })

  const advanceTime = (ms) => {
    now += ms
  }

  const insertUser = (handle, displayName, roles = ['user']) => {
    const userId = `u_${handle}_${now}`
    db.prepare(
      `
        INSERT INTO users (user_id, handle, display_name, roles_json, created_at)
        VALUES (?, ?, ?, ?, ?)
      `
    ).run(userId, handle, displayName, JSON.stringify(roles), now)
    return userId
  }

  return {
    db,
    auth,
    hubService,
    channelService,
    messageService,
    deliveryService,
    searchService,
    advanceTime,
    insertUser
  }
}
