/**
 * # Authorization and Client ID Generator functions for Meritocracy Game
 * Copyright(c) 2014 Stefano Balietti
 * MIT Licensed
 * ---
 */

module.exports = {
    authorization: authorization,
    clientIdGenerator: clientIdGenerator
};

var path = require('path');
var J = require('JSUS').JSUS;
var descilConfPath, settings, dk;

settings = module.parent.exports.settings;
room = module.parent.exports.room;

descilConfPath = path.resolve(__dirname, '..', 'descil.conf.js');

// Load the code database.
dk = require('descil-mturk')(descilConfPath);
function codesNotFound() {
    if (!dk.codes.size()) {
        throw new Error('Meritocracy auth.lab: no codes found.');
    }
}
    
dk.readCodes(codesNotFound);

// Creating an authorization function for the players.
// This is executed before the client the PCONNECT listener.
function authorization(headers, cookies, roomName) {
    var pc;
    // settings is defined inside game.room.
    if (settings.AUTH === 'NO') {
        return true;
    }

    pc = J.getQueryString('n', headers.referer);
    if (pc < 2 || pc > 40) {
        console.log('Player connected without pc header.');
        return false;
    }
    // Client Authorized
    return true;

}

// Assigns Player Ids based on cookie token. Must return a string.
function clientIdGenerator(headers, cookies, validCookie, ids, info) {
    var cid;
    if (settings.AUTH === 'NO') {
        code = dk.codes.db[++room.noAuthCounter].AccessCode;
        return code;
    }
    cid = J.getQueryString('n', headers.referer);
    return ('undefined' === typeof ids[cid] || ids[cid].disconnected) ? 
        cid : false;
}