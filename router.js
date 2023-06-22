const User = require('./usershandler.js')
require('dotenv').load()
var BotEngine = require('./bot-engine')

var async = require("async");
var users = []

const botEngine = new BotEngine()

botEngine.start()

function getUserIndex(id){
  //console.log("USERS LENGTH:" + users.length)
  for (var i=0; i<users.length; i++){
    var user = users[i]
    if (user != null){
      //console.log("USER ID:" + user.getUserId())
      if (id == user.getUserId()){
        return i
      }
    }
  }
  return -1
}

function getUserIndexByExtensionId(extId){
  //console.log("USERS LENGTH:" + users.length)
  for (var i=0; i<users.length; i++){
    var user = users[i]
    //console.log("EXTENSiON ID:" + user.getExtensionId())
    if (extId == user.getExtensionId()){
      return i
    }
  }
  return -1
}

function getUserByPhoneNumber(phoneNumber){
  //console.log("USERS LENGTH:" + users.length)
  for (var i=0; i<users.length; i++){
    var user = users[i]
    var index = user.phoneNumbers.indexOf(phoneNumber)
    if (index >= 0){
        return user
    }
  }
  return undefined
}

function getUserByExtensionNumber(extensionNumber){
  //console.log("USERS LENGTH:" + users.length)
  for (var i=0; i<users.length; i++){
    var user = users[i]
    if (user.extensionNumber == extensionNumber){
        return user
    }
  }
  return undefined
}

var router = module.exports = {
  loadLogin: function(req, res){
    if (req.session.userId == 0 || req.session.extensionId == 0) {
      var id = new Date().getTime()
      req.session.userId = id;
      var user = new User(id)
      users.push(user)
      var p = user.getPlatform()
      if (p != null){
        res.render('login', {
          authorize_uri: p.loginUrl({
            brandId: process.env.RINGCENTRAL_BRAND_ID,
            redirectUri: process.env.RC_APP_REDIRECT_URL
          }),
          redirect_uri: process.env.RC_APP_REDIRECT_URL,
          token_json: ''
        });
      }
    }else{
      var index = getUserIndex(req.session.userId)
      if (index >= 0)
        router.loadMainPage(req, res)
      else{
        this.forceLogin(req, res)
      }
    }
  },
  forceLogin: function(req, res){
    req.session.destroy();
    res.render('index')
  },
  login: async function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    let extensionId = await users[index].login(req, res)
    if (extensionId){
        var duplicatedUser = users.filter(u => u.extensionId == extensionId)
        if (duplicatedUser && duplicatedUser.length > 1){
          console.log("Has duplicated users")
          for (var dupUser of duplicatedUser){
            if (dupUser.userId != req.query.state){
              var remUserIndex = users.findIndex(u => u.userId == dupUser.userId)
              if (remUserIndex >= 0){
                console.log("remove dupUser")
                users.splice(remUserIndex, 1)
              }
            }
          }
        }
    }else{
        // login failed => remove this user and force relogin
        console.log("login failed => remove this user and force relogin")
        users.splice(index, 1)
    }
  },
  logout: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0){
      return this.forceLogin(req, res)
    }
    var platform = users[index].getPlatform()
    if (platform != null){
      platform.logout()
      users[index] = null
      users.splice(index, 1);
      this.forceLogin(req, res)
    }else{
        users[index] = null
        users.splice(index, 1);
        thisObj.forceLogin(req, res)
    }
  },
  loadAboutPage: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    res.render('about', {
      userName: users[index].getUserName()
    })
  },
  loadMainPage: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)

    var formattedNumber =  formatPhoneNumber(users[index].phoneNumbers[0])
    res.render('main', {
                userName: users[index].getUserName(),
                phoneNumber: formattedNumber,
                userId: req.session.userId,
                extensionId: req.session.extensionId
              })
  },
  getVoicemailFile: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].getVoicemailFile(res)
  },
  resetVoicemailFile: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].resetVoicemailFile(res)
  },
  startEnrollment: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].startEnrollment(req, res)
  },
  readEnrollment: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].readEnrollment(req, res)
  },
  readVoiceMail: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].readVoiceMail(req, res)
  },
  processVoicemailNotification: function(body, extensionId, subscriptionId){
    if (subscriptionId == botEngine.subscriptionId){
      let phoneNumber = body.from.phoneNumber
      if (phoneNumber){
        var user = getUserByPhoneNumber(phoneNumber)
        if (user){
          botEngine.readVoiceMail(user, body)
        }else{
          console.log("Not found???", body)
        }
      }else{
        let extensionNumber = body.from.extensionNumber
        if (extensionNumber){
          var user = getUserByExtensionNumber(extensionNumber)
          if (user){
            botEngine.readVoiceMail(user, body)
          }else{
            console.log("Not found???", body)
          }
        }
      }
    }
  },
  processCallNotification: function(body, extensionId, subscriptionId){
    var index = getUserIndexByExtensionId(extensionId)
    if (index < 0)
        return
    if (users[index].getSubscriptionId() == subscriptionId)
        users[index].processNotification(body)
    else
        console.log("not my subscription")
  },
  processAIResponse: function (body, extId){
    var index = getUserIndexByExtensionId(extId)
    if (index < 0)
        return
    users[index].processAIResponse(body)
  },
  readCallInfo: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].readCallInfo(res)
  },
  createVoicemailUri: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].createVoicemailUri(req, res)
  }
}

function formatPhoneNumber(phoneNumberString) {
  var cleaned = ('' + phoneNumberString).replace(/\D/g, '')
  var match = cleaned.match(/^(1|)?(\d{3})(\d{3})(\d{4})$/)
  if (match) {
    var intlCode = (match[1] ? '+1 ' : '')
    return [intlCode, '(', match[2], ') ', match[3], '-', match[4]].join('')
  }
  return phoneNumberString
}
