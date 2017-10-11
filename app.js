const express = require('express'),
      basicAuth = require('express-basic-auth'),
      bodyParser = require('body-parser'),
      requireDir = require('require-dir'),
      request = require('requestretry'),
      multer = require('multer'),
      jwt = require('jsonwebtoken');

const fs = require('fs');

const app = express();
const url = require('url');

const path = require('path');
const manifest = requireDir(path.resolve(process.argv[2]));

let spawn = require('child_process').spawn;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(multer().any())

app.post('/token', function(req, res) {
    const user = req.body.user || req.query.user
    console.log(user)
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

app.post('/callback', function(req, res) {
    console.log(req.body);
    const filename = 'reply.mp3'
    const buffer = new Buffer(req.body.data, 'base64');
    console.log(buffer)

    writeAudio(buffer, filename, function() {
        res.json({success: true, message: 'saved'})
    })

})

// 未來可以設計成POST音檔到這分析後回傳結果
app.post('/recognize', verifyToken, function(req, res) {
    const format = req.body.format || req.query.format;
    const rate = req.body.rate || req.query.rate;
    const callbackURL = req.body.callback || req.query.callback;
    const sid = req.body.sid || req.query.sid;
    const cid = req.body.cid || req.query.cid;
    const files = req.files;

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

    buffer = files[0].buffer ; // bytes
    filename = files[0].originalname;

    if (buffer===undefined) {
        return res.json({ success: false, message: 'please provide a audio in binary format.)'})
    }

    meta = {
        'filename' : filename,
        'format' : format,
        'rate'   : rate
    }

    res.json({ success: true, message: 'please wait for callback data.' })

    writeAudio(buffer, filename, function() {
        convertAudio(filename, rate, function() {
            sendRecognize(meta, function(resp, body) {
                // send the text to dialogue api
                console.log(body)
                text = '你好嗎';
                dialogueAPI(text, sid, callbackURL, function(res, body) {
                    // send reply mp3 to callback url
                    console.log(body);
                })
            });
        })
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

// Call dialogue api
function dialogueAPI(text, sid, callbackURL, callback) {
    text2Speech(text, function(res, body) {
        let options = buildOpt('POST', callbackURL)  

        // Avoiding some package parse to utf-8
        options.body = { 
            'sid' : sid,
            'data': body.toString('base64') 
        };

        invokeApi(options, function(res, body) {
            callback(res, body);
        });
    });
}

// Invoke request
function invokeApi(requestOpts, callback) {
    request(requestOpts, function(err, res, body) {
        callback(res, body);
    });
}

// To get the authorization token from Baidu.
function askAuth(method, callback) {
    const URL = url.resolve(manifest.vendor.api.auth, '/oauth/2.0/token');

    let options = buildOpt('POST', URL);
    options.form = buildAuthObj();

    invokeApi(options, function(res, body) {
        callback(res, body);
    });
}

// To use the Baidu recognization API.
function sendRecognize(meta, callback) {
    const URL = url.resolve(manifest.vendor.api.service.recognize, '/server_api');
    const filename = meta['filename']
    const format = meta['format']
    const rate = meta['rate']

    let options = buildOpt('POST', URL);
    options.body= buildVoiceObj(filename, format, rate, manifest.token.access_token);

    //console.log(options);
    invokeApi(options, function(res, body) {
        callback(res, body);
    });
}

function text2Speech(text, callback) {
    const URL = url.resolve(manifest.vendor.api.service.tts.host, 
                            manifest.vendor.api.service.tts.path);

    let options = buildOpt('POST', URL);
    options.form = buildTextObj(text, manifest.token.access_token);
    // 預設是UTF-8, 因為格式是BINARY, 所以不需要encoding
    options.encoding = null;

    //console.log(options);
    invokeApi(options, function(res, body) {
        callback(res, body);
    });
}

// build options for requests
function buildOpt(method, host, json=true) {
    const options = {
        method: method,
        uri: host,
        headers: undefined,
        body: undefined,
        form: undefined,
        json: json,
        maxAttempts: 5,
        retryStrategy: request.RetryStrategies.HTTPOrNetworkError
    };

    return options
}

function buildAuthObj() {
    return {
        'grant_type': 'client_credentials',
        'client_id': manifest.vendor.id,
        'client_secret': manifest.vendor.secret
    }
}

function buildTextObj(text, token) {
    return {
        'tex'  : text.toString('utf8'),
        'lan'  : 'zh',
        'ctp'  : 1,
        'spd'  : 3,
        'cuid' : manifest.vendor.app.id,
        'tok': token
    }
}

function buildVoiceObj(filename, format, rate, token) {
    //const filename = 'sample.amr';
    const buffer = getFileInBuffer(filename); // return buffer in bytes

    return {
        'channel': 1,
        'format' : format,
        'rate'   : rate,
        'token'  : token,
        'cuid'   : manifest.vendor.app.id,
        'len'    : buffer.length,
        'speech' : buffer.toString('base64'),
    }
}

// Use for voice recognize 
// Read audio from local
function getFileInBuffer(filename, folder='./audio') {
    const file = path.resolve(folder, filename);
    const buf = fs.readFileSync(file);
    console.log(buf.length);

    return buf;
}


// Write audio into local
function writeAudio(buffer, filename, callback) {
    const file = path.resolve('./audio', filename);

    fs.writeFile(file, buffer,function(err) {
        if (err) throw err; 
        callback()
    });
}

function convertAudio(filename, rate, callback) {
    const cmd = '/usr/bin/ffmpeg'

    const args = [
        '-y',
        '-i', path.resolve('./audio', filename),
        '-acodec', 'pcm_s16le',
        '-f', 's16le',
        '-ac', '1',
        '-ar', rate,
        path.resolve('./audio', filename)
    ]

    let proc = spawn(cmd, args);

    proc.on('close', function() {
        console.log('finished');
        callback();
    })
}

/*
askAuth("POST", function(res, body) {
    if (res && res.statusCode==200) {
        console.log(typeof(body));
        fs.writeFileSync('./manifest/token.json', JSON.stringify(body, null, '    '), 'utf-8'); 
    }
});
*/

app.listen(manifest.vendor.app.port, () => {
  console.log(`Listening on port ${manifest.vendor.app.port}!`);
});
