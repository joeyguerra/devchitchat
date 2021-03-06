var debug = require('debug')('tests');
var Queue = require('../lib/queue');
var Fs = require('fs');
var Util = require('util');
var Path = require('path');
var EventEmitter = require('events').EventEmitter;
function PersistentQueue(folder, queue){
	this.folder = folder;
	var filePath = '';
	var limit = 10;
	var counter = 0;
	var parts = this.folder.split(Path.sep);
	var ubounds = parts.length;
	for(var i = 0; i < ubounds; i++){
		if(counter > limit){
			throw new Error('Folder depth is too deep. limit is set to ' + limit);
			break;
		}
		filePath += parts[i] + Path.sep;
		if(!Fs.existsSync(filePath)){
			Fs.mkdirSync(filePath);
		}
		counter++;
	}

	this.queue = queue;
	this.name = this.queue.name;
	function enqueued(key, old, v){
		if(!v){
			return;
		}
		Fs.writeFileSync(this.folder + Path.sep + v.header.id + '.json', JSON.stringify(key, old, v));
	}
	function dequeued(key, old, v){
		if(!old){
			return;
		}
		Fs.unlink(this.folder + Path.sep + old.header.id + '.json', function(err){
			if(err){
				debug(err);
			}
		});
	}
	this.queue.observe(Queue.Events.ENQUEUED, enqueued.bind(this));
	this.queue.observe(Queue.Events.DEQUEUED, dequeued.bind(this));
}
//PersistentQueue.prototype = Object.create(Array.prototype);

PersistentQueue.prototype.on = function on(name, subscriber){
	this.queue.subscribe(name, subscriber);
};
PersistentQueue.prototype.enqueue = function enqueue(message){
	this.queue.enqueue(message);
};
PersistentQueue.prototype.dequeue = function dequeue(){
	var message = this.queue.dequeue();
	return message;
};
PersistentQueue.prototype.clear = function clear(){
	Fs.readdir(this.folder, function(err, files){
		if(err){
			debug(err);
			return this.queue.publish('error', err);
		}
		files.forEach(function(file){
			Fs.unlink(this.folder + Path.sep + file, function(err){
				if(err){
					//debug(err);
				}
			}.bind(this));
		}.bind(this));
	}.bind(this));
};
PersistentQueue.prototype.find = function find(message){
	return this.queue.filter(function(item){
		return item.header.id === message.header.id;
	});
};
PersistentQueue.prototype.front = function front(){
	if(this.queue.length === 0){
		return null;
	}
	return this.queue[0].body;
};
module.exports = PersistentQueue;
