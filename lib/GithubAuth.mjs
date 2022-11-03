import {InternalOAuthError, Strategy} from 'passport-oauth2'

class Profile {
    constructor(obj){
        this.id = obj?.id
        this.nodeId = obj?.node_id
        this.displayName = obj?.name
        this.username = obj?.login
        this.profileUrl = obj?.html_url
        if(obj?.email) this.emails = [{value: obj.email }]
        if(obj?.avatar_url) this.photos = [{value: obj.avatar_url}]
        this.provider = 'github'
    }
}

export default class GithubAuth extends Strategy {
    constructor(options, verify){
        super(Object.assign(options, {
            authorizationURL: 'https://github.com/login/oauth/authorize',
            tokenURL: 'https://github.com/login/oauth/access_token',
            customHeaders: {
                'User-Agent': 'passport-github-jg'
            }
        }), verify)
        this.name = 'github'
        this._oauth2.useAuthorizationHeaderforGET(true)
        this._allRawEmails = false
        this.userProfile.bind(this)
    }
    userProfile(accessToken, done){
        this._oauth2.get('https://api.github.com/user', accessToken, (err, body, res)=>{
            if(err) return done(new InternalOAuthError('Failed to fetch user profile', err))
            let profile = null
            try{ profile = new Profile(JSON.parse(body)) }catch(e){}
            if(!profile) return done(new Error('Failed to parse user profile'))

            let canAccessEmail = false
            let scopes = this._scope
            if(typeof scopes == 'string') scopes = scopes.split(this._scopeSeparator)
            if(Array.isArray(scopes)){
                canAccessEmail = scopes.some(s => s == 'user' || s == 'user:email')
            }
            if(!canAccessEmail) return done(null, profile)

            this._oauth2.get('https://api.github.com/user/emails', accessToken, (err, body, res)=>{
                if(err) return done(new InternalOAuthError('Failed to fetch user emails', err))
                let emails = null
                try{ emails = JSON.parse(body) }catch(e){}
                if(!emails || !emails.length) return done(new Error('Failed to fetch user emails'))
                if(this._allRawEmails){
                    profile.emails = emails.map(e => {
                        e.value = e.email
                        delete e.email
                        return e
                    })
                } else {
                    profile.emails = emails.filter(e => e.primary).map(e => {
                        return {value: e.email}
                    })
                }
                done(null, profile)
            })
        })
    }
}