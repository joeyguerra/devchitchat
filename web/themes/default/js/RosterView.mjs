
export default class RoasterView {
    constructor(container, model, delegate){
        this.container = container
        this.model = model
        this.delegate = delegate
		this.template = this.container.querySelector('li:first-child').cloneNode(true)
        this.container.removeChild(this.container.querySelector('li:first-child'))
		this.model.observe('push', this.userJoined.bind(this))
		this.model.observe('pop', this.userLeft.bind(this))
		this.model.observe('remove', this.userLeft.bind(this))
    }
    joined(member){
        console.trace('joined', member)
        if(!this.model.find(m => m.username == member.username)){
            this.model.push(member)
        }
    }
    left(member){
        console.trace('left', member)
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
        if(this.container.querySelector(`#${v.username}`)) return
        const elem = this.template.cloneNode(true)
        elem.style.display = 'block'
        elem.id = v.username
        elem.querySelector('img').src = v.avatar
        elem.querySelector('figcaption').innerHTML = v.displayName.split(' ').map(n => n.substring(0, 1).toUpperCase()).join('')
        const first = this.container.querySelector('li:last-child')
        if(first){
            this.container.insertBefore(elem, first)
        } else {
            this.container.appendChild(elem)
        }
    }
    userLeft(key, old, v){
        const remove = this.container.querySelector(`#${old.username}`)
        if(!remove) return
        this.container.removeChild(remove);
    }
}