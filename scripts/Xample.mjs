// Description:
//   Test script
//
// Commands:
//   hubot helo - Responds with Hello World!.
//
// Notes:
//   This is a test script.
//

export default async (robot) => {
  robot.respond(/helo$/, async res => {
    await res.reply("HELO World! I'm Dumbotheelephant.")
  })
  robot.respond(/helo room/, async res => {
    await res.send('Hello World!')
  })
  robot.router.get('/helo', async (req, res) => {
    res.send("HELO World! I'm Dumbotheelephant.")
  })
}