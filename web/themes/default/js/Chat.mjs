import { makeKeyValueObservable } from '../../../../lib/Observable.mjs'
import NotificationCenter from '../../../../lib/NotificationCenter.mjs'
import {Message, Events} from '../../../../lib/Models.mjs'
import DiscussionView from '/public/js/DiscussionView.mjs'
import RosterView from '/public/js/RosterView.mjs'
import MessageView from '/public/js/MessageView.mjs'
import ReconnectingCounterView from '/public/js/ReconnectingCounterView.mjs'
import PreviewView from '/public/js/PreviewView.mjs'

function debug(level){
    console.log(arguments)
}

function formatDate(lastTimeSent){
    var date = new Date(this.time)
    if((this.time - lastTimeSent)/1000 > 60*1)
    return 'mm/dd/yyyy h:m t'.replace('mm', date.getMonth() + 1)
        .replace('dd', date.getDate() > 9 ? date.getDate() : '0' + date.getDate())
        .replace('yyyy', date.getFullYear())
        .replace('h', date.getHours() - 12 < 0 ? date.getHours() : date.getHours() - 12)
        .replace('m', date.getMinutes()> 9 ? date.getMinutes() : '0' + date.getMinutes())
        .replace('t', date.getHours() > 11 ? 'PM' : 'AM')
    return ''
}

const PERMISSIONS = {
    DEFAULT: 'default'
    , GRANTED: 'granted'
    , DENIED: 'denied'
}

class Chat {
    constructor(model, socket, win){
        this.win = win
        this.socket = socket
        this.views = []
        this.model = model
        this.config = {
            ACTIVITY_LIMIT_IN_SECONDS: 20,
        }
        this.isNotificationsOn = false
        this.reconnection = makeKeyValueObservable({times: 0})
        this.isActiveRightNow = false
        this.activityTimestamp = new Date()
    }
    start(){
        if(this.win.member && this.socket){
            this.socket.on('connected', this.connected.bind(this))
            this.socket.on('left', this.left.bind(this))
            this.socket.on('joined', this.joined.bind(this))
            this.socket.on('nicknames', this.nicknames.bind(this))
            this.socket.on('message', this.message.bind(this))
            this.socket.on('reconnect', this.reconnect.bind(this))
            this.socket.on('reconnecting', this.reconnecting.bind(this))
            this.socket.on('error', this.error.bind(this))

            const discussionView = this.win.document.getElementById('messagesView')
            const messageView = this.win.document.getElementById('comment')
            const rosterView = this.win.document.getElementById('rosterView')

            const dView = new DiscussionView(discussionView, this.model.messages, this)
            this.views.push(dView)
            this.views.push(new RosterView(rosterView, this.model.roster, this))
            this.views.push(new MessageView(messageView, this.model.message, this))
            this.views.push(new ReconnectingCounterView(this.win.reconnectingElement, this.reconnection, this))

            const firstChild = dView.container.querySelector('.discussion li:first-child')
            const template = firstChild.cloneNode(true)
            template.style.display = 'none'
            template.className = 'self preview'
            template.innerHTML += '<small>Not sent yet.</small>'
            template.querySelector('img').src = this.win.member.avatar
            firstChild.parentNode.appendChild(template)
            
            this.views.push(new PreviewView(template, this.model.message, this))
            this.views.forEach(v => v.resize ? v.resize({h: this.win.document.documentElement.clientHeight, w: this.win.document.documentElement.clientWidth}) : null)
            this.win.addEventListener('resize', this, true)

            this.socket.emit('nickname', this.win.member.username, exists => {
                this.model.roster.push({username: this.win.member.username, name: this.win.member.displayName, avatar: this.win.member.avatar})
            })

            this.socket.emit('send previous messages', 'hello?', list => {
                if(!list) return
                list.forEach(m => {
                    this.model.messages.push(new Message(m))
                })
            })
            NotificationCenter.subscribe(Events.THIS_USER_HAS_SENT_A_MESSAGE, {THIS_USER_HAS_SENT_A_MESSAGE: (publisher, info) => {
                this.activityTimestamp = new Date()
            }}, messageView)

            NotificationCenter.subscribe(Events.CHAT_HEIGHT_HAS_CHANGED, {CHAT_HEIGHT_HAS_CHANGED: (publisher, messageHeight) => {
                if (this.win.scrollY <= 0) return
                this.win.scrollTo(this.win.scrollX, this.win.scrollY + messageHeight)
            }}, discussionView)
        }

        this.win.addEventListener('blur', this.blur, true)
        this.win.addEventListener('focus', this.focus, true)
        this.win.addEventListener('unload', this.release, true)
    
    }
    getBase64Image(img) {
        // Create an empty canvas element
        const canvas = this.win.document.createElement("canvas")
        canvas.width = img.width
        canvas.height = img.height
    
        // Copy the image contents to the canvas
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0)
    
