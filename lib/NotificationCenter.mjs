const observers = []
const NotificationCenter = {
    publish(notification, publisher, info){
        const ubounds = observers.length
        for(let i = 0; i<ubounds; i++){
            if(!observers[i]) continue
            if(observers[i].notification !== notification) continue
            if(observers[i].publisher !== null && observers[i].publisher !== publisher) continue
            try{
                if(observers[i].observer[notification]) observers[i].observer[notification](publisher, info)
                else observers[i].observer(publisher, info)
            }catch(e){
                console.log([e, observers[i]])
            }
        }
    }
    , subscribe(notification, observer, publisher){
        observers.push({notification, observer, publisher})
    }
    , unsubscribe(notification, observer, publisher){
        const ubounds = observers.length
        for(let i = 0; i<ubounds; i++){
            if(observers[i].observer == observer && observers[i].notification == notification){
                observers.splice(i, 1)
                break
            }
        }
    }
    , release(){
        const observer = null
        while(observer = observers.pop()){
            if(observer.release) observer.release()
        }
    }
}

export default NotificationCenter