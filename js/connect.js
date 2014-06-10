window.onload = function () {
    var pc = JSUS.getQueryString('n');
    var room = JSUS.getQueryString('room');

    if (!pc || pc < 2 || pc > 40) {
  	alert('Oopps! Something went wrong. Please contact the experimenter.');
  	throw new Error('No PC number found.');
    }

    // node.store.cookie('player', pc);

    // Configuring nodegame.
    node.setup('nodegame', {
	// HOST needs to be specified only 
	// if this file is located in another server
	// host: http://myserver.com,	  
        verbosity: 10,
        window: {
            disableRightClick: true,
            defaultHeaderPosition: 'left',
            promptOnleave: false,
            noEscape: true // Defaults TRUE
        },
        env: {
            auto: false,
            debug: false
        },
        events: {
	    dumpEvents: true, // output to console all fired events
            history: false // keep a record of all fired events
        },
        socket: {
	    type: 'SocketIo', // for remote connections
	    reconnect: false
	}
    });

    // Connecting to waiting room:
    // if a room is specified in query string use that info.
    // Otherwise use pc number.

    if (room && room === 'A') {
        node.connect("/meritocracy");
    }
    else if (room && room === 'B') {
        node.connect("/meritocracyB");
    }
    else if (pc < 18) {        
        node.connect("/meritocracy");
    }
    else {
        node.connect("/meritocracyB");
    }
}