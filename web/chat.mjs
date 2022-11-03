import signer from 'jws'
import Commands from '../app/commands/index.mjs'
import Events from '../app/events/index.mjs'
import Member from '../app/entities/member.mjs'
import debug from 'debug'
import {Server} from 'socket.io'
import {v4 as uuid} from 'uuid'

class SocketMessage{
	constructor(obj, occurred = Date.now()){
		this.text = obj?.text
		this.time = occurred
		this.from = obj?.from
		this.room = obj?.room
		this.to = obj?.to
		this.socketId = obj?.socketId
		this.id = obj?.id ?? uuid()
	}
}


var hooks = []
var roster = {}
debug('chat')
export default (web) => {
	if(!web.bus){
		throw new Error('Bus is required')
	}
	if(!web.server){
		throw new Error('Server is required')
	}
	if(!web.cookieParser){
		throw new Error('CookieParser is required')
	}
	if(!web.cookieSession){
		throw new Error('CookeSession is required')
	}
	if(!web.Persistence){
		throw new Error('Persistence is required')
	}
	if(!web.config){
		throw new Error('Config is required')
	}
	if(!web.Passport){
		throw new Error("Passport is required")
	}
	var io = new Server(web.server)
	var cookieParserFunction = web.cookieParser()
	var cookieSessionFunction = web.cookieSession({ keys: [web.config.COOKIE_KEY, ':blah:'], secret: web.config.COOKIE_SECRET})
	var Persistence = web.Persistence
	var bus = web.bus

	function getRoomFromReferrer(socket){
		if(socket.request._query.room){
			return socket.request._query.room
		}
		if(socket.handshake.headers.referer){
			return socket.handshake.headers.referer.split('/').pop()
		}
		return null
	}

	bus.iHandle('SendNewChatMessage', {
		handle: function(command){
			command.header.endpoint = {
				port: web.config.endpoint.split(':').pop(),
				host: web.config.endpoint.split(':').shift()
			}
			Persistence.member.findOne({username: command.body.from.username}, async function(err, doc){
				if(err){
					console.log(err)
				}
				if(doc){
					command.body.from.avatar = doc.avatar
					command.body.from.username = doc.username
					command.body.from.name = doc.name
				}
				hooks.forEach(function(hook){
					hook.execute(m)
				})

				io.to(command.body.room).emit('message', command.body)
				if(command.body.text?.indexOf('allthethings') > -1){
					for await(let entry of Persistence.allTheThings()){
						var message = new SocketMessage({
							text: JSON.stringify(entry, null, 2),
							from: command.body.from,
							room: command.body.room,
						}, Date.now())
						io.to(command.body.room).emit('message', message)
					}
				}
				let event = new Events.NewChatMessageWasSent(command.body)
				event.header.endpoint = command.header.endpoint
				bus.publish(event)
			})
	    }
	})
	bus.iHandle('SendNicknames', {
		handle: function handle(command){
			io.sockets.to(command.body.room).emit('nicknames', command.body.nicknames)
		}
	})

	bus.iSubscribeTo('NewChatMessageWasSent', null, {
		update: function update(event){
			Persistence.message.save(event.body, function(err, doc){
				if(err){
					console.log('error occurred persisting message', err, doc)
				}
			})
		}
	})

	bus.iSubscribeTo('UserHasLeft', null, {
		update: function update(event){
			delete roster[event.body.room][event.body.id]
			io.sockets.to(event.body.room).emit('left', event.body)
		}
	})

	io.use(function(socket, next){
		cookieParserFunction(socket.request, socket.request.res, function(){
			cookieSessionFunction(socket.request, socket.request.res, function(){
				var user = socket.request.session.passport ? socket.request.session.passport.user : null
				if(!socket.request.session.passport && socket.request._query.token === 'hubot code'){
					console.log("authing hubot")
					user = socket.request._query.token
				}
				var decodedSignature = signer.decode(user)
				if(!decodedSignature){
					console.log(user, "Unauthed from io connection")
					return next(401)
				}
				Persistence.member.findOne({token: decodedSignature.payload}, function(err, doc){
					if(doc){
						var room = getRoomFromReferrer(socket)
						if(!roster[room]){
							roster[room] = {}
						}
						roster[room][socket.id] = new Member(doc)
						next()
					}else{
						next(401)
					}
				})
			})
		})
	})
	function Client(socket, room, roster, delegate){
		this.socket = socket
		this.room = room
		this.roster = roster
		this.delegate = delegate
		this.socket.on('message', this.onMessage.bind(this))
		this.socket.on('send previous messages', this.onSendPreviousMessages.bind(this))
		this.socket.on('nickname', this.onNickname.bind(this))
		this.socket.on('left', this.onLeft.bind(this))
		this.socket.on('disconnect', this.onDisconnect.bind(this))
		this.socket.on('join', this.onJoin.bind(this))
	}
	Client.prototype = {
		onError: function onError(err){
			console.log(err)
		},
		onMessage: function onMessage(text){
			var message = new SocketMessage({
				text: text,
				from: this.roster[this.socket.id] || Member.unknown,
				room: this.room,
				to: null,
				socketId: this.socket.id,
				id: uuid()
			}, Date.now())
			this.delegate.send(new Commands.SendNewChatMessage(message))
		},
		onSendPreviousMessages: function onSendPreviousMessages(message, callback){
			Persistence.message.findPrevious24Hours(this.room, function(err, doc){
				if(err){
					console.log("error sending today messages", err)
				}
				return callback(doc)
			})
		},
		onNickname: function onNickname(nick, callback){
			this.socket.to(this.room).emit('joined', this.roster[this.socket.id])
			this.delegate.send(new Commands.SendNicknames({room: this.room, nicknames: this.roster}))
			return callback(true)
		},
		onJoin: function onJoin(room, callback){
			this.room = room
			callback(true)
		},
		onLeft: function onLeft(message){
			debug('disconnected', message)
			this.delegate.publish(new Events.UserHasLeft({room: this.room, member: message.member, id: this.socket.id}))
		},
		onDisconnect: function onDisconnect(){
			debug('disconnecting', arguments)
			this.delegate.publish(new Events.UserHasLeft({room: this.room, member: this.roster[this.socket.id], id: this.socket.id}))
			this.delegate.send(new Commands.SendNicknames({room: this.room, nicknames: this.roster}))
		},
		connect: function connect(message){
			if(message){
				this.socket.emit('message', message)
			}
			this.socket.emit('connected', this.roster)
			this.delegate.publish(new Events.UserHasConnected({room: this.room, member: this.roster[this.socket.id]}))
		},
		join: function join(room){
			this.socket.join(room)
		}
	}

	io.on('connection', function (socket) {
		var room = getRoomFromReferrer(socket)
		var client = new Client(socket, room, roster[room], bus)
		client.connect()
		client.join(room)
		debug('connecting', socket.request._query.username)
	})
	return io
}
