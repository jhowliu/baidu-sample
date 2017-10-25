const request = require('requestretry');
const requireDir = require('require-dir');

const utils = require('./utils');
const baidu = require('./baidu');

let manifest = requireDir('../manifest');

// Invoke request
module.exports.invokeApi = function (requestOpts, callback) {
    request(requestOpts, function(err, res, body) {
        callback(res, body);
    });
}

// build options for requests
module.exports.buildOpt = function (method, host, json=true) {
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

module.exports.buildAuthObj = function () {
    return {
        grant_type: 'client_credentials',
        client_id: manifest.vendor.id,
        client_secret: manifest.vendor.secret
    }
}

module.exports.buildTextObj = function (text, token) {
    return {
        tex  : text.toString('utf8'),
        lan  : 'zh',
        ctp  : 1,
        spd  : 4,
        cuid : manifest.vendor.app.id,
        tok  : token
    }
}

// session, appid are required
module.exports.buildDiagObj = function() {
    return {
        q: undefined,
        session: undefined,
        appid: undefined,
        PersonName: undefined,
        IDNo: undefined,
        ServiceType: undefined,
        Date: undefined,
    }
}

module.exports.buildVoiceObj = function (filename, format, rate, token) {
    const buffer = utils.getFileInBuffer(filename); // return buffer in bytes

    return {
        channel: 1,
        format : format,
        rate   : rate,
        token  : token,
        cuid   : manifest.vendor.app.id,
        len    : buffer.length,
        speech : buffer.toString('base64'),
    }
}


module.exports.sendCallback = function (sid, binary, callbackURL, callback) {
    let options = this.buildOpt('POST', callbackURL)  

    // Avoiding some package parse to utf-8
    options.body = { 
        'sid' : sid,
        'data': binary.toString('base64') 
    };
    
    this.invokeApi(options, function(res, body) {
        callback(res, body);
    });
}
