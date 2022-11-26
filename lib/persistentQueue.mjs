import Queue from './queue.mjs'
import fs from 'node:fs'
import path from 'node:path'
import debug from 'debug'

debug('tests')

class PersistentQueue{
	constructor(folder, queue){
		this.folder = folder
		const filePath = ''
		const limit = 10
		const counter = 0
		const parts = this.folder.split(path.sep)
		const ubounds = parts.length
		for(var i = 0; i < ubounds; i++){
			if(counter > limit){
				throw new Error('Folder depth is too deep. limit is set to ' + limit)
			}
			filePath += parts[i] + path.sep
			if(!fs.existsSync(filePath)){
				fs.mkdirSync(filePath)
			}
			counter++
		}

		this.queue = queue
		this.name = this.queue.name
		this.queue.observe(Queue.Events.ENQUEUED, this.enqueued.bind(this))
		this.queue.observe(Queue.Events.DEQUEUED, this.dequeued.bind(this))	
	}
	enqueued(key, old, v){
		if(!v){
			return
		}
		Fs.writeFileSync(this.folder + Path.sep + v.header.id + '.json', JSON.stringify(key, old, v))
	}
	dequeued(key, old, v){
		if(!old){
			return
		}
		Fs.unlink(this.folder + Path.sep + old.header.id + '.json', function(err){
			if(err){
				debug(err)
			}
		})
	}
	on(name, subscriber){
		this.queue.subscribe(name, subscriber)
	}
	enqueue(message){
		this.queue.enqueue(message)
	}
	dequeue(){
		var message = this.queue.dequeue()
		return message
	}
	clear(){
		fs.readdir(this.folder, function(err, files){
			if(err){
				debug(err)
				return this.queue.publish('error', err)
			}
			files.forEach(function(file){
				Fs.unlink(this.folder + Path.sep + file, function(err){
					if(err){
						//debug(err)
					}
				}.bind(this))
			}.bind(this))
		}.bind(this))
	}
	find(message){
		return this.queue.filter(function(item){
			return item.header.id === message.header.id
		})
	}
	front(){
		if(this.queue.length === 0){
			return null
		}
		return this.queue[0].body
	}
}

export default PersistentQueue
