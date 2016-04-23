'use strict';
var fs = require('fs'),
    path = require('path'),
    readline = require('readline');
var iconv = require('iconv-lite');

exports.openCSV = (fileName) => {
    let filePath = path.join(__dirname, 'data-csv', fileName);
    return readline.createInterface({
        input: fs.createReadStream(filePath).pipe(iconv.decodeStream('latin1'))
    });
};

const RE_STR = /"([\w\/:\s]*)"/i;

exports.parseLine = (line) => {
    let values = line.split(';');
    return values.map(val => {
        let m = val.match(RE_STR);
        return m && m[1] || val.substr(1, val.length-2);
    })
};
