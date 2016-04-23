'use strict';
var fs = require('fs'),
    path = require('path'),
    reader = require('./reader');

let diacritics = require('diacritics');

const $parties = require('./models/parties');
const $groups = require('./models/party-groups');

const $quocient = require('./calculations/quocient');

exports.loadPositions = (state) => new Promise(resolve => {
    let lineReader = reader.openCSV(`consulta_vagas_2014_${state}.txt`, state);
    lineReader.on('line', (line) => {
        let values = reader.parseLine(line);
        let posCode = values[7];
        if (posCode !== '6') {
            return;
        }
        let position = {
            code: Number(posCode),
            state: values[4],
            name: values[8],
            total: Number(values[9])
        };
        resolve(position);
    });
});

exports.loadCandidate = (state) => new Promise(resolve => {
    let lineReader = reader.openCSV(`consulta_cand_2014_${state}.txt`, state);
    let candidates = [];
    lineReader.on('line', (line) => {
        let values = reader.parseLine(line);
        let posCode = values[8];
        if (posCode !== '6') {
            return;
        }
        let candidate = {
            state: values[5],
            fullName: values[10],
            urnaName: diacritics.remove(values[14]),
            candidate: Number(values[12]),
            party: values[18]
        };
        candidates.push(candidate);
    });

    let prom = new Promise(resolve => {
        let candVotes = require('./data-json/data-impeachment-cvt');
        resolve(candVotes);
    });

    lineReader.on('close', () => {
        prom.then(candVotes => {

            candVotes.forEach(candVote => {
                if (candVote.state !== state) return;
                let candidate = candidates.filter(c => c.urnaName === candVote.urnaName);
                if (candidate && candidate.length) {
                    let cand = candidate[0];
                    //cand.avatar = candVote.avatar;
                    cand.impeachment = candVote.vote;
                } else {
                    console.log('>>>> not found', candVote.urnaName, candVote.state);
                }
            });

            resolve(candidates);
        });
    });
});

