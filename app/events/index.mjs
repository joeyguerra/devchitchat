function Event(body){
	this.body = body
	this.header = {
		id: (new Date()).getTime()
		, endpoint: {port: 8126, host: 'localhost'}
		, token: 'testing'
		, name: 'Event'
	}
	this.type = 'event'
}
function MemberWasUpdated(member){
	Event.apply(this, [member])
	this.header.name = 'MemberWasUpdated'
}

function MemberWasCreated(member){
	Event.apply(this, [member])
	this.header.name = 'MemberWasCreated'
}

function MemberWasDeleted(member){
	Event.apply(this, [member])
	this.header.name = 'MemberWasDeleted'
}

function AvatarWasChanged(member){
	Event.apply(this, [member])
	this.header.name = 'AvatarWasChanged'
}

function BackgroundWasChanged(member){
	Event.apply(this, [member])
	this.header.name = 'BackgroundWasChanged'
}

function MessageWasSent(member){
	Event.apply(this, [member])
	this.header.name = 'MessageWasSent'
}
function NewChatMessageWasSent(message){
	Event.apply(this, [message])
	this.header.name = 'NewChatMessageWasSent'
}
function UserHasLeft(message){
	Event.apply(this, [message])
	this.header.name = 'UserHasLeft'
}
function UserHasConnected(message){
	Event.apply(this, [message])
	this.header.name = 'UserHasConnected'
}

export default {
	MemberWasUpdated
	, MemberWasCreated
	, MemberWasDeleted
	, AvatarWasChanged
	, BackgroundWasChanged
	, MessageWasSent
	, NewChatMessageWasSent
	, UserHasLeft
	, UserHasConnected
	, Event
}
