var Resource = require('../resource');
var nStore = require('nstore');
nStore = nStore.extend(require('nstore/query')());
var messagesPath = process.env.DATA_PATH + '/messages.db';
module.exports = function index(app){
	var self = new Resource();
	self.title = "Dev Chit Chat";
	function byDate(a, b){
		if(a.time === b.time) return 0;
		if(a.time > b.time) return -1;
		return 1;
	}
	app.get("/messages?.:format?", function(req, resp, next){
		if(!req.user) return next(401);
		var repo = nStore.new(messagesPath, function(){
			var today = new Date();
			today = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
			repo.find({"time >=": today.getTime()}, function(err, doc){
				var list = [];
				for(var key in doc){
					list.push(doc[key]);
				}
				list.sort(byDate);
				resp.represent('messages/index', self, list, next);
			});
		});
	});
	return self;
};