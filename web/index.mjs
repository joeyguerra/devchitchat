import express from 'express'
import path, {dirname} from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import {Chilla} from 'chilla'
import compression from 'compression'
import multer from 'multer'
import methodOverride from 'method-override'
import cookieParser from 'cookie-parser'
import cookieSession from 'cookie-session'
import passport from 'passport'
import GithubAuth from '../lib/GithubAuth.mjs'
import jws from 'jws'
import Member from '../app/entities/member.mjs'
import bus from '../boundaries/bus.mjs'
import Commands from '../app/commands/index.mjs'
import Events from '../app/events/index.mjs'
import debug from'debug'
import Db from '../lib/db.mjs'
import TwitterAuth from '../lib/TwitterAuth.mjs'
const config = Object.assign({
	site: {
		title: 'devchitchat'
	},
	domain: 'dev.local'
}, process.env)

debug('httpServer')

multer({dest: './uploads/'})
const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const rootPath = __dirname.replace('web' + path.sep, '')
const chilla = Chilla({
	themeRoot: rootPath + ['', 'themes', 'default'].join(path.sep),
	appPath: rootPath
});
const uploadsFolder = rootPath + '/uploads/'
const imagesFolder = rootPath + '/uploads/images/'
const members = []
const db = new Db(config.DATA_PATH)
function Resource(obj){
	this.layout = 'default'
	this.title = "devchitchat"
	this.js = []
	this.css = []
	this.header = {}
	this.user = null
	this.status = {code: 200, description: 'Ok'}
	this.author = "Joey Guerra"
	this.description = "devchitchat web and chat server"
	for(var key in obj){
		this[key] = obj[key]
	}
}

function createFolderIfDoesntExist(folder){
	if(!fs.existsSync(folder)){
		fs.mkdirSync(folder)
	}
}

bus.start()
bus.iHandle('AddMember', {
	handle: function(command){
		db.newMemberWasSubmitted(command.body, function(err, doc){
			if(!err){
				bus.publish(new Events.MemberWasCreated(command.body))
			}else{
				debug('error from AddMember handle:', err)
			}
		})
	}
})

bus.iHandle('UpdateMember', {
	handle: function(command){
		db.memberWasUpdated(command.body.id, command.body, function(err, doc){
			if(!err){
				bus.publish(new Events.MemberWasUpdated(command.body))
			}else{
				debug('error from UpdateMember handle:', err)
			}
		})
	}
})
bus.iHandle('DeleteMember', {
	handle: function(command){
		db.memberWasDeleted(command.body.id, function(err, count){
			if(!err){
				bus.publish(new Events.MemberWasDeleted(command.body))
			}else{
				debug('error from DeleteMember: ', err)
			}
		})
	}
})
bus.iHandle('ChangeAvatar', {
	handle: function(command){
		db.updateAvatar(command.body.id, command.body.avatar, function(err, count){
			if(!err){
				bus.publish(new Events.AvatarWasChanged(command.body))
			}else{
				debug('error from ChangeAvatar: ', err)
			}
		})
	}
})
bus.iHandle('ChangeBackground', {
	handle: function(command){
		db.updateBackground(command.body.id, command.body.background, function(err, count){
			if(!err){
				bus.publish(new Events.BackgroundWasChanged(command.body))
			}else{
				debug('error from ChangeBackground: ', err)
			}
		})
	}
})
createFolderIfDoesntExist(config.DATA_PATH)
createFolderIfDoesntExist(uploadsFolder)
createFolderIfDoesntExist(imagesFolder)
express.response.represent = function(result){
	if(result === undefined) return this.req.next(result)
	if(!result.view){
		this.statusCode = result
		this.set('Content-Type', 'text/plain')
		return this.end(arguments.length > 1 ? arguments[1] : null)
	}
	result.resource.user = this.req.user
	chilla.execute({
		next: this.req.next,
		model: result.model,
		request: this.req,
		response: this,
		resource: result.resource,
		template: result.view,
		config: config
	}, function(output){
		this.statusCode = 200
		if(!isNaN(output)){
			this.statusCode = output
			output = ''
		}
		this.write(output)
		this.end()
	}.bind(this))
}

app.use(compression())
app.use("/public", express.static(chilla.themeRoot))
app.use("/uploads", express.static(rootPath + '/uploads/'))
app.set("views", rootPath + "/themes/default/templates")
app.set("view engine", (view, options, fn)=> fn(view, options))
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser({
	secret: config.COOKIE_SECRET
}))
app.use(cookieSession({ keys: [config.COOKIE_KEY, ':blarbityblarbblarb:'], secret: config.COOKIE_SECRET}))
app.use(methodOverride((req, res)=>{
	if(req.body._method) return req.body._method
	return req.method
}))
const regenerate = callback => {
	console.log('regenerating')
	callback()
}
const save = callback => {
	console.log('saving')
	callback()
}
app.use((req, res, next)=>{
	req.session.regenerate = regenerate
	req.session.save = save
	next()
})
app.use(passport.session())

