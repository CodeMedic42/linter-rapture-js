'use babel';

import _ from 'lodash';
import Chokidar from 'chokidar';
import Path from 'path';
import Promise from 'bluebird';
import FS from 'fs';

const fsPromise = Promise.promisifyAll(FS);

function readFile(path, fileName) {
    return fsPromise.readFileAsync(Path.join(path, fileName)).then((contents) => {
        const c = contents.toString();
        return c;
    }).catch((err) => {
        console.log(err.message);

        return null;
    });
}

function callCallbacks(callbacks, file, contents) {
    _.forEach(callbacks, (callback) => {
        callback(file, contents);
    });
}

function fileWatch(pattern, options) {
    let current = {};
    let callbacks = [];

    const _options = _.merge({
        cwd: process.cwd()
    }, options);

    const watcher = Chokidar.watch(pattern, _options);

    console.log('fileWatch event setup');

    watcher
    .on('add', (file) => {
        console.log('fileWatch.add');
        readFile(_options.cwd, file).then((contents) => {
            current[file] = contents;

            callCallbacks(callbacks, file, contents);
        });
    })
    .on('change', (file) => {
        console.log('fileWatch.change');
        readFile(_options.cwd, file).then((contents) => {
            current[file] = contents;

            callCallbacks(callbacks, file, contents);
        }).catch((err) => {
            console.log(err.message);

            return null;
        });
    })
    .on('unlink', (file) => {
        console.log('fileWatch.unlink');
        current[file] = null;

        callCallbacks(callbacks, file, null);
    })
    .on('error', (error, file) => {
        console.log('fileWatch.error');
        if (FS.existsSync(Path.join(_options.cwd, file))) {
            console.log(`Watcher error: ${error}`);
        }

        current[file] = null;

        callCallbacks(callbacks, file, null);
    });

    const control = {
        onUpdate: (cb) => {
            callbacks.push(cb);

            _.forEach(callbacks, (callback) => {
                _.forOwn(current, (contents, file) => {
                    callback(file, contents);
                });
            });

            return control;
        },
        destroy: () => {
            _.forEach(callbacks, (callback, index) => {
                _.forOwn(current, (contents, file) => {
                    callback(file);
                });

                callback[index] = null;
            });

            callbacks = null;
            current = null;

            watcher.close();
        }
    };

    return control;
}

export default fileWatch;
