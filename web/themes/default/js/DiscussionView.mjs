import { makeKeyValueObservable } from "../../../../lib/Observable.mjs"
import {Events} from '../../../../lib/Models.mjs'
import NotificationCenter from '../../../../lib/NotificationCenter.mjs'

function hookGithubResponse(message){
    try{
        var users = JSON.parse(message.text)
        if(users.what === 'github list of users'){
            message.text = '<ul>'
            users.items.forEach(function(user){
                message.text += '<li><a href="' + user.html_url + '"><img class="img-circle avatar" src="' + window.location.origin + user.avatar_url + '" /></a></li>'
            })
            message.text += '</ul>'
        }
    }catch(e){
    }
    return message
}
function hookListOfUsers(message){
    try{
        var users = JSON.parse(message.text)
        if(users.what === 'list of users'){
            message.text = '<ul>'
            for(key in users){
                if(!users[key].avatar) continue
                message.text += '<li><img class="img-circle avatar" src="' + window.location.origin + users[key].avatar + '" /></a></li>'
            }
            message.text += '</ul>'
        }
    }catch(e){
    }
    return message
}
function hookGsearchResultClass(message){
    if(message.text.indexOf('GsearchResultClass') === -1) return message
    var result = JSON.parse(message.text)
    var searchResult = result.responseData.results
    message.text = ''
    searchResult.forEach(function(s){
        message.text += '<img src="{src}" width="200" />'.replace(/{src}/, s.unescapedUrl)
    })
    return message
}

function hookForDataImage(message){
    if(message.text.indexOf('data:image') > -1){
        message.text = `![](${message.text})`
    }
    return message
}

class DiscussionView {
    #md
    constructor(container, model, delegate){
        this.container = container
        this.model = model
        this.delegate = delegate
        this.template = this.container.querySelector('.discussion li')
        this.discussion = this.container.querySelector('.discussion')
        this.lastTimeMessageWasSent = (new Date()).getTime()
        this.#md = this.delegate.win.markdownit()
        this.hooks = [
            hookForDataImage,
            hookGsearchResultClass,
            hookGithubResponse,
            hookListOfUsers,
            message => {
                message.text = this.#md.render(message.text)
                return message
            }
        ]
		this.model.observe('push', this.messageWasAdded.bind(this))
		this.model.observe('pop', this.messageWasRemoved.bind(this))

    }
    messageWasSubmitted(message){

    }
    message(message){
        if(!message) return
        if(message.text.trim().length == 0) return
        if(this.delegate && this.delegate.messageWasReceived){
            this.delegate.messageWasReceived(message)
        }
        this.model.push(makeKeyValueObservable(message))
    }
    messageWasAdded(key, old, v){
        if(!v) return
        if(!v.from) return
        const originalHeight = this.discussion.scrollHeight
        const lastMessage = this.container.querySelector(`.discussion li[data-from]`)
        const fromId = lastMessage?.getAttribute('data-from')

        const elem = this.template.cloneNode(true)
        const messageElement = elem.querySelector('.message')
        messageElement.setAttribute('data-count', '0')

        elem.style.display = ''
        elem.setAttribute('data-from', v.from.id)
        elem.addEventListener('dblclick', this.delegate.messageWasDoubleClicked.bind(this.delegate), true)
        this.hooks.forEach(hook => {
            v = hook(v)
        })
        if(this.delegate.win.member.id == v.from.id){
            elem.className = 'self'
        }
        if(fromId == v.from.id){
            const firstOne = this.discussion.querySelector('[data-count="0"]')
            firstOne.setAttribute('data-count', '1')
            const messages = this.template.querySelector('.message').cloneNode(true)
            messages.setAttribute('data-count', '0')
            messages.querySelector('.text').innerHTML = v.text
            lastMessage.insertBefore(messages, lastMessage.querySelector('.message'))
        }else{
            const first = this.discussion.querySelector('.discussion li:first-child')
            elem.querySelector('.text').innerHTML = v.text
            elem.querySelector('img').src = v.from.avatar
            first.parentNode.insertBefore(elem, first.nextSibling)
        }
        this.lastTimeMessageWasSent = v.time
        NotificationCenter.publish(Events.CHAT_HEIGHT_HAS_CHANGED, this, this.discussion.scrollHeight - originalHeight)
    }
    messageWasRemoved(key, old, v){
        const last = this.container.querySelector(".discussion:last-child")
        this.container.removeChild(last)
    }
}

export default DiscussionView