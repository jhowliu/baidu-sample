const express = require('express'),
      bodyJson = require('body-parser').json({ type: '*/*' }),
      basicAuth = require('express-basic-auth'),
      requireDir = require('require-dir'),
      request = require('requestretry');


const app = express();
const url = require('url');

const path = require('path');
const manifest = requireDir(path.resolve(process.argv[2]));

/*
app.use(basicAuth {
    {
        users: {
            manifest.baidu.id: manifest.baidu.secret
        }
    }
});
*/

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

function invokeApi(requestOpts, callback) {
    request(requestOpts, function(err, res, body) {
        callback(res, body);
    });
}

// To get the authorization token from Baidu.
function askAuth(method, callback) {
    const URL = url.resolve(manifest.baidu.api.auth, '/oauth/2.0/token');

    let options = buildOpt('POST', URL);
    options.form = buildAuthObj();

    console.log(method, URL);
    console.log(options);

    invokeApi(options, function(res, body) {
        console.log('Baidu Auth: ' + JSON.stringify(body));
        callback(res, body);
    });
}

// To use the Baidu recognization API.
function sendRecognize(method, host, path, token) {
    const URL = url.resolve(host, path);

}

function buildAuthObj() {
    return {
        'grant_type': 'client_credentials',
        'client_id': manifest.baidu.id,
        'client_secret': manifest.baidu.secret
    }
}

askAuth("POST", function(res, body) {
    console.log(body);
});
