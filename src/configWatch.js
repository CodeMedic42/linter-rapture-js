'use babel';

import _ from 'lodash';
import Chokidar from 'chokidar';
import Path from 'path';
import Promise from 'bluebird';
import FS from 'fs';

const fsPromise = Promise.promisifyAll(FS);
const configFileName = '.rapturelintrc';

function validateRule() {}

function parseConfig(path, filePath) {
    return fsPromise.readFileAsync(filePath).then((contents) => {
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

function configWatch(path, options) {
    let current = null;
    let callbacks = [];

    if (!_.isString(path) || path.length <= 0) {
        throw new Error('Path must be a string');
    }

    const _options = _.merge({
        cwd: path
    }, options);

    const filePath = Path.join(_options.cwd, configFileName);
    const watcher = Chokidar.watch(configFileName, _options);

    console.log('config setup');

    watcher
    .on('add', () => {
        console.log('config add');
        parseConfig(_options.cwd, filePath).then((config) => {
            current = config;

            callCallbacks(callbacks, config);
        });
    })
    .on('change', () => {
        console.log('config change');
        parseConfig(_options.cwd, filePath).then((config) => {
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
        if (FS.existsSync(filePath)) {
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
        dispose: () => {
            console.log('config dispose');
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
