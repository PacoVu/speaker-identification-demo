var path = require('path')
var util = require('util')

require('dotenv').load();

var express = require('express');
var session = require('express-session');

var app = express();
app.use(session({ secret: 'this-is-a-secret-token', cookie: { maxAge: 24 * 60 * 60 * 1000 }}));
var bodyParser = require('body-parser');
var urlencoded = bodyParser.urlencoded({extended: false})

app.use(express.static(path.join(__dirname, 'public')))
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'ejs')
app.use(urlencoded);

var port = process.env.PORT || 5000

var server = require('http').createServer(app);
server.listen(port);
console.log("listen to port " + port)
var router = require('./router');

app.get('/', function (req, res) {
  if (req.session.extensionId != 0)
    router.logout(req, res)
  else{
    res.render('index')
  }
})
app.get('/index', function (req, res) {
  if (req.query.n != undefined && req.query.n == 1){
    router.logout(req, res)
  }else {
    res.render('index')
  }
})

app.get('/login', function (req, res) {
  req.session.cookie = { maxAge: 24 * 60 * 60 * 1000 }
  if (!req.session.hasOwnProperty("userId"))
    req.session.userId = 0;
    if (!req.session.hasOwnProperty("extensionId"))
      req.session.extensionId = 0;
  console.log("SESSION:" + JSON.stringify(req.session))
  router.loadLogin(req, res)
})

app.get('/logout', function (req, res) {
  console.log('logout why here?')
  router.logout(req, res)
})

app.get('/loadmainpage', function (req, res) {
  console.log('loadMainPage')
  if (req.session.extensionId != 0)
    router.loadMainPage(req, res)
  else{
    res.render('index')
  }
})

app.get('/about', function (req, res) {
  router.loadAboutPage(req, res)
})

app.get('/oauth2callback', function(req, res){
  console.log("callback redirected")
  router.login(req, res)
})

app.post('/webhookcallback', function(req, res) {
    if(req.headers.hasOwnProperty("validation-token")) {
        res.setHeader('Validation-Token', req.headers['validation-token']);
        res.statusCode = 200;
        res.end();
    }else{
        var body = []
        req.on('data', function(chunk) {
            body.push(chunk);
        }).on('end', function() {
            body = Buffer.concat(body).toString();
            if (body != ""){
              var jsonObj = JSON.parse(body)
              console.log("jsonObj.event", jsonObj.event)
              if (jsonObj.event.indexOf('/voicemail') > -1){
                router.processVoicemailNotification(jsonObj.body, jsonObj.ownerId, jsonObj.subscriptionId)
              }else if (jsonObj.event.indexOf('/sessions') > -1){
                router.processCallNotification(jsonObj.body, jsonObj.ownerId, jsonObj.subscriptionId)
              }
            }else{
              console.log("Empty body?")
            }
        });
    }
})

app.post("/ai-callback", function(req, res) {
  res.statusCode = 200
  res.end("")
  var body = [];
  req.on('data', function(chunk) {
      body.push(chunk);
  }).on('end', function() {
      body = Buffer.concat(body).toString();
      //console.log("RESULT", body)
      console.log("telSessionId", req.query.telSessionId)
      if (req.query.extId){
        router.processAIResponse(body, req.query.extId, req.query.telSessionId)
      }
  });
})

app.get('/enrollment', function (req, res) {
  if (req.session.extensionId != 0)
    router.readEnrollment(req, res)
  else{
    res.render('index')
  }
})
app.get('/voicemai-file', function (req, res) {
  if (req.session.extensionId != 0)
    router.getVoicemailFile(req, res)
  else{
    res.render('index')
  }
})

app.get ('/reset-voicemail-file', function (req, res) {
  if (req.session.extensionId != 0)
    router.resetVoicemailFile(req, res)
  else{
    res.render('index')
  }
})

app.post('/start-enrollment', function(req, res){
  console.log("start-enrollment", req.body.voicemailId)
  if (req.session.extensionId != 0)
    router.startEnrollment(req, res)
  else{
    res.render('index')
  }
});

app.get('/voicemails', function(req, res){
  console.log(req.query)
  var file = req.query.fileName;
  res.download(file);
});


app.get('/call-info', function (req, res) {
  if (req.session.extensionId != 0)
    router.readCallInfo(req, res)
  else{
    res.render('index')
  }
})

app.get('/read', function (req, res) {
  router.readVoiceMail(req, res)
})
