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

app.get('/recognize', function(req, res) {
    sendRecognize('smaple.amr', function(resp, body) {
        res.send(body);
    });
});

// 之後可以設計成POST音檔到這分析後回傳結果
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
    const URL = url.resolve(manifest.vendor.api.service, '/server_api');

    let options = buildOpt('POST', URL);
    options.body= buildVoiceObj(format, rate, manifest.token.access_token);

    console.log(options);
    invokeApi(options, function(res, body) {
        callback(res, body);
    });
}

function buildAuthObj() {
    return {
        'grant_type': 'client_credentials',
        'client_id': manifest.vendor.id,
        'client_secret': manifest.vendor.secret
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
        'cuid'   : 'lingtelli-baidu-api',
        'len'    : buffer.length,
        'speech' : buffer.toString('base64'),
    }
}

function getFileInBuffer(filename, host='./samples') {
    const file = path.resolve(host, filename);
    const buf = fs.readFileSync(file);
    console.log(buf.length);

    return buf;
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
