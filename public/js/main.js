var callInsights = undefined
var voicemailId = "" //"voicemails/1993176771016.mp3"

window.addEventListener('message', (e) => {
  const data = e.data;
  if (data.call && data.call.direction == 'Outbound'){
    if (data) {
      switch (data.type) {
        case 'rc-call-end-notify':
          // Start polling for voicemail content
          resetCurrentVoicemail()
          break;
        default:
          break;
        }
    }
  }
});

function init(){
  readEnrollment()
  pollCallInfo()
  //pollEnrollmentContent()
}

function resetCurrentVoicemail(){
  var source = document.getElementById('voicemail_player');
  source.src = ``
  $("#enroll-btn").attr("disabled", true);
  var getting = $.get( "reset-voicemail-file" );
  getting.done(function( res ) {
    if (res.status == "ok") {
      pollVoicemailFile()
    }else{
      alert("err")
    }
  });
}

function updateEnrollmentData(data){
  var html = "<ul>"
  html += `<li>Enrollment Id: ${data.enrollmentId}</li>`
  html += `<li>Enrollment Complete:  ${data.enrollmentComplete}</li>`
  html += `<li>Total Speech Duration: ${data.totalSpeechDuration.toFixed(2)}</li>`
  html += `<li>Total Enrollment Duration: ${data.totalEnrollDuration.toFixed(2)}</li>`
  html += `<li>Enrollment Quality: ${data.enrollmentQuality}</li>`
  html += "</ul>"
  $("#enrollment-info").html(html)
}

function startEnrollment(){
  var posting = $.post('start-enrollment', { voicemailId: voicemailId })
  posting.done(function( res ) {
    if (res.status == "proceeding") {
      $("#enrollment-info").html("Processing!")
      var source = document.getElementById('voicemail_player');
      source.src = ``
      $("#enroll-btn").attr("disabled", true);
      window.setTimeout(function (){
        readEnrollment()
      }, 10000)
    }else{
      alert("err")
    }
  });
  posting.fail(function(res){
    alert(res.status);
  });
}

function readEnrollment(){
  console.log("readEnrollment")
  var getting = $.get( 'enrollment' );
  getting.done(function( res ) {
    if (res.status == "ok") {
      updateEnrollmentData(res.data)
    }else if (res.status == "proceeding"){
      $("#enrollment-info").html("Processing!")
      $("#enroll-btn").attr("disabled", true);
      window.setTimeout(function (){
        readEnrollment()
      }, 30000)
    }else if (res.status == "notfound"){
      $("#enrollment-info").html("Not enrolled!")
      window.setTimeout(function (){
        readEnrollment()
      }, 30000)
    }else{
      alert("err")
    }
  });
}

function pollVoicemailFile(){
  let url = "voicemai-file"
  var getting = $.get( url );
  getting.done(function( res ) {
    if (res != ""){
      var source = document.getElementById('voicemail_player');
      console.log(res)
      source.src = `/voicemails?fileName=${res}`
      voicemailId = res
      $("#enroll-btn").attr("disabled", false);
    }else{
      window.setTimeout(function (){
        pollVoicemailFile()
      }, 30000)
    }
  });
}
function pollCallInfo(){
  var url = 'call-info'
  var getting = $.get( url );
  getting.done(function( res ) {
    console.log(res.status)
    if (res.status == "No-Call"){
      //$("#status").html("No Call")
      setPollingPeriod(60000)
    }else if (res.status == "Active"){
      // Display call metadata
      //$("#status").html("Active")
      setPollingPeriod(40000)
    }else if (res.status == "Processing"){
      // Display call metadata
      $("#status").html("Analyzing")
      setPollingPeriod(20000)
    }else if (res.status == "Completed"){
      $("#status").html("Completed")
      callInsights = res.recordingAnalysis
      setInsights(document.getElementById("call-analysis"))
      setPollingPeriod(60000)
    }
  });
}

function setPollingPeriod(waitTime){
  console.log(waitTime)
  window.setTimeout(function (){
        pollCallInfo()
  }, waitTime)
}
function setInsights(elm){
  console.log("call when new content")
  if (callInsights){
    let value = elm.options[elm.selectedIndex].value
    $("#insights").html(callInsights[`${value}`])
  }
}

function showSampleText(){
  if($("#sample-text").is(":visible")){
    //$("sample-text-btn").value = "Show sample text"
    $("#sample-text-btn").prop('value', 'Show sample text');
    $("#sample-text").hide()

  } else{
    //$("sample-text-btn").value = "Hide sample text"
    $("#sample-text-btn").prop('value', 'Hide sample text');
    $("#sample-text").show()
  }
}


/*
function poEnrollment(id){
  var url = `enrollment?id=${id}`
  var getting = $.get( url );
  getting.done(function( res ) {
    if (res.status == "ok") {
      updateEnrollmentData(res.data)
    }else{
      alert("err")
    }
  });
}
*/
