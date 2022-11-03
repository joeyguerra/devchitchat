var test = require("tap").test;
var Net = require('net');
var debug = require('debug')('tests');
var Queue = require('../lib/queue');

test("enqueue and dequeue", function (t) {
	var commandQueue = new Queue('commands');
	commandQueue.enqueue({id: 1});
	var command = commandQueue.dequeue();
	t.ok(command.id === 1, '1 message in queue');
	t.end();
});

test("observe enqueued", function (t) {
	var commandQueue = new Queue('commands');
	var counter = 0;
	commandQueue.observe(Queue.Events.ENQUEUED, function(key, old, v){
		counter++;
		if(counter === 3){
			t.ok(v.id === counter, "done with all");
			t.end();
		}
	})
	commandQueue.enqueue({id: 1});
	t.ok(commandQueue.front().id === 1, 'checking front');
	commandQueue.enqueue({id: 2});
	commandQueue.enqueue({id: 3});
});
