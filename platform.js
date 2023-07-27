var RingCentral = require('@ringcentral/sdk').SDK

function RCPlatform(id) {
  this.extensionId = ""
  var cachePrefix = `user_${id}`

  this.rcsdk = new RingCentral({
      cachePrefix: cachePrefix,
      server: RingCentral.server.production,
      clientId: process.env.RC_CLIENT_ID_PROD,
      clientSecret:process.env.RC_CLIENT_SECRET_PROD,
      redirectUri: process.env.RC_APP_REDIRECT_URL,
    })

  this.platform = this.rcsdk.platform()
  this.platform.on(this.platform.events.loginSuccess, this.loginSuccess)
  this.platform.on(this.platform.events.logoutSuccess, this.logoutSuccess)

  var boundRefreshSuccessFunction = ( async function() {
    console.log(`WONDERFUL ext id ${this.extensionId}`)
    var tokenObj = await this.platform.auth().data()
  }).bind(this);
  this.platform.on(this.platform.events.refreshSuccess, boundRefreshSuccessFunction);

  var boundRefreshErrorFunction = ( async function() {
    console.log("Refresh failed", this.extensionId)
  }).bind(this);
  this.platform.on(this.platform.events.refreshError, boundRefreshErrorFunction);

  return this
}

RCPlatform.prototype = {
  login: async function(code){
    try{
      var resp = await this.rcsdk.login({
        code: code,
        redirectUri: process.env.RC_APP_REDIRECT_URL
      })
      var tokenObj = await resp.json()
      this.extensionId = tokenObj.owner_id
      tokenObj = await this.platform.auth().data()
      return  tokenObj
    }catch(e){
      console.log('PLATFORM LOGIN ERROR ' + e.message || 'Server cannot authorize user');
      return null
    }
  },
  logout: async function(){
    console.log("logout from platform engine")
    await this.platform.logout()
  },
  getPlatform: async function(extId){
    if (extId  !=  this.extensionId){
      console.log (`requester: ${extId}  !=  owner: ${this.extensionId}`)
      console.log("If this ever happens => SERIOUS PROBLEM. Need to check and fix!")
      return null
    }

    if (await this.platform.loggedIn()){
      return this.platform
    }else{
        console.log("BOTH TOKEN TOKENS EXPIRED")
        console.log("CAN'T REFRESH")
        return null
    }
  },
  getSDKPlatform: function(){
    return this.platform
  },
  getTokens: async function(){
    if (await this.platform.loggedIn()){
      var tokenObj = await this.platform.auth().data()
      return tokenObj
    }else{
      console.log("getTokens: BOTH TOKEN TOKENS EXPIRED => Relogin required.")
      return ''
    }

  },
  loginSuccess: function(e){
    console.log("Login success")
  },
  logoutSuccess: function(e){
    console.log("logout Success")
  },
  refreshError: function(e){
    console.log("refresh Error")
    console.log("Error " + e.message)
  }
}

module.exports = RCPlatform;
