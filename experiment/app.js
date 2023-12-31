global.__base = __dirname + '/';

const
  use_https = true,
  argv = require('minimist')(process.argv.slice(2)),
  https = require('https'),
  fs = require('fs'),
  app = require('express')(),
  _ = require('lodash'),
  parser = require('xmldom').DOMParser,
  XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest,
  sendPostRequest = require('request').post;

var gameport;
var researchers = ['A4SSYO0HDVD4E', 'A1BOIDKD33QSDK', 'A1MMCS8S8CTWKU', 'A1MMCS8S8CTWKV', 'A1MMCS8S8CTWKS', 'A1RFS3YXD1ZIKG'];
var blockResearcher = true;

if (argv.gameport) {
  var gameport = argv.gameport;
  console.log('using port ' + gameport);
} else {
  var gameport = 8860;
  console.log('no gameport specified: using ' + gameport.toString() + '\nUse the --gameport flag to change');
}

try {
  var privateKey = fs.readFileSync('/etc/letsencrypt/live/cogtoolslab.org/privkey.pem'),
    certificate = fs.readFileSync('/etc/letsencrypt/live/cogtoolslab.org/cert.pem'),
    intermed = fs.readFileSync('/etc/letsencrypt/live/cogtoolslab.org/chain.pem'),
    options = { key: privateKey, cert: certificate, ca: intermed },
    server = require('https').createServer(options, app).listen(gameport),
    io = require('socket.io')(server);
} catch (err) {
  console.log("cannot find SSL certificates; falling back to http");
  var server = app.listen(gameport),
    io = require('socket.io')(server);
}

// serve stuff that the client requests
app.get('/*', (req, res) => {
  serveFile(req, res);
});


io.on('connection', function (socket) {

  // Recover query string information and set condition
  var hs = socket.request;
  var query = require('url').parse(hs.headers.referer, true).query;
  // change to prolific participant ID
  var id = query.PROLIFIC_PID;

  var isResearcher = _.includes(researchers, id);

  if (!id || isResearcher && !blockResearcher){
    initializeWithTrials(socket)
  //} else if (!valid_id(id)) {
  //  console.log('invalid id, blocked');
  } else {
    checkPreviousParticipant(id, (exists) => {
      return exists ? handleDuplicate(socket) : initializeWithTrials(socket);
    });
  }

  // Send client stims
 // initializeWithTrials(socket);

  socket.on('currentData', function (data) {
    console.log(data.dataType + ' data: ' + JSON.stringify(data));
    writeDataToMongo(data);
  });
  
});

FORBIDDEN_FILES = ["auth.json"]

// security patch from 2021
var serveFile = function(req, res) {
  var fileName = req.params[0];
  if(FORBIDDEN_FILES.includes(fileName)){
    // Don't serve files that contain secrets
    console.log("Forbidden file requested:" + filename);
    return;
  }
  console.log('\t :: Express :: file requested: ' + fileName);
  return res.sendFile(fileName, {root: __dirname});
};

// var handleDuplicate = function (req, res) {
//   console.log("duplicate id: blocking request");
//   res.sendFile('duplicate.html', { root: __dirname });
//   return res.redirect('/duplicate.html');
// };

var handleDuplicate = function (socket) {
  console.log("duplicate id: blocking request");
  socket.emit('redirect', '/duplicate.html');
};

var valid_id = function (id) {
  return (id.length <= 15 && id.length >= 12) || id.length == 41;
};

var handleInvalidID = function (socket) {
  console.log("invalid id: blocking request");
  socket.emit('redirect', '/invalid.html');
};

function checkPreviousParticipant(workerId, callback) {
  var p = { 'workerId': workerId };
  var postData = {
    dbname: 'block_construction_replication2023',
    query: p,
    projection: { '_id': 1 }
  };
  sendPostRequest(
    'http://localhost:8000/db/exists',
    { json: postData },
    (error, res, body) => {
      try {
        if (!error && res.statusCode === 200) {
          console.log("success! Received data " + JSON.stringify(body));
          callback(body);
        } else {
          throw `${error}`;
        }
      }
      catch (err) {
        console.log(err);
        console.log('no database; allowing participant to continue');
        return callback(false);
      }
    }
  );
};

function initializeWithTrials(socket) {
  var gameid = UUID();
  // this colname is used in fetching stimuli from stims database
  var colname = 'block-construction-silhouette-exp02';
  sendPostRequest('http://localhost:8000/db/getstims', {
    json: {
      dbname: 'stimuli',
      colname: colname,
      numTrials: 1,
      gameid: gameid
    }
  }, (error, res, body) => {
    if (!error && res.statusCode === 200) {
      // send trial list (and id) to client
      var packet = {
        gameid: gameid,
        trials: body.meta,
        version: body.version
      };
      socket.emit('onConnected', packet);
    } else {
      console.log(`error getting stims: ${error} ${body}`);
    }
  });
}

function UUID() {
  var baseName = (Math.floor(Math.random() * 10) + '' +
    Math.floor(Math.random() * 10) + '' +
    Math.floor(Math.random() * 10) + '' +
    Math.floor(Math.random() * 10));
  var template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  var id = baseName + '-' + template.replace(/[xy]/g, function (c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
  return id;
};

var writeDataToMongo = function (data) {
  sendPostRequest('http://localhost:8000/db/insert',
    { json: data },
    (error, res, body) => {
      if (!error && res.statusCode === 200) {
        console.log(`sent data to store`);
      } else {
        console.log(`error sending data to store: ${error} ${body}`);
      }
    }
  );
};
