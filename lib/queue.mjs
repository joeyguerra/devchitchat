import Observable from './observable.mjs'
import {EventEmitter} from 'events'

function Queue(name){
	this.name = name
	this.emitter = new EventEmitter()
	this.observable = Observable()
	this.innerList = []
	Object.defineProperty(this, 'length', {
		get: function(){
			return this.innerList.length
		}.bind(this),
		enumerable: true
	})
}
Queue.prototype = {
	push: function push(item){
		this.innerList.push(item)
		this.observable.changed('push', null, item)
	},
	shift: function(){
		var item = this.innerList.shift()
		this.observable.changed('shift', item, null)
		return item
	},
	observe: function observe(key, observer){
		this.observable.observe(key, observer)
	},
	stopObserving: function stopObserving(observer){
		this.observable.stopObserving(observer)
	},
	release: function release(){
		this.observable.release()
	},
	enqueue: function enqueue(item){
		this.push(item)
		this.observable.changed(Queue.Events.ENQUEUED, null, item)
	},
	dequeue: function dequeue(){
		var item = this.shift()
		this.observable.changed(Queue.Events.DEQUEUED, item, null)
		return item
	},
	subscribe: function subscribe(eventName, subscriber){
		this.emitter.on(eventName, subscriber)
	},
	publish: function publish(eventName, info){
		this.emitter.emit(eventName, info)
	},
	front: function front(){
		if(this.innerList.length === 0){
			return null
		}
		return this.innerList[0]
	}
}
Queue.Events = {
	ENQUEUED: 'ENQUEUED',
	DEQUEUED: 'DEQUEUED'
}
export default Queue
