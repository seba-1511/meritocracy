/**
 * # Decide treatment for Meritocracy Game
 * Copyright(c) 2014 Stefano Balietti
 * MIT Licensed
 * ---
 */
var J = require('JSUS').JSUS;

// Assigns a treatment condition to a group.
module.exports = function decideRoom(channel, room, gameInfo, treatment) {
    var treats;

    if ('undefined' === typeof treatment) {
        treats = Object.keys(gameInfo.treatments);
        treatment = J.randomInt(0, treats.length);
        treatment = gameInfo.treatments[treatment];
    }
    else if ('string' !== typeof treatment) {
        throw new TypeError('Meritrocracy game.room: CHOSEN_TREATMENT ' +
                            'must be string or undefined.');
    }

    // lab:
    // 6 sessions, with two parallel groups, playing two treatments each.
    if (treatment === 'LAB') {
        switch(room.sessionCounter) {
        case 1:
            if (channel.name === 'MERIT_A') {
                treatment = room.firstTreatment ? 'exo_perfect' : 'random';
            }
            else {
                treatment = room.firstTreatment ? 'exo_v20' : 'exo_v3';
            }
            break;
            
        case 2:
            if (channel.name === 'MERIT_A') {
                treatment = room.firstTreatment ? 'random' : 'exo_perfect';
            }
            else {
                treatment = room.firstTreatment ? 'exo_v3' : 'exo_v20';
            }
            break;
            
            
        case 3:
            if (channel.name === 'MERIT_A') {
                treatment = room.firstTreatment ? 'exo_perfect' : 'exo_v20';
            }
            else {
                treatment = room.firstTreatment ? 'random' : 'exo_v3';
            }
            break;

        case 4:
            if (channel.name === 'MERIT_A') {
                treatment = room.firstTreatment ? 'exo_v20' : 'exo_perfect';
            }
            else {
                treatment = room.firstTreatment ? 'exo_v3' : 'random';
            }
            break;

        case 5:
            if (channel.name === 'MERIT_A') {
                treatment = room.firstTreatment ? 'exo_perfect' : 'exo_v3';
            }
            else {
                treatment = room.firstTreatment ? 'random' : 'exo_v20';
            }
            break;

        case 6:
            if (channel.name === 'MERIT_A') {
                treatment = room.firstTreatment ? 'exo_v3' : 'exo_perfect';
            }
            else {
                treatment = room.firstTreatment ? 'exo_v20' : 'random';
            }
            break;
        }

    }


    // online.
    else if (treatment === 'rotation') {
        ++room.sessionCounter;

        if (room.sessionCounter === 1) {
            treatment = 'random';
        }
        else if (room.sessionCounter === 2) {
            treatment = 'exo_v1000';
        }
        else if (room.sessionCounter === 3) {
            treatment = 'exo_v100';
        }
        else if (room.sessionCounter === 4) {
            treatment = 'exo_v50';
        }
        else {
            treatment = 'exo_v20';
        }
    }

    // Return treatment settings.
    return gameInfo.treatments[treatment];
}
