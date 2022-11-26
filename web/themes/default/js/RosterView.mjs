
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
    #prepareForDomId(id){
        return id.replace(':', '_')
    }
    joined(member){
        const found = this.model.find(m => m.id == member.id)
        if(!found){
            this.model.push(member)
        }
    }
    left(member){
        this.model.remove(m => m.id == member.id)
    }
    connected(nicknames){
        for(let name in nicknames){
            let member = nicknames[name]
            if(this.model.find(m => m.id == member.id)) continue
            this.model.push(member)
        }
    }
    userJoined(key, old, v){
        const domId = this.#prepareForDomId(v.id)
        if(this.container.querySelector(`#${domId}`)) return
        const elem = this.template.cloneNode(true)
        elem.style.display = 'block'
        elem.id = domId
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
        const domId = this.#prepareForDomId(old.id)
        let remove = null
        try{
            remove = this.container.querySelector(`#${domId}`)
        }catch(e){
            console.log(e)
        }
        if(!remove) return
        this.container.removeChild(remove);
    }
}