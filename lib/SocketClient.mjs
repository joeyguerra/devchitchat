import {randomUUID} from 'node:crypto'

class SocketMessage{
	constructor(obj, occurred = Date.now()){
		this.text = obj?.text
		this.time = occurred
		this.from = obj?.from
		this.room = obj?.room
		this.to = obj?.to
		this.socketId = obj?.socketId
		this.id = obj?.id ?? randomUUID()
	}
}

class SocketClient {
	constructor(io, socket, room, roster, db){
		this.io = io
		this.db = db
		this.socket = socket
		this.room = room
		this.roster = roster
		this.socket.on('message', this.onMessage.bind(this))
		this.socket.on('send previous messages', this.onSendPreviousMessages.bind(this))
		this.socket.on('nickname', this.onNickname.bind(this))
		this.socket.on('left', this.onLeft.bind(this))
		this.socket.on('disconnect', this.onDisconnect.bind(this))
		this.socket.on('join', this.onJoin.bind(this))
	}
	onError(err){
		console.log(err)
	}
	async onMessage(text){
		const message = new SocketMessage({
			text: text,
			from: this.roster[this.socket.id] || Member.unknown,
			room: this.room,
			to: null,
			socketId: this.socket.id,
			id: randomUUID()
		}, Date.now())
		this.io.to(message.room).emit('message', message)
		await this.db.message.save(message, (err, doc)=>{
			if(err){
				console.log('error occurred persisting message', err, doc)
			}
		})
	}
	onSendPreviousMessages(message, callback){
		this.db.message.findPrevious24Hours(this.room, function(err, doc){
			if(err){
				console.log("error sending today messages", err)
			}
			return callback(doc)
		})
	}
	onNickname(nick, callback){
		this.socket.to(this.room).emit('joined', this.roster[this.socket.id])
		this.io.sockets.to(this.room).emit('nicknames', this.roster)
		return callback(true)
	}
	onJoin(room, callback){
		this.room = room
		callback(true)
	}
	onLeft(message){
		delete this.roster[message.id]
		this.io.sockets.to(message.room).emit('left', message)
	}
	onDisconnect(){
		this.onLeft({room: this.room, member: this.roster[this.socket.id], id: this.socket.id})
		this.io.sockets.to(this.room).emit('nicknames', this.roster)
	}
	connect(message){
		if(message){
			this.socket.emit('message', message)
		}
		this.socket.emit('connected', this.roster)
	}
	join(room){
		this.socket.join(room)
	}
}

export default SocketClient