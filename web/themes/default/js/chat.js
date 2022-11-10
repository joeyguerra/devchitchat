(function(n, win){
	function debug(level){
		console.log(arguments)
	}
	function getBase64Image(img) {
	    // Create an empty canvas element
	    var canvas = document.createElement("canvas")
	    canvas.width = img.width
	    canvas.height = img.height

	    // Copy the image contents to the canvas
	    var ctx = canvas.getContext("2d")
	    ctx.drawImage(img, 0, 0)

	    // Get the data-URL formatted image
	    // Firefox supports PNG and JPEG. You could check img.src to guess the
	    // original format, but be aware the using "image/jpg" will re-encode the image.
	    var dataURL = canvas.toDataURL("image/png")

	    return dataURL.replace(/^data:image\/(png|jpg)base64,/, "")
	}
	n.Events = {
		MESSAGE_WAS_SUBMITTED: 'MESSAGE_WAS_SUBMITTED',
		THIS_USER_HAS_SENT_A_MESSAGE: 'THIS_USER_HAS_SENT_A_MESSAGE',
		HAS_STARTED_TYPING: 'HAS_STARTED_TYPING',
		HAS_STOPPED_TYPING: 'HAS_STOPPED_TYPING',
		CHAT_HEIGHT_HAS_CHANGED: 'CHAT_HEIGHT_HAS_CHANGED'
	}

	n.Message = function(obj){
		this.text = ''
		this.to = null
		this.from = null
		this.time = null
		this.room = null
		for(var key in obj){
			this[key] = obj[key]
		}
	}
	n.Message.prototype = {
		sent: function(lastTimeSent){
  		  var date = new Date(this.time)
  		  if((this.time - lastTimeSent)/1000 > 60*1)
  		  return 'mm/dd/yyyy h:m t'.replace('mm', date.getMonth() + 1)
  		 	 .replace('dd', date.getDate() > 9 ? date.getDate() : '0' + date.getDate())
  			 .replace('yyyy', date.getFullYear())
  			 .replace('h', date.getHours() - 12 < 0 ? date.getHours() : date.getHours() - 12)
  			 .replace('m', date.getMinutes()> 9 ? date.getMinutes() : '0' + date.getMinutes())
  			 .replace('t', date.getHours() > 11 ? 'PM' : 'AM')
  		  return ""
		}
	}

	n.Member = function(obj){
		this.username = null
		this.avatar = null
		this.name = null
		this.displayName = null
	  for(var key in obj){
		  this[key] = obj[key]
	  }
	}

	var app = function(){
		var views = []
		var message = new n.Observable(new n.Message({text: null, to: {name: win.member.displayName, username: win.member ? win.member.username : null, avatar: win.member ? win.member.avatar : null}}))
		var messages = new n.Observable.List()
		var roster = new n.Observable.List()
		var reconnecting = new n.Observable({times: 0})
		var self = {ACTIVITY_LIMIT_IN_SECONDS: 20}
		var Permissions = {
			DEFAULT: 'default'
			, GRANTED: 'granted'
			, DENIED: 'denied'
		}
		var isNotificationsOn = false
		var reconnectingCounterView = document.createElement('div')
		reconnectingCounterView.className = 'reconnecting'
		document.body.appendChild(reconnectingCounterView)

		self.isActiveRightNow = true
		self.release = function(e){
			views.forEach(function(v){
				if(v.release){
					v.release()
				}
			})
			if(win.member){
				var room = window.location.href.split('/')[3]
				socket.emit('left', {member: win.member, room: ''})
				socket.removeAllListeners('connect')
				socket.removeAllListeners('nicknames')
				socket.removeAllListeners('message')
				socket.removeAllListeners('reconnect')
				socket.removeAllListeners('reconnecting')
				socket.removeAllListeners('error')
				socket.removeAllListeners('left')
			}
		}
		self.messageWasReceived = function(message){
			return message
		}
		self.messageWasSubmitted = function(model){
			if(!model.text){
				return
			}
			if(model.text.length === 0){
				return
			}
			views.forEach(function(v){
				if(v.messageWasSubmitted){
					v.messageWasSubmitted(model)
				}
			})
			socket.emit('message', model.text)
		}
		self.connected = function(nicknames){
			reconnecting.times = 0
			views.forEach(function(v){
				if(v.connected){
					v.connected(nicknames)
				}
			})
		}
		self.joined = function(member){
			views.forEach(function(v){
				if(v.joined){
					v.joined(member)
				}
			})
		}
		self.nicknames = function(nicknames){
			views.forEach(function(v){
				if(v.nicknames){
					v.nicknames(nicknames)
				}
			})
		}
		self.didShowNotification = function(e){
			setTimeout(function closeIt(){
				e.target.close()
				e.target.removeEventListener('show', this.didShowNotification)
			}, 5000)
		}

		self.message = function(message){
			if(isNotificationsOn &&
				message.from.username !== win.member.username &&
				!self.isActiveRightNow
			){
				var n = new Notification(message.from.displayName || message.from.name, {body: message.text, tag: "notifyUser", icon: message.from.avatar})
				n.addEventListener('show', self.didShowNotification.bind(self), true)
			}
			views.forEach(function(v){
				message.to = {username: win.member.username, name: win.member.displayName, avatar: win.member.avatar}
				if(v.message){
					v.message(message)
				}
			})
		}
		self.reconnect = function(protocol, flag){
			debug(0, 'reconnect->', arguments)
		    socket.emit('nickname', win.member.username, function(exists){
		    	roster.push({username: win.member.username, name: win.member.displayName, avatar: win.member.avatar})
		    })
		}
		self.reconnecting = function(someNumber, flag){
			reconnecting.times = someNumber
			debug(0, 'reconnecting->', someNumber, flag)
		}
		self.error = function(){
			debug(0, 'error->', arguments)
		}
		self.left = function(msg){
			views.forEach(function(v){
				if(v.left) v.left(msg.member)
			})
			if(member === win.member.username){
				console.log("you've been disconnected from the server")
			}
		}
		self.handleEvent = function(e){
			if(self[e.type]) self[e.type](e)
		}
		self.resize = function(e){
			views.forEach(function(v){
				if(v.resize) v.resize({h: e.target.document.documentElement.clientHeight, w: e.target.document.documentElement.clientWidth})
			})
		}
		self.blur = function blur(e){
			this.isActiveRightNow = false
		}
		self.focus = function focus(e){
			this.isActiveRightNow = true
		}
		self.messageWasDoubleClicked = function messageWasDoubleClicked(e){
			views.forEach(function(v){
				if(v.messageWasDoubleClicked){
					var fromId = e.target.parentNode.parentNode.getAttribute("data-from")
					var from = roster.find(function(i, u){
						return fromId === u.id
					})
					v.messageWasDoubleClicked({text: e.target.innerHTML, from: from})
				}
			})

		}
		self.requestNotificationPermission = function(){
			if(!('Notification' in window)){
				isNotificationsOn = false
				return isNotificationsOn
			}
			isNotificationsOn = Notification.permission === Permissions.GRANTED
			if(Notification.permission !== Permissions.DENIED && !isNotificationsOn){
				Notification.requestPermission(function(p){
					if(p === Permissions.GRANTED){
						isNotificationsOn = true
					}
				})
			}
		}
		self.member = win.member
		self.activityTimestamp = new Date()
		self.requestNotificationPermission()
		var socket = null
		if(win.member){
			socket = io.connect('', {query: 'username=' + win.member.username})
			socket.on('connected', self.connected)
			socket.on('left', self.left)
			socket.on('joined', self.joined)
			socket.on('nicknames', self.nicknames)
			socket.on('message', self.message)
			socket.on('reconnect', self.reconnect)
			socket.on('reconnecting', self.reconnecting)
			socket.on('error', self.error)
			var messageView = null, discussionView = null
			views.push(discussionView = n.DiscussionView(document.getElementById('messagesView'), messages, self))
			views.push(n.RosterView(document.getElementById('rosterView'), roster, self))
			views.push(messageView = n.MessageView(document.getElementById("comment"), message, self))
			views.push(n.ReconnectingCounterView(reconnectingCounterView, reconnecting, self))
			var firstChild = discussionView.container.querySelector(".discussion li:first-child")
			var template = firstChild.cloneNode(true)
			template.style.display = 'none'
			template.className = 'self preview'
			var compiled = Hogan.compile(template.innerHTML)
			var html = compiled.render({from: win.member})
			template.innerHTML = html + '<small>Not sent yet.</small>'
			var avatar = template.querySelector('img')
			avatar.src = win.member.avatar
			firstChild.parentNode.appendChild(template)
			views.push(n.PreviewView(template, message, self))

			messageView.resize({h: window.document.documentElement.clientHeight, w: window.document.documentElement.clientWidth})
			win.addEventListener('resize', self, true)

		    socket.emit('nickname', win.member.username, function(exists){
				roster.push({username: win.member.username, name: win.member.displayName, avatar: win.member.avatar})
		    })

			socket.emit('send previous messages', 'hello?', function(list){
				if(!list) return
				list.forEach(function(m){
					messages.push(new n.Message(m))
				})
			})

			n.NotificationCenter.subscribe(n.Events.THIS_USER_HAS_SENT_A_MESSAGE, {THIS_USER_HAS_SENT_A_MESSAGE: function(publisher, info){
				self.activityTimestamp = new Date()
			}}, messageView)

			n.NotificationCenter.subscribe(n.Events.CHAT_HEIGHT_HAS_CHANGED, {CHAT_HEIGHT_HAS_CHANGED: function(publisher, messageHeight) {
				if (window.scrollY <= 0)
					return
				window.scrollTo(window.scrollX, window.scrollY + messageHeight)
			}}, discussionView)
		}
		win.addEventListener('blur', self.blur.bind(self), true)
		win.addEventListener('focus', self.focus.bind(self), true)
		win.addEventListener('unload', self.release, true)
		self.model = {
			messages: messages
		}
		self.views = views
		self.getBase64Image = getBase64Image
		return self
	}()
	win.app = app
})(module.exports, global)
