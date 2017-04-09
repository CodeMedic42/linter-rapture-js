/* global jasmine describe xdescribe it xit expect beforeEach afterEach waitsForPromise */

/*
Comment 001
I have no idea why I need this extra wait. It might be windows.

No matter what timeout interval I use the file is never registered in Chokidar before the next step is ran.

But if I have this extra empty step then the interval does not matter, the file is registered and everything works.

Either FsExtra.copySync is not truly synchronous or Chokidar/node just has problems in windows.
*/

'use babel';

const _ = require('lodash');
const Path = require('path');
// const Promise = require('bluebird');
const FsExtra = require('fs-extra');
const Sinon = require('sinon');

const plugin = require('../src/index.js');

const internalDataWhenStopped = {
    configWatch: null,
    sessions: null,
    fileWatchers: null,
    linter: null,
    editorGroupContext: null,
    inEditor: null,
    globs: null,
    editorContexts: null,
    currentConfig: null
};

function runSteps(steps, counter) {
    let _counter = counter;

    if (!_.isNumber(counter)) {
        _counter = 0;
    } else {
        console.log(`step: ${_counter}`);

        steps[_counter]();

        _counter += 1;
    }

    if (_counter < steps.length) {
        setTimeout(runSteps, 200, steps, _counter);
    }
}

function testArray(expected, observed) {
    if (_.isNil(expected)) {
        expect(observed).toBe(null);
    } else {
        expect(observed instanceof Array).toBe(true);
        expect(observed.length).toBe(expected);
    }
}

function testInEditor(expected, observed) {
    if (_.isNil(expected)) {
        expect(observed).toBe(null);
    } else {
        expect(observed instanceof Object).toBe(true);
        expect(_.isEqual(expected, observed)).toBe(true);
    }
}

function validateInternalData(internalData, expected) {
    expect(_.keys(internalData).length).toBe(9);

    expect(_.isNil(internalData.currentConfig)).toBe(!expected.currentConfig);
    expect(_.isNil(internalData.configWatch)).toBe(!expected.configWatch);
    expect(internalData.linter).toEqual(expected.linter);
    expect(_.isNil(internalData.editorGroupContext)).toBe(!expected.editorGroupContext);

    testArray(expected.sessions, internalData.sessions);
    testArray(expected.fileWatchers, internalData.fileWatchers);
    testArray(expected.globs, internalData.globs);
    testArray(expected.editorContexts, internalData.editorContexts);

    testInEditor(expected.inEditor, internalData.inEditor);
}

function buidlLinterMock() {
    const disposeSpy = Sinon.spy();
    const setMessagesSpy = Sinon.spy();

    const linterMock = {
        dispose: disposeSpy,
        setMessages: setMessagesSpy
    };

    return {
        linterMock,
        registerIndieMock: (initValue) => {
            expect(initValue).toBeDefined();
            expect(initValue.name).toBe('Json');

            return linterMock;
        }
    };
}

const issueCheck = Sinon.match((issue) => {
    if (!_.isString(issue.excerpt) || issue.excerpt.length <= 0) {
        return false;
    } else if (issue.severity !== 'error') {
        return false;
    } else if (!_.isPlainObject(issue.location)) {
        return false;
    } else if (issue.location.file !== 'files\\test.json') {
        return false;
    } else if (!_.isArray(issue.location.position) || issue.location.position.length !== 2) {
        return false;
    } else if (!_.isArray(issue.location.position[0]) || issue.location.position[0].length !== 2) {
        return false;
    } else if (!_.isArray(issue.location.position[1]) || issue.location.position[1].length !== 2) {
        return false;
    } else if (!_.isFinite(issue.location.position[0][0]) || !_.isFinite(issue.location.position[0][1])) {
        return false;
    } else if (!_.isFinite(issue.location.position[1][0]) || !_.isFinite(issue.location.position[1][1])) {
        return false;
    } else if (issue.location.position[0][0] < 0 || issue.location.position[0][1] < 0) {
        return false;
    } else if (issue.location.position[1][0] < 0 || issue.location.position[1][1] < 0) {
        return false;
    }

    return true;
}, 'issueCheck');

function activate() {
    plugin.activate({
        usePolling: true,
        interval: 200
    });
}

