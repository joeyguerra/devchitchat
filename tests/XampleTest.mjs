
  import { describe, it, beforeEach, afterEach } from 'node:test'
  import assert from 'node:assert/strict'
  
  import { Robot } from 'hubot'
  
  // You need a dummy adapter to test scripts
  import dummyRobot from './doubles/DummyAdapter.mjs'
  
  // Mocks Aren't Stubs
  // https://www.martinfowler.com/articles/mocksArentStubs.html
  
  describe('Xample testing Hubot scripts', () => {
    let robot = null
    beforeEach(async () => {
      process.env.EXPRESS_PORT = 0
      robot = new Robot(dummyRobot, true, 'Dumbotheelephant')
      await robot.loadAdapter()
      await robot.run()
      await robot.loadFile('./scripts', 'Xample.mjs')
    })
    afterEach(() => {
      delete process.env.EXPRESS_PORT
      robot.shutdown()
    })
    it('should handle /helo request', async () => {
      const expected = "HELO World! I'm Dumbotheelephant."
      const url = 'http://localhost:' + robot.server.address().port + '/helo'
      const response = await fetch(url)
      const actual = await response.text()
      assert.strictEqual(actual, expected)
      })
    it('should reply with expected message', async () => {
      const expected = "HELO World! I'm Dumbotheelephant."
      const user = robot.brain.userForId('test-user', { name: 'test user' })
      let actual = ''
      robot.on('reply', (envelope, ...strings) => {
        actual = strings.join('')
      })
      await robot.adapter.say(user, '@Dumbotheelephant helo', 'test-room')
      assert.strictEqual(actual, expected)
    })
  
    it('should send message to the #general room', async () => {
      const expected = 'general'
      const user = robot.brain.userForId('test-user', { name: 'test user' })
      let actual = ''
      robot.on('send', (envelope, ...strings) => {
        actual = envelope.room
      })
      await robot.adapter.say(user, '@Dumbotheelephant helo room', 'general')
      assert.strictEqual(actual, expected)
    })
  })  
