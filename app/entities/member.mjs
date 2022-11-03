import moment from 'moment'
import Observable from '../../lib/observable.mjs'
var Member = function Member(obj){
	var self = Observable()
	var name = null
	Object.defineProperty(this, 'name', {
		get: function(){return name}
		, set: function(v){
			var old = name
			self.changed('name', old, v)
			name = v
		}
		, enumerable: true
	});

	let displayName = null
	Object.defineProperty(this, 'displayName', {
		get: function(){return name}
		, set: function(v){
		}
		, enumerable: true
	})
	
	var username = null
	Object.defineProperty(this, 'username', {
		get: function(){return username}
		, set: function(v){
			var old = username
			self.changed('username', old, v)
			username = v
		}
		, enumerable: true
	})


	var token = null
	Object.defineProperty(this, 'token', {
		get: function(){return token}
		, set: function(v){
			var old = token
			self.changed('token', old, v)
			token = v
		}
		, enumerable: true
	})

	var avatar = null
	Object.defineProperty(this, 'avatar', {
		get: function(){return avatar}
		, set: function(v){
			var old = avatar
			self.changed('avatar', old, v)
			avatar = v
		}
		, enumerable: true
	})
	
	var time = (new Date()).getTime();
	Object.defineProperty(this, 'time', {
		get: function(){return time;}
		, set: function(v){
			var old = time
			self.changed('time', old, v)
			time = v
		}
		, enumerable: true
	});
	for(var key in obj){
		try{
			this[key] = obj[key]
		}catch(e){
			console.error('trying to set properties', e)
		}
	}
	return this
};
function byDate(a, b){
	if(a.time === b.time) return 0;
	if(a.time > b.time) return -1;
	return 1;
}
Member.prototype = {
	humanFriendlyDate: function(date){
		return moment(date).format("dddd, MMMM DD, YYYY");
	}
	, w3cFormat: function(date){
		return moment.utc(date).format();
	}
	, canEdit: function(user){
		return user.id === this.id;
	}
};
Member.pipbot = new Member({name: 'pipbot', avatar: '/public/images/bot.png', username: 'pipbot'});
Member.sortByDate = function(list){
	return list.sort(byDate);
};

export default Member;
