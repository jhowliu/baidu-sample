const express = require('express'),
      basicAuth = require('express-basic-auth'),
      bodyParser = require('body-parser'),
      requireDir = require('require-dir'),
      request = require('requestretry'),
      multer = require('multer'),
      jwt = require('jsonwebtoken'),
      fs = require('fs'),
      cors = require('cors');

const app = express();
const url = require('url');

const path = require('path');
const manifest = requireDir(path.resolve(process.argv[2]));

const net = require('./model/networks');
const baidu = require('./model/baidu');
const utils = require('./model/utils');
const diagFlow = require('./model/dialogue');

let SESSION_IDS = []; 
let userInfos = require('./config/user');

app.use(bodyParser.json({ limit: '5mb' }));
app.use(bodyParser.urlencoded({ limit: '5mb', extended: false }));
app.use(multer().any())

app.use(cors());

app.get('/download/:id', function(req, res) {
    res.sendFile(path.resolve('./audio', req.params.id+'.mp3'));
});

app.post('/user', function(req, res) {
    userInfos.identifier = req.body.identifier;
    userInfos.username = req.body.username;
    userInfos.service = req.body.service;
    userInfos.date = req.body.date;

    res.json({ success: true, msg: "Save successfully." });

});

app.post('/token', function(req, res) {
    const user = req.body.user || req.query.user

    if (user === manifest.partner.user) {
        var token = jwt.sign({user: user}, manifest.partner.secret, {
            expiresIn: 60*60*24*365
        })

        res.json({
            success: true,
            message: 'Enjoy your token',
            token: token
        })
    } else {
        res.json({ success: false, message: 'Authenticate failed. User not found.' }) 
    }
});


// Just for testing
app.post('/callback', function(req, res) {
    const filename = utils.generateRandomString() + '.mp3';
    const buffer = new Buffer(req.body.data, 'base64');
    console.log(filename)

    utils.writeAudio(buffer, filename, function() {
        res.json({success: true, message: 'saved'})
    })

})


// 未來可以設計成POST音檔到這分析後回傳結果
app.post('/recognize', verifyToken, function(req, res) {
    console.log("REFERER: " + req.referer);
    const format = req.body.format || req.query.format;
    const rate = req.body.rate || req.query.rate;
    const callbackURL = req.body.callback || req.query.callback;
    const sid = req.body.sid || req.query.sid;
    const cid = req.body.cid || req.query.cid;
    const files = req.files || req.body.file;
    const coding = req.body.coding;

    let buffer = null;
    let filename = null;

    if (format === undefined || 
        rate   === undefined ||
        cid    === undefined || 
        sid    === undefined ||
        callbackURL === undefined) {
        return res.json({ success: false, message: 'parameters error.' })
    }

    if (files === undefined || !files.length) {
        return res.json({ success: false, message: 'please provide a audio'})
    }

    if (coding == undefined) {
        buffer = files[0].buffer ; // bytes
        filename = files[0].originalname;
    } else {
        buffer = new Buffer (req.body.file, 'base64');
        filename = utils.generateRandomString();
    }

    if (buffer===undefined) {
        return res.json({ success: false, message: 'please provide a audio in binary format.)'})
    } 

    meta = {
        'filename' : filename,
        'format' : format,
        'rate'   : rate
    }

    res.json({ success: true, message: 'please wait for callback data.' })

    utils.writeAudio(buffer, filename, function() {
        utils.convertAudio(filename, rate, function() {
            baidu.sendRecognize(meta, function(resp, body) {
                // send the text to dialogue api
                dialogueAPI(sid, callbackURL, function(res, body) {
                    // send reply mp3 to callback url
                    console.log(body);
                })
            });
        })
    });
});

app.post('/reset-auth', function(req, res) {
    baidu.askAuth("POST", function(res, body) {
        if (res && res.statusCode==200) {
            console.log(body);
            fs.writeFileSync('./manifest/token.json', JSON.stringify(body, null, '    '), 'utf-8'); 
        }
    });
});


// middleware to verify incoming token
function verifyToken(req, res, next) {
    console.log(req.body)
    const token = req.body.token || req.query.token

    if (token) {
        jwt.verify(token, manifest.partner.secret, function (err, decode) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'})
            } else {
                return next()
            }
        });
    } else {
        return res.json({success: false, message: 'No token provided.'})
    }
}

// Call dialogue api (POST the reply to the callback url)
function dialogueAPI(sid, callbackURL, callback) {

    // Greeting First
    if (!(sid in SESSION_IDS)) {
        diagFlow.greeting(userInfos, sid, function(reply) {
            let text = '我聽不清楚，請再說一遍';

            if (reply != undefined && 'dialogueReply' in reply) {
                text = reply.dialogueReply;
            }

            baidu.text2Speech(text, function(res, body) {
                net.sendCallback(sid, body, callbackURL, function(res, body) {
                    callback(res, body);
                }) 
            });
        });
    }

    // Conversation Time 
    if ( sid in SESSION_IDS) {

    }
}


app.listen(manifest.vendor.app.port, () => {
  console.log(`Listening on port ${manifest.vendor.app.port}!`);
});
