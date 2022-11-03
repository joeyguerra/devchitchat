function Folder(files){
	this.files = files;
}
Folder.prototype = {
	canEdit: function(user){
		return user !== null;
	}
};
Folder.isValid = function(fileName){
	if(fileName === null) return false;
	if(fileName.length > 30) return false;
	return /^\w+(\.\w+)?$/.test(fileName);
};

export default Folder;