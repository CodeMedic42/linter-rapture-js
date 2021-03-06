'use babel';

import _ from 'lodash';
import Chokidar from 'chokidar';
import Path from 'path';
import Promise from 'bluebird';
import FS from 'fs';
import Resolve from 'resolve';

const fsPromise = Promise.promisifyAll(FS);
const configFileName = '.rapturelintrc';

function handleError(err) {
    console.error(err);

    atom.notifications.addError('linter-rapture-js', {
        dismissable: true,
        detail: err.message
    });
}

function parseConfig(path, filePath) {
    return fsPromise.readFileAsync(filePath).then((contents) => {
        const config = JSON.parse(contents.toString());

        _.forEach(config.sessions, (session) => {
            const contextResolution = Resolve.sync(session.context, { basedir: path });

            // eslint-disable-next-line import/no-dynamic-require
            session.context = require(contextResolution);
        });

        return config;
    }).catch((err) => {
        handleError(err);

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

    watcher
    .on('add', () => {
        parseConfig(_options.cwd, filePath).then((config) => {
            current = config;

            callCallbacks(callbacks, config);
        });
    })
    .on('change', () => {
        parseConfig(_options.cwd, filePath).then((config) => {
            current = config;

            callCallbacks(callbacks, config);
        }).catch((err) => {
            handleError(err);

            return null;
        });
    })
    .on('unlink', () => {
        current = null;

        callCallbacks(callbacks, null);
    })
    .on('error', (error) => {
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
