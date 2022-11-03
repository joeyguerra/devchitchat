import {InternalOAuthError, Strategy} from 'passport-oauth2'
import {URL} from 'node:url'

class Profile {
    constructor(obj){
        this.id = obj?.id
        this.username = obj?.username
        this.displayName = obj.name
        if(obj?.profile_image_url) this.photos = [{ value: obj.profile_image_url }]
        this.provider = 'twitter'
        this.profileUrl = obj.url
    }
}
function createAuthError(err){
    let authError =null
    let error = null
    try{
        error = JSON.parse(err.data)
    }catch(e){
        authError = new InternalOAuthError('Failed to fetch user profile', err)
    }
    if(!authError && error && error.errors && error.errors.length){
        authError = new Error(error.errors[0].message, error.errors[0].code)
    }
    if(!authError && error){
        authError = error
    }
    return authError
}
export default class TwitterAuth extends Strategy {
    constructor(options, verify){
        options = Object.assign(options, {
            authorizationURL: 'https://twitter.com/i/oauth2/authorize',
            tokenURL: 'https://api.twitter.com/2/oauth2/token',
            sessionKey: 'oauth:twitter',
            scope: Array.from(new Set(['users.read', 'tweet.read', ...(options.scope || [])])),
            pkce: true,
            state: true,
            clientType: 'private',
            customHeaders: {
                ...{
                    Authorization: `Basic ${Buffer.from(`${options.clientID}:${options.clientSecret}`).toString('base64')}`
                },
                ...(options.customHeaders || {})
            }
        })
        super(options, verify)
        this.name = 'twitter'
        this.userProfileUrl = options?.userProfileUrl ?? 'https://api.twitter.com/2/users/me?user.fields=profile_image_url,url'
    }
    userProfile(accessToken, done){
        let url = new URL(this.userProfileUrl)
        url.query = url.query || {}
        this._oauth2.useAuthorizationHeaderforGET(true)
        this._oauth2.get(url.toString(), accessToken, (err, body, res)=>{
            if(err && err.data) return done(createAuthError(err))
            let profile = null
            try{
                const obj = JSON.parse(body)
                profile = new Profile(obj.data)
                profile._raw = body
                profile._json = obj.data
            }catch(e){
                return done(new Error('Failed to parse user profile'))
            }
            done(null, profile)
        })
    }
    parseErrorResponse(body, status){
        let json = null
        try{
            json = JSON.parse(body)
            if(Array.isArray(json.errors) && json.errors.length > 0){
                return new Error(json.errors[0].message)
            }
        }catch(e){
            return new Error(body)
        }
    }
}