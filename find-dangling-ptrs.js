/*
 * should take in two paramers...
 * 1. .elf file
 * 2. log file
 */

const Path = require('path');
const fs = require('fs');
const spawnSync = require('child_process').spawnSync;

let logFile = process.argv[2];
let elfFile = process.argv[3];
let symbols;
let logFileFromStdin;

if (!elfFile && Path.extname(logFile).toLowerCase() === '.elf') {
    elfFile = logFile;
    logFile = null;
}

if (!elfFile) {
    console.log('ELF file not provided, syntax `find-dangling-ptrs [logfile] [elffile]`');
    console.log('Log file may be omitted, then reading from stdin');
    process.exit(1);
}

if (!logFile) {
    let buff = Buffer.from([]);

    console.log('Waiting for input from stdin...');

    process.stdin.on('data', d => {
        buff = Buffer.concat([d, buff]);
    });

    process.stdin.on('end', () => {
        // not ready with symbol parsing yet?
        if (!symbols) {
            logFileFromStdin = buff.toString('utf-8');
            return;
        }
        startProcessing(buff.toString('utf-8'), symbols)
    });
}

console.log('Extracting symbols from', elfFile);
let objdumpResult = spawnSync('arm-none-eabi-objdump', [ '-S', elfFile ]);
if (objdumpResult.error) {
    console.log('Failed to launch `arm-none-eabi-objdump`, is it in your PATH?');
    console.log(objdumpResult.error.toString());
    process.exit(1);
}

if (objdumpResult.status !== 0) {
    console.log('Failed to execute `arm-none-eabi-objdump` properly (returned ' + objdumpResult.status + ')');
    console.log(objdumpResult.stdout.toString('utf-8'));
    console.log(objdumpResult.stderr.toString('utf-8'));
    process.exit(1);
}

console.log('Extracting symbols OK');

// alright... we have the symbols
symbols = objdumpResult.stdout.toString('utf-8');

if (logFile) {
    return startProcessing(fs.readFileSync(logFile, 'utf-8'), symbols);
}
else if (logFileFromStdin) {
    return startProcessing(logFileFromStdin, symbols);
}

function startProcessing(logFileContent, symbols) {
    let lines = logFileContent.split('\n').filter(f=>!!f).filter(f=>f[0] === '#');

    let allocs = {};

    for (let l of lines) {
        if (l.indexOf('#m:') === 0) {
            // malloc
            let [op, ptr, loc, size] = l.split(/[\:;-]/);
            allocs[ptr] = { loc: loc, size: size };
        }
        else if (l.indexOf('#c:') === 0) {
            // calloc
            let [op, ptr, loc, size, items] = l.split(/[\:;-]/);
            allocs[ptr] = { loc: loc, size: size * items };
        }
        else if (l.indexOf('#f:') === 0) {
            // free
            let [op, ret, loc, ptr] = l.split(/[\:;-]/);
            if (allocs[ptr]) {
                delete allocs[ptr];
            }
            else if (ptr !== '0x0') {
                console.warn('Free for untracked pointer', ptr);
            }
        }
        else if (l.indexOf('#r:') === 0) {
            let [op, new_ptr, loc, old_ptr, size] = l.split(/[\:;-]/);
            if (allocs[old_ptr]) {
                delete allocs[old_ptr];
            }
            else if (ptr !== '0x0') {
                console.warn('Realloc for untracked pointer', old_ptr);
            }

            allocs[new_ptr] = { loc: loc, size: size };
        }
    }

    let pointer = Object.keys(allocs).length === 1 ? 'pointer' : 'pointers';
    console.log(`\nFound ${Object.keys(allocs).length} dangling ${pointer}`);

    let symbolLines = symbols.split('\n');

    // dedupe the allocations...
    let deduped = Object.keys(allocs).reduce((curr, ptr) => {
        let loc = allocs[ptr].loc;
        let size = Number(allocs[ptr].size);

        if (!curr[loc]) {
            curr[loc] = [ ];
        }
        curr[loc].push({ ptr: ptr, size: size });
        return curr;
    }, {});

    for (let loc of Object.keys(deduped)) {
        let flc = findLineInCode(loc, symbolLines);

        let total = deduped[loc].reduce((curr, r) => curr + r.size, 0);

        let ptrs = deduped[loc].map(r => r.ptr + ' (' + r.size + ')').join(', ');

        console.log('');
        console.log('--------------------------------------------------');
        console.log(`${deduped[loc].length} dangling pointers (total: ${total} bytes): [ ${ptrs} ]`);
        console.log(flc.join('\n'));
    }
}

function findLineInCode(loc, symbolLines) {
    const isLoc = /^    [0-9a-f]{4,6}:/;

    loc = Number(loc.substr(2)) - 1;

    let lineIx = symbolLines.findIndex(l => l.indexOf(`    ${loc}:`) === 0);

    let lines = [];

    let linesToFindAbove = 10;
    let currLineIx = lineIx;
    while (linesToFindAbove > 0 || currLineIx > symbolLines.length) {
        currLineIx--;
        if (!isLoc.test(symbolLines[currLineIx])) {
            lines.unshift(symbolLines[currLineIx]);
            linesToFindAbove--;
        }
    }

    lines = lines.map(l => '    ' + l);
    lines[lines.length - 1] = '>>> ' + lines[lines.length - 1].substr(4);

    let linesToFindBelow = 10;
    currLineIx = lineIx;
    while (linesToFindBelow > 0 || currLineIx > symbolLines.length) {
        currLineIx++;
        if (!isLoc.test(symbolLines[currLineIx])) {
            lines.push('    ' + symbolLines[currLineIx]);
            linesToFindBelow--;
        }
    }

    return lines;
}
