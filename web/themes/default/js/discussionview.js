(function(n, win){
	n.DiscussionView = function(container, model, delegate){
		var self = {
			container: container
			, model: model
			, delegate: delegate
			, messageWasSubmitted: function(message){}
			, message: function(message){
				if(message && message.text && message.text.length > 0){
					if(this.delegate && this.delegate.messageWasReceived){
						this.delegate.messageWasReceived(message)
					}
					this.model.push(new n.Observable(new n.Message(message)))
				}
			}
		}
		var template = container.querySelector(".discussion li")
		var discussion = container.querySelector('.discussion')
		template.style.display = 'none'
		var lastTimeMessageWasSent = (new Date()).getTime()
		var hooks = []
		var imageUrlPattern = /https?:\/\/(?:[a-z\-]+\.)+[a-z]{2,6}(?:\/[^/#?]+)+\.(?:jpg|gif|png)/ig
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
		function hookForNewLines(message){
			message.text = message.text.replace(/\n/ig, '<br />')
			return message
		}
		function hookForShowingXml(message){
			message.text = message.text.replace(/</ig, '&lt').replace(/>/ig, '/&gt')
			return message
		}
		hooks.push({execute: hookForDataImage})
		hooks.push({execute: hookForLinks})
		hooks.push({execute: hookForImages})
		hooks.push({execute: hookGsearchResultClass})
		hooks.push({execute: hookGithubResponse})
		hooks.push({execute: hookListOfUsers})
		hooks.push({execute: hookForShowingXml})
		hooks.push({execute: hookForNewLines})
		function messageWasAdded(key, old, v){
			if(!v) return
			if(!v.from) return
			var originalHeight = discussion.scrollHeight
			var lastMessage = discussion.querySelector("[data-from='" + v.from.id + "']:first-child")
			var elem = template.cloneNode(true)
			elem.setAttribute('data-from', v.from.id)
			elem.addEventListener('dblclick', function(e){
				delegate.messageWasDoubleClicked(e)
			}, true)
			elem.style.display = 'block'
			hooks.forEach(hook => {
				v = hook.execute(v)
			})
			if(lastMessage === null){
				var first = discussion.querySelector('.discussion li:first-child')
				if(delegate.member.username == v.from.username){
					elem.className = 'self'
				}
				elem.querySelector('figcaption').innerHTML = v.from.displayName
				elem.querySelector('.text').innerHTML = v.text
				elem.querySelector('img').src = v.from.avatar
				var time = document.createElement('li')
				time.className = 'sent'
				time.innerHTML = `<time>${new Date(lastTimeMessageWasSent)}</time>`
				discussion.insertBefore(elem, first)
				discussion.insertBefore(time, first)
			}else{
				var messages = template.querySelector('.message').cloneNode(true)
				messages.querySelector('.text').innerHTML = v.text
				lastMessage.insertBefore(messages, lastMessage.querySelector('.message'))
			}
			lastTimeMessageWasSent = v.time
			n.NotificationCenter.publish(n.Events.CHAT_HEIGHT_HAS_CHANGED, self, discussion.scrollHeight - originalHeight)
		}
		function messageWasRemoved(key, old, v){
			var last = container.querySelector(".discussion:last-child")
			container.removeChild(last)
		}

		self.model.subscribe('push', messageWasAdded)
		self.model.subscribe('pop', messageWasRemoved)
		return self
	}
})(module.exports, global)