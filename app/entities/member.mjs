import moment from 'moment'
import {makeKeyValueObservable} from '../../lib/Observable.mjs'

class User {
	constructor(obj){
		this.name = obj?.name
		this.displayName = obj?.displayName ?? this.name
		this.username = obj?.username
		this.token = obj?.token
		this.avatar = obj?.avatar
		this.time = obj?.time ?? Date.now()
		this.id = obj?.id
	}
}
const Member = function Member(obj){
	return makeKeyValueObservable(new User(obj))
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
Member.unknown = new Member()
Member.sortByDate = function(list){
	return list.sort(byDate);
};

export default Member;
