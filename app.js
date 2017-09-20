const express = require('express'),
      bodyJson = require('body-parser').json({ type: '*/*' }),
      basicAuth = require('express-basic-auth'),
      requireDir = require('require-dir'),
      request = require('requestretry');

const fs = require('fs');

const app = express();
const url = require('url');

const path = require('path');
const manifest = requireDir(path.resolve(process.argv[2]));

app.get('/text2speech', bodyJson, function(req, res) {
    const text = req.query.text;

    if (!text) return res.send("please send request with params which is text");

    text2Speech(text, function(resp, body) {
        const contentType = resp.headers['content-type'];

        if (contentType == 'audio/mp3') {
            console.log(body)
            res.type('audio/mp3');
            res.send(body);
            res.end();
            /* write mp3 into local
            writeAudio(body, 'sample.mp3', function() {
                res.download('./audio/sample.mp3', 'sample.mp3');
            });
            */
        } else {
            res.send(body);
            //content-type = Application/json
        }
    });
});

app.get('/recognize', function(req, res) {
    sendRecognize('smaple.amr', function(resp, body) {
        res.send(body);
    });
});

// 未來可以設計成POST音檔到這分析後回傳結果
app.post('/recognize', bodyJson, function(req, res) {
    const file = req.body.file; // base64 or bytes
    const format = req.body.format;
    const rate = req.body.rate;
    const token = req.body.token;

    //checkTokenFromDB() match db token是否相同

    sendRecognize(file, function(resp, body) {
        res.send(body);
    });
});

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
function sendRecognize(filename, callback, format='amr', rate=8000) {
    const URL = url.resolve(manifest.vendor.api.service.recognize, '/server_api');

    let options = buildOpt('POST', URL);
    options.body= buildVoiceObj(format, rate, manifest.token.access_token);

    console.log(options);
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

    console.log(options);
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

function buildVoiceObj(format, rate, token) {
    const filename = 'sample.amr';
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
function getFileInBuffer(filename, host='./samples') {
    const file = path.resolve(host, filename);
    const buf = fs.readFileSync(file);
    console.log(buf.length);

    return buf;
}

function writeAudio(buffer, filename, callback) {
    const file = path.resolve('./audio', filename);

    fs.writeFile(file, buffer,function(err) {
        if (err) throw err; 
        console.log('done');
        callback();
    });
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
  console.log(`Echo Bot listening on port ${manifest.vendor.app.port}!`);
});
