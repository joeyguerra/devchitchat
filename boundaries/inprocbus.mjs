import Queue from '../lib/queue.mjs'
import PersistentQueue from '../lib/persistentQueue.mjs'
import path from 'node:path'
import fs from 'node:fs'
import {v4 as uuid} from 'uuid'
import debug from 'debug'

debug('inprocbus')

import { fileURLToPath } from 'node:url'
const __dirname = fileURLToPath(import.meta.url)
const queuePath = `${__dirname}${path.sep}queues${path.sep}outgoing${path.sep}`
console.log('queuePath', queuePath)
const commands = new PersistentQueue(queuePath, new Queue({name: 'Commands'}))
const events = new PersistentQueue(queuePath, new Queue({name: 'Events'}))
const handlers = {}
const subscribers = {}

function loadFromDisk(){
	const files = fs.readdirSync(queuePath)
	files.forEach(directory => {
		fs.readdirSync(queuePath + directory + path.sep).forEach(file => {
			const text = fs.readFileSync(queuePath + directory + path.sep + file, {encoding: "utf-8"})
			try{
				const obj = JSON.parse(text)
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
	const event = events.dequeue()
	if(!event){
		return
	}
	if(!subscribers[event.header.name]){
		return
	}
	for(let i = 0; i < subscribers[event.header.name].length; i++){
		subscribers[event.header.name][i].update(event)
	}
}

function sendCommands(){
	const command = commands.dequeue()
	if(!command){
		return
	}
	if(handlers[command.header.name]){
		handlers[command.header.name].handle(command)
	}
}

process.on('inprocbus.hasStarted', loadFromDisk)

export default {
	send(command){
		command.header.uuid = uuid()
		commands.enqueue(command)
	},
	publish(event){
		event.header.uuid = uuid()
		events.enqueue(event)
	},
	iHandle(name, handler){
		if(handlers[name]){
			throw new Error(name + ' is already handled')
		}
		handlers[name] = handler
	},
	iSubscribeTo(name, publisher, subscriber){
		if(!subscribers[name]){
			subscribers[name] = []
		}
		subscribers[name].push(subscriber)
	},
	commandInterval: null,
	eventInterval: null,
	start(){
		process.emit('inprocbus.hasStarted', this)
		this.commandInterval = setInterval(sendCommands, 500)
		this.eventInterval = setInterval(sendEvents, 500)
	},
	stop(){
		clearInterval(this.commandInterval)
		clearInterval(this.eventInterval)
		process.emit('inprocbus.hasStopped', this)
	}
}
