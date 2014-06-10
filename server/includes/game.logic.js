/**
 * # Logic code for Meritocracy Game
 * Copyright(c) 2014 Stefano Balietti
 * MIT Licensed
 *
 * Info:
 * Matching, and stepping can be done in different ways. It can be
 * centralized, and the logic tells the clients when to step, or
 * clients can synchronize themselves and step automatically.
 *
 * In this game, the logic is synchronized with the clients. The logic
 * will send automatically game-commands to start and step
 * through the game plot whenever it enters a new game step.
 *
 * http://www.nodegame.org
 * ---
 */

var path = require('path');

var Database = require('nodegame-db').Database;

var ngc = require('nodegame-client');
var Stager = ngc.Stager;
var stepRules = ngc.stepRules;
var GameStage = ngc.GameStage;
var J = ngc.JSUS;

var stager = new Stager();

// Variable registered outside of the export function are shared among all
// instances of game logics.
var counter = 0;

// Here we export the logic function. Receives three parameters:
// - node: the NodeGameClient object.
// - channel: the ServerChannel object in which this logic will be running.
// - gameRoom: the GameRoom object in which this logic will be running.
module.exports = function(node, channel, gameRoom, treatmentName, settings) {

    var DUMP_DIR, DUMP_DIR_JSON, DUMP_DIR_CSV;
    var ngdb, mdb;

    var treatments;
    var dk, confPath;

    var client;

    var nbRequiredPlayers;

    var EXCHANGE_RATE, groupnames;

    // Variable registered outside of the export function are shared among all
    // instances of game logics.
    var counter, channelCode, exPart, uniqueSession;

    counter = settings.SESSION_ID;
    channelCode = channel.name.charAt(channel.name.length-1);
    exPart = settings.part;
    uniqueSession =  counter + '_' + channelCode;

    EXCHANGE_RATE = settings.EXCHANGE_RATE;
    groupNames = settings.GROUP_NAMES;

    DUMP_DIR = path.resolve(__dirname, '..', 'data') + '/' + uniqueSession + '/';

    J.mkdirSyncRecursive(DUMP_DIR, 0777);

    // Preparing storage: FILE or MONGODB.
    if (settings.DB === 'FILE') {
        DUMP_DIR_JSON = DUMP_DIR + 'json/';
        DUMP_DIR_CSV = DUMP_DIR + 'csv/';

        // Recursively create directories, sub-trees and all.
        J.mkdirSyncRecursive(DUMP_DIR_JSON, 0777);
        J.mkdirSyncRecursive(DUMP_DIR_CSV, 0777);
    }
    else {

        ngdb = new Database(node);
        mdb = ngdb.getLayer('MongoDB', {
            dbName: 'meritocracy_db',
            collectionName: 'lab'
        });

        mdb.connect(function() {});

        node.on.data('questionnaire', function(msg) {
            var saveObject = {
                session: uniqueSession,
                condition: treatmentName,
                stage: msg.stage,
                player: msg.from,
                created: msg.created,
                gameName: msg.data.gameName,
                additionalComments: msg.data.comments,
                alreadyParticipated: msg.data.socExp,
                strategyChoice: msg.data.stratChoice,
                strategyComments: msg.data.stratComment,
                exPart: exPart
            };
            mdb.store(saveObject);
        });

        node.on.data('QUIZ', function(msg) {
            var saveObject = {
                session: uniqueSession,
                condition: treatmentName,
                stage: msg.stage,
                player: msg.from,
                created: msg.created,
                quiz: msg.data,
                exPart: exPart
            };
            mdb.store(saveObject);
        });

        node.on.data('timestep', function(msg) {
            var saveObject = {
                session: uniqueSession,
                condition: treatmentName,
                stage: msg.stage,
                player: msg.from,
                timeElapsed: msg.data.time,
                timeup: msg.data.timeup,
                exPart: exPart
            };
            mdb.store(saveObject);
        });

        node.game.savePlayerValues = function(p, payoff, positionInNoisyRank,
                                              ranking, noisyRanking,
                                              groupStats,
                                              currentStage) {

            var noisyContribution, finalGroupStats;

            noisyContribution = 'undefined' === typeof p.noisyContribution ?
                'NA' : p.noiseContribution;

            finalGroupStats = groupStats[groupNames[positionInNoisyRank[0]]];

            mdb.store({
                session: uniqueSession,
                condition: treatmentName,
                stage: currentStage,
                player: p.player,
                group: p.group,
                contribution: p.value.contribution,
                demand: null === p.value.demand ? "NA" : p.value.demand,
                noisyContribution: noisyContribution,
                payoff: payoff,
                groupAvgContr: finalGroupStats.avgContr,
                groupStdContr: finalGroupStats.stdContr,
                groupAvgDemand: finalGroupStats.avgDemand,
                groupStdDemand: finalGroupStats.stdDemand,
                rankBeforeNoise: ranking.indexOf(p.id) + 1,
                rankAfterNoise: noisyRanking.indexOf(p.id) + 1,
                timeup: p.value.isTimeOut,
                exPart: exPart
            });
        };

        node.game.saveRoundResults = function(ranking, groupStats,
                                              noisyRanking, noisyGroupStats) {
            mdb.store({
                session: uniqueSession,
                condition: treatmentName,
                ranking: ranking,
                noisyRanking: noisyRanking,
                groupAverages: groupStats,
                noisyGroupAverages: noisyGroupStats,
                exPart: exPart
            });
        };
    }


    // Outgoing messages will be saved.
    node.socket.journalOn = true;

    // Players required to be connected at the same (NOT USED).
    nbRequiredPlayers = settings.MIN_PLAYERS;

    // Client game to send to reconnecting players.
    client = require(gameRoom.clientPath)(gameRoom, treatmentName, settings);

    // Reads in descil-mturk configuration.
    confPath = path.resolve(__dirname, '..', 'descil.conf.js');
    dk = require('descil-mturk')(confPath);

    function codesNotFound() {
        if (!dk.codes.size()) {
            throw new Error('game.logic: no codes found.');
        }
    }

    if (settings.AUTH === 'MTURK') {
        dk.getCodes(codesNotFound);
    }
    else {
        dk.readCodes(codesNotFound);
    }

    // Get the function that compute the results.
    treatments = channel.require(__dirname + '/treatments.js', {
        node: node,
        treatment: treatmentName,
        groupNames: groupNames,
        dk: dk,
        SUBGROUP_SIZE: settings.SUBGROUP_SIZE
    }, true); // Force reload from FS

    // The number of players has changed...but do we care?
    function numOfPlayersMatters(stage, id) {
        var nPlayers;
        // We care about disconnections only during the actual game stage.
        // Before, we wait until the overbooking stage.
        // After we dot care at all.
        if (stage !== 5) return false;
        // Should not be a player leaving cause of overbooking.
        return 'undefined' === typeof node.game.overbooked[id];

        // NOT USED FOR NOW.
        nPlayers = node.game.pl.size();
        // These disconections are likely to be players leaving
        // from overbooking stage. Ignore them.
        if (nPlayers >= settings.GROUP_SIZE) return false;
        // This is a real disconnection.
        return nPlayers < settings.GROUP_SIZE;
    }

    // Event handler registered in the init function are always valid.
    stager.setOnInit(function() {
        console.log('********************** meritocracy room ' + counter+++' **********************');

        node.game.countdown = null;

        // Players that disconnected temporarily.
        node.game.disconnected = {};
        // Players sent away due to overbooking.
        node.game.overbooked = {};

        // "STEPPING" is the last event emitted before the stage is updated.
        node.on('STEPPING', function() {
            var currentStage, db, p, gain;

            currentStage = node.game.getCurrentGameStage();

            if (settings.DB === 'FILE') {
                // We do not save stage 0.0.0.
                // Morever, If the last stage is equal to the current one, we are
                // re-playing the same stage cause of a reconnection. In this
                // case we do not update the database, or save files.
                if (!GameStage.compare(currentStage, new GameStage())) {
                    return;
                }
                // Update last stage reference.
                node.game.lastStage = currentStage;

                db = node.game.memory.stage[currentStage];

                if (db && db.size()) {
                    try {
                        // Saving results to FS.
                        node.fs.saveMemory('csv', DUMP_DIR + 'memory_' + currentStage +
                                           '.csv', { flags: 'w' }, db);
                        node.fs.saveMemory('json', DUMP_DIR + 'memory_' + currentStage +
                                           '.nddb', null, db);

                        console.log('Round data saved ', currentStage);
                    }
                    catch(e) {
                        console.log('OH! An error occurred while saving: ',
                                    currentStage);
                    }
                }
            }

            console.log(uniqueSession, ' - Round:  ', currentStage);
        });

        // Add session name to data in DB.
        node.game.memory.on('insert', function(o) {
            o.session = uniqueSession;
            o.exPart = exPart;
        });

        // Register player disconnection, and wait for him...
        node.on.pdisconnect(function(p) {
            var curStage;
            curStage = node.game.getCurrentGameStage().stage;
            console.log('Warning: one player disconnected! ', curStage, p.id);

            dk.updateCode(p.id, {
                disconnected: true,
                stage: p.stage
            });

            if (numOfPlayersMatters(curStage, p.id)) {

                // If we do not have other disconnected players,
                // start the procedure.
                if (node.game.countdown === null) {
                    node.say('notEnoughPlayers', 'ALL');

                    this.countdown = setTimeout(function() {
                        var i;
                        console.log('Countdown fired. Player/s did not reconnect.');
                        lostPlayers = 0;
                        for (i in node.game.disconnected) {
                            if (node.game.disconnected.hasOwnProperty(i)) {
                                dk.updateCode(i, {
                                    kickedOut: true
                                });
                            }
                        }
                        // Clear list of temporarily disconnected players.
                        node.game.disconnected = {};
                        node.game.countdown = null;
                        node.remoteCommand('resume', 'ALL');
                    }, 30000);
                }

                // Only if the disconnection is not related to players sent away
                // for overbooking added to the list of temporarily disconnected.
                if ('undefined' === typeof node.game.overbooked[p.id]) {
                    node.game.disconnected[p.id] = '';
                }
            }
        });


        // Reconnections must be handled by the game developer.
        node.on.preconnect(function(p) {
            var code, curStage;
            var state, stateMsgs, i, len;

            console.log('Oh...somebody reconnected!', p);
            code = dk.codeExists(p.id);

            if (!code) {
                console.log('game.logic: reconnecting player not found in ' +
                            'code db: ' + p.id);
                return;
            }
            if (!code.disconnected) {
                console.log('game.logic: reconnecting player that was not ' +
                            'marked disconnected: ' + p.id);
                return;
            }

            if (code.kickedOut) {
                // It is not added automatically.
                // This could be improved, maybe not throwing the exception.
                node.game.pl.add(p);
                node.redirect('html/disconnected.htm', p.id);
                console.log('game.logic: kicked out player tried to ' +
                            'reconnect: ' + p.id);
                return;
            }

            if (code.checkedOut) {
                // It is not added automatically.
                // This could be improved, maybe not throwing the exception.
                node.game.pl.add(p);
                node.redirect('html/obco.html?co=1&out=' + code.ExitCode, p.id);
                console.log('game.logic: checked out player tried to ' +
                            'reconnect: ' + p.id);
                return;
            }

            curStage = node.game.getCurrentGameStage();

            delete node.game.disconnected[p.id];

            // If all disconnected players reconnected...
            if (!J.size(node.game.disconnected)) {
                // Delete countdown game.
                clearTimeout(this.countdown);
            }

            // Mark code as connected.
            code.disconnected = false;

            // Get the list of messages previously sent to
            // the reconnecting client in the same stage.
            // Messages will be re-sent **after** the client
            // has been initialized. We need to get this messages
            // before sending any others, otherwise they will be duplicated.
            state = node.socket.journal.stage[curStage];
            if (state && state.size()) {
                stateMsgs = state.selexec('to', '=', p.id).fetch();
            }

            // Clear any message in the buffer from.
            // node.remoteCommand('erase_buffer', 'ALL');

            // Notify other player he is back.
            // TODO: add it automatically if we return TRUE? It must be done
            // both in the alias and the real event handler
            node.game.pl.each(function(player) {
                node.socket.send(node.msg.create({
                    target: 'PCONNECT',
                    data: p,
                    to: player.id
                }));
            });

            // Send currently connected players to reconnecting.
            node.socket.send(node.msg.create({
                target: 'PLIST',
                data: node.game.pl.db,
                to: p.id
            }));

            // We could slice the game plot, and send just what we need
            // however here we resend all the stages, and move their game plot.
            console.log('** Player reconnected: ' + p.id + ' **');
	    // Setting metadata, settings, and plot.
            node.remoteSetup('game_metadata',  p.id, client.metadata);
	    node.remoteSetup('game_settings', p.id, client.settings);
	    node.remoteSetup('plot', p.id, client.plot);
            node.remoteSetup('env', p.id, client.env);
            node.remoteSetup('env', p.id, {
                treatment: treatmentName,
                part: exPart
            });


            // It is not added automatically.
            // TODO: add it automatically if we return TRUE? It must be done
            // both in the alias and the real event handler
            node.game.pl.add(p);

            // Do something.
            // Resend state to connected player.
            // node.remoteCommand('goto_step', p.id, curStage);

            // Start the game on the reconnecting client.
            node.remoteCommand('start', p.id, {
                startStage: node.game.plot.previous(curStage)
            });

            // Re-send missing msessages now.
            if (stateMsgs) {
                if (stateMsgs) {
                    i = -1, len = stateMsgs.length;
                    for ( ; ++i < len ; ) {
                        node.socket.send(stateMsgs[i]);
                    }
                }

                // Test. not nice...
                // This messages should be deleted from journal, otherwise
                // they sum up.
                node.socket.journal.stage[curStage] = state.selexec('to', '!=', p.id);

            }

            // If all disconnected players reconnected...
            if (!J.size(node.game.disconnected)) {

                // Will send all the players to current stage
                // (also those who were there already).
                // node.game.gotoStep(node.player.stage);


                // Unpause ALL players
                // TODO: add it automatically if we return TRUE? It must be done
                // both in the alias and the real event handler
                node.game.pl.each(function(player) {
                    if (player.id !== p.id) {
                        node.remoteCommand('resume', player.id);
                    }
                });
            }
            // Check if we care about disconnected players.
            else if (numOfPlayersMatters()) {
                node.say('notEnoughPlayers', p.id);
            }
            console.log('init');
        });
    });

    // Event handler registered in the init function are always valid.
    stager.setOnGameOver(function() {
        console.log('************** GAMEOVER ' + gameRoom.name + '****************');
        // TODO: update database.
        channel.destroyGameRoom(gameRoom.name);
    });

    // Game Types Objects definition

    // Functions
    function precache() {
        console.log('Pre-Cache');
    }

    function instructions() {
        // debugger
        console.log('Instructions');
    }

    function quiz() {
        console.log('Quiz');
    }

    function questionnaire() {
        console.log('questionnaire');

        var code, exitcode, accesscode;
        var bonusFile, bonus;
        var playerIds;

        bonusFile = DUMP_DIR + 'bonus.csv';

        console.log('FINAL PAYOFF PER PLAYER');
        console.log('***********************');

        bonus = node.game.pl.map(function(p) {
            // debugger
            code = dk.codes.id.get(p.id);
            if (!code) {
                console.log('ERROR: no code in endgame:', p.id);
                return ['NA', 'NA'];
            }

            accesscode = code.AccessCode;
            exitcode = code.ExitCode;

            // Update total real money won.
            code.winReal = parseFloat(Number((code.win || 0) / EXCHANGE_RATE)
                                      .toFixed(2), 10);
            code.winReal = parseFloat(code.winReal, 10);

            console.log(p.id, ': ',  code.winReal, code.ExitCode);
            return [p.id, code.ExitCode, code.winReal, node.game.gameTerminated];
        });

        console.log('***********************');

        try {
            node.fs.writeCsv(bonusFile, bonus, {
                headers: ["access", "exit", "bonus", "terminated"]
            });
        }
        catch(e) {
            console.log('ERROR: could not save the bonus file: ',
                        DUMP_DIR + 'bonus.csv');
        }
    }

    function endgame() {
        var code, exitcode, accesscode;
        var playerIds;

        console.log('endgame');

        node.game.pl.each(function(p) {
            // debugger
            code = dk.codes.id.get(p.id);
            if (!code) {
                console.log('ERROR: no code in endgame:', p.id);
                return ['NA', 'NA'];
            }

            accesscode = code.AccessCode;
            exitcode = code.ExitCode;

	    node.say('WIN', p.id, {
                win: code.winReal.toFixed(2),
                exitcode: code.ExitCode
            });
        });


        setTimeout(function() {
            // Notify Waiting Room that first part is finished.
            if (exPart == 1) {
                channel.waitingRoom.firstTreatment = false;

                playerIds = node.game.pl.id.getAllKeys();
                for (i in playerIds) {
                    if (playerIds.hasOwnProperty(i)) {
                        channel.movePlayer(playerIds[i],
                                           channel.waitingRoom.name);
                    }
                }
            }
        }, settings.timer.breakPart1);
        // Destroy Room?

    }

    // Set default step rule.
    stager.setDefaultStepRule(stepRules.OTHERS_SYNC_STEP);

    // Adding the stages. We can later on define the rules and order that
    // will determine their execution.
    stager.addStage({
        id: 'precache',
        cb: precache,
        // minPlayers: [nbRequiredPlayers, notEnoughPlayers]
    });

    stager.addStage({
        id: 'instructions',
        cb: instructions,
        // minPlayers: [nbRequiredPlayers, notEnoughPlayers]
    });

    stager.addStage({
        id: 'overbooking',
        cb: function() {
            var nPlayers, redirectPlayersDb, extraPlayersCount;
            var ob;
            console.log('overbooking');

            // Query string variable for redirection: if 1 it is a normal
            // overbooking, if 0, we had some many disconnections already
            // that the game cannot start at all.
            ob = 1;
            nPlayers = node.game.pl.size();
            if (nPlayers !== settings.GROUP_SIZE &&
                nPlayers !== (settings.GROUP_SIZE - 1)) {

                // We have too many players, some will be redirected away.
                if (nPlayers > settings.GROUP_SIZE) {
                    extraPlayersCount = nPlayers - settings.GROUP_SIZE;
                    redirectPlayersDb = node.game.pl
                        .shuffle()
                        .limit(extraPlayersCount);
                }
                // Not enough players. Game suspended.
                else {
                    redirectPlayersDb = node.game.pl;
                    ob = 0;
                }

                redirectPlayersDb.each(function(p) {
                    var code, link;
                    code = dk.codeExists(p.id);
                    link = 'html/obco.html?ob=' + ob +
                        '&out=' + code.ExitCode;
                    dk.checkOut(p.id, code.ExitCode, 0);
                    // Save the id of redirected player.
                    node.game.overbooked[p.id] = '';
                    // Redirect.
                    node.redirect(link, p.id);
                });
            }

            if (!ob) {
                node.game.gameover();
            }
            else {
                // TODO: check this.
                node.done();
            }
        }
    });

    stager.addStage({
        id: 'quiz',
        cb: quiz,
        // minPlayers: [nbRequiredPlayers, notEnoughPlayers]
    });

    stager.addStep({
        id: 'bid',
        cb: function() {
            console.log('bid');
            return true;
        },
        // minPlayers: [nbRequiredPlayers, notEnoughPlayers]
    });

    stager.addStep({
        id: 'results',
        cb: function() {
            // Computes the values for all players and all groups,
            // sends them to the clients, and save results into database.
            treatments[treatmentName].sendResults();
            return true;
        },
        // minPlayers: [nbRequiredPlayers, notEnoughPlayers]
    });

    stager.addStage({
        id: 'meritocracy',
        steps: ['bid', 'results'],
        // minPlayers: [nbRequiredPlayers, notEnoughPlayers]
    });

    stager.addStage({
        id: 'questionnaire',
        cb: questionnaire
    });

    stager.addStage({
        id: 'endgame',
        cb: endgame
    });

    // Building the game plot.

    // Here we define the sequence of stages of the game (game plot).
    stager
        .init()
        .next('precache')
        .next('instructions')
        .next('quiz')
        .next('overbooking')
        .repeat('meritocracy', settings.REPEAT)
        .next('questionnaire')
        .next('endgame')
    .gameover();

    // Here we group together the definition of the game logic.
    return {
        nodename: 'lgc_' + uniqueSession,
        game_metadata: {
            name: 'meritocracy',
            version: '0.0.1'
        },
        game_settings: {
            // Will not publish any update of stage / stageLevel, etc.
            publishLevel: 0,
            // Will send a start / step command to ALL the clients when
            // the logic will start / step through the game.
            // This option requires that the game plots of the clients
            // and logic are symmetric or anyway compatible.
            syncStepping: true
        },
        // Extracts, and compacts the game plot that we defined above.
        plot: stager.getState(),
        // If debug is false (default false), exception will be caught and
        // and printed to screen, and the game will continue.
        debug: settings.DEBUG,
        // Controls the amount of information printed to screen.
        verbosity: 0,
        // nodeGame enviroment variables.
        env: {
            auto: settings.AUTO
        }
    };
};