import signer from 'jws'
import Commands from '../app/commands/index.mjs'
import Events from '../app/events/index.mjs'
import Member from '../app/entities/Member.mjs'
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

	function getEndpoint(){
		return {
			port: web.config.endpoint.split(':').pop(),
			host: web.config.endpoint.split(':').shift()
		}
	}
	bus.iHandle('SendNewChatMessage', {
		async handle(command){
			command.header.endpoint = getEndpoint()
			hooks.forEach(hook => {
				hook.execute(command.body)
			})

			io.to(command.body.room).emit('message', command.body)

			// Just for dev, to see what's in the db.
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
		}
	})
	bus.iHandle('SendNicknames', {
		async handle(command){
			io.sockets.to(command.body.room).emit('nicknames', command.body.nicknames)
		}
	})

	bus.iSubscribeTo('NewChatMessageWasSent', null, {
		async update(event){
			await Persistence.message.save(event.body, (err, doc)=>{
				if(err){
					console.log('error occurred persisting message', err, doc)
				}
			})
		}
	})

	bus.iSubscribeTo('UserHasLeft', null, {
		async update(event){
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
		onError(err){
			console.log(err)
		},
		onMessage(text){
			const message = new SocketMessage({
				text: text,
				from: this.roster[this.socket.id] || Member.unknown,
				room: this.room,
				to: null,
				socketId: this.socket.id,
				id: uuid()
			}, Date.now())
			const command = new Commands.SendNewChatMessage(message)
			command.header.endpoint = getEndpoint()
			this.delegate.send(command)
		},
		onSendPreviousMessages(message, callback){
			Persistence.message.findPrevious24Hours(this.room, function(err, doc){
				if(err){
					console.log("error sending today messages", err)
				}
				return callback(doc)
			})
		},
		onNickname(nick, callback){
			this.socket.to(this.room).emit('joined', this.roster[this.socket.id])
			const command = new Commands.SendNicknames({room: this.room, nicknames: this.roster})
			command.header.endpoint = getEndpoint()
			this.delegate.send(command)
			return callback(true)
		},
		onJoin(room, callback){
			this.room = room
			callback(true)
		},
		onLeft(message){
			debug('disconnected', message)
			const event = new Events.UserHasLeft({room: this.room, member: message.member, id: this.socket.id})
			event.header.endpoint = getEndpoint()
			this.delegate.publish(event)
		},
		onDisconnect(){
			debug('disconnecting', arguments)
			const event = new Events.UserHasLeft({room: this.room, member: this.roster[this.socket.id], id: this.socket.id})
			event.header.endpoint = getEndpoint()
			this.delegate.publish(event)
			const command = new Commands.SendNicknames({room: this.room, nicknames: this.roster})
			command.header.endpoint = getEndpoint()
			this.delegate.send(command)
		},
		connect(message){
			if(message){
				this.socket.emit('message', message)
			}
			this.socket.emit('connected', this.roster)
			const event = new Events.UserHasConnected({room: this.room, member: this.roster[this.socket.id]})
			event.header.endpoint = getEndpoint()
			this.delegate.publish(event)
		},
		join(room){
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