function checkLinterSpies(linterBuilderMock, expectedFileName, expectedIssues, expectedDisposeStatus) {
    expect(linterBuilderMock.linterMock.dispose.called).toBe(expectedDisposeStatus);

    expect(linterBuilderMock.linterMock.setMessages.called).toBe(true);
    expect(linterBuilderMock.linterMock.setMessages.calledWith(expectedFileName, expectedIssues)).toBe(true);

    linterBuilderMock.linterMock.setMessages.reset();
    linterBuilderMock.linterMock.dispose.reset();
}

describe('Linter Tests', () => {
    beforeEach(() => {
        // DAMN ATOM SETTING CLOCK SPIES!
        jasmine.useRealClock();
    });

    // xit('Simple Test', () => {
    //     validateInternalData(plugin.internalData, internalDataWhenStopped);
    //
    //     plugin.activate();
    //
    //     validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
    //         configWatch: true
    //     }));
    //
    //     const linterBuilderMock = buidlLinterMock();
    //
    //     plugin.consumeIndie(linterBuilderMock.registerIndieMock);
    //
    //     validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
    //         configWatch: true,
    //         linter: linterBuilderMock.linterMock
    //     }));
    //
    //     expect(linterBuilderMock.linterMock.dispose.called).toBe(false);
    //     expect(linterBuilderMock.linterMock.setMessages.called).toBe(false);
    //
    //     plugin.deactivate();
    //
    //     validateInternalData(plugin.internalData, internalDataWhenStopped);
    //
    //     expect(linterBuilderMock.linterMock.dispose.called).toBe(true);
    //     expect(linterBuilderMock.linterMock.setMessages.called).toBe(false);
    // });

    describe('Linter Tests', () => {
        describe('Startup and shutdown tests', () => {
            describe('Single Session', () => {
                beforeEach(() => {
                    FsExtra.copySync(Path.join(__dirname, 'fixtures/fullSetup/singleSession/'), Path.join(__dirname, './fixtures/fullSetup/singleSessionCopy/'));
                    process.chdir(Path.join(__dirname, 'fixtures/fullSetup/singleSessionCopy'));
                });

                afterEach(() => {
                    process.chdir(Path.join(__dirname, 'fixtures'));
                    FsExtra.removeSync(Path.join(__dirname, './fixtures/fullSetup/singleSessionCopy/'));
                });

                describe('RC File starts off undefined', () => {
                    beforeEach(() => {
                        FsExtra.removeSync(Path.join(__dirname, './fixtures/fullSetup/singleSessionCopy/.rapturelintrc'));
                    });

                    it('base', () => {
                        waitsForPromise(() => new Promise((resolve) => {
                            let linterBuilderMock;

                            runSteps([
                                () => {
                                    validateInternalData(plugin.internalData, internalDataWhenStopped);

                                    activate();
                                },
                                () => {
                                    validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                        configWatch: true
                                    }));

                                    linterBuilderMock = buidlLinterMock();

                                    plugin.consumeIndie(linterBuilderMock.registerIndieMock);
                                },
                                () => {
                                    validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                        configWatch: true,
                                        linter: linterBuilderMock.linterMock
                                    }));

                                    expect(linterBuilderMock.linterMock.dispose.called).toBe(false);
                                    expect(linterBuilderMock.linterMock.setMessages.called).toBe(false);

                                    plugin.deactivate();
                                },
                                () => {
                                    expect(linterBuilderMock.linterMock.dispose.called).toBe(true);
                                    expect(linterBuilderMock.linterMock.setMessages.called).toBe(false);

                                    resolve();
                                }]);
                        }));
                    });

                    describe('RC File becomes defined', () => {
                        it('File does not exist', () => {
                            waitsForPromise(() => new Promise((resolve) => {
                                let linterBuilderMock;

                                runSteps([
                                    () => {
                                        FsExtra.removeSync(Path.join(__dirname, './fixtures/fullSetup/singleSessionCopy/files/test.json'));
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, internalDataWhenStopped);

                                        activate();
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            configWatch: true
                                        }));

                                        linterBuilderMock = buidlLinterMock();

                                        plugin.consumeIndie(linterBuilderMock.registerIndieMock);
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            configWatch: true,
                                            linter: linterBuilderMock.linterMock
                                        }));

                                        expect(linterBuilderMock.linterMock.dispose.called).toBe(false);
                                        expect(linterBuilderMock.linterMock.setMessages.called).toBe(false);
                                    },
                                    () => {
                                        FsExtra.copySync(Path.join(__dirname, 'fixtures/fullSetup/singleSession/.rapturelintrc'), Path.join(__dirname, './fixtures/fullSetup/singleSessionCopy/.rapturelintrc'));

                                        console.log('copied');
                                    },
                                    () => { /* See "Comment 001" at the top of the file */ },
                                    () => {
                                        console.log(plugin.internalData);

                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            configWatch: true,
                                            linter: linterBuilderMock.linterMock,
                                            sessions: 1,
                                            fileWatchers: 1,
                                            globs: 1,
                                            editorGroupContext: true,
                                            currentConfig: true,
                                            editorContexts: 0,
                                            inEditor: {}
                                        }));

                                        expect(linterBuilderMock.linterMock.dispose.called).toBe(false);
                                        expect(linterBuilderMock.linterMock.setMessages.called).toBe(false);
                                        expect(linterBuilderMock.linterMock.setMessages.calledWith([])).toBe(false);

                                        plugin.deactivate();
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, internalDataWhenStopped);

                                        expect(linterBuilderMock.linterMock.dispose.called).toBe(true);
                                        expect(linterBuilderMock.linterMock.setMessages.called).toBe(false);
                                        expect(linterBuilderMock.linterMock.setMessages.calledWith([])).toBe(false);

                                        resolve();
                                    }]);
                            }));
                        });

                        it('File exists and is valid', () => {
                            let linterBuilderMock;

                            waitsForPromise(() => new Promise((resolve) => {
                                runSteps([
                                    () => {
                                        validateInternalData(plugin.internalData, internalDataWhenStopped);

                                        activate();
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            configWatch: true
                                        }));

                                        linterBuilderMock = buidlLinterMock();

                                        plugin.consumeIndie(linterBuilderMock.registerIndieMock);
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            configWatch: true,
                                            linter: linterBuilderMock.linterMock
                                        }));

                                        expect(linterBuilderMock.linterMock.dispose.called).toBe(false);
                                        expect(linterBuilderMock.linterMock.setMessages.called).toBe(false);

                                        console.log('setTimeout');

                                        FsExtra.copySync(Path.join(__dirname, 'fixtures/fullSetup/singleSession/.rapturelintrc'), Path.join(__dirname, './fixtures/fullSetup/singleSessionCopy/.rapturelintrc'));

                                        console.log('copied');
                                    },
                                    () => { /* See "Comment 001" at the top of the file */ },
                                    () => {
                                        console.log(plugin.internalData);

                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            configWatch: true,
                                            linter: linterBuilderMock.linterMock,
                                            sessions: 1,
                                            fileWatchers: 1,
                                            globs: 1,
                                            editorGroupContext: true,
                                            currentConfig: true,
                                            inEditor: {
                                                'files\\test.json': false
                                            },
                                            editorContexts: 0
                                        }));

                                        expect(linterBuilderMock.linterMock.dispose.called).toBe(false);
                                        expect(linterBuilderMock.linterMock.setMessages.called).toBe(true);
                                        expect(linterBuilderMock.linterMock.setMessages.calledWith('files\\test.json', [])).toBe(true);

                                        plugin.deactivate();
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, internalDataWhenStopped);

                                        expect(linterBuilderMock.linterMock.dispose.called).toBe(true);
                                        expect(linterBuilderMock.linterMock.setMessages.called).toBe(true);
                                        expect(linterBuilderMock.linterMock.setMessages.calledWith('files\\test.json', [])).toBe(true);

                                        resolve();
                                    }
                                ]);
                            }));
                        });

                        it('File exists and is invalid', () => {
                            waitsForPromise(() => new Promise((resolve) => {
                                let linterBuilderMock;

                                runSteps([
                                    () => {
                                        FsExtra.copySync(Path.join(__dirname, 'fixtures/fullSetup/invalidFile/test.json'), Path.join(__dirname, './fixtures/fullSetup/singleSessionCopy/files/test.json'));
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, internalDataWhenStopped);

                                        activate();
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            configWatch: true
                                        }));

                                        linterBuilderMock = buidlLinterMock();

                                        plugin.consumeIndie(linterBuilderMock.registerIndieMock);
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            configWatch: true,
                                            linter: linterBuilderMock.linterMock
                                        }));

                                        expect(linterBuilderMock.linterMock.dispose.called).toBe(false);
                                        expect(linterBuilderMock.linterMock.setMessages.called).toBe(false);
                                    },
                                    () => {
                                        FsExtra.copySync(Path.join(__dirname, 'fixtures/fullSetup/singleSession/.rapturelintrc'), Path.join(__dirname, './fixtures/fullSetup/singleSessionCopy/.rapturelintrc'));

                                        console.log('copied');
                                    },
                                    () => { /* See "Comment 001" at the top of the file */ },
                                    () => {
                                        console.log(plugin.internalData);

                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            configWatch: true,
                                            linter: linterBuilderMock.linterMock,
                                            sessions: 1,
                                            fileWatchers: 1,
                                            globs: 1,
                                            editorGroupContext: true,
                                            currentConfig: true,
                                            inEditor: {
                                                'files\\test.json': false
                                            },
                                            editorContexts: 0
                                        }));

                                        expect(linterBuilderMock.linterMock.dispose.called).toBe(false);
                                        expect(linterBuilderMock.linterMock.setMessages.called).toBe(true);

                                        expect(linterBuilderMock.linterMock.setMessages.calledWith('files\\test.json', [issueCheck])).toBe(true);

                                        plugin.deactivate();
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, internalDataWhenStopped);

                                        expect(linterBuilderMock.linterMock.dispose.called).toBe(true);
                                        expect(linterBuilderMock.linterMock.setMessages.called).toBe(true);
                                        expect(linterBuilderMock.linterMock.setMessages.calledWith('files\\test.json', [])).toBe(true);

                                        resolve();
                                    }]);
                            }));
                        });
                    });
                });

                describe('RC File starts off defined ', () => {
                    describe('File starts off valid', () => {
                        it('base', () => {
                            let linterBuilderMock;

                            waitsForPromise(() => new Promise((resolve) => {
                                runSteps([
                                    () => {
                                        validateInternalData(plugin.internalData, internalDataWhenStopped);

                                        activate();
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            configWatch: true
                                        }));

                                        linterBuilderMock = buidlLinterMock();

                                        plugin.consumeIndie(linterBuilderMock.registerIndieMock);
                                    },
                                    () => {
                                        console.log(plugin.internalData);

                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            configWatch: true,
                                            linter: linterBuilderMock.linterMock,
                                            sessions: 1,
                                            fileWatchers: 1,
                                            globs: 1,
                                            editorGroupContext: true,
                                            currentConfig: true,
                                            inEditor: {
                                                'files\\test.json': false
                                            },
                                            editorContexts: 0
                                        }));

                                        expect(linterBuilderMock.linterMock.dispose.called).toBe(false);
                                        expect(linterBuilderMock.linterMock.setMessages.called).toBe(true);
                                        expect(linterBuilderMock.linterMock.setMessages.calledWith('files\\test.json', [])).toBe(true);

                                        plugin.deactivate();
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, internalDataWhenStopped);

                                        expect(linterBuilderMock.linterMock.dispose.called).toBe(true);
                                        expect(linterBuilderMock.linterMock.setMessages.called).toBe(true);
                                        expect(linterBuilderMock.linterMock.setMessages.calledWith('files\\test.json', [])).toBe(true);

                                        resolve();
                                    }
                                ]);
                            }));
                        });

                        it('becomes invalid', () => {
                            let linterBuilderMock;

                            waitsForPromise(() => new Promise((resolve) => {
                                runSteps([
                                    () => {
                                        validateInternalData(plugin.internalData, internalDataWhenStopped);

                                        activate();
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            configWatch: true
                                        }));

                                        linterBuilderMock = buidlLinterMock();

                                        plugin.consumeIndie(linterBuilderMock.registerIndieMock);
                                    },
                                    () => {
                                        console.log(plugin.internalData);

                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            configWatch: true,
                                            linter: linterBuilderMock.linterMock,
                                            sessions: 1,
                                            fileWatchers: 1,
                                            globs: 1,
                                            editorGroupContext: true,
                                            currentConfig: true,
                                            inEditor: {
                                                'files\\test.json': false
                                            },
                                            editorContexts: 0
                                        }));

                                        expect(linterBuilderMock.linterMock.dispose.called).toBe(false);
                                        expect(linterBuilderMock.linterMock.setMessages.called).toBe(true);
                                        expect(linterBuilderMock.linterMock.setMessages.calledWith('files\\test.json', [])).toBe(true);
                                    },
                                    () => {
                                        FsExtra.copySync(Path.join(__dirname, 'fixtures/fullSetup/invalidFile/test.json'), Path.join(__dirname, './fixtures/fullSetup/singleSessionCopy/files/test.json'));
                                    },
                                    () => { /* See "Comment 001" at the top of the file */ },
                                    () => {
                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            configWatch: true,
                                            linter: linterBuilderMock.linterMock,
                                            sessions: 1,
                                            fileWatchers: 1,
                                            globs: 1,
                                            editorGroupContext: true,
                                            currentConfig: true,
                                            inEditor: {
                                                'files\\test.json': false
                                            },
                                            editorContexts: 0
                                        }));

                                        expect(linterBuilderMock.linterMock.dispose.called).toBe(false);
                                        expect(linterBuilderMock.linterMock.setMessages.called).toBe(true);
                                        expect(linterBuilderMock.linterMock.setMessages.calledWith('files\\test.json', [issueCheck])).toBe(true);

                                        plugin.deactivate();
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, internalDataWhenStopped);

                                        expect(linterBuilderMock.linterMock.dispose.called).toBe(true);
                                        expect(linterBuilderMock.linterMock.setMessages.called).toBe(true);
                                        expect(linterBuilderMock.linterMock.setMessages.calledWith('files\\test.json', [])).toBe(true);

                                        resolve();
                                    }
                                ]);
                            }));
                        });

                        it('is removed', () => {
                            let linterBuilderMock;

                            waitsForPromise(() => new Promise((resolve) => {
                                runSteps([
                                    () => {
                                        validateInternalData(plugin.internalData, internalDataWhenStopped);

                                        activate();
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            configWatch: true
                                        }));

                                        linterBuilderMock = buidlLinterMock();

                                        plugin.consumeIndie(linterBuilderMock.registerIndieMock);
                                    },
                                    () => {
                                        console.log(plugin.internalData);

                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            configWatch: true,
                                            linter: linterBuilderMock.linterMock,
                                            sessions: 1,
                                            fileWatchers: 1,
                                            globs: 1,
                                            editorGroupContext: true,
                                            currentConfig: true,
                                            inEditor: {
                                                'files\\test.json': false
                                            },
                                            editorContexts: 0
                                        }));

                                        expect(linterBuilderMock.linterMock.dispose.called).toBe(false);
                                        expect(linterBuilderMock.linterMock.setMessages.called).toBe(true);
                                        expect(linterBuilderMock.linterMock.setMessages.calledWith('files\\test.json', [])).toBe(true);
                                    },
                                    () => {
                                        FsExtra.removeSync(Path.join(__dirname, './fixtures/fullSetup/singleSessionCopy/files/test.json'));
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            configWatch: true,
                                            linter: linterBuilderMock.linterMock,
                                            sessions: 1,
                                            fileWatchers: 1,
                                            globs: 1,
                                            editorGroupContext: true,
                                            currentConfig: true,
                                            inEditor: {
                                                'files\\test.json': false
                                            },
                                            editorContexts: 0
                                        }));

                                        expect(linterBuilderMock.linterMock.dispose.called).toBe(false);
                                        expect(linterBuilderMock.linterMock.setMessages.called).toBe(true);
                                        expect(linterBuilderMock.linterMock.setMessages.calledWith('files\\test.json', [])).toBe(true);

                                        plugin.deactivate();
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, internalDataWhenStopped);

                                        expect(linterBuilderMock.linterMock.dispose.called).toBe(true);
                                        expect(linterBuilderMock.linterMock.setMessages.called).toBe(true);
                                        expect(linterBuilderMock.linterMock.setMessages.calledWith('files\\test.json', [])).toBe(true);

                                        resolve();
                                    }
                                ]);
                            }));
                        });
                    });

                    describe('File starts off invalid', () => {
                        beforeEach(() => {
                            FsExtra.copySync(Path.join(__dirname, 'fixtures/fullSetup/invalidFile/test.json'), Path.join(__dirname, './fixtures/fullSetup/singleSessionCopy/files/test.json'));
                        });

                        it('base', () => {
                            let linterBuilderMock;

                            waitsForPromise(() => new Promise((resolve) => {
                                runSteps([
                                    () => {
                                        validateInternalData(plugin.internalData, internalDataWhenStopped);

                                        activate();
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            configWatch: true
                                        }));

                                        linterBuilderMock = buidlLinterMock();

                                        plugin.consumeIndie(linterBuilderMock.registerIndieMock);
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            configWatch: true,
                                            linter: linterBuilderMock.linterMock,
                                            sessions: 1,
                                            fileWatchers: 1,
                                            globs: 1,
                                            editorGroupContext: true,
                                            currentConfig: true,
                                            inEditor: {
                                                'files\\test.json': false
                                            },
                                            editorContexts: 0
                                        }));

                                        expect(linterBuilderMock.linterMock.dispose.called).toBe(false);
                                        expect(linterBuilderMock.linterMock.setMessages.called).toBe(true);

                                        expect(linterBuilderMock.linterMock.setMessages.calledWith('files\\test.json', [issueCheck])).toBe(true);

                                        plugin.deactivate();
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, internalDataWhenStopped);

                                        expect(linterBuilderMock.linterMock.dispose.called).toBe(true);
                                        expect(linterBuilderMock.linterMock.setMessages.called).toBe(true);
                                        expect(linterBuilderMock.linterMock.setMessages.calledWith('files\\test.json', [])).toBe(true);

                                        resolve();
                                    }
                                ]);
                            }));
                        });

                        it('becomes valid', () => {
                            let linterBuilderMock;

                            waitsForPromise(() => new Promise((resolve) => {
                                runSteps([
                                    () => {
                                        validateInternalData(plugin.internalData, internalDataWhenStopped);

                                        activate();
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            configWatch: true
                                        }));

                                        linterBuilderMock = buidlLinterMock();

                                        plugin.consumeIndie(linterBuilderMock.registerIndieMock);
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            configWatch: true,
                                            linter: linterBuilderMock.linterMock,
                                            sessions: 1,
                                            fileWatchers: 1,
                                            globs: 1,
                                            editorGroupContext: true,
                                            currentConfig: true,
                                            inEditor: {
                                                'files\\test.json': false
                                            },
                                            editorContexts: 0
                                        }));

                                        checkLinterSpies(linterBuilderMock, 'files\\test.json', [issueCheck], false);

                                        FsExtra.copySync(Path.join(__dirname, 'fixtures/fullSetup/singleSession/files/test.json'), Path.join(__dirname, './fixtures/fullSetup/singleSessionCopy/files/test.json'));
                                    },
                                    () => { /* See "Comment 001" at the top of the file */ },
                                    () => { /* See "Comment 001" at the top of the file */ },
                                    () => {
                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            configWatch: true,
                                            linter: linterBuilderMock.linterMock,
                                            sessions: 1,
                                            fileWatchers: 1,
                                            globs: 1,
                                            editorGroupContext: true,
                                            currentConfig: true,
                                            inEditor: {
                                                'files\\test.json': false
                                            },
                                            editorContexts: 0
                                        }));

                                        checkLinterSpies(linterBuilderMock, 'files\\test.json', [], false);

                                        plugin.deactivate();
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, internalDataWhenStopped);

                                        expect(linterBuilderMock.linterMock.dispose.called).toBe(true);
                                        expect(linterBuilderMock.linterMock.setMessages.called).toBe(true);
                                        expect(linterBuilderMock.linterMock.setMessages.calledWith('files\\test.json', [])).toBe(true);

                                        resolve();
                                    }
                                ]);
                            }));
                        });

                        xit('is removed', () => {});
                    });

                    describe('becomes undefined', () => {
                        xit('File does not exist', () => {});

                        xit('File exists and is valid', () => {});

                        xit('File exists and is invalid', () => {});
                    });
                });
            });

            xdescribe('Multi Session', () => {});
        });
    });
});
