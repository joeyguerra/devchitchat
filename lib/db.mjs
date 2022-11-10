import {ClassicLevel} from 'classic-level'
import Message from '../app/entities/message.mjs'
import Member from '../app/entities/Member.mjs'

class Document {
    #name
    #db
    constructor(name, db){
        this.#name = name
        this.#db = db
    }
    #map(name, value){
        if(name == 'message') return new Message(value)
        if(name == 'member') return new Member(value)
    }
    async findOne(query, cb = (err, member)=>{}){
        let found = null
        let key = Object.keys(query)[0]
        for await (const value of this.#db.values()){
            if(value[key] == query[key]) {
                found = this.#map(this.#name, value)
                break
            }
        }
        cb(null, found)
        return found
    }
    async find(query, options, cb = (err, docs)=>{}){
        const found = []
        for await (const value of this.#db.values()){
            found.push(this.#map(this.#name, value))
        }
        cb(null, found)
        return found
    }
    async findActive(cb = (err, docs)=>{}){
        let today = new Date()
        const found = []
        for await (const value of this.#db.values()){
            if(value.active > today.getTime()) {
                found.push(this.#map(this.#name, value))
            }
        }
        cb(null, found)
        return found
    }
    async save(body, cb = (err, doc)=>{}){
        const err = await this.#db.put(`${this.#name}:${body.id}`, body)
        if(err) {
            cb(err)
            return
        }
        cb(null, body)
        return body
    }
    async findToday(room, cb = (err, doc)=>{}){
        let today = new Date()
        let found = []
        today = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0)
        for await (const value of this.#db.values()){
            if(value.room == room && value.time >= today.getTime()) {
                found.push(this.#map(this.#name, value))
            }
        }
        found.sort((a, b) => {
            if(b.time == a.time) return 0
            if(b.time > a.time) return 1
            return -1
        })
        if(found.lengh == 0) return cb(null, found)
        found = this.group(found)
        cb(null, found)
        return found
    }
    async findPrevious24Hours(room, cb = (err, doc)=>{}){
        const today = new Date()
        today.setDate(today.getDate() - 1)
        let found = []
        let count = 0
        for await (const value of this.#db.values()){
            if(value.room == room && value.time >= today.getTime()) {
                count++
                found.push(this.#map(this.#name, value))
            }
            if(count > 200) break
        }
        found.sort((a, b) => a.time > b.time ? 1 : -1)
        if(found.lengh == 0) return cb(null, found)
        found = this.group(found)
        cb(null, found)
        return found
    }
    group(messages){
        const grouped = []
        for(let i = 0; i < messages.length; i++){
            const current = messages[i]
            const next = messages[i+1]
            if(current.from.username == next?.from.username){
                if(!grouped[grouped.length - 1]) grouped.push({messages: []})
                const gMessages = grouped[grouped.length - 1]
                gMessages?.messages.push(current)
            } else {
                const gMessages = grouped[grouped.length - 1]
                gMessages?.messages.push(current)
                if(next) grouped.push({messages: []})
            }
        }
        return grouped
    }
    async remove(id, cb = (err, doc)=>{}){
        const err = await this.#db.del(`${this.#name}:${id}`)
        cb(err, 1)
        return 1
    }
}
class Db {
    #db
    constructor(fileName, options = {valueEncoding: 'json'}){
        this.#db = new ClassicLevel(fileName, options)
        this.member = new Document('member', this.#db)
        this.message = new Document('message', this.#db)
    }
    async newMemberWasSubmitted(member, cb = (err, doc)=>{}){
        const body = await this.member.save(member)
        this.#db.put(`last_member`, body)
        cb(null, body)
        return body
    }
    async memberWasUpdated(id, member, cb = (err, doc)=>{}){
        const doc = await this.member.save({id: id, name: member.name, page: member.page, active: (new Date()).getTime()
                , time: (new Date()).getTime(), token: member.token, username: member.username, avatar: member.avatar
                , background: member.background})
        cb(null, doc)
        return doc
    }
    async memberWasDeleted(id, cb = (err, doc)=>{}){
        const err = await this.member.remove(id, cb)
        return err
    }
    async updateAvatar(id, avatar, cb = (err, doc)=>{}){
        const m = await this.member.findOne({id: id})
        m.avatar = avatar
        const doc = await this.member.save(m)
        cb(null, doc)
        return doc
    }
    async updateBackground(id, background, cb = (err, doc)=>{}){
        const m = await this.member.findOne({id: id})
        m.background = background
        const doc = await this.member.save(m)
        cb(null, doc)
        return doc
    }
    async *allTheThings(){
        for await (const value of this.#db.values()){
            yield value
        }
    }
}

export default Db