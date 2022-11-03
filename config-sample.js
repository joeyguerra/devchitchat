export default {
	dataPath: __dirname + '/data',
	port: process.env.PORT || 5000,
    site: {
      title: 'devchitchat'
    },
	theme: 'default',
	cookie: {
		key: 'devchitchat',
		secret: 'some secret password for signed cookies'
    },
	secret: "Milo of Croton carried the calf as it grew into a bull.",
	hubot:{
		token: ""
	},
	passport: {
		github: {
			clientID: '',
			clientSecret: '',
			callbackURL: 'http://localhost:5000/github/callback'		
		},
		twitter: {
			consumerKey: "",
			consumerSecret: "",
			callbackUrl: "http://localhost:5000/twitter/callback"
		}
	}
};