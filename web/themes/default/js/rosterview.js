(function(n, win){
	n.RosterView = function(container, model, delegate){
		var self = {
			container: container
			, model: model
			, delegate: delegate
			, joined(member){
				if(!this.model.find((i, m) => m.username == member.username)){
					this.model.push(member)
				}
			}
			, left(member){
				this.model.remove((i, m) => m.username == member.username)
			}
			, connected(nicknames){
				for(var name in nicknames){
					let member = nicknames[name]
					if(this.model.find((i, m)=> m.username == member.username)) continue
					this.model.push(member)
				}
			}
		};

		var parent = container.querySelector('ul');
		var template = container.querySelector('ul li:first-child');
		var joinedTemplate = Hogan.compile(template.innerHTML);
		template.style.display = 'none';
		function userJoined(key, old, v){
			if(document.getElementById(v.username)){
				return
			}
			var elem = template.cloneNode(true)
			elem.style.display = 'block'
			elem.id = v.username
			elem.innerHTML = joinedTemplate.render(v)
			elem.querySelector('img').src = v.avatar
			elem.querySelector('figcaption').innerHTML = v.displayName
			parent.insertBefore(elem, template)
		}
		function userLeft(key, old, v){
			var remove = parent.querySelector('#' + old.username);
			if(remove === null){
				return;
			}
			parent.removeChild(remove);
		}
		self.container.style.display = 'block';
		self.model.subscribe('push', userJoined);
		self.model.subscribe('pop', userLeft);
		self.model.subscribe('remove', userLeft);
		return self;
	};
})(module.exports, global)