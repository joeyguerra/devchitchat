
export default class RoasterView {
    constructor(container, model, delegate){
        this.container = container
        this.model = model
        this.delegate = delegate
		this.template = this.container.querySelector('li:first-child')
		this.template.style.display = 'none'
		this.container.style.display = 'block'
		this.model.observe('push', this.userJoined.bind(this))
		this.model.observe('pop', this.userLeft.bind(this))
		this.model.observe('remove', this.userLeft.bind(this))
    }
    joined(member){
        if(!this.model.find(m => m.username == member.username)){
            this.model.push(member)
        }
    }
    left(member){
        this.model.remove(m => m.username == member.username)
    }
    connected(nicknames){
        for(let name in nicknames){
            let member = nicknames[name]
            if(this.model.find(m => m.username == member.username)) continue
            this.model.push(member)
        }
    }
    userJoined(key, old, v){
        console.log(v)
        if(this.container.querySelector(`#${v.username}`)) return
        const elem = this.template.cloneNode(true)
        elem.style.display = 'block'
        elem.id = v.username
        elem.querySelector('img').src = v.avatar
        elem.querySelector('figcaption').innerHTML = v.displayName
        this.container.insertBefore(elem, this.template)
    }
    userLeft(key, old, v){
        const remove = this.container.querySelector(`#${old.username}`)
        if(!remove) return
        this.container.removeChild(remove);
    }
}