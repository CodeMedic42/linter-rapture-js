'use babel';

import Resolve from 'resolve';

const INVALID_CONTEXT = 'The defined context failed to load.';

export function loadContext(path, baseDir) {
    const contextResolution = Resolve.sync(path, { basedir: baseDir });

    // eslint-disable-next-line import/no-dynamic-require
    const instance = require(contextResolution);

    if (typeof instance === 'function') {
        return instance;
    }

    if (typeof instance.default === 'function') {
        return instance.default;
    }

    throw new Error(INVALID_CONTEXT);
}

export function handleError(err) {
    console.error(err);

    atom.notifications.addError('linter-rapture-js', {
        dismissable: true,
        detail: err.message
    });
}
