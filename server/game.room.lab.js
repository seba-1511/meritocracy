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
    var J = require('JSUS').JSUS;

    // Load Meritocracy settings;
    var gameInfo = channel.servernode.getGamesInfo('meritocracy');
    var settings = gameInfo.treatments.standard;

    // Set first treatment to true. Each group plays two treatments.
    room.firstTreatment = true;

    // If NO authorization is found, local codes will be used,
    // and assigned automatically.
    room.noAuthCounter = -1;

    // Used to rotate treatments, and count how many have been dispatched.
    room.sessionCounter = settings.SESSION_ID;

    // Loads the database layer. If you do not use an external database
    // you do not need these lines.
    var Database = require('nodegame-db').Database;
    var ngdb = new Database(node);
    var mdb = ngdb.getLayer('MongoDB');

    // Decide Room function.
    var decideRoom = require(__dirname + '/includes/decide.treatments.js');

    // Set Auth and Client ID Generator to Player Server.
    var authObj = channel.require(__dirname + '/includes/auth.lab.js', {
        settings: settings,
        room: room
    });
    channel.player.authorization(authObj.authorization);
    channel.player.clientIdGenerator(authObj.clientIdGenerator);

    // Creates a Stager object. It will be used to define the sequence of
    // stages for this waiting rooms.
    var stager = new node.Stager()

    // Creating an init function.
    // Event listeners registered here are valid for all the stages of the game.
    stager.setOnInit(function() {
        var counter = 0;
        var POOL_SIZE = settings.POOL_SIZE;
        var GROUP_SIZE = settings.GROUP_SIZE;
        var GROUP_OVERBOOKING = settings.GROUP_OVERBOOKING;

        function adjustGameSettings() {
            return {
                MIN_PLAYERS: settings.MIN_PLAYERS,
                SUBGROUP_SIZE: settings.SUBGROUP_SIZE,
                GROUP_SIZE: settings.GROUP_SIZE,
                GROUP_OVERBOOKING: settings.GROUP_OVERBOOKING,
                part: room.firstTreatment ? 1 : 2
            };
        }

        function connectingPlayer(p) {
            var nPlayers;
            nPlayers = room.clients.player.size();
            // Wait to have enough clients connected.
            if (nPlayers >= POOL_SIZE) {
                node.emit('DISPATCH');
            }
        }

        node.on.preconnect(function(p) {
            console.log('Oh...somebody reconnected in the waiting room!', p);
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
            // nothing.
        });

        node.on('DISPATCH', function() {
            var gameRoom, wRoom, tmpPlayerList, assignedRoom;
            var nPlayers, i, len;
            var runtimeConf, totalGroupSize;

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
                assignedRoom = decideRoom(channel, room, gameInfo,
                                          settings.CHOSEN_TREATMENT);

                // Creating a sub gaming room.
                // The constructor also moves the client from this room into
                // the new room
                gameRoom = channel.createGameRoom({
                    gameName: 'meritocracy',
                    treatmentName: assignedRoom.name,
                    group: assignedRoom.name,
                    clients: tmpPlayerList,
                    runtimeConf: runtimeConf
                });

                gameRoom.setupGame();
                gameRoom.startGame();
            }

        });

        console.log('********Waiting Room Created*****************');
    });

    // This function will be executed once node.game.gameover() is called.
    stager.setOnGameOver(function () {
        console.log('^^^^^^^^^^^^^^^^GAME OVER^^^^^^^^^^^^^^^^^^');
    });

    // Creating a unique game stage that will handle all incoming connections.
    stager.addStage({
        id: 'waiting',
        cb: function () {
            // Returning true in a stage callback means execution ok.
            return true;
        }
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
        nodename: 'merit_wait_room',
        game_metadata: {
            name: 'merit_wait_room',
            version: '0.2.0'
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