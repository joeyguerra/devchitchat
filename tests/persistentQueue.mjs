var test = require("tap").test;
var debug = require('debug')('tests');
var Fs = require('fs');
var Path = require('path');
var EventEmitter = require('events').EventEmitter;
var Queue = require('../lib/queue');
var PersistentQueue = require('../lib/persistentQueue');
var Message = require('../boundaries/message');

test("Given I enqueued something\n when I look in the folder\n then I see a file in there", function (t) {
	var path = __dirname + Path.sep + 'queues' + Path.sep + 'incoming';
	var commandQueue = new PersistentQueue(path, new Queue('commands'));
	commandQueue.clear();
	commandQueue.enqueue(new Message({name: "Name should be this"}, {queueName: 'test::persistent::enqueue'}));
	var files = Fs.readdirSync(commandQueue.folder);
	t.ok(files.length === 1, "Persist enqueued item to disk");
	commandQueue.clear();
	t.end();
});

test("Given I enqueue something\n when I dequeue it\n then I don't see a file in the incoming folder", function(t){
	var path = __dirname + Path.sep + 'queues' + Path.sep + 'incoming';
	var commandQueue = new PersistentQueue(path, new Queue('commands'));
	commandQueue.clear();
	commandQueue.enqueue(new Message({name: "Name should be this"}, {queueName: 'test::persistent::dequeue'}));
	var command = commandQueue.dequeue();
	t.ok(command.body.name === "Name should be this", "Dequeued item should be what was enqueued");
	commandQueue.clear();
	t.end();
});
