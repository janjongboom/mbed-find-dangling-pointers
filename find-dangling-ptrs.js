let buff = Buffer.from([]);

process.stdin.on('data', d => {
    buff = Buffer.concat([d, buff]);
});

process.stdin.on('end', () => {
    let lines = buff.toString('utf-8').split('\n').filter(f=>!!f).filter(f=>f[0] === '#');

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
            else {
                console.warn('Free for untracked pointer', ptr);
            }
        }
        else if (l.indexOf('#r:') === 0) {
            let [op, new_ptr, loc, old_ptr, size] = l.split(/[\:;-]/);
            if (allocs[old_ptr]) {
                delete allocs[old_ptr];
            }
            else {
                console.warn('Realloc for untracked pointer', old_ptr);
            }

            allocs[new_ptr] = { loc: loc, size: size };
        }
    }

    console.log('Dangling pointers', allocs);
});

