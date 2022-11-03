import os from 'os'
import cookieParser from 'cookie-parser'
import cookieSession from 'cookie-session'
import chatServer from './chat.mjs'
import web from './index.mjs'

var ifaces = os.networkInterfaces()
var addresses = []
for(var key in ifaces){
	var iface = ifaces[key]
	var address = iface.filter(function(element, index, arry){
		return !element.internal && element.family === 'IPv4'
	})
	if(address.length === 0){
		continue
	}
	address.forEach(function(a){
		addresses.push(a);
	})
}
var localhost = addresses.map(function(current, index, ary){
	return current.address
}).reduce(function(previous, current, index, ary){
	return current
})
var server = web.http.listen(web.config.PORT, function(){
	web.config.endpoint = `${web.config.domain}:${server.address().port}`
	console.log(`Listening on http://${web.config.endpoint}`)
})

export default chatServer({
	server: server,
	config: web.config,
	cookieParser,
	cookieSession,
	bus: web.bus,
	Persistence: web.persistence,
	Passport: web.Passport
})