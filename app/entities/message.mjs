import moment from 'moment'
var Message = function(obj){
	this.text = null
	this.time = (new Date()).getTime()
	this.from = null
	this.room = null
	this.id = null
	for(var key in obj){
		this[key] = obj[key]
	}
	return this
}
function byDate(a, b){
	if(a.time === b.time) return 0
	if(a.time > b.time) return -1
	return 1
}
Message.prototype = {
	humanFriendlyDate: function(date){
		return moment(date).format("dddd, MMMM DD, YYYY hh:mm:ss a")
	}
	, w3cFormat: function(date){
		return moment.utc(date).format()
	}
}
Message.sortByDate = function(list){
	return list.sort(byDate)
}

export default Message
