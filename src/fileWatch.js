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

function fileWatch(pattern, path, options) {
    let current = {};
    let callbacks = [];

    if (!_.isString(pattern) || pattern.length <= 0) {
        throw new Error('Pattern must be a string');
    }

    if (!_.isString(path) || path.length <= 0) {
        throw new Error('Path must be a string');
    }

    const _options = _.merge({
        cwd: path
    }, options);

    const watcher = Chokidar.watch(pattern, _options);

    console.log('fileWatch event setup');

    watcher
    .on('add', (file) => {
        console.log('fileWatch.add');
        readFile(_options.cwd, file).then((contents) => {
            const _file = Path.join(_options.cwd, file);

            current[_file] = contents;

            callCallbacks(callbacks, _file, contents);
        });
    })
    .on('change', (file) => {
        console.log('fileWatch.change');
        readFile(_options.cwd, file).then((contents) => {
            const _file = Path.join(_options.cwd, file);

            current[_file] = contents;

            callCallbacks(callbacks, _file, contents);
        }).catch((err) => {
            console.log(err.message);

            return null;
        });
    })
    .on('unlink', (file) => {
        console.log('fileWatch.unlink');

        const _file = Path.join(_options.cwd, file);

        delete current[_file];

        callCallbacks(callbacks, _file, undefined);
    })
    .on('error', (error, file) => {
        console.log('fileWatch.error');

        if (FS.existsSync(Path.join(_options.cwd, file))) {
            console.log(`Watcher error: ${error}`);
        }

        const _file = Path.join(_options.cwd, file);

        current[_file] = null;

        callCallbacks(callbacks, _file, null);
    });

    const control = {
        onUpdate: (cb) => {
            callbacks.push(cb);

            _.forOwn(current, (contents, file) => {
                callCallbacks(callbacks, file, contents);
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
