import {v4 as uuid} from 'uuid'
function Message(body, header){
	this.header = header
	this.header.queueName = header.queueName || null
	this.header.id = header.id || uuid()
	this.body = body
}
export default Message