exports.loadVotes = (opts, candsFull) => {
    let state = opts.state,
        totalPositions = opts.total;

    let lineReader = reader.openCSV(`votacao_secao_2014_${state}.txt`, state);

    let totalVotes = 0,
        partyGroups = JSON.parse(JSON.stringify($groups[state].map(g => {
            g.votes = 0;
            return g;
        })));

    let sessions = [],
        candidates = [],
        parties = [],
        candidateCache = {},
        partyCache = {};
    lineReader.on('line', (line) => {
        let values = reader.parseLine(line);

        let position = values[11];
        if (position !== '6') {
            return;
        }
        let candidateCode = values[13];
        if (~['95', '96', '97'].indexOf(candidateCode)) {
            return;
        }
        let votes = Number(values[14]);

        let session = {
            date: values[0],
            hour: values[1],
            year: values[2],
            state: values[5],
            city: values[7],
            zone: values[9],
            session: values[10],
            position: position,
            candidate: Number(candidateCode),
            votes: votes
        };

        // Calculete per Party
        let partyCode = candidateCode.substr(0, 2);
        if (!partyCache[partyCode]) {
            let code = Number(partyCode),
                abbr = $parties.filter(i => i.number === code)[0].name;
            partyCache[partyCode] = {
                party: code,
                abbr: abbr,
                group: partyGroups.findIndex(p => ~p.parties.indexOf(abbr)),
                candidates: {},
                votes: 0
            };
            parties.push(partyCache[partyCode]);
            if (partyCache[partyCode].group === -1) {
                partyCache[partyCode].group = partyGroups.length;
                partyGroups.push({
                    name: `${code} - ${abbr}`,
                    parties: [abbr],
                    votes: 0
                })
            }
            partyCache[abbr] = partyCache[partyCode];
        }
        let party = partyCache[partyCode];
        party.votes += votes;
        if (!party.candidates[candidateCode]) {
            party.candidates[candidateCode] = {
                candidate: session.candidate,
                votes: 0
            };
        }
        party.candidates[candidateCode].votes += votes;
        partyGroups[party.group].votes += votes;

        // Calculate per Candidate
        if (!candidateCache[candidateCode]) {
            let candNumber = session.candidate,
                cIdx = candsFull.findIndex(c => c.candidate === candNumber),
                candidateFull = ~cIdx ? candsFull[cIdx] : {};
            candidateCache[candidateCode] = {
                candidate: candNumber,
                fullName: candidateFull.fullName,
                urnaName: candidateFull.urnaName,
                avatar: candidateFull.avatar,
                party: party.abbr,
                state: session.state,
                impeachment: candidateFull.impeachment,
                votes: 0
            };
            candidates.push(candidateCache[candidateCode]);
        }

        let candidate = candidateCache[candidateCode];
        candidate.votes += votes;

        sessions.push(session);
        totalVotes += votes;
    });

    lineReader.on('close', () => {
        // sort data
        let sort = (a, b) => {
            return a.votes < b.votes ? 1 : -1;
        };
        candidates = candidates.sort(sort);
        parties = parties.sort(sort);

        // calculations
        let quoc = Math.round(totalVotes / totalPositions);
        console.log('Quociente Eleitoral, ', quoc);

        // calculate by groups
        let groupResume = $quocient.process(partyGroups, totalPositions, quoc);

        // statistic by party
        let partyResume = $quocient.process(parties, totalPositions, quoc),
            partyIdxs = {};
        for (let i = 0; i < parties.length; i++) {
            let party = parties[i];
            partyIdxs[party.abbr] = i;
        }


        console.log('Total Positions', totalPositions, '>>>', groupResume.total, partyResume.total);

        let totalImp = 0,
            candVotes = [],
            others = {};
        candidates = candidates.map((c, i) => {
            c.pct = Math.round((c.votes / totalVotes) * 10000) / 100;
            c.individual = quoc < c.votes;
            c.quoc = Math.round((c.votes / quoc) * 100) / 100;

            let party = partyCache[c.party],
                groupResult = groupResume[party.group],
                partyResult = partyResume[partyIdxs[c.party]];
            c.status = {};
            if (c.individual) {
                c.status.individual = 'winner';
            }
            if (groupResult.win > 0) {
                c.status.geral = 'winner';
                console.log(i, '>> winnn', c.candidate, c.party, groupResult, party.abbr, party.group);
                groupResult.win--;
            } else if (groupResult.sup > 0) {
                c.status.geral = 'sup';
                groupResult.sup--;
            }

            if (!others[c.party]) {
                others[c.party] = [];
            }
            let g = partyGroups[party.group];
            if (c.status.geral && c.impeachment !== undefined) {
                totalImp++;
                let cc = JSON.parse(JSON.stringify(c));
                if (g.totalNeedVotes === undefined) {
                    g.countNeeds = 0;
                    g.totalNeedVotes = 0;
                }
                if (g.totalExtraVotes === undefined) {
                    g.countExtra = 0;
                    g.totalExtraVotes = 0;
                }

                cc.group = {
                    id: party.group,
                    parties: g.parties,
                    others: []
                };
                candVotes.push(cc);
                if (c.individual) {
                    let votes = c.votes - quoc;
                    others[c.party].push({
                        candidate: c.candidate,
                        urnaName: c.urnaName,
                        party: c.party,
                        state: c.state,
                        votes: votes
                    });
                    g.countExtra++;
                    g.totalExtraVotes += votes;
                } else {
                    g.countNeeds++;
                    g.totalNeedVotes += quoc - c.votes;
                }
            } else {
                others[c.party].push({
                    candidate: c.candidate,
                    urnaName: c.urnaName,
                    party: c.party,
                    state: c.state,
                    votes: c.votes
                });
                g.countExtra++;
                g.totalExtraVotes += c.votes;
            }

            if (partyResult.win > 0) {
                c.status.party = 'winner';
                partyResult.win--;
            } else if (partyResult.sup > 0) {
                c.status.party = 'sup';
                partyResult.sup--;
            }
            return c;
        });

        let extraCache = {},
            extras = [];
        for (let i = 0; i < candVotes.length; i++) {
            let candidate = candVotes[i];
            if (candidate.individual) {
                continue;
            }
            let group = candidate.group,
                partyGroup = partyGroups[group.id],
                listParties = group.parties;

            if (partyGroup.hasMore === undefined) {
                partyGroup.hasMore = partyGroup.totalNeedVotes < partyGroup.totalExtraVotes;
                if (!partyGroup.hasMore) {
                    partyGroup.pctLess = (partyGroup.totalNeedVotes - partyGroup.totalExtraVotes) / partyGroup.totalNeedVotes;
                } else {
                    partyGroup.pctLess = 0;
                }
                console.log('>>>>', listParties.join(','), '=>>', partyGroup.totalExtraVotes * partyGroup.pctLess);
                console.log('--->', partyGroup.pctLess, partyGroup.hasMore , '=', partyGroup.totalNeedVotes, `(${partyGroup.countNeeds})`, '<', partyGroup.totalExtraVotes, `(${partyGroup.countExtra})`);
            }

            const totalExtraVotes = partyGroup.hasMore ? partyGroup.totalNeedVotes : partyGroup.totalExtraVotes;
            var needVotes = quoc - candidate.votes;
            var needPct = Math.round((needVotes / totalExtraVotes) * 10000) / 10000;
            const lessVotes = Math.round(needVotes * partyGroup.pctLess);
            group.needVotes = needVotes;
            group.pctVotes = needPct;


            if (lessVotes) {
                let auxNeedVotes = needVotes - lessVotes;
                let auxNeedPct = Math.round(((needPct * auxNeedVotes) / needVotes) * 10000) / 10000;

                needPct = auxNeedPct;
                needVotes = auxNeedVotes;
            }

            group.realNeedVotes = needVotes;
            group.realPctVotes = needPct;

            group.totalVotes = 0;
            for (let k = 0; k < listParties.length; k++) {
                let party = listParties[k];
                let _others = others[party].filter(o => candidate.candidate !== o.candidate);
                group.others.push(..._others.map(o => {
                    let c = JSON.parse(JSON.stringify(o));
                    c.pct = needPct;
                    c.auxVotes = Math.round(needPct * o.votes);
                    return c;
                }));
            }
            let voteEach = Math.round(needVotes / group.others.length);
            group.voteEach = voteEach;
            // max 20 times
            for (let t = 0, _others = [...group.others]; t < 20 && group.totalVotes <= group.realNeedVotes; t++) {
                let more = [];

                for (let k = 0; k < _others.length; k++) {
                    let o = _others[k];
                    if (o.canVotes) {
                        o.auxVotes = o.canVotes;
                        delete o.canVotes;
                    }

                    if (o.auxVotes > voteEach) {
                        o.canVotes = o.auxVotes;
                        o.auxVotes = voteEach;
                        o.pct = Math.round(o.auxVotes * 10000 / o.votes) / 10000;
                        more.push(o);
                    }
                }
                _others.length = 0;
                _others.push(...more);

                group.totalVotes = Math.round(group.others.map(o => o.auxVotes).reduce((a, b) => a + b));
                let _less = group.realNeedVotes - group.totalVotes;
                if (_others.length && _less > 0) {
                    if (_less < _others.length) {
                        voteEach++;
                        _others.length = _less;
                    } else {
                        let incr = Math.round(_less / _others.length);
                        voteEach = incr + voteEach;
                    }
                    //console.log('####', candidate.urnaName, group.voteEach, voteEach, '=', _less);
                    //console.log('==>>', group.auxTotalVotes, '<=', group.realNeedVotes, '/', _others.length);
                } else {
                    break;
                }
            }

            group.others.forEach(c => {
                if (!extraCache[c.candidate]) {
                    extraCache[c.candidate] = {
                        cadidate: c.candidate,
                        urnaName: c.urnaName,
                        votes: c.votes,
                        donateVotes: 0
                    };
                    extras.push(extraCache[c.candidate]);
                }
                extraCache[c.candidate].donateVotes += c.auxVotes;
            })
        }

        partyGroups = partyGroups.sort(sort);


        // save data
        [
            //{data: sessions, name: `sessions`},
            {data: candidates, name: `candidates`},
            {data: parties, name: `parties`},
            {data: partyGroups, name: `groups`},
            {data: candVotes, name: 'candidate-impeachment'},
            {data: extras, name: 'candidate-extras'}
        ].forEach(val => {
            let dir = path.join(__dirname, 'data-json', state);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir);
            }

            let jsonPath = path.join(__dirname, 'data-json', state, `${val.name}_${state}.json`);
            //if (!fs.existsSync(jsonPath)) {
            fs.writeFile(jsonPath, JSON.stringify(val.data, 0, '  '), 'utf8', () => {
                console.log('saved in:', jsonPath);
            });
            //}
        })
    });
};
