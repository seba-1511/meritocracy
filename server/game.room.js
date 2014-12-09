/**
 * # Waiting Room for Meritocracy Game
 * Copyright(c) 2014 Stefano Balietti
 * MIT Licensed
 *
 * Handles incoming connections, matches them, sets the Meritocracy game
 * in each client, move them in a separate gaming room, and start the game.
 * ---
 */
module.exports = function(node, channel, room) {

    var ngc = require('nodegame-client');
    var path = require('path');
    var J = require('JSUS').JSUS;

    // Load Meritocracy settings;
    var gameInfo = channel.servernode.getGamesInfo('meritocracy');
    var settings = gameInfo.treatments.standard;

    // Reads in descil-mturk configuration.
    var descilConfPath = path.resolve(__dirname, 'descil.conf.js');

    // Load the code database.
    var dk = require('descil-mturk')(descilConfPath);
    function codesNotFound() {
        if (!dk.codes.size()) {
            throw new Error('Meritocracy game.room: no codes found.');
        }
        // Add a ref to the node obj.
        node.dk = dk;
    }

    if (settings.AUTH === 'MTURK') {
        dk.getCodes(codesNotFound);
    }
    else {
        dk.readCodes(codesNotFound);
    }


    // Set first treatment to true. Each Group plays two treatments.
    room.firstTreatment = true;


    // How many sessions should be dispatched.
    var TARGET_SESSIONS = settings.TARGET_SESSIONS;
    // Should we accept sessions.
    var acceptExtraSessions = settings.ACCEPT_EXTRA_SESSIONS;

    // If NO authorization is found, local codes will be used,
    // and assigned automatically.
    var noAuthCounter = -1;

    // Used to rotate treatments, and count how many have been dispatched.
    var sessionCounter = 0;

    // Still dispatching.
    var roomClosed = false;

    // Loads the database layer. If you do not use an external database
    // you do not need these lines.
    var Database = require('nodegame-db').Database;
    var ngdb = new Database(node);
    var mdb = ngdb.getLayer('MongoDB');

    // Creates a Stager object. It will be used to define the sequence of
    // stages for this waiting rooms.
    var stager = new node.Stager()

    // Creating a unique game stage that will handle all incoming connections.
    stager.addStage({
        id: 'waiting',
        cb: function () {
            // Returning true in a stage callback means execution ok.
            return true;
        }
    });

    // Assigns a treatment condition to a group.
    function decideRoom(treatment) {
        var treats;
        ++sessionCounter;
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
        // 6 sessions, with two parallel groups, playing two treatments each
        if (treatment === 'LAB') {
            switch(settings.SESSION_ID) {
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
        // online
        else if (treatment === 'rotation') {
            if (sessionCounter === 1) {
                treatment = 'random';
            }
            else if (sessionCounter === 2) {
                treatment = 'exo_v1000';
            }
            else if (sessionCounter === 3) {
                treatment = 'exo_v100';
            }
            else if (sessionCounter === 4) {
                treatment = 'exo_v50';
            }
            else {
                treatment = 'exo_v20';
            }
        }

        // Implement logic here.
        return gameInfo.treatments[treatment];
    }

    // You can share objects with the included file. Include them in the
    // object passed as second parameter.
    var client = channel.require(__dirname + '/includes/game.client', {
        ngc: ngc,
        settings: settings
    });

    var clientWait = channel.require(__dirname + '/includes/wait.client', {
        ngc: ngc,
        settings: settings
    });

    // Creating an authorization function for the players.
    // This is executed before the client the PCONNECT listener.
    channel.player.authorization(function(header, cookies, room) {
        var code, player, token;

        if (settings.AUTH === 'NO') {
            return true;
        }

        playerId = cookies.player;
        token = cookies.token;

        console.log('game.room: checking auth.');

        // Weird thing.
        if ('string' !== typeof playerId) {
            console.log('no player: ', player)
            return false;
        }

        // Weird thing.
        if ('string' !== typeof token) {
            console.log('no token: ', token)
            return false;
        }

        code = dk.codeExists(token);

        console.log(code);
        console.log("-------------------");

        // Code not existing.
	if (!code) {
            console.log('not existing token: ', token);
            return false;
        }

        if (code.checkedOut) {
            console.log('token was already checked out: ', token);
            return false;
        }

        // Code in use.
        //  usage is for LOCAL check, IsUsed for MTURK
	if (code.valid === false) {
            if (code.disconnected) {
                return true;
            }
            else {
                console.log('token already in use: ', token);
                return false;
            }
	}

        // Client Authorized
        return true;

    });

    // Assigns Player Ids based on cookie token. Must return a string.
    channel.player.clientIdGenerator(function(headers, cookies, validCookie,
                                              ids, info) {
        var code;
        if (settings.AUTH === 'NO') {
            code = dk.codes.db[++noAuthCounter].AccessCode;
            return code;
        }

        // Return the id only if token was validated.
        // More checks could be done here to ensure that token is unique in ids.
        if (cookies.token && validCookie) {
            return cookies.token;
        }
    });

    // Creating an init function.
    // Event listeners registered here are valid for all the stages of the game.
    stager.setOnInit(function() {
        var counter = 0;
        var COUNTDOWN_MILLISECONDS = settings.COUNTDOWN_MILLISECONDS;
        var COUNTDOWN_AT_POOL_SIZE = settings.COUNTDOWN_AT_POOL_SIZE;
        var POOL_SIZE = settings.POOL_SIZE;
        var GROUP_SIZE = settings.GROUP_SIZE;
        var GROUP_OVERBOOKING = settings.GROUP_OVERBOOKING;

        // Countdown
        var countdown;

        // Starts the countdown on (if that is the case) and notify the players.
        // If countdown is already started, just send the time left to the
        // new client (pId).
        function startCountdown(nPlayers, pId) {
            // If COUNTDOWN option is on check whether we should start it.
            if ('undefined' !== typeof COUNTDOWN_AT_POOL_SIZE &&
                nPlayers >= COUNTDOWN_AT_POOL_SIZE) {
                if (!countdown) {
                    // Need to specify update, otherwise update = milliseconds.
                    countdown = node.timer.createTimer({
                        milliseconds: COUNTDOWN_MILLISECONDS,
                        update: 1000,
                        timeup: 'DISPATCH'
                    });
                    // Send countdown to client for the first time to ALL.
                    node.say('countdown', 'ALL',  countdown.timeLeft);
                    countdown.start();
                }
                else {
                    // Countdown already existing. Send it to the new client.
                    node.say('countdown', pId, countdown.timeLeft);
                }
            }
        }

        // Stops the countdown (if that is the case) and notify all players.
        function stopCountdown(success) {
            // If COUNTDOWN option is on check whether we should start it.
            if ('undefined' !== typeof COUNTDOWN_AT_POOL_SIZE) {
                if (countdown &&
                    room.clients.player.size() < COUNTDOWN_AT_POOL_SIZE) {
                    // Timer must be destroyed to clear event listeners.
                    node.timer.destroyTimer(countdown);
                    countdown = null;
                    // Send countdown to client.
                    node.say('countdownStop', 'ALL', !success);
                }
            }
        }

        function adjustGameSettings(nPlayers) {
            var mySettings;
            mySettings = {
                MIN_PLAYERS: settings.MIN_PLAYERS,
                SUBGROUP_SIZE: settings.SUBGROUP_SIZE,
                GROUP_SIZE: settings.GROUP_SIZE,
                GROUP_OVERBOOKING: settings.GROUP_OVERBOOKING
            };

            // Settings are kept default.
            return mySettings;

            if (nPlayers !== 16) {
                if (nPlayers === 15) {
                    mySettings.SUBGROUP_SIZE = 5;
                    mySettings.GROUP_SIZE = 15;
                }
                else if (nPlayers >= 12) {
                    mySettings.GROUP_SIZE = 12;
                }
                else if (nPlayers >= 9) {
                    mySettings.GROUP_SIZE = 9;
                    mySettings.SUBGROUP_SIZE = 3;
                }
            }
            return mySettings;
        }

        // references...
        this.room = room;
        this.channel = channel;

        console.log('********Waiting Room Created*****************');

        function connectingPlayer(p) {
            var nPlayers, code;
            console.log('-----------Player connected ' + p.id);

            dk.markInvalid(p.id);

            if (settings.AUTH === 'MTURK') {
                dk.checkIn(p.id);
            }

            nPlayers = room.clients.player.size();

            console.log('CONNECTED PLAYERS: ', nPlayers);
            console.log('------------------------------');

            // Send the client the waiting stage.
            node.remoteSetup('game_metadata', p.id, clientWait.metadata);
            node.remoteSetup('plot', p.id, clientWait.plot);
            node.remoteCommand('start', p.id);

            node.say('waitingRoom', 'ALL', {
                poolSize: POOL_SIZE,
                nPlayers: nPlayers,
                atLeastPlayers: COUNTDOWN_AT_POOL_SIZE,
                gameCompleted: roomClosed
            });

            if (roomClosed) {
                // Checkin him / her out.
                code = dk.codes.id.get(p.id);
                if (!code) {
                    console.log('ERROR: no code for connecting player:', p.id);
                    return;
                }

//                // Award a compensation only the first time.
//                if (!code.win) {
//                    console.log('CO!!!!!!!!');
//                    accesscode = code.AccessCode;
//                    exitcode = code.ExitCode;
//                    code.win =  settings.COMPENSATION;
//                    dk.checkOut(accesscode, exitcode, code.win);
//                }
            }
            else {
                // Wait to have enough clients connected.
                if (nPlayers < POOL_SIZE) {
                    startCountdown(nPlayers, p.id);
                }
                else {
                    node.emit('DISPATCH');
                }
            }
        }

        // This callback is executed whenever a previously disconnected
        // players reconnects.
        node.on.preconnect(function (p) {
            console.log('Oh...somebody reconnected in the waiting room!', p);
            // Notify other player he is back.
            // TODO: add it automatically if we return TRUE? It must be done
            // both in the alias and the real event handler
            // TODO: Cannot use to: ALL, because this includes the reconnecting
            // player.
            node.game.pl.each(function(player) {
                node.socket.send(node.msg.create({
                    target: 'PCONNECT',
                    data: p,
                    to: player.id
                }));
            });

            node.socket.send(node.msg.create({
                target: 'PLIST',
                data: node.game.pl.db,
                to: p.id
            }));

            node.game.pl.add(p);
            connectingPlayer(p);
        });

        // This must be done manually for now (maybe will change in the future).
        node.on.mreconnect(function (p) {
            node.game.ml.add(p);
        });

        // This callback is executed when a player connects to the channel.
        node.on.pconnect(connectingPlayer);

        // This callback is executed when a player disconnects from the channel.
        node.on.pdisconnect(function(p) {
            // Also check if it should be stopped.
            stopCountdown();

            // Client really disconnected (not moved into another game room).
            if (channel.registry.clients.disconnected.get(p.id)) {
                // Free up the code.
                dk.markValid(p.id);
            }
        });


        node.on('DISPATCH', function() {
            var gameRoom, wRoom, tmpPlayerList, assignedRoom;
            var nPlayers, i, len;
            var runtimeConf, totalGroupSize;

            // Also check if it should be stopped.
            stopCountdown(true);

            // PlayerList object of waiting players.
            wRoom = room.clients.player;
            nPlayers = wRoom.size();

            console.log('-----------We have enough players: ' + nPlayers);

            runtimeConf = adjustGameSettings(nPlayers);

            totalGroupSize = runtimeConf.GROUP_SIZE +
                runtimeConf.GROUP_OVERBOOKING;

            i = -1, len = Math.floor(nPlayers / totalGroupSize);
            for (; ++i < len;) {

                // Doing the random matching.
                tmpPlayerList = wRoom.shuffle().limit(totalGroupSize);

                //Assigning a game room to this list of players
                assignedRoom = decideRoom(settings.CHOSEN_TREATMENT);
                runtimeConf.roomType = assignedRoom.name;

                // Creating a sub gaming room.
                // The object must contains the following information:
                // - clients: a list of players (array or PlayerList)
                // - logicPath: the path to the file containing the logic (string)
                // - channel: a reference to the channel of execution (ServerChannel)
                // - group: a name to group together multiple game rooms (string)
                //
                // The constructor also moves the client from this room into
                // the new room


                gameRoom = channel.createGameRoom({
                    gameName: 'meritocracy',
                    group: assignedRoom.name,
                    clients: tmpPlayerList,
                    runtimeConf: runtimeConf,
                    treatmentName: assignedRoom.name
                });


//                 // Setting metadata, settings, and plot.
//                 tmpPlayerList.each(function (p) {
//                     // Clearing the waiting stage.
//                     node.remoteCommand('stop', p.id);
//                     // Setting the actual game.
//                     node.remoteSetup('game_metadata', p.id, client.metadata);
//                     node.remoteSetup('game_settings', p.id, client.settings);
//                     node.remoteSetup('plot', p.id, client.plot);
//                     node.remoteSetup('env', p.id, client.env);
//                     node.remoteSetup('env', p.id, {
//                         roomType: assignedRoom.name
//                     });
//                 });

                
                // Start the logic.
                gameRoom.setupGame();
                gameRoom.startGame(true, []);

                // gameRoom.startGame();
            }

            if ('undefined' !== TARGET_SESSIONS) {
                if (sessionCounter === TARGET_SESSIONS) {
                    console.log('SESSION TARGET REACHED: ', sessionCounter);
                    if (!acceptExtraSessions) {
                        roomClosed = true;
                    }
                }
            }

            // TODO: node.game.pl.size() is unchanged.
            // We need to check with wRoom.size()
            if (room.clients.player.size()) {
                node.emit('NOTIFY_LEFTOVER');
            }
        });


        // If there are some players left out of the matching,
        // notify them that they have to wait more.
        node.on('NOTIFY_LEFTOVER', function() {
            var nPlayers;
            nPlayers = room.clients.player.size();
            if (nPlayers) {
                node.say('waitingRoom', 'ALL', {
                    poolSize: POOL_SIZE,
                    nPlayers: nPlayers,
                    retry: !roomClosed,
                    roomClosed: roomClosed
                });
            }
        });

    });

    // This function will be executed once node.game.gameover() is called.
    stager.setOnGameOver(function () {
        console.log('^^^^^^^^^^^^^^^^GAME OVER^^^^^^^^^^^^^^^^^^');
    });

    // Defining the game structure:
    // - init: must always be there. It corresponds to the `setOnInit` function.
    // - loop: without a second argument, loops forever on the same function.
    // Other possibilities are: .next(), .repeat(), .gameover().
    // @see node.Stager
    stager
        .init()
        .loop('waiting');

    // Returns all the information about this waiting room.
    return {
        nodename: 'wroom',
        game_metadata: {
            name: 'wroom',
            version: '0.1.0'
        },
        game_settings: {
            publishLevel: 0
        },
        plot: stager.getState(),
        // If debug is true, the ErrorManager will throw errors
        // also for the sub-rooms.
        debug: settings.DEBUG,
        verbosity: 0,
        publishLevel: 2
    };
};