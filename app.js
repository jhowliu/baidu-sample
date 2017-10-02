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
            expiresIn: 60*10
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

app.get('/text2speech', function(req, res) {
    const text = req.query.text;

    if (!text) return res.json({ success: false, message: 'please send request with params which is text'});

    text2Speech(text, function(resp, body) {
        const contentType = resp.headers['content-type'];

        if (contentType == 'audio/mp3') {
            console.log(body)
            res.type('audio/mp3');
            res.send(body);
            res.end();
        } else {
            res.send(body);
        }
    });
});

app.get('/recognize', function(req, res) {
    sendRecognize('sample.amr', function(resp, body) {
        res.send(body);
    });
});

// 未來可以設計成POST音檔到這分析後回傳結果
app.post('/recognize', verifyToken, function(req, res) {
    const format = req.body.format;
    const rate = req.body.rate;
    const files = req.files;

    let buffer = null;
    let filename = null;

    if (format === undefined || 
        rate   === undefined ||
        files  === undefined) {
        return res.json({ success: false, message: 'parameters error.' })
    }

    if (!files.length) {
        return res.json({ success: false, message: 'please provide a audio'})
    }

    buffer = files[0].buffer ; // base64 or bytes
    filename = files[0].originalname;

    if (buffer==null) {
        return res.json({ success: false, message: 'please provide a audio in binary format.)'})
    }


    meta = {
        'filename' : filename,
        'format' : format,
        'rate'   : rate
    }

    //checkTokenFromDB() match db token是否相同
    writeAudio(buffer, rate, filename, function() {
        sendRecognize(meta, function(resp, body) {
            return res.json({ success: true, message: body})
        });
    });
});

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
function writeAudio(buffer, rate, filename, callback) {
    const file = path.resolve('./audio', filename);

    fs.writeFile(file, buffer,function(err) {
        if (err) throw err; 
        convertAudio(filename, rate, function() {
            callback();
        })
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
