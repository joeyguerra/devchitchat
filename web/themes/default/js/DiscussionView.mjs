import { makeKeyValueObservable } from "../../../../lib/Observable.mjs"
import {Events} from '../../../../lib/Models.mjs'
import NotificationCenter from '../../../../lib/NotificationCenter.mjs'

const imageUrlPattern = /https?:\/\/(?:[a-z\-]+\.)+[a-z]{2,6}(?:\/[^/#?]+)+\.(?:jpg|gif|png)/ig

function hookForImages(message){
    if(message.isHtml){
        return message
    }
    message.text = message.text.replace(imageUrlPattern, '<img class="external" src="$&" />')
    return message
}
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
function includeHttp(url){
    if(url.indexOf('http') > -1){
        return url
    }
    return 'http://' + url
}
function hookForLinks(message){
    if(imageUrlPattern.test(message.text)){
        return message
    }
    const pattern = /((http|https|ftp|ftps)\:\/\/[a-zA-Z0-9\-\.]+\.[a-zA-Z]{2,3}(\/\S*)?)/g
    const matches = pattern.exec(message.text)

    // message.text = URI.withinString(message.text, function(url){
    // 	return '<a href="' + includeHttp(url) + '" target="_blank">' + url + '</a>'
    // })
    return message
}
function hookForDataImage(message){
    message.text = message.text.replace(/^data\:image(.*)/, '<img class="external" src="$&" />')
    return message
}

function hookForShowingXml(message){
    message.text = message.text.replace(/</ig, '&lt').replace(/>/ig, '/&gt')
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
            hookForLinks,
            hookForImages,
            hookGsearchResultClass,
            hookGithubResponse,
            hookListOfUsers,
            hookForShowingXml,
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
        var originalHeight = this.discussion.scrollHeight
        var lastMessage = this.discussion.querySelector(`[data-from='${v.from.id}']:first-child`)
        var elem = this.template.cloneNode(true)
        elem.setAttribute('data-from', v.from.id)
        elem.addEventListener('dblclick', this.delegate.messageWasDoubleClicked.bind(this.delegate), true)
        elem.style.display = 'block'
        this.hooks.forEach(hook => {
            v = hook(v)
        })
        if(!lastMessage){
            var first = this.discussion.querySelector('.discussion li:first-child')
            if(this.delegate.win.member.username == v.from.username){
                elem.className = 'self'
            }
            elem.querySelector('figcaption').innerHTML = v.from.displayName
            elem.querySelector('.text').innerHTML = v.text
            elem.querySelector('img').src = v.from.avatar
            var time = this.delegate.win.document.createElement('li')
            time.className = 'sent'
            time.innerHTML = `<time>${(new Date(this.lastTimeMessageWasSent)).toISOString()}</time>`
            this.discussion.insertBefore(elem, first)
            this.discussion.insertBefore(time, first)
        }else{
            var messages = this.template.querySelector('.message').cloneNode(true)
            messages.querySelector('.text').innerHTML = v.text
            lastMessage.insertBefore(messages, lastMessage.querySelector('.message'))
        }
        this.lastTimeMessageWasSent = v.time
        NotificationCenter.publish(Events.CHAT_HEIGHT_HAS_CHANGED, this, this.discussion.scrollHeight - originalHeight)
    }
    messageWasRemoved(key, old, v){
        var last = this.container.querySelector(".discussion:last-child")
        this.container.removeChild(last)
    }
}

export default DiscussionView