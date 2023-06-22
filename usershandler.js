var fs = require('fs')
var request=require('request');
var async = require("async");
const RCPlatform = require('./platform.js')
require('dotenv').load()



function User(id) {
  this.id = id;
  this.extensionId = 0;
  this.extensionNumber = ""
  this.userName = ""
  this.phoneNumbers = []
  this.subscriptionId = ""
  this.enrollmentData = {
    status: "notfound",
    data: undefined
  }
  this.voicemailFile = "" //"voicemails/1993176771016.mp3"
  this.analysisObj = {
    summary: '',
    absLong: '',
    tasks: '',
    questions: '',
    trackers: '',
    conversations: ''
  }
  this.callRecordingId = ""
  this.rcPlatform = new RCPlatform()
  return this
}

var engine = User.prototype = {
    setExtensionId: function(id) {
      this.extensionId = id
    },
    setUserName: function (userName){
      this.userName = userName
    },
    getUserId: function(){
      return this.id
    },
    getExtensionId: function(){
      return this.extensionId
    },
    getSubscriptionId: function(){
      return this.subscriptionId
    },
    getUserName: function(){
      return this.userName;
    },
    getPlatform: function(){
      return this.rcPlatform.getSDKPlatform()
    },
    loadMainPage: function(req, res){
      var extId = this.getExtensionId()
      res.render('main', {
              userName: this.getUserName(),
              userId: req.session.userId,
              extensionId: req.session.extensionId
            })
    },
    login: async function(req, res){
      var thisReq = req
      if (req.query.code) {
        var thisUser = this
        var extensionId = await this.rcPlatform.login(req.query.code)
        if (extensionId){
          this.extensionId = extensionId
          req.session.extensionId = extensionId;
          var p = await this.rcPlatform.getPlatform(this.extensionId)
          await this._readExtensionPhoneNumber(p)
          await this._readExtensionInfo(p)
          await this._readSubscription(p)
          await this._createSubscription(p)
          res.send('login success');
          return extensionId
        }
      } else {
        res.send('No Auth code');
        return null
      }
    },
    _readExtensionPhoneNumber: async function(p){
      this.phoneNumbers = []
      try {
        var resp = await p.get("/restapi/v1.0/account/~/extension/~/phone-number", {
          "perPage": 100,
          "usageType": ["DirectNumber"]
        })
        var jsonObj = await resp.json()
        var count = jsonObj.records.length
        for (var record of jsonObj.records){
          //console.log(record)
          //console.log("==")
          if (record.type == "VoiceFax" || record.type == "VoiceOnly"){
            this.phoneNumbers.push(record.phoneNumber)
          }
        }
      console.log(this.phoneNumbers)
      } catch (e) {
        console.log("_readExtensionPhoneNumber() - Cannot read phone numbers!!!")
        console.error(e.message);
      }
    },
    _readExtensionInfo: async function(p){
      try {
        var resp = await p.get("/restapi/v1.0/account/~/extension/~/")
        var jsonObj = await resp.json()
        this.extensionNumber = jsonObj.extensionNumber
        this.userName = jsonObj.contact.firstName + " " + jsonObj.contact.lastName
        console.log(this.userName)
      } catch (e) {
        console.log("login() - Failed")
        console.error(e.message);
      }
    },
    _readSubscription: async function(p){
      try {
          var resp = await p.get('/restapi/v1.0/subscription')
          var jsonObj = await resp.json()
          for (record of jsonObj.records){
            console.log("record", record)
            await p.delete(`/restapi/v1.0/subscription/${record.id}`)
          }
      }catch(e) {
          console.error(e);
          throw e;
      }
    },
    _createSubscription: async function(p){
      var params = {
            eventFilters: [
              '/restapi/v1.0/account/~/extension/~/telephony/sessions'
            ],
            deliveryMode: {
                transportType: "WebHook",
                address: process.env.DELIVERY_MODE_ADDRESS
              },
            expiresIn: 3600
            }
            console.log(params)
      try {
          var resp = await p.post('/restapi/v1.0/subscription', params)
          var jsonObj = await resp.json()
          this.subscriptionId = jsonObj.id
          console.log(jsonObj.id)
          console.log("Ready to receive recording notification via WebHook.")
      }catch(e) {
          console.error(e);
          throw e;
      }
    },
    getVoicemailFile: function(res){
      res.send(this.voicemailFile)
    },
    resetVoicemailFile: function(res){
      if (this.voicemailFile != ""){
        let file = `./${this.voicemailFile}`
        if (fs.existsSync(file))
          fs.unlinkSync(file)
        this.voicemailFile = ""
      }
      res.send({status: "ok"})
    },
    readEnrollment: async function(req, res) {
      //await this._readEnrollment(res, 1)
      var platform = await this.rcPlatform.getPlatform(this.extensionId)
      if (platform){
        try{
          let endpoint = `/ai/audio/v1/enrollments/${this.extensionId}`
          console.log(endpoint)
          var resp = await platform.get(endpoint)
          var jsonObj = await resp.json()
          this.enrollmentData.status = "ok"
          this.enrollmentData.data = jsonObj
          res.send(this.enrollmentData)
        }catch(e){
          console.log("failed", e.message)
          this.enrollmentData.status = "notfound"
          res.send(this.enrollmentData)
        }
      }
    },
    deleteEnrollment: async function(id) {
      var platform = await this.rcPlatform.getPlatform(this.extensionId)
      if (platform){
        try{
         let endpoint = `/ai/audio/v1/enrollments/${id}`
         console.log(endpoint)
         var resp = await platform.delete(endpoint)
         console.log("deleted", id)
       }catch(e){
         console.log("failed", e.message)
         //console.log(e)
       }
      }
    },
    notifyVoicemailReady: function(fileName){
      this.voicemailFile = fileName
    },
    startEnrollment: function(req, res){
      //this.enrollmentD = ""
      //this.doEnrollment(req.body.voicemailId)
      console.log("Start enrollment")
      this.enrollmentData.status = "proceeding"
      res.send(this.enrollmentData)
      this.doEnrollment(`./${this.voicemailFile}`)
    },
    doEnrollment: async function(fileName){
      console.log("doEnrollment", fileName)
      //this.voicemailFile = fileName
      const base64data = fs.readFileSync(fileName, {encoding: 'base64'});
      var params = {
            encoding: "Mpeg",
            languageCode: "en-US",
            content: base64data
          }
      var platform = await this.rcPlatform.getPlatform(this.extensionId)
      if (platform){
        //var resp = undefined
        console.log(this.enrollmentData)
        if (this.enrollmentData.data){
          console.log("Update")
          var resp = await platform.patch(`/ai/audio/v1/enrollments/${this.extensionId}`, params)
        }else{
          console.log("Create new enrollment")
          params['enrollmentId'] = this.extensionId
          var resp = await platform.post(`/ai/audio/v1/enrollments`, params)
        }
        var jsonObj = await resp.json()
        this.enrollmentData.data = jsonObj
        this.enrollmentData.status = "ok"
        console.log(this.enrollmentData)
        console.log("DONE => Delete the voicemail file")
        let file = `./${this.voicemailFile}`
        if (fs.existsSync(file))
          fs.unlinkSync(file)
      }else{
        console.log("platform error")
        this.enrollmentData.status = "failed"
      }
    },
    processNotification: async function(body){
      var call = undefined
      var party = body.parties[0]
      if (party.status.code == "Setup"){
        // check and change
        console.log("Ignore call in Setup stage")
        return
      }

      if (party.extensionId){
        if (party.status.code == "Disconnected"){
          if (party.hasOwnProperty('recordings')){
              console.log(party.recordings[0])
              this.callRecordingId = party.recordings[0].id
              console.log("callRecordingId", this.callRecordingId)
              var thisUser = this
              setTimeout(function(){
                thisUser.readCallRecording()
              },25000)
          }else{
              console.log("No recording")
          }
        }
      }else{
        console.log("Remote party event. IGNORE")
      }
    },
    readCallRecording: async function(){
      var platform = await this.rcPlatform.getPlatform(this.extensionId)
      if (platform){
        let tokens = await platform.auth().data()
        let contentUri = `https://media.ringcentral.com/restapi/v1.0/account/~/recording/${this.callRecordingId}/content?access_token=${tokens.access_token}`
        try{
          var params = {
               encoding: "Mpeg",
               languageCode: "en-US",
               source: "RingCentral",
               audioType: "CallCenter",
               separateSpeakerPerChannel: false,
               enableVoiceActivityDetection: true,
               enableWordTimings: true,
               contentUri: contentUri,
               speakerCount: 2,
               enrollmentIds: [this.extensionId.toString()],
               insights: [ "All" ]
          }
          console.log(params)
          var resp = await platform.post(`/ai/insights/v1/async/analyze-interaction?webhook=${process.env.AI_WEBHOOK_ADDRESS}?extId=${this.extensionId}`, params)
          var jsonObj = await resp.json()
          console.log(jsonObj)
         }catch(e){
           console.log("failed", JSON.stringify(e))
           console.log(e.message)
         }
      }
    },
    processAIResponse: function(body){
      let jsonObj = JSON.parse(body)
      var analysisObj = {
        summary: '',
        absLong: '',
        tasks: '',
        questions: '',
        trackers: '',
        conversations: ''
      }
      var summary = ''
      var absLong = ''
      var tasks = ''
      var questions = ''

      for (var utterance of jsonObj.response.utteranceInsights){
          var item = `<div><b>${this._identifySpeaker(utterance.speakerId)}:</b> ${utterance.text}</div>`
          analysisObj.conversations += item
      }

      for (var insight of jsonObj.response.conversationalInsights){
          switch (insight.name){
            case "ExtractiveSummary":
              for (var item of insight.values){
                //summary += `${item.value}<br/>`
                analysisObj.summary += `<div><i>${formatDuration(item.start)}</i> - ${item.value}</div>`
              }
              break
            case "Tasks":
              for (var item of insight.values){
                analysisObj.tasks += `<div><i>${formatDuration(item.start)}</i> - ${item.value}</div>`
              }
              break
            case "AbstractiveSummaryLong":
              for (var item of insight.values){
                //absLong += `${item.value}<br/>`
                analysisObj.absLong += `<div><i>${formatDuration(item.start)}</i> - ${item.value}</div>`
              }
              break
            default:
              break
          }
      }

      for (var insight of jsonObj.response.speakerInsights.insights){
        switch (insight.name){
          case "QuestionsAsked":
            for (var item of insight.values){
              analysisObj.questions += `<div><i>Speaker ${this._identifySpeaker(item.speakerId)}</i></div>`
              for (var q of item.questions)
                //questions += `<i>${formatDuration(q.start)}</i> - ${q.text}<br/>`
                analysisObj.questions += `<div><i>${formatDuration(q.start)}</i> - ${q.text}</div>`
            }
            break
          default:
            break
        }
      }


      for (var insight of jsonObj.response.trackerInsights){
        switch (insight.name){
          case "fd6a41ce-1e10-420f-aef0-15ef96509ce3":
            var sp = ''
            for (var item of insight.values){
              if (sp == ''){
                sp = parseInt(item.speakerId)
                sp += 1
                analysisObj.trackers += `<div><i>Speaker ${this._identifySpeaker(item.speakerId)}</i></div>`
              }
              analysisObj.trackers += `<div><i>${formatDuration(item.start)}</i> - ${item.text}</div>`
            }
            break
          default:
            break
        }
      }
      console.log('analysisObj', analysisObj)
      this.analysisObj = analysisObj
    },
    readCallInfo: function(res){
      res.send(this.analysisObj)
    },
    _identifySpeaker: function(speakerId){
      if (speakerId === this.extensionId){
        return this.userName
      }else{
        return speakerId
      }
    }
}
module.exports = User;
///
function formatCallDuration(dur){
  var duration = ""
  if (dur > 3600){
    var h = Math.floor(dur / 3600)
    dur = dur % 3600
    var m = Math.floor(dur / 60)
    m = (m>9) ? m : ("0" + m)
    dur = dur % 60
    var s = (dur>9) ? dur : ("0" + dur)
    return h + ":" + m + ":" + s
  }else if (dur > 60){
    var m = Math.floor(dur / 60)
    dur %= 60
    var s = (dur>9) ? dur : ("0" + dur)
    return m + ":" + s
  }else{
    var s = (dur>9) ? dur : ("0" + dur)
    return "0:" + s
  }
}

function padLeft(input, char, length) {
  var str = `${input}`;
  var padding = [];
  for (var i = str.length; i < length; i += 1) {
    padding.push(char);
  }
  return padding.join('') + str;
}

function formatDuration(duration) {
  if (Number.isNaN(duration)) {
    return '--:--';
  }
  var intDuration = typeof duration === 'number' ?
    Math.round(duration) :
    parseInt(duration, 10);

  var seconds = padLeft(intDuration % 60, '0', 2);
  var minutes = padLeft(Math.floor(intDuration / 60) % 60, '0', 2);
  var hours = Math.floor(intDuration / 3600) % 24;
  var string = '';
  if (hours > 0) {
    string = string + padLeft(hours, '0', 2)   + ':';
  }
  string = string + minutes + ':' + seconds;
  return string;
}
