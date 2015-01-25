var Express = require('express');
var App = Express();
var config = require('../config');
var bodyParser = require('body-parser');
var Path = require('path');
var Fs = require('fs');
var rootPath = __dirname.replace('web' + Path.sep, '');
var Util = require('util');
var Chilla = require('chilla').Chilla({
	themeRoot: rootPath + ['', 'themes', 'default'].join(Path.sep),
	appPath: rootPath
});
var BodyParser = require('body-parser');
var StaticServer = require('serve-static');
var Compression = require('compression');
var Multer = require('multer');
var MethodOverride = require('method-override');
var CookieParser = require('cookie-parser');
var CookieSession = require('cookie-session');
var Passport = require('passport');
var GithubStrategy = require('passport-github').Strategy;
var TwitterStrategy = require('passport-twitter').Strategy;
var Datastore = require('nedb');
var membersDbFilePath = null;
var Signer = require('jws');
var Persistence = null;
var Member = require('../profile/entities/member');
var uploadsFolder = rootPath + '/uploads/';
var imagesFolder = rootPath + '/uploads/images/';
var members = [];
var httpImageRoot = "/uploads/images/";
var Moment = require('moment');
var HttpStatus = require('../lib/httpstatus');
var packageFile = require('../package.json');
var busClient = require('../boundaries/inprocbus');

var Commands = require('../profile/commands');
var Events = require('../profile/events');
var chatServer = null;

function Resource(obj){
	this.layout = 'default';
	this.title = "devchitchat";
	this.js = [];
	this.css = [];
	this.header = {};
	this.user = null;
	this.status = {code: 200, description: 'Ok'};
	this.author = "Joey Guerra";
	this.description = "devchitchat web and chat server";
	for(var key in obj){
		this[key] = obj[key];
	}
}

function createFolderIfDoesntExist(folder){
	if(!Fs.existsSync(folder)){
		Fs.mkdirSync(folder);
	}
}

busClient.start();
busClient.iHandle('AddMember', {
	handle: function(command){
		Persistence.newMemberWasSubmitted(command.body, function(err, doc){
			if(!err){
				busClient.publish(new Events.MemberWasCreated(command.body));
			}else{
				console.log('error from AddMember handle:', err);
			}
		});
	}
});

busClient.iHandle('UpdateMember', {
	handle: function(command){
		Persistence.memberWasUpdated(command.body._id, command.body, function(err, doc){
			if(!err){
				busClient.publish(new Events.MemberWasUpdated(command.body));
			}else{
				console.log('error from UpdateMember handle:', err);
			}
		});
	}
});
busClient.iHandle('DeleteMember', {
	handle: function(command){
		Persistence.memberWasDeleted(command.body._id, function(err, count){
			if(!err){
				busClient.publish(new Events.MemberWasDeleted(command.body));
			}else{
				console.log('error from DeleteMember: ', err);
			}
		});
	}
});
busClient.iHandle('ChangeAvatar', {
	handle: function(command){
		Persistence.updateAvatar(command.body.id, command.body.avatar, function(err, count){
			if(!err){
				busClient.publish(new Events.AvatarWasChanged(command.body));
			}else{
				console.log('error from ChangeAvatar: ', err);
			}
		});
	}
});
busClient.iHandle('ChangeBackground', {
	handle: function(command){
		Persistence.updateBackground(command.body.id, command.body.background, function(err, count){
			if(!err){
				busClient.publish(new Events.BackgroundWasChanged(command.body));
			}else{
				console.log('error from ChangeBackground: ', err);
			}
		});
	}
});
createFolderIfDoesntExist(config.dataPath);
createFolderIfDoesntExist(uploadsFolder);
createFolderIfDoesntExist(imagesFolder);
membersDbFilePath = config.dataPath + '/members.db';
Persistence = require('../boundaries/persistence')(config);
Express.response.represent = function(result){
	if(result === undefined) return this.req.next(result);
	if(!result.view){
		this.statusCode = result;
		this.set('Content-Type', 'text/plain');
		return this.end(arguments.length > 1 ? arguments[1] : null);
	}
	result.resource.user = this.req.user;
	Chilla.execute({
		next: this.req.next,
		model: result.model,
		request: this.req,
		response: this,
		resource: result.resource,
		template: result.view,
		config: config
	}, function(output){
		this.statusCode = 200;
		if(!isNaN(output)){
			this.statusCode = output;
			output = '';
		}
		this.write(output);
		this.end();
	}.bind(this));
};
App.use(Compression());
App.use("/public", StaticServer(Chilla.themeRoot));
App.use("/uploads", StaticServer(rootPath + '/uploads/'));
App.set("views", rootPath + "/themes/default/templates");
App.set("view engine", function(view, options, fn){ return fn(view, options);});
App.use(CookieParser());
App.use(Multer({dest: './uploads/'}));
App.use(BodyParser.urlencoded({ extended: true }));
App.use(MethodOverride(function(req, res){
	if(req.body._method) return req.body._method;
	return req.method;
}));
App.use(CookieSession({ keys: [config.cookie.key, ':blarbityblarbblarb:'], secret: config.cookie.secret}));
App.use(Passport.initialize());
App.use(Passport.session());

