import NotificationCenter from '../../../../lib/NotificationCenter.mjs'
import {Events} from '../../../../lib/Models.mjs'

export default class MessageView {
    constructor(container, model, delegate){
        this.container = container
        this.model = model
        this.delegate = delegate
        this.typingTimestamp = new Date()
        this.typingTimer = null
        this.defaultStyle = {
            position: this.container.style.position,
            top: this.container.style.top
        }
        this.interval = null
        this.field = this.container.querySelector("[name='message']")
        this.form = this.container.querySelector('form')
        this.offset = {top: this.container.offsetTop}

        this.delegate.win.addEventListener('scroll', this.scrolling.bind(this), true)
        this.button = this.form.querySelector('button')

        Object.defineProperty(this, 'top', {
            get(){
                return parseInt(this.field.style.top.replace('px', ''), 10)
            }
            , set(v){ 
                this.field.style.top = `${v}px`
            }
            , enumerable: true
        })

        this.field.addEventListener('keyup', this, true)
        this.form.addEventListener('submit', this, true)
        this.form.addEventListener('paste', this, true)
        this.field.focus()
    }
    resize(viewportSize){
        //this.top = viewportSize.h - 40
    }
    startTimer(){
        NotificationCenter.publish(Events.HAS_STARTED_TYPING, this, null);
        this.interval = setInterval(function(){
            if(this.field.value.length === 0){
                this.typingTimer = null;
                NotificationCenter.publish(Events.HAS_STOPPED_TYPING, this, null)
                clearInterval(this.interval)
            }
        }.bind(this), 3000)
        return new Date()
    }
    stopTimer(){
        this.typingTimer = null
        clearInterval(this.interval)
        NotificationCenter.publish(Events.HAS_STOPPED_TYPING, this, null);
    }
    sendMessage(){
        if(this.model.text.trim().length == 0) return
        this.model.from = this.model.to
        this.model.time = Date.now()
        this.model.text = this.field.value
        if(/^\[.*\]/.test(this.model.text)){
            this.model.text = this.model.text.replace(/] /, "]\n")
        }
        this.delegate.messageWasSubmitted(this.model)
        NotificationCenter.publish(Events.THIS_USER_HAS_SENT_A_MESSAGE, this, this.model)
        if(this.typingTimer ) this.stopTimer()
        this.typingTimestamp = new Date()
        this.model.text = ''
        this.field.value = ''
    }
    handleEvent(e){
        if(this[e.type]) this[e.type](e)
    }
    paste(e){
        if(!e.clipboardData.items) return
        if(e.clipboardData.items.length == 0) return
        if(e.clipboardData.items[0].type.indexOf('image/') === -1) return
        e.preventDefault()
        const file = e.clipboardData.items[0].getAsFile()
        const reader = new FileReader()
        reader.onload = function(evt) {
            this.model.text = evt.target.result
            this.sendMessage()
        }.bind(this)
        reader.readAsDataURL(file)
    }
    submit(e){
        e.preventDefault()
        this.sendMessage()
    }
    keyup(e){
        this.typingTimestamp = new Date()
        if(!this.typingTimer) this.typingTimer = this.startTimer()
        if(e.keyCode == 13) this.button.click()
        this.model.text = this.field.value
    }
    release(){
        this.field.removeEventListener('keyup', this)
        this.form.removeEventListener('submit', this)
    }
    scrolling(e){
        if(this.delegate.win.scrollY > 0){
            if(this.container.style.position != 'fixed'){
                this.container.style.position = 'fixed'
                this.container.style.top = '0'
            }
        }else if(this.container.style.position != this.defaultStyle.position){
            this.container.style.position = this.defaultStyle.position
            this.container.style.top = this.defaultStyle.top
        }
    }
    messageWasDoubleClicked(message){
        message.text = message.text.replace('<br>', ' ')
        this.field.value = `[${message.text} from ${message.from.displayName}] `
        this.field.focus()
    }
}