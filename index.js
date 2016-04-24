'use strict';

const loadData = require('./load-data');

const groups = require('./models/party-groups'),
    states = Object.keys(groups);

for (let i=0; i<states.length; i++) {
    let state = states[i];
    //if (~['RS', 'RJ', 'SP'].indexOf(state)) {
    //    continue;
    //}
    Promise.all([
        loadData.loadPositions(state),
        loadData.loadCandidate(state)
    ]).then(results => {
        let position = results[0],
            candidates = results[1];
        loadData.loadVotes(position, candidates);
    });
}
