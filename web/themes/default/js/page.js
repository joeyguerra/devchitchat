(function(n, win){
	var imageUploader = {
		container: null
		, model: null
		, handleEvent: function(e){
			this.upload(e.target.name, e.target.files);
		}
		, onload: function(e){
			this.container.value = null;
			this.fileWasUploaded(e.target);
		}
		, upload: function(name, files){
			var self = this;
			var xhr = new XMLHttpRequest();
			var formData = new FormData();
			xhr.open("POST", self.fileUploadUrl, true);
			xhr.onload = function(e){self.onload(e);};
			for(var i = 0; i < files.length;i++){
				formData.append(name + i, files[i]);
			}
			xhr.send(formData);		
		}
		, fileUploadUrl: '/page/images.json'
		, fileWasUploaded: function(target){
			var m = JSON.parse(target.responseText);
			m.files.map(function(file){
				file = "//{host}{file}".replace(/{host}/, window.location.host).replace(/{file}/, file);
				model.push(file);
			});
		}
	};
	var contentView = {
		container: null
		, imageWasClicked: function(publisher, info){
			this.addImage(info);
		}
		, addImage: function(image){
			var imageTag = '<img src="' + image.src + '" />';
			var start = this.container.selectionStart;
			var end = imageTag.length;
			var front = this.container.value.substring(0, start);
			var back = this.container.value.substring(start, this.container.value.length);
			this.container.value = front + imageTag + back;
		}
	};
	var imageListView = {
		container: null
		, model: null
		, update: function(key, old, v){
			this.container.innerHTML += this.newItem(v);
		}
		, newItem: function(v){
			return '<li><img src="' + v + '" width="100" /></li>';
		}
		, handleEvent: function(e){
			if(!e.target.src) return;
			n.NotificationCenter.publish('imageWasClicked', this, e.target);
		}
	};
	
	contentView.container = document.getElementById('contents');
	imageUploader.container = document.getElementById('images');
	imageUploader.container.addEventListener('change', imageUploader, true);
	imageListView.container = document.getElementById('listOfImages');
	imageListView.container.addEventListener('mouseup', imageListView, true);
	
	n.NotificationCenter.subscribe('imageWasClicked', contentView, null);
	var model = new n.Observable.List();
	model.contents = null;
	model.subscribe('push', imageListView.update.bind(imageListView));
})(module.exports, global);