// TODO: stop using jwots. they don't expire.
passport.serializeUser((member, done)=>{
	var signature = jws.sign({
		header: {alg: 'HS256'}
		, payload: member.token
		, secret: config.SECRET
	})
	return done(null, signature)	
})

passport.deserializeUser((token, done)=>{
	var decodedSignature = jws.decode(token);
	if(!decodedSignature) return done(null, null);
	db.member.findOne({token: decodedSignature.payload}, (err, member)=>{
		if(err){
			debug(err)
		}
		done(err, member)
	})
})

passport.use(new GithubAuth({
	clientID: config.GITHUB_CLIENT_ID,
	clientSecret: config.GITHUB_CLIENT_SECRET,
	callbackURL: config.GITHUB_CALLBACK_URL
}, (accessToken, refreshToken, profile, done)=>{
	db.member.findOne({id: profile.id}, (err, member)=>{
		if(err){
			return done(err)
		}
		if(member){
			return done(null, member)
		}
		member = new Member({
			id: profile.id,
			provider: profile.provider,
			name: profile.displayName,
			token: profile.nodeId,
			username: profile.username,
			profileUrl: profile.profileUrl,
			emails: profile.emails,
			avatar: profile.photos.pop().value
		})
		db.newMemberWasSubmitted(member, (err, doc)=>{
			if(!err){
				bus.publish(new Events.MemberWasCreated(doc))
			}else{
				debug('error from AddMember handle:', err)
			}
			done(err, member)
		})
	})
}))

passport.use(new TwitterAuth({
	clientID: config.TWITTER_CLIENT_ID,
	clientSecret: config.TWITTER_CLIENT_SECRET,
	callbackURL: config.TWITTER_CALLBACK_URL
}, (accessToken, refreshToken, profile, done)=>{
	db.member.findOne({id: profile.id}, (err, member)=>{
		if(err){
			return done(err);
		}
		if(member){
			return done(null, member);
		}
		member = new Member({
			id: profile.id,
			provider: profile.provider,
			name: profile.displayName,
			token: profile.id,
			username: profile.username,
			profileUrl: profile.profileUrl,
			emails: profile.emails,
			avatar: profile.photos.pop().value
		})

		db.newMemberWasSubmitted(member, (err, doc)=>{
			if(!err){
				bus.publish(new Events.MemberWasCreated(doc))
			}else{
				debug('error from AddMember handle:', err)
			}
			done(err, member)
		})
	})
}))

app.get(['/chat/:room.:format?', '/member', '/members', '/member/:member_name', '/welcome.:format?'], (req, resp, next)=>{
	if(!req.isAuthenticated()) return next(401)
	next()
})

app.post(['/members'], (req, resp, next)=>{
	if(!req.isAuthenticated()) return next(401)
	next()
});

app.delete(['/members'], (req, resp, next)=>{
	if(!req.isAuthenticated()) return next(401)
	next()
})

app.get('/logout.:format?', (req, resp, next)=>{
	req.logout(()=>{
		resp.redirect('/index')
	})
})

app.get('/login/github.:format?', passport.authenticate('github'))
app.get('/login/twitter.:format?', passport.authenticate('twitter'))
app.get('/github/callback', passport.authenticate('github', {successRedirect: '/welcome', failureRedirect: '/'}))
app.get('/twitter/callback', passport.authenticate('twitter', {successRedirect: '/welcome', failureRedirect: '/'}))

app.get('/welcome.:format?', (req, resp, next)=>{
	resp.represent({
		view: 'chat/room',
		resource: new Resource({title: "Welcome", js:[
			'/socket.io/socket.io.js',
			'/public/js/hogan-2.0.0.min.js',
			'/public/js/mvc.js',
			'/public/js/messageview.js',
			'/public/js/previewview.js',
			'/public/js/rosterview.js',
			'/public/js/reconnectingcounterview.js',
			'/public/js/discussionview.js',
			'/public/js/chat.js',
			'/public/js/menu.js'
		], css: ['chatbubbles', 'room']}),
		model: []})
})

app.get(['/', '/index.:format?'], (req, resp, next)=>{
	resp.represent({
		view: 'index/index',
		resource: new Resource({title: "devchitchat", css: ['index']}),
		model: {}})
})

