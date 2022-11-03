(function(n, win){
	n.View.Textarea = function(container, controller, model){
		n.View.apply(this, [container, controller, model]);
		this.offset = {top: container.offsetTop};
		Object.defineProperty(this, 'height', {
			get: function(){return parseInt(container.style.height.replace('px', ''), 10);}
			, set: function(v){ container.style.height = v+'px';}
			, enumerable: true
		});
		this.controller.setView(this);
	};
	n.View.Mixin(n.View.Textarea.prototype);
	
	n.Controller.Textarea = function(delegate, model){
		n.Controller.apply(this, [delegate, model]);
	};
	n.Controller.Textarea.prototype = {
		resize: function(viewportSize){
			this.view.height = viewportSize.h - this.view.offset.top - 40;
		}
	};
	n.Controller.Mixin(n.Controller.Textarea.prototype);

	n.View.Avatar = function(container, controller, model){
		n.View.apply(this, [container, controller, model]);
		this.controller.setView(this);
		this.model.subscribe('avatar', this.update.bind(this));
	};
	n.View.Avatar.prototype = {
		update: function(key, old, v){
			this.container.src = v;
		}
	};
	n.View.Mixin(n.View.Avatar.prototype);

	n.View.Background = function(container, controller, model){
		n.View.apply(this, [container, controller, model]);
		this.controller.setView(this);
		this.model.subscribe('background', this.update.bind(this));
	};
	n.View.Background.prototype = {
		update: function(key, old, v){
			this.container.src = v;
		}
	};
	n.View.Mixin(n.View.Background.prototype);

	n.View.ImageUpload = function(container, controller, model){
		n.View.apply(this, [container, controller, model]);
		this.controller.setView(this);
	};
	n.View.Mixin(n.View.ImageUpload.prototype);

	n.Controller.ImageUpload = function(delegate, model){
		n.Controller.apply(this, [delegate, model]);
	};
	n.Controller.ImageUpload.prototype = {
		setView: function(v){
			n.Controller.prototype.setView.call(this, v);
			this.view.container.addEventListener('change', this, true);
		}
		, handleEvent: function(e){
			var file = e.target.files[0];
			this.upload(e.target.name, file);
		}
		, onload: function(e){
			this.view.container.value = null;
			this.delegate.fileWasUploaded(e.target);
		}
		, upload: function(name, file){
			var xhr = new XMLHttpRequest();
			var formData = new FormData();
			var self = this;
			xhr.open("POST", this.delegate.fileUploadUrl, true);
			xhr.onload = function(e){self.onload(e);};
			formData.append(name, file);
			xhr.send(formData);
		}
	}
	n.Controller.Mixin(n.Controller.ImageUpload.prototype);

	var app = (function(win){
		var member = new n.Observable({name: '', page: '', username: '', avatar: '', background: ''});
		var self = {
			views:[]
			, handleEvent: function(e){
				if(this[e.type]) this[e.type](e);
			}
			, resize: function(e){
				this.views[0].controller.resize({h: e.target.document.documentElement.clientHeight, w: e.target.document.documentElement.clientWidth});
			}
			, fileUploadUrl: '/member/' + document.getElementById('id').value + '/avatars.json'
			, fileWasUploaded: function(target){
				var m = JSON.parse(target.responseText);
				var avatar = "//{host}{avatar}".replace(/{host}/, window.location.host).replace(/{avatar}/, m.avatar);
				member.avatar = avatar;
			}
		};
		var backgroundHandler = {
			fileUploadUrl: '/member/' + document.getElementById('id').value + '/backgrounds.json'
			, fileWasUploaded: function(target){
				var m = JSON.parse(target.responseText);
				var background = "//{host}{background}".replace(/{host}/, window.location.host).replace(/{background}/, m.background);
				member.background = background;
			}
		};
		//self.views.push(new n.View.Textarea(document.querySelector('textarea'), new n.Controller.Textarea(self, member), member));
		self.views.push(new n.View.ImageUpload(document.getElementById('newAvatar'), new n.Controller.ImageUpload(self, member), member));
		self.views.push(new n.View.ImageUpload(document.getElementById('newBackground'), new n.Controller.ImageUpload(backgroundHandler, member), member));
		self.views.push(new n.View.Avatar(document.getElementById('model.avatar'), new n.Controller(self, member), member));
		self.views.push(new n.View.Background(document.getElementById('model.background'), new n.Controller(backgroundHandler, member), member));
		//win.addEventListener('resize', this, true);
		//self.views[0].controller.resize({h: window.document.documentElement.clientHeight});
	})(win);
})(module.exports, global);
