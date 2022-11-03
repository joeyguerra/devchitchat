import Queue from '../lib/queue'
import PersistentQueue from '../lib/persistentQueue'
import path from 'path'
import fs from 'fs'
import {v4 as uuid} from 'uuid'
import debug from 'debug'

debug('inprocbus')

var queuePath = __dirname + path.sep + 'queues' + path.sep + 'outgoing' + path.sep
var commands = new PersistentQueue(queuePath, new Queue({name: 'Commands'}))
var events = new PersistentQueue(queuePath, new Queue({name: 'Events'}))
var handlers = {}
var subscribers = {}

function loadFromDisk(){
	var files = fs.readdirSync(queuePath)
	files.forEach(function(directory){
		fs.readdirSync(queuePath + directory + path.sep).forEach(function(file){
			var text = fs.readFileSync(queuePath + directory + path.sep + file, {encoding: "utf-8"})
			try{
				var obj = JSON.parse(text)
				if(obj.type === 'command'){
					commands.enqueue(obj)
				}else if(obj.type === 'events'){
					events.enqueue(obj)
				}
			}catch(e){
			}
		})
	})
}

function sendEvents(){
	var event = events.dequeue()
	if(!event){
		return
	}
	if(!subscribers[event.header.name]){
		return
	}
	for(var i = 0; i < subscribers[event.header.name].length; i++){
		subscribers[event.header.name][i].update(event)
	}
}

function sendCommands(){
	var command = commands.dequeue()
	if(!command){
		return
	}
	if(handlers[command.header.name]){
		handlers[command.header.name].handle(command)
	}
}

process.on('inprocbus.hasStarted', loadFromDisk)

export default {
	send: function(command){
		command.header.uuid = uuid()
		commands.enqueue(command)
	},
	publish: function(event){
		event.header.uuid = uuid()
		events.enqueue(event)
	},
	iHandle: function(name, handler){
		if(handlers[name]){
			throw new Error(name + ' is already handled')
		}
		handlers[name] = handler
	},
	iSubscribeTo: function(name, publisher, subscriber){
		if(!subscribers[name]){
			subscribers[name] = []
		}
		subscribers[name].push(subscriber)
	},
	commandInterval: null,
	eventInterval: null,
	start: function(){
		process.emit('inprocbus.hasStarted', this)
		this.commandInterval = setInterval(sendCommands, 500)
		this.eventInterval = setInterval(sendEvents, 500)
	},
	stop: function(){
		clearInterval(this.commandInterval)
		clearInterval(this.eventInterval)
		process.emit('inprocbus.hasStopped', this)
	}
}
