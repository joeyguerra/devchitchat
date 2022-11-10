export class Member {
    constructor(obj){
        this.text = obj?.text
        this.to = obj?.to
        this.from = obj?.from
        this.time = obj?.time
        this.room = obj?.room
        for(let key in obj){
            if(!this[key]) obj[key]
        }
    }
}

export class Message {
    constructor(obj){
        this.username = obj?.username
        this.avatar = obj?.avatar
        this.name = obj?.name
        this.displayName = obj?.displayName
        for(let key in obj){
            if(!this[key]) obj[key]
        }
    }
}

export const Events = {
    MESSAGE_WAS_SUBMITTED: 'MESSAGE_WAS_SUBMITTED',
    THIS_USER_HAS_SENT_A_MESSAGE: 'THIS_USER_HAS_SENT_A_MESSAGE',
    HAS_STARTED_TYPING: 'HAS_STARTED_TYPING',
    HAS_STOPPED_TYPING: 'HAS_STOPPED_TYPING',
    CHAT_HEIGHT_HAS_CHANGED: 'CHAT_HEIGHT_HAS_CHANGED'
}
