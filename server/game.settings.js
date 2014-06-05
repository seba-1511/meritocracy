/**
 * # Game settings: Meritocracy game.
 * Copyright(c) 2014 Stefano Balietti
 * MIT Licensed
 *
 * http://www.nodegame.org
 * ---
 */
module.exports = {

    // Files:

    logicPath: "includes/game.logic.js",
    clientPath: "includes/game.client.js",

    // Waiting Room Settings. *
    ////////////////////////////

    // How many sessions should be dispatched.
    TARGET_SESSIONS: 5,

    // Stop creating new sessions after N sessions has been dispatched.
    ACCEPT_EXTRA_SESSIONS: false,

    // When the MIN_POOL_SIZE level is reached a countdown is started.
    COUNTDOWN_MILLISECONDS: 20000,

    // When enough players are connected starts  countdown to launch the game.
    // Countdown is canceled if POOL_SIZE goes again under the threshold.
    // Set to undefined to disable.
    COUNTDOWN_AT_POOL_SIZE: undefined,

    // How many players have to connect before a random subset is drawn.
    POOL_SIZE: 4,
    // How many players in each group ( must be <= POOL_SIZE).
    GROUP_SIZE: 4,
    // How many extra players besides those in GROUP_SIZE will be added.
    GROUP_OVERBOOKING: 0,

    // Minimum number of players that must be always connected (NOT USED).
    MIN_PLAYERS: 4,

    // Session Counter start from.
    SESSION_ID: 1, // online last 114

    // Game settings.
    TREATMENTS: ['blackbox', 'endo', 'random', 'exo_perfect',
                 'exo_v2', 'exo_v5', 'exo_v10', 'exo_v20',
                 'exo_v50', 'exo_v100', 'exo_v1000'
    ],

    // Previous treatment names and variance level
    // exo_high -> 2
    // exo_low -> 4
    // exo_lowlow -> 20
    // exo_extralow -> 100
    // exo_minor -> 1000

    // Which treatment to play.
    // Leave undefined for a randomly chosen treatment.
    CHOSEN_TREATMENT: 'LAB',

    // How many times the meritocracy stage is repeated. *
    REPEAT: 2,
    // Names of the groups.
    GROUP_NAMES: ['1', '2', '3', '4'],
    // How many player in each group. *
    SUBGROUP_SIZE: 4,

    // Noise standard deviation. High and low "meritocracy".
    NOISE_STD: {
        exo_v2: 1.4142,
        exo_v3: 1.732051,
        exo_v5: 2.236068,
        exo_v10: 3.162278,
        exo_v20: 4.472136,
        exo_v50: 7.071068,
        exo_v100: 10,
        exo_v1000: 31.62278
    },

    // Payment settings. *
    GROUP_ACCOUNT_DIVIDER: 2,
    INITIAL_COINS: 20,

    // Divider ECU / DOLLARS *
    EXCHANGE_RATE: 100, // 333, // 266 for 20 rounds

    COMPENSATION: 0.25,

    timer: {
        instructions1: 300000,
        instructions2: 180000,
        quiz: 120000,
        questionnaire: 180000,
        bid: function() {
	    if (node.game.getCurrentGameStage().round < 3) return 30000;
	    return 15000;
	},
        results: function() {
            var round;
            round = node.game.getCurrentGameStage().round;
	    if (round < 2) return 60000;
	    if (round < 3) return 50000;
	    return 30000;
        },
        // Logic
        breakPart1: 20000,
        // Waiting Room
        dispatch: 3000
    },

    // DEBUG.
    DEBUG: true,

    // AUTO-PLAY.
    AUTO: true,

    // DATABASE.
    DB: 'MONGODB', // FILE, MONGODB

    // AUTHORIZATION.
    AUTH: 'LOCAL', // MTURK, LOCAL, NO.


    treatments: {

        exo_perfect: {
            fullName: "Perfect Meritocracy",
            description: "Zero variance for perfect meritocracy."
        },

        exo_v3: {
            fullName: "High Meritocracy V3",
            description: "Low level of variance for a high level of meritocracy.",
        },

        exo_v20: {
            fullName: "Low Meritocracy V20",
            description: "High level of variance for a low level of meritocracy."
        },

        random: {
            fullName: "Random",
            description: "Completely random matching for no meritocracy."
        }
    }


    // * = if you change this you need to update instructions and quiz
};
