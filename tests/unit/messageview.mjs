const test = require("tap").test;
const fs = require('fs')
const path = require('path')
const previewTemplate = fs.readFileSync(path.join(path.dirname(__dirname).replace('/tests', ''), '/web/themes/default/templates/preview.html'), {encoding: 'utf-8'})
const MessageView = require('../../web/themes/default/js/messageview').MessageView
global.addEventListener = ()=>{}
const Elem = {
    querySelector: function(selector){

    },
    addEventListener: function(event, listener, bubble){

    },
    focus: function(){

    }
}
global.document = Elem
global.NotificationCenter = require('../../web/themes/default/js/mvc').NotificationCenter
global.Observable = require('../../web/themes/default/js/mvc').Observable
global.Events = {
    MESSAGE_WAS_SUBMITTED: 'MESSAGE_WAS_SUBMITTED',
    THIS_USER_HAS_SENT_A_MESSAGE: 'THIS_USER_HAS_SENT_A_MESSAGE',
    HAS_STARTED_TYPING: 'HAS_STARTED_TYPING',
    HAS_STOPPED_TYPING: 'HAS_STOPPED_TYPING',
    CHAT_HEIGHT_HAS_CHANGED: 'CHAT_HEIGHT_HAS_CHANGED'
};

test("Message get's sent when hitting enter", (t) => {
    let model = new Observable({text: null, to: {name: "joey", username: "ijoeyguerra", avatar: null}});
    const view = MessageView({
        style: {
            position: 0,
            top: 0
        },
        querySelector: function(selector){
            return Elem
        },
        offsetTop: 0
    },
    model,
    {
        messageWasSubmitted: (message)=>{
            t.ok(message.text === model.text, "Message was submitted and matches what was set")
            t.end()
        }
    })
    model.text = "some message"
    view.sendMessage()
})
