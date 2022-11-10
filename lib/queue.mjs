import {ObservableArray} from './observable.mjs'
import {EventEmitter} from 'events'

class Queue extends ObservableArray {
	constructor(name){
		super()
		this.name = name
		this.emitter = new EventEmitter()
	}
	release(){
		this.observable.release()
	}
	enqueue(item){
		this.push(item)
	}
	dequeue(){
		return this.shift()
	}
	subscribe(eventName, subscriber){
		this.emitter.on(eventName, subscriber)
	}
	publish(eventName, info){
		this.emitter.emit(eventName, info)
	}
	front(){
		if(this.length === 0){
			return null
		}
		return this[0]
	}

}
Queue.Events = {
	ENQUEUED: 'push',
	DEQUEUED: 'shift'
}
export default Queue
