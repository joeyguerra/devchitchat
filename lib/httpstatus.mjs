export default function HttpStatus(code){
	this.code = code
	var self = this
	function messageFromCode(c){
		var message = 'Ok'
		switch(c){
			case(401):
				message = "Unauthorized"
				break
			case(404):
				message = "Not Found"
				break
			case(500):
				message = "Internal Server Error"
				break
		}
		return message
	}
	Object.defineProperty(this, 'message', {
		get: function(){
			return messageFromCode(self.code)
		}
		, enumerable: true
	})
}