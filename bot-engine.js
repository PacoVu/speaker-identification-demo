const url = require('url')
const fs = require('fs')
const https = require('https')

function BotEngine() {
  const RC = require('@ringcentral/sdk').SDK
  const rcsdk = new RC({
      server: RC.server.production,
      clientId: process.env.RC_CLIENT_ID_PROD,
      clientSecret:process.env.RC_CLIENT_SECRET_PROD
    })
  this.platform = rcsdk.platform();
  this.subscriptionId = ""
  return this
}

BotEngine.prototype = {
    _login: async function(){
      console.log("Bot is logging in")
      await this.platform.login({ jwt: process.env.BOT_JWT })
      this.platform.on(this.platform.events.loginSuccess, async function(e){
        console.log("Bot login successful")
      });

    },
    start: async function(){
      console.log("Bot start automatically.")
        var thisUser = this
        var loggedIn = await this.platform.loggedIn()
        if (!loggedIn)
          await this._login()
        await this.readSubscription()
        await this.createSubscription()

    },
    createSubscription: async function(){
      var params = {
            eventFilters: [
              '/restapi/v1.0/account/~/extension/~/voicemail'
            ],
            deliveryMode: {
                transportType: "WebHook",
                address: process.env.DELIVERY_MODE_ADDRESS
              },
            expiresIn: process.env.WEBHOOK_EXPIRESIN
            }
            console.log(params)
      try {
          var resp = await this.platform.post('/restapi/v1.0/subscription', params)
          var jsonObj = await resp.json()
          this.subscriptionId = jsonObj.id
          console.log(jsonObj.id)
          console.log("Ready to receive voicemail notification via WebHook.")
      }catch(e) {
          console.error(e);
          throw e;
      }
    },
    readVoiceMail: async function(user, body){
      console.log(body)
      for (attachment of body.attachments){
        if (attachment.type == "AudioRecording"){
          var u = url.parse(attachment.uri)
          var fileName = "voicemails/"
          if (attachment.contentType == "audio/mpeg")
              fileName += attachment.id + ".mp3"
          else
              fileName += attachment.id + ".wav"
          var loggedIn = await this.platform.loggedIn()
          if (!loggedIn)
            await this._login()
          var tokenObj = await this.platform.auth().data()
          var accessToken = tokenObj.access_token
          var thisObj = this
          download(u.host, u.path, accessToken, fileName, function(){
            console.log("Save atttachment to the local machine.")
            console.log("user extension id",user.extensionId)
            thisObj.deleteVoicemailMessage(body.id)
            //user.doEnrollment(fileName)
            user.notifyVoicemailReady(fileName)
          })
        }
      }
    },
    deleteVoicemailMessage: async function(messageId){
      try {
        var loggedIn = await this.platform.loggedIn()
        if (!loggedIn)
          await this._login()
        let endpoint =  `/restapi/v1.0/account/~/extension/~/message-store/${messageId}`
        this.platform.delete(endpoint)
        console.log/"Message deleted"
      }catch (e){
        console.log("Delete message failed", e.message)
      }
    },
    readSubscription: async function(){
      try {
          var resp = await this.platform.get('/restapi/v1.0/subscription')
          var jsonObj = await resp.json()
          for (record of jsonObj.records){
            console.log("record", record)
            await this.platform.delete(`/restapi/v1.0/subscription/${record.id}`)
            console.log(`Deleted ${record.id}`)
          }
      }catch(e) {
          console.error(e);
          throw e;
      }
    }
}

module.exports = BotEngine;

const download = function(domain, path, accessToken, dest, cb) {
    var file = fs.createWriteStream(dest);
    var options = {
          host: domain,
          path: path,
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
      }
    const req = https.request(options, res => {
    console.log(`statusCode: ${res.statusCode}`)
    res.pipe(file);
    file.on('finish', function() {
        file.close(cb);
    });
  })
  req.on('error', error => {
    console.error(error)
  })
  req.end()
}