Passport.serializeUser(function(member, done) {
	var signature = Signer.sign({
		header: {alg: 'HS256'}
		, payload: member.username
		, secret: config.secret
	});
	done(null, signature);
});
Passport.deserializeUser(function deserializeUser(token, done) {
	var decodedSignature = Signer.decode(token);		
	if(!decodedSignature) return done(null, null);
	Persistence.member.findOne({username: decodedSignature.payload}, function(err, member) {
		if(err){
			console.log(err);
		}
		done(err, member);
	});
});

Passport.use(new GithubStrategy(config.passport.github, function(accessToken, refreshToken, profile, done) {
	Persistence.member.findOne({id: profile.id}, function(err, member){
		if(err){
			return done(err);
		}
		if(member){
			return done(null, member);
		}
		var member = new Member({
			id: profile.id,
			provider: profile.provider,
			name: profile.displayName,
			token: profile.id,
			username: profile.username,
			profileUrl: profile.profileUrl,
			emails: profile.emails,
			avatar: profile._json.avatar_url
		});
		busClient.send(new Commands.AddMember(member));
		done(null, member);
	});
}));
Passport.use(new TwitterStrategy(config.passport.twitter, function(accessToken, refreshToken, profile, done) {
	Persistence.member.findOne({id: profile.id}, function(err, member){
		if(err){
			return done(err);
		}
		if(member){
			return done(null, member);
		}
		var member = new Member({
			id: profile.id,
			provider: profile.provider,
			name: profile.displayName,
			token: profile.id,
			username: profile.username,
			profileUrl: profile.profileUrl,
			emails: profile.emails,
			avatar: profile._json.profile_image_url_https
		});
		busClient.send(new Commands.AddMember(member));
		done(null, member);
	});
}));

App.get(['/chat/:room.:format?', '/member', '/members', '/member/:member_name', '/welcome.:format?'], function(req, resp, next){
	if(!req.isAuthenticated()) return next(401);
	next();
});
App.post(['/members'], function(req, resp, next){
	if(!req.isAuthenticated()) return next(401);
	next();
});
App.delete(['/members'], function(req, resp, next){
	if(!req.isAuthenticated()) return next(401);
	next();
});

App.get('/logout.:format?', function(req, resp, next){
	req.logout();
	resp.redirect('/index');
});

App.get('/login/github.:format?', Passport.authenticate('github'));
App.get('/login/twitter.:format?', Passport.authenticate('twitter'));
App.get('/github/callback', Passport.authenticate('github', {successRedirect: '/welcome', failureRedirect: '/login'}));
App.get('/twitter/callback', Passport.authenticate('twitter', {successRedirect: '/welcome', failureRedirect: '/login'}));
App.get('/welcome.:format?', function(req, resp, next){
	resp.represent({
		view: 'chat/room',
		resource: new Resource({title: "Welcome", js:['chat'], css: ['chatbubbles']}),
		model: []});
});
App.delete("/members.:format?", function(req, resp, next){
	var id = req.body._id;
	Persistence.member.findOne({_id: id}, function(err, member){
		if(err){
			console.log(err);
		}
		if(member && member._id !== null){
			busClient.send(new Commands.DeleteMember(member));
		}
	});
	resp.redirect('/members');
});
App.get("/members.:format?", function(req, resp, next){
	var docs = [];
	Persistence.member.find({}, {public: -1}, function(err, docs){
		if(err){
			console.log(err);
			next(500);
		}
		resp.represent({view: 'member/index'
			, resource: new Resource({title: "List of Members"
			, members: members, css: ['members']})
			, model: docs});
	});
});
App.get('/members/:_id.:format?', function(req, resp, next){
	Persistence.member.findOne({_id: req.params._id}, function(err, doc){
		if(err) return next(500);
		if(doc === null) return next(404);
		resp.represent({view: 'member/show'
			, resource: new Resource({members: members, css: ['member'], js: ['member']})
			, model: doc});
	});
});
App.get("/member/:_id.:format?", function getMemberById(req, resp, next){
	Persistence.member.findOne({_id: req.params._id}, function(err, doc){
		if(err) return next(500);
		if(doc === null) return next(404);
		resp.represent({view: 'member/edit'
			, resource: new Resource({members: members, css: ['member'], js: ['member']})
			, model: doc});
	});
});
App.get("/member.:format?", function getMemberEditForm(req, resp, next){
	resp.represent({view: 'member/edit'
		, resource: new Resource({title: "New Member", members: members
			, css: ['member']
			, js: ['member']
		})
		, model: new Member()
	});
});
App.put("/member/:_id.:format?", function updateMemberById(req, resp, next){
	Persistence.member.findOne({_id: req.params._id}, function(err, doc){
		if(!doc) return next(404);
		doc.page = req.body.page;
		doc.name = req.body.name;
		busClient.send(new Commands.UpdateMember(doc));
		resp.redirect('/members');
	});
});