        // Get the data-URL formatted image
        // Firefox supports PNG and JPEG. You could check img.src to guess the
        // original format, but be aware the using "image/jpg" will re-encode the image.
        const dataURL = canvas.toDataURL('image/png')
    
        return dataURL.replace(/^data:image\/(png|jpg)base64,/, '')
    }
    release(e){
        this.views.forEach(v => {
            try{
                if(v.release) v.release()
            }catch(e){}
        })
        if(this.win.member){
            const room = this.win.location.href.split('/')[3]
            this.socket.emit('left', {member: this.win.member, room: ''})
            this.socket.removeAllListeners('connect')
            this.socket.removeAllListeners('nicknames')
            this.socket.removeAllListeners('message')
            this.socket.removeAllListeners('reconnect')
            this.socket.removeAllListeners('reconnecting')
            this.socket.removeAllListeners('error')
            this.socket.removeAllListeners('left')
        }
    }
    messageWasReceived(message){
        return message
    }
    messageWasSubmitted(model){
        if(!model.text) return
        if(model.text.length === 0) return
        this.views.forEach(v => {
            if(v.messageWasSubmitted) v.messageWasSubmitted(model)
        })
        this.socket.emit('message', model.text)
    }
    connected(nicknames){
        this.reconnection.times = 0
        this.views.forEach(v => {
            if(v.connected) v.connected(nicknames)
        })
    }
    joined(member){
        this.views.forEach(v => {
            if(v.joined) v.joined(member)
        })
    }
    nicknames(nicknames){
        this.views.forEach(v => {
            if(v.nicknames) v.nicknames(nicknames)
        })
    }
    didShowNotification(e){
        setTimeout(function(){
            e.target.close()
            e.target.removeEventListener('show', this.didShowNotification)
        }.bind(this), 5000)
    }
    message(message){
        if(this.isNotificationsOn
            && message.from.username !== this.win.member.username
            && !this.isActiveRightNow
        ){
            const notification = new this.win.Notification(message.from.displayName || message.from.name, {body: message.text, tag: 'notifyUser', icon: message.from.avatar})
            console.log('showing notif', notification)
            notification.addEventListener('show', this.didShowNotification, true)
        }
        this.views.forEach(v => {
            message.to = {
                username: this.win.member.username,
                name: this.win.member.displayName,
                avatar: this.win.member.avatar
            }
            if(v.message) v.message(message)
        })
    }
    reconnect(protocol, flag){
        debug(0, 'reconnect->', protocol, flag)
        this.socket.emit('nickname', this.win.member.username, exists => {
            this.model.roster.push({
                username: this.win.member.username,
                name: this.win.member.displayName,
                avatar: this.win.member.avatar
            })
        })
    }
    reconnecting(someNumber, flag){
        this.reconnection.times = someNumber
        debug(0, 'reconnecting->', someNumber, flag)
    }
    error(){
        debug(0, 'error->', arguments)
    }
    left(msg){
        this.views.forEach(v => {
            if(v.left) v.left(msg.member)
        })
        if(msg.member.username == this.win.member.username){
            console.log("you've been disconnected from the server")
        }
    }
    handleEvent(e){
        if(this[e.type]) this[e.type](e)
    }
    resize(e){
        this.views.forEach(v => {
            if(v.resize) v.resize({h: e.target.document.documentElement.clientHeight, w: e.target.document.documentElement.clientWidth})
        })
    }
    blur(e){
        this.isActiveRightNow = false
    }
    focus(e){
        this.isActiveRightNow = true
    }
    messageWasDoubleClicked(e){
        this.views.forEach(v => {
            if(v.messageWasDoubleClicked){
                const fromId = e.target.parentNode.parentNode.getAttribute("data-from")
                const from = this.model.roster.find(u => {
                    return fromId === u.id
                })
                v.messageWasDoubleClicked({text: e.target.innerHTML, from: from})
            }
        })
    }
    messageWasDoubleClicked(e){
        this.views.forEach(v => {
            if(v.messageWasDoubleClicked){
                const fromId = e.target.parentNode.parentNode.getAttribute("data-from")
                const from = this.model.roster.find(u => {
                    return fromId === u.id
                })
                v.messageWasDoubleClicked({text: e.target.innerHTML, from: from})
            }
        })
    }
    requestNotificationPermission(){
        if(!('Notification' in this.win)){
            this.isNotificationsOn = false
            return this.isNotificationsOn
        }
        this.isNotificationsOn = this.win.Notification.permission == PERMISSIONS.GRANTED
        if(this.isNotificationsOn) return

        console.log('requesting notification permissions', this.isNotificationsOn, this.win.Notification.permission)
        this.win.Notification.requestPermission(p => {
            if(p == PERMISSIONS.GRANTED){
                this.isNotificationsOn = true
            }
        })
    }
}

export default Chat