(function(n, win){	
	n.CreateMemberView = function(container, model, delegate){
		var current = 0;
		var self = {
			container: container
			, model: model
			, template: null
			, delegate: delegate
			, hide: function(){
				this.container.style['display'] = 'none';
			}
			, show: function(){
				this.container.style['display'] = 'block';
			}
			, update: function(key, old, v){
				var member = v;
				member.backgroundStyle = member.background.length > 0 ? 'background-image: url("' + member.background + '")' : '';
				member.avatarImage = member.avatar.length > 0 ? '<img class="img-circle avatar" src="' + member.avatar + '" />' : '';
				var t = this.container.cloneNode(true);
				var template = Hogan.compile(t.outerHTML);
				var div = document.createElement('div');
				div.innerHTML = template.render(member);
				this.container.parentNode.appendChild(div.firstChild);
				this.container.parentNode.removeChild(this.container);
				this.container = document.getElementById(member.username);
				this.show();				
			}
		};
		self.model.subscribe('push', self.update.bind(self));
		return self;
	};
	n.CreateMemberGetter = function(delegate, model){
		var self = {
			delegate: delegate
			, model: model
			, fetch: function(callback){
				var xhr = new XMLHttpRequest();
				var self = this;
				var username = window.location.href.split('/');
				username = username[username.length-1];
				const url = '/members/' + username + '.json';
				xhr.open("GET", url, true);
				xhr.onload = function(e){
					this.onload(e);
					if(callback) {
						callback(e.target);
					}
				}.bind(this);
				xhr.send();
			}
			, onload: function(e){
				var response = JSON.parse(e.target.responseText);
				this.model.push(response);
			}
		};
		
		return self;
	};

	var app = (function(win, member){
		var self = {
			views: []
		};
		var members = new n.Observable.List();
		var memberView = n.CreateMemberView(document.getElementById('{{username}}'), members);
		var memberGetter = n.CreateMemberGetter(self, members);
		memberGetter.fetch();		
		return self;
	})(win);
})(module.exports, global);
