
export class ObservableArray extends Array{
    #observers = {}
    constructor(...args){
        super(...args)
    }
    observe(key, observer){
        if(!this.#observers[key]) this.#observers[key] = []
        this.#observers[key].push(observer)
    }
    stopObserving(key, observer){
        if(!this.#observers[key]) return
        const i = this.#observers[key].findIndex(o => o === observer)
        if(i == -1) return
        const del = this.#observers[key].splice(i, 1)
    }
    async #changed(key, previousValue, value){
        if(!this.#observers[key]) return
        for await(let o of this.#observers[key]){
            if(typeof o == 'function') {
                await o(key, previousValue, value)
            } else {
                await o.update(key, previousValue, value)
            }
        }
    }
    async push(item){
        super.push(item)
        await this.#changed('push', null, item)
    }
    async remove(d){
        let deleted = []
        let i = 0
        for await (let item of this){
            if(d(item, i)){
                deleted = this.splice(i, 1)
                await this.#changed('remove', deleted[0], i)
                break;
            }
            i++
        }
        return deleted[0]
      }
      async removeMany(d){
        let deleted = []
        let i = 0
        for await (let item of this){
            if(d(item, i)){
                deleted.push(this.splice(i, 1)[0])
                await this.#changed('remove', deleted[deleted.length-1], i)
            }
            i++
        }
        return deleted
      }  
}

export const makeKeyValueObservable = observable => {
    let cached = Object.assign({}, observable)
    let proxied = {}
    let observers = {}
    const everyKeyObservers = []
    const changed = (key, old, value) => {
        if(everyKeyObservers.length > 0) {
            everyKeyObservers.forEach(o=>{
                if(o.update) o.update(key, old, value)
                else o(key, old, value)
            })
        }
        if(!observers[key]) return
        observers[key]?.forEach(o=>{
            if(o.update) o.update(key, old, value)
            else o(key, old, value)
        })
    }
    const api = {
        observe(key, observer){
            if(typeof key == 'function') {
                everyKeyObservers.push(key)
                return
            }
            if(!observers[key]) observers[key] = []
            observers[key].push(observer)
        },
        stopObserving(key, observer){
            if(typeof key == 'function') {
                const i = everyKeyObservers.findIndex(o => o === key)
                if(i == -1) return
                everyKeyObservers.splice(i, 1)
                return
            }
            if(!observers[key]) return
            const i = observers[key].findIndex(o => o === observer)
            if(i == -1) return
            observers[key].splice(i, 1)
        }
    }
    
    const makeProxy = obj => {
        if(!obj) obj = {}
        let p = new Proxy(obj, {
            get(target, prop, receiver){
                return obj[prop]
            },
            set(target, prop, value){
                if(undefined == target[prop] && Array.isArray(value)) {
                    value = new ObservableArray(...value)
                } else if(undefined == target[prop] && typeof value == 'object') {
                    value = makeKeyValueObservable(value)
                }
                const old = obj[prop]
                obj[prop] = value
                changed(prop, old, value)
                return true
            }
        })
        return Object.assign(p, api)
    }

    Object.keys(cached).forEach(key => {
        if(Array.isArray(cached[key])){
            proxied[key] = new ObservableArray(...cached[key])
        }else if(typeof cached[key] == 'object'){
            proxied[key] = makeProxy(cached[key])
        } else {
            proxied[key] = cached[key]
        }
    })

    return makeProxy(proxied)
}

export default {
	makeKeyValueObservable,
	ObservableArray
}