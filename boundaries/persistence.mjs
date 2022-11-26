import Datastore from '../lib/db.mjs'
import Member from '../models/Member.mjs'
import Message from '../models/message.mjs'
let config = null

function replaceLastMember(id, member){
	lastMemberDb.remove({}, {multi: true}, function(err, numRemoved){
		if(err) console.log('error replaceLastMember: ', err, id)
	})
	member.id = id
	lastMemberDb.insert(member, function(err, docs){
		if(err) console.log('error replaceLastMember inserting: ', err, id)
	})
}
let Db = {
	memberWasDeleted: function memberWasDeleted(id, callback){
		db.remove({id: id}, {multi:false}, function(err, numRemoved){
			if(callback) callback(err, numRemoved)
		})
		lastMemberDb.remove({id: id}, {multi:false}, function(err, numRemoved){})
	}
	, message: {
		save: function(message, callback){
			messageDb.insert(message, function(err, doc){
				delete message.id
				if(err) console.log('save new message error:', err)
				if(callback) callback(err, doc)
			})
		}
		, findToday: function(room, callback){
			var today = new Date()
			today = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0)
			messageDb.find({room: {$eq: room}, time: {$gte: today.getTime()}}).sort({time: -1}).exec(function(err, docs){
				if(err) return callback(err, null)
				if(docs.length === 0) return callback(null, null)
				var list = []
				docs.forEach(function(doc){
					list.push(new Message(doc))
				})
				callback(null, list)
			})
			
		},
		findPrevious24Hours: function findPrevious24Hours(room, callback){
			var d = (new Date())
			d.setDate(d.getDate() - 1)
			messageDb.find({$where: function(){
				return this.room === room && this.time >= d.getTime()
			}}).sort({time: -1}).limit(200).exec(function(err, docs){
				if(err){
					return callback(err, null)
				}
				if(docs.length === 0) {
					return callback(null, null)
				}
				var list = docs.map(function(doc){
					return new Message(doc)
				})
				callback(null, list.reverse())
			})
		}
		, refresh: function(){
			messageDb.loadDatabase()
		}
	}
	, member:{
		findOne: function findOne(query, callback){
			db.findOne(query, function(err, doc){
				if(err) return callback(err, doc)
				if(!doc) return callback(null, null)
				callback(err, new Member(doc))
			})
		}
		, find: function find(query, sortBy, callback){
			if(sortBy){
				db.find(query).sort(sortBy).exec(function(err, docs){
					if(err) return callback(err, null)
					var list = []
					for(var i = 0; i < docs.length; i++){
						list.push(new Member(docs[i]))
					}
					callback(null, list)
				})
			}else{
				db.find(query, function(err, docs){
					if(err) return callback(err, null)
					var list = []
					for(var i = 0; i < docs.length; i++){
						list.push(new Member(docs[i]))
					}
					callback(null, list)
				})
			}
		}
		, findFirst: function(callback){
			db.find({}).sort({username: 1}).limit(1).exec(function(err, docs){
				if(err) return callback(err, null)
				if(docs.length === 0) return callback(null, null)
				callback(null, new Member(docs[0]))
			})
		}
		, findMostRecentlyActive: function(query, callback){
			db.find(query).sort({active: -1}).limit(1).exec(function(err, docs){
				if(err) return callback(err, null)
				if(docs.length === 0) return callback(null, null)
				callback(null, new Member(docs[0]))
			})
		}
		, findActive: function(callback){
			var today = new Date()
			today.setMonth(today.getMonth()-1)
			db.find(callback)
		}
	}
	, lastMemberWasDeleted: function lastMemberWasDeleted(member){
		var member = null
		var monthAgo = new Date()
		monthAgo.setMonth(monthAgo.getMonth()-1)
		db.find({"active >=":monthAgo.getTime()}, function(err, docs){
			if(err) throw err
			if(docs.length === 0) return
			var list = []
			for(var i = 0; i < docs.length; i++){
				list.push(new Member(docs[i]))
			}
			member = member[0]
			member.id = member.id
			lastMemberDb.insert(member, function(err, doc){
				if(err) throw err
			})
		})
	}
	, memberWasUpdated: function memberWasUpdated(id, member, callback){
		db.update({id: id}, {name: member.name, page: member.page, active: (new Date()).getTime()
				, time: (new Date()).getTime(), token: member.token, username: member.username, avatar: member.avatar
				, background: member.background}, function(err, updated){
			if(err) console.log('error during memberWasUpdated: ', id, err, updated)
			if(callback) callback(err, updated)
		})
		replaceLastMember(id, member)
	}
	, updateAvatar: function(id, avatar, callback){
		db.update({id: id}, {$set: {avatar: avatar}}, {}, function(err, updated){
			if(err) console.log('error during updateAvatar: ', id, err, updated)
			console.log('updated avatar', updated)
			if(callback) callback(err, {id: id, avatar: avatar, updated: updated})
		})
	}
	, updateBackground: function(id, background, callback){
		db.update({id: id}, {$set: {background: background}}, {}, function(err, updated){
			if(err) console.log('error during updatedBackground: ', id, err, updated)
			console.log('updated background', updated)
			if(callback) callback(err, {id: id, background: background, updated: updated})
		})
	}
	, newMemberWasSubmitted: function newMemberWasSubmitted(member, callback){
		db.insert(member, function(err, doc){
			if(err){
				console.log('newMemberWasSubmitted error:', err)
			}
			lastMemberDb.remove({}, {multi: true}, function(err, numRemoved){
				doc.id = doc.id
				lastMemberDb.insert(doc, function(err, docs){
					if(err) console.log('newMemberWasSubmitted error inserting last member:', err)
				})
				if(callback) callback(err, doc)
			})
		})
	}
	, getLastMember: function getLastMember(callback){
		lastMemberDb.findOne({}, function(err, doc){
			callback(new Member(doc))
		})
	}
	, refresh: function(){
		db.loadDatabase()
		lastMemberDb.loadDatabase()
	}
}

let db = null
let lastMemberDb = null
let messageDb = null
export default function(c){
	config = c
	db = new Datastore({filename: config.DATA_PATH + '/members.db', autoload: true})
	lastMemberDb = new Datastore({filename: config.DATA_PATH + '/lastmember.db', autoload: true})
	messageDb = new Datastore({filename: config.DATA_PATH + '/messages.db', autoload: true})
	return Db
}
