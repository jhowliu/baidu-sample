const path = require('path');
const requireDir = require('require-dir');

const net = require('./networks');
const manifest = requireDir('../manifest');

const baidu = require('./baidu');

// info is an object
// Return a mp3 buffer
module.exports.dialog= function(state, info, callback) {
    let options = net.buildOpt('GET', manifest.services.apis.sunshine.host);
    let payload = net.buildDiagObj();

    payload.appid = info.user.appid;
    payload.session = info.sid;

    if (state == 'start') {
        payload.PersonName = info.user.username;
        payload.IDNo = info.user.identifier;
        payload.ServiceType = info.user.service;
        payload.Date = info.user.date;
    } else {
        payload.q = info.text;
    }

    console.log(payload);

    options.qs = payload;

    net.invokeApi(options, function(res, body) {
        console.log("Dialog: \n" + JSON.stringify(body));
        let state = undefined;
        let text = '抱歉，請再說一遍';

        if (body != undefined) {
            if ('dialogueState' in body) {
                state = body.dialogueState;
            }
            if ('dialogueReply' in body) {
                text = body.dialogueReply;
            }
        }
        // return a buffer (MP3)
        baidu.text2Speech(text, function(res, body) {
            callback(body, state);
        });
    });
}
