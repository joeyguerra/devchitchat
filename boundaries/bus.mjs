import EventEmitter from 'events'
import {v4 as uuid} from 'uuid'
var emitter = new EventEmitter()
var handlers = {}
export default {
	send: function(command){
		command.header.uuid = uuid()
    	emitter.emit(command.header.name, command)
	},
	publish: function(event){
		event.header.uuid = uuid()
    	emitter.emit(event.header.name, event)
	},
	iHandle: function(name, handler){
		if(handlers[name]){
			throw new Error(name + ' is already handled')
		}
		handlers[name] = handler
    	emitter.on(name, handler.handle.bind(handler))
	},
	iSubscribeTo: function(name, publisher, subscriber){
    	emitter.on(name, subscriber.update.bind(subscriber))
	},
	start: function(){
	},
	stop: function(){
	}
}
