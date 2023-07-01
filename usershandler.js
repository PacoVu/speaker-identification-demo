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
  this.voicemailFile = ""
  this.callInfo = {
    status: "No-Call",
    metaData: {
      direction: "",
      fromNumber: "",
      toNumber: "",
      ringingDuration: "",
      talkDuration: "",
      dateTime: ""
    },
    recordingAnalysis: {
      summary: '',
      absLong: '',
      tasks: '',
      questions: '',
      trackers: '',
      conversations: ''
    }
  }
  this.analysisObj = {
    summary: '',
    absLong: '',
    tasks: '',
    questions: '',
    trackers: '',
    conversations: ''
  }
  this.callRecordingId = [] // "2264251598020"
  this.activeCalls = []
  this.contactsList = []
  this.enrollmentIds = []
  this.rcPlatform = new RCPlatform(id)
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
          await this.readAccountEnrollmentIds(p)
          await this._readContacts("")
          //await this._readOldJob(p)
          //await this.readCallRecording("s-a0d7aba213a5az188e4ba3249z59d6a40000")

          res.send('login success');
          return extensionId
        }
      } else {
        res.send('No Auth code');
        return null
      }
    },
    handleLogout: async function(){
      var platform = await this.rcPlatform.getPlatform(this.extensionId)
      if (platform){
        await this._readSubscription(platform)
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
          console.log(e.message);
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
            expiresIn: process.env.WEBHOOK_EXPIRESIN
            }
            console.log(params)
      try {
          var resp = await p.post('/restapi/v1.0/subscription', params)
          var jsonObj = await resp.json()
          this.subscriptionId = jsonObj.id
          console.log(jsonObj.id)
          console.log("Ready to receive recording notification via WebHook.")
      }catch(e) {
          console.error(e.message);
      }
    },
    // test code
    readAccountEnrollmentIds: async function(p){
      await this._readAccountEnrollmentIds(p, 1)

    },
    _readAccountEnrollmentIds: async function(p, page){
      try{
        let queryParams = {
            partial: false,
            perPage: 3,
            page: page
        }
        let endpoint = "/ai/audio/v1/enrollments"
        var resp = await p.get(endpoint, queryParams)
        var jsonObj = await resp.json()
        for (var enrollment of jsonObj.records){
          this.enrollmentIds.push(enrollment.enrollmentId)
        }
        if (jsonObj.paging.page < jsonObj.paging.totalPages){
          let page = jsonObj.paging.page + 1
          await this._readAccountEnrollmentIds(p, page)
        }
        console.log(this.enrollmentIds)
      }catch (e){
        console.log("Unable to read speakers identification.", e.message)
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
    deleteEnrollment: async function(res) {
      if (this.enrollmentData.data){
        var platform = await this.rcPlatform.getPlatform(this.extensionId)
        if (platform){
          try{
           let endpoint = `/ai/audio/v1/enrollments/${this.enrollmentData.data.enrollmentId}`
           console.log(endpoint)
           var resp = await platform.delete(endpoint)
           console.log("deleted", id)
         }catch(e){
           console.log("failed", e.message)
           //console.log(e)
         }
        }
        this.enrollmentData.status = "notfound"
        this.enrollmentData.data = undefined
      }
      res.send(this.enrollmentData)
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
        console.log("party", party)
        let enrollIdIndex = this.enrollmentIds.indexOf(party.extensionId)

        var call = this.activeCalls.find(o => o.telSessionId == body.telephonySessionId)
        if (!call){
          var call = {
            telSessionId: body.telephonySessionId,
            callRecordingId: "",
            extensionIds: []
          }
          if (enrollIdIndex >= 0)
            call.extensionIds.push(party.extensionId)
          this.activeCalls.push(call)
        }else{
          let extId = call.extensionIds.indexOf(party.extensionId)
          if (extId < 0 && enrollIdIndex >= 0)
            call.extensionIds.push(party.extensionId)
        }
        console.log("activeCalls", this.activeCalls)
        if (party.status.code == "Proceeding"){

        }else if (party.status.code == "Answered"){
          console.log("Answered")
        }else if (party.status.code == "Disconnected"){
          if (party.hasOwnProperty('recordings')){
              console.log(party.recordings[0])
              if (party.extensionId == this.extensionId){
                call.callRecordingId = party.recordings[0].id
                var thisUser = this
                console.log(this.activeCalls)
                setTimeout(function(){
                  thisUser._checkCallRecording()
                }, 60000)
              }
          }else{
              console.log("No recording")
              var call = this.activeCalls.find(o => o.telSessionId == body.telephonySessionId)
              if (call){
                this.activeCalls.splice(this.activeCalls.indexOf(call), 1)
              }
              console.log("empty activeCalls", this.activeCalls)
          }
        }
      }else{
        console.log("Remote party event. IGNORE")
      }
    },
    _checkCallRecording: async function(){
      console.log("extension id", this.extensionId)
      var platform = await this.rcPlatform.getPlatform(this.extensionId)
      if (platform){
        var thisUser = this
        const forLoop = async _ => {
          console.log('Start loop')
          for (let call of this.activeCalls) {
            console.log(call)
            if (call.callRecordingId != ""){
              try{
                console.log('check if this recording is available', call.callRecordingId)
                let endpoint = `/restapi/v1.0/account/~/recording/${call.callRecordingId}`
                console.log(endpoint)
                var resp = await platform.get(endpoint)
                let jsonObj = await resp.json()
                console.log(jsonObj)
                this.readCallRecording(call, jsonObj)
                break
              }catch (e){
                console.log("Failed", e.message)
                let errorJson = await e.response.json()
                console.log(errorJson)
                /*
                setTimeout(function(){
                  thisUser._checkCallRecording()
                }, 30000)
                */
                break
              }
            }
          }
          console.log('End loop')
        }
        forLoop()
      }
    },
    readCallRecording: async function(call, recordingObj){
      console.log("telephonySessionId", call.telSessionId)
      var call = this.activeCalls.find(o => o.telSessionId == telephonySessionId)
      var extensionIds = call.extensionIds
      console.log(extensionIds)
      var speakerCount = (extensionIds.length == 1) ? 3 : extensionIds.length + 1
      var platform = await this.rcPlatform.getPlatform(this.extensionId)
      if (platform){

        let tokens = await platform.auth().data()
        let contentUri = `${recordingObj.contentUri}?access_token=${tokens.access_token}`
        let encoding = (recordingObj.contenType == "audio/mpeg") ? "Mpeg" : "Wav"

        try{
          var params = {
               encoding: encoding,
               languageCode: "en-US",
               source: "RingCentral",
               audioType: "CallCenter",
               separateSpeakerPerChannel: false,
               enableVoiceActivityDetection: true,
               enableWordTimings: true,
               contentUri: contentUri,
               speakerCount: speakerCount,
               enrollmentIds: extensionIds,
               insights: [ "All" ]
          }
          console.log("speakerCount / params.enrollmentIds", params.speakerCount, params.enrollmentIds)
          let endpoint = `/ai/insights/v1/async/analyze-interaction?webhook=${process.env.AI_WEBHOOK_ADDRESS}?extId=${this.extensionId}%26telSessionId=${call.telSessionId}`

          console.log("endpoint", endpoint)
          var resp = await platform.post(endpoint, params)
          var jsonObj = await resp.json()
          console.log(jsonObj)
          this.callInfo.status = "Processing"
         }catch(e){
           console.log("failed", JSON.stringify(e))
           console.log(e.message)
         }
      }
    },
    processAIResponse: function(body, telSessionId){
      console.log(telSessionId)
      var call = this.activeCalls.find(o => o.telSessionId == telSessionId)
      console.log("Remove this call", call)
      if (call){
        this.activeCalls.splice(this.activeCalls.indexOf(call), 1)
        console.log("active call removed")
      }

      let jsonObj = JSON.parse(body)
      if (jsonObj.status == "Fail"){
        console.log("Fail", jsonObj)
        this.callInfo.status = "Completed"
        return
      }
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
      this.callInfo.status = "Completed"
      this.callInfo.recordingAnalysis = analysisObj
    },
    readCallInfo: async function(res){
      /*
      this.callInfo = {
        status: "No-Call",
        metaData: {
          direction: "",
          fromNumber: "",
          toNumber: "",
          ringingDuration: "",
          talkDuration: "",
          dateTime: ""
        },
        recordingAnalysis: {
          summary: '',
          absLong: '',
          tasks: '',
          questions: '',
          trackers: '',
          conversations: ''
        }
      }
      */
      res.send(this.callInfo)
    },
    _identifySpeaker: function(speakerId){
      if (speakerId === this.extensionId){
        return this.userName
      }else{
        return `Speaker ${speakerId}`
      }
    },
    _readContacts: async function(uri){
      var platform = await this.rcPlatform.getPlatform(this.extensionId)
      if (platform){
        try {
          var params = { perPage: 1000 }
          var endpoint = '/restapi/v1.0/account/~/extension/~/address-book/contact'
          if (uri != "") {
            endpoint = uri
            params = null
          }
          //console.log(endpoint)
          var resp = await platform.get(endpoint, params)
          var jsonObj = await resp.json()
          for (var record of jsonObj.records){
            var fullName = (record.firstName) ? `${record.firstName} ` : ""
            fullName += (record.lastName) ? record.lastName : ""

            var contact = {
              name: fullName,
              phoneNumbers: []
            }
            if (record.hasOwnProperty('mobilePhone')){
                contact.phoneNumbers.push(record.mobilePhone)
            }else if (record.hasOwnProperty('businessPhone')){
                contact.phoneNumbers.push(record.businessPhone)
            }else if (record.hasOwnProperty('companyPhone')){
                contact.phoneNumbers.push(record.companyPhone)
            }
            if (contact.phoneNumbers.length > 0)
              this.contactsList.push(contact)
          }
          if (jsonObj.navigation.hasOwnProperty('nextPage')){
            console.log("Read next page")
            await new Promise(r => setTimeout(r, 1000));
            await this._readContacts(sonObj.navigation.nextPage.uri)
          }else{
            console.log(this.contactsList)
          }
        }catch(e){
          console.log("Failed?", e.message)
        }
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