app.delete("/members.:format?", (req, resp, next)=>{
	var id = req.body.id
	db.member.findOne({id: id}, (err, member)=>{
		if(err){
			debug(err)
		}
		if(member && member.id !== null){
			bus.send(new Commands.DeleteMember(member))
		}
	})
	resp.redirect('/members')
})
app.get("/members.:format?", (req, resp, next)=>{
	var docs = []
	db.member.find({}, {public: -1}, (err, docs)=>{
		if(err){
			debug(err)
			next(500)
		}
		resp.represent({view: 'members/index'
			, resource: new Resource({title: "List of Members"
			, members: members, css: ['members']})
			, model: docs})
	})
})

app.get('/members/:id.:format?', (req, resp, next)=>{
	db.member.findOne({id: req.params.id}, (err, doc)=>{
		if(err) return next(500)
		if(doc === null) return next(404)
		resp.represent({view: 'member/show'
			, resource: new Resource({members: members, css: ['member'], js: ['member']})
			, model: doc})
	})
})

app.get("/member/:id.:format?", (req, resp, next)=>{
	db.member.findOne({id: req.params.id}, function(err, doc){
		if(err) return next(500)
		if(doc === null) return next(404)
		resp.represent({view: 'member/edit'
			, resource: new Resource({members: members, css: ['member'], js: ['member']})
			, model: doc})
	})
})

app.get("/member.:format?", (req, resp, next)=>{
	resp.represent({view: 'members/edit'
		, resource: new Resource({title: "New Member", members: members
			, css: ['member']
			, js: ['member']
		})
		, model: new Member()
	})
})

app.put("/member/:id.:format?", (req, resp, next)=>{
	db.member.findOne({id: req.params.id}, (err, doc)=>{
		if(!doc) return next(404)
		doc.page = req.body.page
		doc.name = req.body.name
		bus.send(new Commands.UpdateMember(doc))
		resp.redirect('/members')
	})
})

app.post("/member.:format?", (req, resp, next)=>{
	var member = new Member()
	member.name = req.params.name
	member.page = req.params.page
	member.active = (new Date()).getTime()
	bus.send(new Commands.AddMember(member))
	resp.redirect('/members')
})

app.post('/member/:id/backgrounds.:format?', (req, resp, next)=>{
	var file = req.files['newBackground']
	var folder = rootPath + '/uploads/' + req.user.username
	var id = req.params.id
	fs.exists(folder, function(exists){
		if(!exists) fs.mkdirSync(folder)
		fs.rename(rootPath + '/' + file.path, folder + '/' + file.originalname
			, err => {
				if(err){
					debug(err)
				}
				const newBackground = '/uploads/' + req.user.username + '/' + file.originalname
				bus.send(new Commands.ChangeBackground({id: req.user.id, background: newBackground}))
				db.member.findOne({id: id}, (err, doc)=>{
					doc.background = newBackground
					resp.represent({view: 'member/show', resource: new Resource(), model: new Member(doc)})
				})
		})
	})
})

app.post('/member/:id/avatars.:format?', (req, resp, next)=>{
	const file = req.files['newAvatar']
	const folder = rootPath + '/uploads/' + req.user.username
	const id = req.params.id
	fs.exists(folder, exists => {
		if(!exists) fs.mkdirSync(folder)
		fs.rename(rootPath + '/' + file.path, folder + '/' + file.originalname
			, err => {
				if(err){
					debug(err)
				}
				const newAvatar = '/uploads/' + req.user.username + '/' + file.originalname
				bus.send(new Commands.ChangeAvatar({id: req.user.id, avatar: newAvatar}))
				db.member.findOne({id: id}, (err, doc)=>{
					doc.avatar = newAvatar
					resp.represent({view: 'member/show', resource: new Resource(), model: new Member(doc)})
				})
		})
	})
})

app.get("/chat/:room.:format?", (req, resp, next)=>{
	const room = req.params.room
	db.message.findToday(room, (err, doc)=>{
		resp.represent({
			view: 'chat/room',
			resource: new Resource({title: "Welcome", js:[
				'/socket.io/socket.io.js',
				'/public/js/hogan-2.0.0.min.js',
				'/public/js/uri.js',
				'/public/js/mvc.js',
				'/public/js/reconnectingcounterview.js',
				'/public/js/messageview.js',
				'/public/js/previewview.js',
				'/public/js/rosterview.js',
				'/public/js/discussionview.js',
				'/public/js/chat.js',
				'/public/js/menu.js'
			], css: ['chatbubbles', 'room']}),
			model: doc})
	})
})

export default {
	http: app,
	bus: bus,
	persistence: db,
	config: config,
	Passport: passport
}
