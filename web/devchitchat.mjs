
import http from 'node:http'
import fs from 'node:fs'
import {dirname} from 'node:path'
import { fileURLToPath } from 'node:url'

import cookieParser from 'cookie-parser'
import cookieSession from 'cookie-session'
import compression from 'compression'
import bodyParser from 'body-parser'
import handlebars from 'handlebars'
import multer from 'multer'
import methodOverride from 'method-override'
import express from 'express'
import {Server} from 'socket.io'
import passport from 'passport'
import jws from 'jws'
import MarkdownIt from 'markdown-it'
import debug from'debug'

import Db from '../lib/db.mjs'
import Member from '../models/Member.mjs'
import GithubAuth from '../lib/GithubAuth.mjs'
import TwitterAuth from '../lib/TwitterAuth.mjs'
import SocketClient from '../lib/SocketClient.mjs'
import Message from '../Models/message.mjs'

const md = new MarkdownIt({
	html: true,
	linkify: true,
	typographer: true
})

const File = fs.promises

const config = Object.assign({
	site: {
		title: 'devchitchat'
	},
	domain: 'dev.local'
}, process.env)

const db = new Db(config.DATA_PATH)
let roster = {}
debug('devchitchat:server')

const rootPath = dirname(fileURLToPath(import.meta.url))
const app = express()

const UPLAODS_FOLDER = `${rootPath}/uploads/`
const IMAGES_FOLDER = `${rootPath}/uploads/images/`
multer({dest: UPLAODS_FOLDER})

function createFolderIfDoesntExist(folder){
	if(!fs.existsSync(folder)){
		fs.mkdirSync(folder)
	}
}
createFolderIfDoesntExist(config.DATA_PATH)
createFolderIfDoesntExist(UPLAODS_FOLDER)
createFolderIfDoesntExist(IMAGES_FOLDER)

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

handlebars.registerHelper('tojson', (value, options)=>{
	return JSON.stringify(value, null, 2)
})
handlebars.registerHelper('w3cFormat', (value, options) => {
	return (new Date(value)).toISOString()
})
handlebars.registerHelper('forDisplay', (value, options) => {
	return Message.forDisplay(new Date(value))
})

handlebars.registerHelper('ifThisIsTheFirstMessageInTheGroup', (message, index, messages, loggedInMember, options)=>{
	let html = null
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
app.use("/public", express.static(`${rootPath}/themes/default`))
console.log(`Root path ${rootPath}`)
app.use("/uploads", express.static(UPLAODS_FOLDER))
app.use('/lib', express.static(`${rootPath.replace('/web', '')}/lib`))
app.use('/public/markdown', express.static(`${rootPath.replace('/web', '')}/node_modules/markdown-it/dist`))

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

// Note: Passport requires the session object to have a specific API.
// So just adding the 2 methods that it calls in it's code is enough.
app.use((req, res, next)=>{
	req.session.regenerate = callback => callback()
	req.session.save = callback => callback()
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
}, async (accessToken, refreshToken, profile, done)=>{
	try{
		let member = await db.member.findOne({id: profile.id})
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
		const doc = await db.newMemberWasSubmitted(member)
		done(null, doc)
	}catch(e){
		done(e)
	}
}))

passport.use(new TwitterAuth({
	clientID: config.TWITTER_CLIENT_ID,
	clientSecret: config.TWITTER_CLIENT_SECRET,
	callbackURL: config.TWITTER_CALLBACK_URL
}, async (accessToken, refreshToken, profile, done)=>{
	try{
		let member = await db.member.findOne({id: profile.id})
		if(member){
			return done(null, member)
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
	
		const doc = await db.newMemberWasSubmitted(member)
		done(null, doc)	
	}catch(e){
		done(e)
	}
}))

app.get(['/chat/:room.:format?', '/welcome.:format?'], (req, res, next)=>{
	if(!req.isAuthenticated()) return next(401)
	next()
})

app.get('/logout.:format?', (req, res, next)=>{
	req.logout(()=>{
		res.redirect('/index')
	})
})

app.get('/login/github.:format?', passport.authenticate('github'))
app.get('/login/twitter.:format?', passport.authenticate('twitter'))
app.get('/github/callback', passport.authenticate('github', {successRedirect: '/welcome', failureRedirect: '/'}))
app.get('/twitter/callback', passport.authenticate('twitter', {successRedirect: '/welcome', failureRedirect: '/'}))
app.locals.title = 'DevChitChat'
app.locals.description = 'Every day around 10 AM'
app.locals.author = 'joey g'

app.get(['/', '/index.:format?'], (req, res)=>{
	res.render('index/index.html', {
		css: ['/public/css/index.css']
	})
})

app.get('/welcome.:format?', async (req, res)=>{
	const messages = await db.message.findToday('welcome')
	messages.forEach(m => {
		m.messages.forEach( message => {
			if(message.text.indexOf('data:image') > -1){
				message.text = `![](${message.text})`
			}
			message.text = md.render(message.text)
		})
	})
	res.render('chat/room.html', {
		title: `the welcoming room`,
		member: JSON.stringify(req.user, null, 2),
		user: req.user,
		messages: messages,
		counter: 0,
		js:[
			'/socket.io/socket.io.js',
			'/public/js/hogan-2.0.0.min.js',
		], css: ['/public/css/chatbubbles.css', '/public/css/room.css']
	})
})

app.get("/chat/:room.:format?", async (req, res)=>{
	const room = req.params.room
	const messages = await db.message.findToday(room)
	res.render('chat/room.html', {
		title: `the welcoming room`,
		member: JSON.stringify(req.user, null, 2),
		user: req.user,
		messages: messages,
		counter: 0,
		js:[
			'/socket.io/socket.io.js',
			'/public/js/hogan-2.0.0.min.js',
		], css: ['/public/css/chatbubbles.css', '/public/css/room.css']
	})
})

const server = http.createServer(app).listen(config.PORT, ()=>{
	config.endpoint = `${config.domain}:${server.address().port}`
	console.log(`Listening on http://${config.endpoint}`)
})

const io = new Server(server)
const cookieParserFunction = cookieParser()
const cookieSessionFunction = cookieSession({ keys: [config.COOKIE_KEY, ':blah:'], secret: config.COOKIE_SECRET})

function getRoomFromReferrer(socket){
	if(socket.request._query.room){
		return socket.request._query.room
	}
	if(socket.handshake.headers.referer){
		return socket.handshake.headers.referer.split('/').pop()
	}
	return null
}

io.use(function(socket, next){
	cookieParserFunction(socket.request, socket.request.res, ()=>{
		cookieSessionFunction(socket.request, socket.request.res, ()=>{
			var user = socket.request.session.passport ? socket.request.session.passport.user : null
			// if(!socket.request.session.passport && socket.request._query.token === 'hubot code'){
			// 	console.log("authing hubot")
			// 	user = socket.request._query.token
			// }
			var decodedSignature = jws.decode(user)
			if(!decodedSignature){
				console.log(user, "Unauthed from io connection")
				return next(401)
			}
			db.member.findOne({token: decodedSignature.payload}, function(err, doc){
				if(doc){
					var room = getRoomFromReferrer(socket)
					if(!roster[room]){
						roster[room] = {}
					}
					roster[room][socket.id] = new Member(doc)
					next()
				}else{
					next(401)
				}
			})
		})
	})
})

io.on('connection', socket => {
	var room = getRoomFromReferrer(socket)
	var client = new SocketClient(io, socket, room, roster[room], db)
	client.connect()
	client.join(room)
	debug('connecting', socket.request._query.username)
})