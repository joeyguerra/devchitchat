import express from 'express'
import path, {dirname} from 'node:path'
import fs, { stat } from 'node:fs'
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
import Member from '../app/entities/Member.mjs'
import bus from '../boundaries/bus.mjs'
import Commands from '../app/commands/index.mjs'
import Events from '../app/events/index.mjs'
import debug from'debug'
import Db from '../lib/db.mjs'
import TwitterAuth from '../lib/TwitterAuth.mjs'
import bodyParser from 'body-parser'
import handlebars from 'handlebars'

const File = fs.promises

const config = Object.assign({
	site: {
		title: 'devchitchat'
	},
	domain: 'dev.local'
}, process.env)

debug('httpServer')

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const rootPath = __dirname
const chilla = Chilla({
	themeRoot: rootPath + ['', 'themes', 'default'].join(path.sep),
	appPath: rootPath
});
const UPLAODS_FOLDER = `${rootPath}/uploads/`
const IMAGES_FOLDER = `${rootPath}/uploads/images/`
const members = []
const db = new Db(config.DATA_PATH)

multer({dest: UPLAODS_FOLDER})

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
createFolderIfDoesntExist(UPLAODS_FOLDER)
createFolderIfDoesntExist(IMAGES_FOLDER)
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

async function readFiles(folders, source, delegate) {
    for await (let file of folders) {
        let fileName = `${source}/${file.name}`
        if (file.isFile()){
            if(delegate.filterOut && await delegate.filterOut(file, fileName)) continue
            if(delegate.fileWasFound) await delegate.fileWasFound({ file, fileName })
        }else{
            if(delegate.directoryWasFound) await delegate.directoryWasFound({ file, fileName })
        }
    }
}

;(async ()=>{
	const files = []
	const source = './templates'
	const destination = './dist'
	const folders = await File.readdir(source, {withFileTypes: true})
    await readFiles(folders, source, {
        async directoryWasFound(info){
            try{await File.mkdir(info.fileName.replace(source, destination))}catch(e){}
            await readFiles(await File.readdir(info.fileName, {withFileTypes: true}), info.fileName, this)
        },
        async fileWasFound(info){
            // only if you want to create static files
			// if(info.fileName.indexOf('Layout') == -1) fs.createReadStream(info.fileName).pipe(fs.createWriteStream(info.fileName.replace(source, destination)))
			files.push(info.fileName)
        }
    })
    for await (let file of files){
        let data = await File.readFile(file, 'utf-8')
        let key = file.replace(`${source}/`, '').replace(/[\s|\-]/g, '_')
        if(key.indexOf('.html') > -1) {
			console.log(`Registering ${key}`)
            handlebars.registerPartial(key, data)
        }
    }
})()

handlebars.registerHelper('w3cFormat', (value, options) => {
	return (new Date(value)).toISOString()
})
handlebars.registerHelper('ifThisIsTheFirstMessageInTheGroup', (message, index, messages, loggedInMember, options)=>{

	let html = null
	// if(message.from.username != loggedInMember.username){
	// 	options.data.root.counter = 0
	// }
	console.log(options.data.root.counter, message.from.username == loggedInMember.username, message.from.username, loggedInMember.username, messages[index + 1]?.from.username)
	if(options.data.root.counter == 0 &&
		message.from.username == loggedInMember.username){
		options.data.root.counter = 1
		return options.fn(message)
	}

	if(options.data.root.counter == 0 &&
		message.from.username != loggedInMember.username &&
		message.from.username == messages[index + 1]?.from.username){
		options.data.root.counter = 1
		return options.fn(message)
	}

	return html
})
handlebars.registerHelper('ifLastMessageInGroup', (message, index, messages, loggedInMember, options)=>{
	if(message.from.username == loggedInMember.username && messages[index + 1]?.from.username != loggedInMember.username){
		options.data.root.counter = 0
		return options.fn(message)
	}
	if(message.from.username != loggedInMember.username && messages[index + 1]?.from.username == loggedInMember.username){
		options.data.root.counter = 0
		return options.fn(message)
	}
	return null
})

handlebars.registerHelper('selfOrOther', (member, user, state, options) => {
	if(!state.current) state.current = 0
	let className = ''
	if(member.username == user.username){
		className = 'self'
		state.current = 0
	} else {
		className = 'other'
		state.current = 1
	}
	return className
})

