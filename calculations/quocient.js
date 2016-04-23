'use strict';

exports.process = (groups, pos, quoc) => {
    let resume = {total: 0};
    for (let i = 0; i < groups.length; i++) {
        let group = groups[i];
        group.quoc = group.votes / quoc;
        group.positions = Math.round(group.quoc);
        if (group.positions) {
            resume.total += group.positions;
        }
        resume[i] = {win: group.positions, sup: group.positions * 2};
    }
    // others positions
    for (let r = resume.total; r < pos; r++) {
        let great = {idx: -1, val: 0};
        for (let i = 0; i < groups.length; i++) {
            let group = groups[i];
            // ignore if no position
            if (!group.positions) continue;

            let med = group.votes / (group.positions + 1);
            if (med > great.val) {
                great.val = med;
                great.idx = i;
            }
        }
        if (~great.idx) {
            let positions = (groups[great.idx].positions += 1);
            resume[great.idx] = {win: positions, sup: positions * 2};
            resume.total += 1;
        }
    }
    return resume;
};
