'use strict';
var path = require('path'),
    fs = require('fs');

exports.gen = (state) => {
    let dataPath = path.join(__dirname, 'data-json', state, `candidate-impeachment_${state}.json`);
    if (!fs.existsSync(dataPath)) {
        return;
    }

    let dataStr = fs.readFileSync(dataPath, 'utf8'),
        candidates = JSON.parse(dataStr);

    let resume = [],
        parties = {},
        cache = {};
    for (let c = 0; c < candidates.length; c++) {
        let candidate = candidates[c];
        let list = parties[candidate.candidate] = [];
        for (let o=0; o<candidate.group.others.length; o++) {
            let other = candidate.group.others[o];
            if (!~list.indexOf(other.party)) {
                list.push(other.party);
            }

            let target = `${candidate.candidate}-${other.party}`;
            if (!cache[target]) {
                cache[target] = 0;
            }
            cache[target] += other.auxVotes;
        }
    }

    for (let c = 0; c < candidates.length; c++) {
        let candidate = candidates[c];
        let label = `${candidate.party} - ${candidate.urnaName}`;
        let list = parties[candidate.candidate];
        if (!list.length) {
            resume.push([label, candidate.party, 100]);
        } else for (let l=0; l<list.length; l++) {
            let party = list[l];
            let target = `${candidate.candidate}-${party}`;
            if (cache[target]) {
                resume.push([label, party, cache[target]]);
            }
        }
    }

    let jsonPath = path.join(__dirname, 'data-json', state, `resume_${state}.json`);
    //if (!fs.existsSync(jsonPath)) {
    fs.writeFile(jsonPath, JSON.stringify(resume, 0, '  '), 'utf8', () => {
        console.log('saved in:', jsonPath);
    });
};


const groups = require('./models/party-groups'),
    states = Object.keys(groups);

for (let i=0; i<states.length; i++) {
    let state = states[i];
    exports.gen(state);
}