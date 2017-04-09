'use babel';

import _ from 'lodash';
import Chokidar from 'chokidar';
import Path from 'path';
import Promise from 'bluebird';
import FS from 'fs';

const fsPromise = Promise.promisifyAll(FS);
const configFileName = '.rapturelintrc';

function validateRule() {}

function parseConfig(path) {
    return fsPromise.readFileAsync(Path.join(path, configFileName)).then((contents) => {
        const config = JSON.parse(contents.toString());

        _.forEach(config.sessions, (session) => {
            _.forEach(session.rules, (rule) => {
                validateRule(rule);

                const rapFile = Path.join(path, rule.rapture);

                // eslint-disable-next-line import/no-dynamic-require
                rule.rapture = require(rapFile);
            });
        });

        return config;
    }).catch((err) => {
        console.log(err.message);

        return null;
    });
}

function callCallbacks(callbacks, value) {
    _.forEach(callbacks, (callback) => {
        callback(value);
    });
}

function configWatch(options) {
    let current = null;
    let callbacks = [];

    const startDir = process.cwd();
    const watcher = Chokidar.watch(configFileName, options);

    console.log('config setup');

    watcher
    .on('add', () => {
        console.log('config add');
        parseConfig(startDir).then((config) => {
            current = config;

            callCallbacks(callbacks, config);
        });
    })
    .on('change', () => {
        console.log('config change');
        parseConfig(startDir).then((config) => {
            current = config;

            callCallbacks(callbacks, config);
        }).catch((err) => {
            console.log(err.message);

            return null;
        });
    })
    .on('unlink', () => {
        console.log('config unlink');
        current = null;

        callCallbacks(callbacks, null);
    })
    .on('error', (error) => {
        console.log('config error');
        if (FS.existsSync(Path.join(startDir, configFileName))) {
            console.log(`Watcher error: ${error}`);
        }

        current = null;

        callCallbacks(callbacks, null);
    });

    const control = {
        onUpdate: (cb) => {
            callbacks.push(cb);

            cb(current);

            return control;
        },
        destroy: () => {
            console.log('config destroy');
            _.forEach(callbacks, (callback, index) => {
                callback(null);
                callback[index] = null;
            });

            callbacks = null;

            watcher.close();
        }
    };

    return control;
}

export default configWatch;
