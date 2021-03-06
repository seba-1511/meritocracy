/**
 * # Waiting Room for Ultimatum Game
 * Copyright(c) 2013 Stefano Balietti
 * MIT Licensed
 *
 * Handles incoming connections, matches them, sets the Ultimatum game
 * in each client, move them in a separate gaming room, and start the game.
 * ---
 */
module.exports = function(node, channel, room) {

    var path = require('path');

    // Reads in descil-mturk configuration.
    var confPath = path.resolve(__dirname, 'descil.conf.js');

    // Load the code database.
    var dk = require('descil-mturk')(confPath);
    //    dk.getCodes(function() {
    //        if (!dk.codes.size()) {
    //            throw new Error('game.room: no codes found.');
    //        }
    //    });
    dk.readCodes(function() {
        if (!dk.codes.size()) {
            throw new Errors('requirements.room: no codes found.');
        }
    });


    // Loads the database layer. If you do not use an external database
    // you do not need these lines.
    var Database = require('nodegame-db').Database;
    var ngdb = new Database(node);
    var mdb = ngdb.getLayer('MongoDB');

    // Load the nodegame-client object.
    var ngc = require('nodegame-client');

    // Creates a Stager object. It will be used to define the sequence of
    // stages for this waiting rooms.
    var stager = new node.Stager();

    // Loading the logic rules that will be used in each sub-gaming room.
    var logicPath = __dirname + '/includes/game.logic';

    //The function to decide in which game room the users are going to be
    var decideRoom = function(arrayRoom) {
        //Implement logic here.
        return arrayRoom[1];
    };

    // Creating the array for association between room and their logic
    var arrayRoomLogic = [{
        group: 'blackbox',
        logicPath: logicPath,
    }, {
        group: 'endo',
        logicPath: logicPath,
    }, {
        group: 'random',
        logicPath: logicPath,
    }, {
        group: 'exo_low',
        logicPath: logicPath,
    }, {
        group: 'exo_high',
        logicPath: logicPath,
    }, {
        group: 'exo_perfect',
        logicPath: logicPath,
    }, ];

    // You can share objects with the included file. Include them in the
    // object passed as second parameter.
    var client = channel.require(__dirname + '/includes/game.client', {
        ngc: ngc
    });

    var clientWait = channel.require(__dirname + '/includes/wait.client', {
        ngc: ngc
    });

    // Creating a unique game stage that will handle all incoming connections. 
    stager.addStage({
        id: 'waiting',
        cb: function() {
            // Returning true in a stage callback means execution ok.
            return true;
        }
    });

    // Creating an authorization function for the players.
    // This is executed before the client the PCONNECT listener.
    // channel.player.authorization(function(header, cookies, room) {
    //     var code;
    //     console.log('game.room: checking auth.');

    //     // Weird thing.
    //     if ('string' !== typeof cookies.player) {
    //         console.log('no player: ', cookies.player)
    //         return false;
    //     }

    //     // Weird thing.
    //     if ('string' !== typeof cookies.token) {
    //         console.log('no token: ', cookies.token)
    //         return false;
    //     }

    //     code = dk.codeExists(cookies.token);

    //     // Code not existing.
    //     if (!code) {
    //         console.log('not existing token: ', cookies.token);
    //         return false;
    //     }

    //     // Code in use.
    //     if (code.usage) {
    //         console.log('token already in use: ', cookies.token);
    //         return false;
    //     }

    //     // Mark the code as in use.
    //     dk.incrementUsage(cookies.token);

    //     // Client Authorized
    //     return true;
    // });


    // channel.player.clientIdGenerator(function(headers, cookies, ids, info) {
    //     return cookies.token;
    // });

    // Creating an init function.
    // Event listeners registered here are valid for all the stages of the game.
    stager.setOnInit(function() {
        var counter = 0;
        var POOL_SIZE = 2;
        var GROUP_SIZE = 2;

        // references...
        this.room = room;
        this.channel = channel;

        console.log('********Waiting Room Created*****************');

        // This callback is executed whenever a previously disconnected
        // players reconnects.
        node.on.preconnect(function(p) {
            console.log('Oh...somebody reconnected in the waiting room!', p);
            node.game.pl.add(p);
        });

        // This must be done manually for now (maybe will change in the future).
        node.on.mreconnect(function(p) {
            node.game.ml.add(p);
        });

        // This callback is executed when a player connects to the channel.
        node.on.pconnect(function(p) {
            var gameRoom, wRoom, tmpPlayerList, assignedRoom;
            var nPlayers, i, len;
            console.log('-----------Player connected ' + p.id);

            node.remoteAlert('Your code has been marked as in use. Do not ' +
                'leave this page, otherwise you will not be ' +
                'able to join the experiment again.', p.id);

            // PlayerList object of waiting players.
            wRoom = room.clients.player;
            nPlayers = wRoom.size();

            // Send the client the waiting stage.
            node.remoteSetup('game_metadata', p.id, clientWait.metadata);
            node.remoteSetup('plot', p.id, clientWait.plot);
            node.remoteCommand('start', p.id);

            node.say('waitingRoom', 'ALL', {
                poolSize: POOL_SIZE,
                nPlayers: nPlayers
            });

            // Wait to have enough clients connected.
            if (nPlayers < POOL_SIZE) {
                return;
            }

            console.log('-----------We have enough players: ' + wRoom.size());

            i = -1, len = Math.floor(nPlayers / GROUP_SIZE);
            for (; ++i < len;) {

                // Doing the random matching.
                tmpPlayerList = wRoom.shuffle().limit(GROUP_SIZE);

                //Assigning a game room to this list of players
                assignedRoom = decideRoom(arrayRoomLogic);

                // Creating a sub gaming room.
                // The object must contains the following information:
                // - clients: a list of players (array or PlayerList)
                // - logicPath: the path to the file containing the logic (string)
                // - channel: a reference to the channel of execution (ServerChannel)
                // - group: a name to group together multiple game rooms (string)
                gameRoom = channel.createGameRoom({
                    group: assignedRoom.group,
                    clients: tmpPlayerList,
                    channel: channel,
                    logicPath: assignedRoom.logicPath
                });

                // Setting metadata, settings, and plot.
                tmpPlayerList.each(function(p) {
                    // Clearing the waiting stage.
                    node.remoteCommand('stop', p.id);
                    // Setting the actual game.
                    node.remoteSetup('game_metadata', p.id, client.metadata);
                    node.remoteSetup('game_settings', p.id, client.settings);
                    node.remoteSetup('plot', p.id, client.plot);
                    node.remoteSetup('env', p.id, client.env);
                    node.remoteSetup('env', p.id, {roomType: assignedRoom.group});
                });

                // Start the logic.
                gameRoom.startGame();
            }

            // TODO: node.game.pl.size() is unchanged.
            // We need to check with wRoom.size()
            nPlayers = room.clients.player.size();
            if (nPlayers) {
                // If there are some players left out of the matching, notify
                // them that they have to wait more.
                wRoom.each(function(p) {
                    node.say('waitingRoom', p.id, {
                        poolSize: POOL_SIZE,
                        nPlayers: nPlayers,
                        retry: true
                    });
                });
            }
        });
    });

    // This function will be executed once node.game.gameover() is called.
    stager.setOnGameOver(function() {
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
        debug: true,
        verbosity: 0,
        publishLevel: 2
    };
};
