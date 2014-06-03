window.onload = function () {
    var pc = JSUS.getQueryString('n');
  		
    if (!pc || pc < 2 || pc > 10) {
  	alert('Oopps! Something went wrong. Please contact the experimenter.');
  	throw new Error('No PC number found.');
    }

    // Configuring nodegame.
    node.setup('nodegame', {
	// HOST needs to be specified only 
	// if this file is located in another server
	// host: http://myserver.com,	  
        verbosity: 10,
        window: {
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

    // Connecting to waiting room.
    if (pc < 18) {        
        node.connect("/meritocracy");
    }
    else {
        node.connect("/meritocracyB");
    }
}