App.post("/member.:format?", function(req, resp, next){
	var member = new Member();
	member.name = req.params.name;
	member.page = req.params.page;
	member.active = (new Date()).getTime();
	busClient.send(new Commands.AddMember(member));
	resp.redirect('/members');
});
App.post('/member/:_id/backgrounds.:format?', function(req, resp, next){
	var file = req.files['newBackground'];
	var folder = rootPath + '/uploads/' + req.user.username;
	var id = req.params._id;
	Fs.exists(folder, function(exists){
		if(!exists) Fs.mkdirSync(folder);
		Fs.rename(rootPath + '/' + file.path, folder + '/' + file.originalname
			, function(err){
				if(err){
					console.log(err);
				}
				var newBackground = '/uploads/' + req.user.username + '/' + file.originalname;
				busClient.send(new Commands.ChangeBackground({id: req.user._id, background: newBackground}));
				Persistence.member.findOne({_id: id}, function(err, doc){
					doc.background = newBackground;
					resp.represent({view: 'member/show', resource: new Resource(), model: new Member(doc)});
				});
		});
	})
});
App.post('/member/:_id/avatars.:format?', function(req, resp, next){
	var file = req.files['newAvatar'];
	var folder = rootPath + '/uploads/' + req.user.username;
	var id = req.params._id;
	Fs.exists(folder, function(exists){
		if(!exists) Fs.mkdirSync(folder);
		Fs.rename(rootPath + '/' + file.path, folder + '/' + file.originalname
			, function(err){
				if(err){
					console.log(err);
				}
				var newAvatar = '/uploads/' + req.user.username + '/' + file.originalname;
				busClient.send(new Commands.ChangeAvatar({id: req.user._id, avatar: newAvatar}));
				Persistence.member.findOne({_id: id}, function(err, doc){
					doc.avatar = newAvatar;
					resp.represent({view: 'member/show', resource: new Resource(), model: new Member(doc)});
				});
		});
	})
});

App.get("/chat/:room.:format?", function(req, resp, next){
	var room = req.params.room;
	Persistence.message.findToday(room, function(err, doc){
		resp.represent({view: 'chat/room', resource: new Resource({js: ['chat'], css: ['chatbubbles']}), model: doc});
	});
});
App.get("/deployment.:format?", function(req, resp, next){
	resp.represent({
		view: 'deployment/index'
		, resource: new Resource({})
		, model: {error: null, message: null}});
});

App.post('/deployment.:format?', function(req, resp, next){
	var message = Util.format("@all %s:%s deployed to %s", req.body.app, req.body.version, req.body.env);
    chatServer.say(message);
	resp.represent({
		view: 'deployment/index'
		, resource: new Resource({})
		, model: {error: null, message: "Thanks"}});
});

App.get('/message.:format?', function(req, resp, next){
	var msg = req.query.msg;
    chatServer.say(decodeURIComponent(msg));
	resp.represent({
		view: 'nick/index'
		, resource: new Resource({})
		, model: {error: null, message: "Thanks"}});
});

var os=require('os');
var ifaces = os.networkInterfaces();
var addresses = [];
for(var key in ifaces){
	if(key.indexOf('en') === -1) continue;
	var iface = ifaces[key];
	var address = iface.reduce(function(previous, current, index, ary){
		return current.address;
	});
	addresses.push(address);
}
var localhost = addresses.reduce(function(previous, current, index, ary){
	return current === null ? previous : current;
});

var server = App.listen(config.port, function(){
	console.log('HttpServer listening on http://%s:%s', localhost, config.port);
});

var chatServer = require('../boundaries/chat')({
	server: server
	, config: config
	, cookieParser: CookieParser
	, cookieSession: CookieSession
	, bus: busClient
	, Persistence: Persistence
});

exports.server = {http: server, chat: chatServer};