'use strict';

const loadData = require('./load-data');

let state = 'AC';

Promise.all([
    loadData.loadPositions(state),
    loadData.loadCandidate(state)
]).then(results => {
    let position = results[0],
        candidates = results[1];
    loadData.loadVotes(position, candidates);
});