app.disable('x-powered-by')
express.static.mime.define({'text/javascript': ['js', 'mjs']})
app.use(express.static('./dist'))
app.use(compression())
app.use("/public", express.static(chilla.themeRoot))
console.log(rootPath)
app.use("/uploads", express.static(UPLAODS_FOLDER))
app.use('/lib', express.static(`${__dirname.replace('/web', '')}/lib`))
app.engine('html', async (filePath, options, callback)=>{
	const data = await File.readFile(filePath, 'utf-8')
	const template = handlebars.compile(data)
	const rendered = template(options)
	callback(null, rendered)
})
app.set('view engine', 'html')
app.set('views', ['./www', './templates'])
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())
app.use(cookieParser({
	secret: config.COOKIE_SECRET
}))
app.use(cookieSession({ keys: [config.COOKIE_KEY, ':blarbityblarbblarb:'], secret: config.COOKIE_SECRET}))
app.use(methodOverride('_method'))
app.set('trust proxy', 1)

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
			id: `github:${profile.id}`,
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
			id: `twitter:${profile.id}`,
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
app.locals.title = 'welcome room'
app.locals.description = 'the welcome chat room'
app.locals.author = 'joey g'

app.get('/welcome.:format?', async (req, res)=>{
	const messages = await db.message.findToday('w2')
	res.render('chat/room.html', {
		member: JSON.stringify(req.user, null, 2),
		user: req.user,
		messages: messages,
		counter: 0,
		js:[
			'/socket.io/socket.io.js',
			'/public/js/hogan-2.0.0.min.js',
			'/public/js/mvc.js',
			'/public/js/messageview.js',
			'/public/js/previewview.js',
			'/public/js/rosterview.js',
			'/public/js/reconnectingcounterview.js',
			'/public/js/menu.js'
		], css: ['/public/css/chatbubbles.css', '/public/css/room.css']
	})
})

app.get(['/', '/index.:format?'], (req, res)=>{
	res.represent({
		view: 'index/index',
		resource: new Resource({title: "devchitchat", css: ['index']}),
		model: {}})
})

app.delete("/members.:format?", (req, res)=>{
	var id = req.body.id
	db.member.findOne({id: id}, (err, member)=>{
		if(err){
			debug(err)
		}
		if(member && member.id !== null){
			bus.send(new Commands.DeleteMember(member))
		}
	})
	res.redirect('/members')
})
app.get("/members.:format?", (req, res)=>{
	var docs = []
	db.member.find({}, {public: -1}, (err, docs)=>{
		if(err){
			debug(err)
			next(500)
		}
		res.represent({view: 'members/index'
			, resource: new Resource({title: "List of Members"
			, members: members, css: ['members']})
			, model: docs})
	})
})

app.get('/members/:id.:format?', (req, res)=>{
	db.member.findOne({id: req.params.id}, (err, doc)=>{
		if(err) return next(500)
		if(doc === null) return next(404)
		res.represent({view: 'member/show'
			, resource: new Resource({members: members, css: ['member'], js: ['member']})
			, model: doc})
	})
})

app.get("/member/:id.:format?", (req, res)=>{
	db.member.findOne({id: req.params.id}, function(err, doc){
		if(err) return next(500)
		if(doc === null) return next(404)
		res.represent({view: 'member/edit'
			, resource: new Resource({members: members, css: ['member'], js: ['member']})
			, model: doc})
	})
})

app.get("/member.:format?", (req, res)=>{
	res.represent({view: 'members/edit'
		, resource: new Resource({title: "New Member", members: members
			, css: ['member']
			, js: ['member']
		})
		, model: new Member()
	})
})

app.put("/member/:id.:format?", (req, res)=>{
	db.member.findOne({id: req.params.id}, (err, doc)=>{
		if(!doc) return next(404)
		doc.page = req.body.page
		doc.name = req.body.name
		bus.send(new Commands.UpdateMember(doc))
		res.redirect('/members')
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

app.post('/member/:id/backgrounds.:format?', (req, res)=>{
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
					res.represent({view: 'member/show', resource: new Resource(), model: new Member(doc)})
				})
		})
	})
})

app.post('/member/:id/avatars.:format?', (req, res)=>{
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
					res.represent({view: 'member/show', resource: new Resource(), model: new Member(doc)})
				})
		})
	})
})

app.get("/chat/:room.:format?", (req, res)=>{
	const room = req.params.room
	db.message.findToday(room, (err, doc)=>{
		res.represent({
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
