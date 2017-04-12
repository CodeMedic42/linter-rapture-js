/* global jasmine describe xdescribe it xit expect beforeEach afterEach waitsForPromise */

'use babel';

const _ = require('lodash');
const Path = require('path');
// const Promise = require('bluebird');
const FsExtra = require('fs-extra');
const Sinon = require('sinon');

const plugin = require('../src/index.js');

const internalDataWhenStopped = {
    linter: null,
    editorGroupContext: null,
    editorContexts: null,
    projects: null,
    watcherOptions: null,
    projectListener: null
};

const stepInterval = 200;

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
        _.delay(() => {
            /*
            There are some oddities when it comes to the timing of thing. Especially around File watches.
            Having two timeouts, rather than one, seems to due the trick.
            */
            _.delay(runSteps, stepInterval, steps, _counter);
        }, stepInterval);
    }
}

// function testArray(expected, observed) {
//     if (_.isNil(expected)) {
//         expect(observed).toBe(null);
//     } else {
//         expect(observed instanceof Array).toBe(true);
//         expect(observed.length).toBe(expected);
//     }
// }

function testProjects(expected, observed) {
    if (_.isNil(expected)) {
        expect(observed).toBe(null);
    } else {
        expect(observed instanceof Object).toBe(true);
        expect(_.isEqual(_.keys(expected), _.keys(observed))).toBe(true);

        _.forOwn(expected, (exp, path) => {
            expect(observed[path]).toBeDefined();
        });
    }
}

function testEditorContexts(expected, observed) {
    if (_.isNil(expected)) {
        expect(observed).toBe(null);
    } else {
        expect(observed instanceof Object).toBe(true);
        expect(_.isEqual(_.keys(expected), _.keys(observed))).toBe(true);

        _.forOwn(expected, (exp, path) => {
            if (path === '*') {
                expect(observed['*'].length).toBe(exp.length);
            } else {
                expect(observed[path]).toBeDefined();
            }
        });
    }
}

function validateInternalData(internalData, expected) {
    expect(_.keys(internalData).length).toBe(6);

    expect(internalData.linter).toEqual(expected.linter);
    expect(_.isNil(internalData.editorGroupContext)).toBe(!expected.editorGroupContext);
    expect(_.isNil(internalData.watcherOptions)).toBe(!expected.watcherOptions);
    expect(_.isNil(internalData.projectListener)).toBe(!expected.projectListener);

    testProjects(expected.projects, internalData.projects);

    testEditorContexts(expected.editorContexts, internalData.editorContexts);
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

function buildIssueCheck(path) {
    return Sinon.match((issue) => {
        if (!_.isString(issue.excerpt) || issue.excerpt.length <= 0) {
            return false;
        } else if (issue.severity !== 'error') {
            return false;
        } else if (!_.isPlainObject(issue.location)) {
            return false;
        } else if (issue.location.file !== Path.join(path, 'files\\test.json')) {
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
}

function activate() {
    plugin.activate({
        usePolling: true,
        interval: 100
    });
}

function checkLinterSpies(linterBuilderMock, expectedFileName, expectedIssues, expectedDisposeCount) {
    expect(linterBuilderMock.linterMock.dispose.callCount).toBe(expectedDisposeCount);

    expect(linterBuilderMock.linterMock.setMessages.callCount).toBe(1);
    expect(linterBuilderMock.linterMock.setMessages.calledWith(expectedFileName, expectedIssues)).toBe(true);

    linterBuilderMock.linterMock.setMessages.reset();
    linterBuilderMock.linterMock.dispose.reset();
}

describe('Linter Tests', () => {
    beforeEach(() => {
        // DAMN ATOM SETTING CLOCK SPIES!
        jasmine.useRealClock();
    });

    describe('Single Project', () => {
        describe('Single Session', () => {
            beforeEach(function initMain() {
                this.workingDir = Path.join(__dirname, 'fixtures/fullSetup/singleSessionCopy');
                this.sourceDir = Path.join(__dirname, 'fixtures/fullSetup/singleSession/');

                FsExtra.copySync(this.sourceDir, this.workingDir);
                atom.project.setPaths([this.workingDir]);
            });

            afterEach(function teardownMain() {
                FsExtra.removeSync(this.workingDir);
            });

            describe('Startup and shutdown tests', () => {
                describe('RC File starts off undefined', () => {
                    beforeEach(function clearRcFile() {
                        FsExtra.removeSync(Path.join(this.workingDir, '.rapturelintrc'));
                    });

                    xit('base', function test() {
                        waitsForPromise(() => new Promise((resolve) => {
                            let linterBuilderMock;

                            runSteps([
                                () => {
                                    validateInternalData(plugin.internalData, internalDataWhenStopped);

                                    activate();
                                },
                                () => {
                                    validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                        watcherOptions: true
                                    }));

                                    linterBuilderMock = buidlLinterMock();

                                    plugin.consumeIndie(linterBuilderMock.registerIndieMock);
                                },
                                () => {
                                    validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                        watcherOptions: true,
                                        linter: linterBuilderMock.linterMock,
                                        editorGroupContext: true,
                                        editorContexts: {
                                            '*': []
                                        },
                                        projects: {
                                            [this.workingDir]: true
                                        },
                                        projectListener: true
                                    }));

                                    expect(linterBuilderMock.linterMock.dispose.called).toBe(false);
                                    expect(linterBuilderMock.linterMock.setMessages.called).toBe(false);

                                    plugin.deactivate();
                                },
                                () => {
                                    validateInternalData(plugin.internalData, internalDataWhenStopped);

                                    expect(linterBuilderMock.linterMock.dispose.called).toBe(true);
                                    expect(linterBuilderMock.linterMock.setMessages.called).toBe(false);

                                    resolve();
                                }]);
                        }));
                    });

                    describe('RC File becomes defined', () => {
                        xit('File does not exist', function test() {
                            waitsForPromise(() => new Promise((resolve) => {
                                let linterBuilderMock;

                                runSteps([
                                    () => {
                                        FsExtra.removeSync(Path.join(this.workingDir, 'files/test.json'));
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, internalDataWhenStopped);

                                        activate();
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            watcherOptions: true
                                        }));

                                        linterBuilderMock = buidlLinterMock();

                                        plugin.consumeIndie(linterBuilderMock.registerIndieMock);
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            watcherOptions: true,
                                            linter: linterBuilderMock.linterMock,
                                            editorGroupContext: true,
                                            editorContexts: {
                                                '*': []
                                            },
                                            projects: {
                                                [this.workingDir]: true
                                            },
                                            projectListener: true
                                        }));

                                        expect(linterBuilderMock.linterMock.dispose.called).toBe(false);
                                        expect(linterBuilderMock.linterMock.setMessages.called).toBe(false);
                                    },
                                    () => {
                                        FsExtra.copySync(Path.join(this.sourceDir, '.rapturelintrc'), Path.join(this.workingDir, '.rapturelintrc'));

                                        console.log('copied');
                                    },
                                    () => {
                                        console.log(plugin.internalData);

                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            watcherOptions: true,
                                            linter: linterBuilderMock.linterMock,
                                            editorGroupContext: true,
                                            editorContexts: {
                                                '*': []
                                            },
                                            projects: {
                                                [this.workingDir]: true
                                            },
                                            projectListener: true
                                        }));

                                        expect(linterBuilderMock.linterMock.dispose.called).toBe(false);
                                        expect(linterBuilderMock.linterMock.setMessages.called).toBe(false);

                                        plugin.deactivate();
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, internalDataWhenStopped);

                                        expect(linterBuilderMock.linterMock.dispose.called).toBe(true);
                                        expect(linterBuilderMock.linterMock.setMessages.called).toBe(false);

                                        resolve();
                                    }]);
                            }));
                        });

                        xit('File exists and is valid', function test() {
                            waitsForPromise(() => new Promise((resolve) => {
                                const fileName = Path.join(this.workingDir, 'files\\test.json');
                                let linterBuilderMock;

                                runSteps([
                                    () => {
                                        validateInternalData(plugin.internalData, internalDataWhenStopped);

                                        activate();
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            watcherOptions: true
                                        }));

                                        linterBuilderMock = buidlLinterMock();

                                        plugin.consumeIndie(linterBuilderMock.registerIndieMock);
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            watcherOptions: true,
                                            linter: linterBuilderMock.linterMock,
                                            editorGroupContext: true,
                                            editorContexts: {
                                                '*': []
                                            },
                                            projects: {
                                                [this.workingDir]: true
                                            },
                                            projectListener: true
                                        }));

                                        expect(linterBuilderMock.linterMock.dispose.called).toBe(false);
                                        expect(linterBuilderMock.linterMock.setMessages.called).toBe(false);

                                        console.log('setTimeout');

                                        FsExtra.copySync(Path.join(this.sourceDir, '.rapturelintrc'), Path.join(this.workingDir, '.rapturelintrc'));

                                        console.log('copied');
                                    },
                                    () => {
                                        console.log(plugin.internalData);

                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            watcherOptions: true,
                                            linter: linterBuilderMock.linterMock,
                                            editorGroupContext: true,
                                            editorContexts: {
                                                '*': []
                                            },
                                            projects: {
                                                [this.workingDir]: true
                                            },
                                            projectListener: true
                                        }));

                                        checkLinterSpies(linterBuilderMock, fileName, [], 0);

                                        plugin.deactivate();
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, internalDataWhenStopped);

                                        checkLinterSpies(linterBuilderMock, fileName, [], 1);

                                        resolve();
                                    }
                                ]);
                            }));
                        });

                        it('File exists and is invalid', function test() {
                            waitsForPromise(() => new Promise((resolve) => {
                                const fileName = Path.join(this.workingDir, 'files\\test.json');
                                let linterBuilderMock;

                                runSteps([
                                    () => {
                                        FsExtra.copySync(Path.join(__dirname, 'fixtures/fullSetup/invalidFile/test.json'), Path.join(this.workingDir, 'files/test.json'));
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, internalDataWhenStopped);

                                        activate();
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            watcherOptions: true
                                        }));

                                        linterBuilderMock = buidlLinterMock();

                                        plugin.consumeIndie(linterBuilderMock.registerIndieMock);
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            watcherOptions: true,
                                            linter: linterBuilderMock.linterMock,
                                            editorGroupContext: true,
                                            editorContexts: {
                                                '*': []
                                            },
                                            projects: {
                                                [this.workingDir]: true
                                            },
                                            projectListener: true
                                        }));

                                        expect(linterBuilderMock.linterMock.dispose.called).toBe(false);
                                        expect(linterBuilderMock.linterMock.setMessages.called).toBe(false);
                                    },
                                    () => {
                                        FsExtra.copySync(Path.join(this.sourceDir, '.rapturelintrc'), Path.join(this.workingDir, '.rapturelintrc'));

                                        console.log('copied');
                                    },
                                    () => {
                                        console.log(plugin.internalData);

                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            watcherOptions: true,
                                            linter: linterBuilderMock.linterMock,
                                            editorGroupContext: true,
                                            editorContexts: {
                                                '*': []
                                            },
                                            projects: {
                                                [this.workingDir]: true
                                            },
                                            projectListener: true
                                        }));

                                        checkLinterSpies(linterBuilderMock, fileName, [buildIssueCheck(this.workingDir)], 0);

                                        plugin.deactivate();
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, internalDataWhenStopped);

                                        checkLinterSpies(linterBuilderMock, fileName, [], 1);

                                        resolve();
                                    }]);
                            }));
                        });
                    });
                });

                describe('RC File starts off defined ', () => {
                    describe('File starts off valid', () => {
                        it('base', function test() {
                            waitsForPromise(() => new Promise((resolve) => {
                                const fileName = Path.join(this.workingDir, 'files\\test.json');
                                let linterBuilderMock;

                                runSteps([
                                    () => {
                                        validateInternalData(plugin.internalData, internalDataWhenStopped);

                                        activate();
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            watcherOptions: true
                                        }));

                                        linterBuilderMock = buidlLinterMock();

                                        plugin.consumeIndie(linterBuilderMock.registerIndieMock);
                                    },
                                    () => {
                                        console.log(plugin.internalData);

                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            watcherOptions: true,
                                            linter: linterBuilderMock.linterMock,
                                            editorGroupContext: true,
                                            editorContexts: {
                                                '*': []
                                            },
                                            projects: {
                                                [this.workingDir]: true
                                            },
                                            projectListener: true
                                        }));

                                        checkLinterSpies(linterBuilderMock, fileName, [], 0);

                                        plugin.deactivate();
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, internalDataWhenStopped);

                                        checkLinterSpies(linterBuilderMock, fileName, [], 1);

                                        resolve();
                                    }
                                ]);
                            }));
                        });

                        it('becomes invalid', function test() {
                            waitsForPromise(() => new Promise((resolve) => {
                                const fileName = Path.join(this.workingDir, 'files\\test.json');
                                let linterBuilderMock;

                                runSteps([
                                    () => {
                                        validateInternalData(plugin.internalData, internalDataWhenStopped);

                                        activate();
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            watcherOptions: true
                                        }));

                                        linterBuilderMock = buidlLinterMock();

                                        plugin.consumeIndie(linterBuilderMock.registerIndieMock);
                                    },
                                    () => {
                                        console.log(plugin.internalData);

                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            watcherOptions: true,
                                            linter: linterBuilderMock.linterMock,
                                            editorGroupContext: true,
                                            editorContexts: {
                                                '*': []
                                            },
                                            projects: {
                                                [this.workingDir]: true
                                            },
                                            projectListener: true
                                        }));

                                        checkLinterSpies(linterBuilderMock, fileName, [], 0);
                                    },
                                    () => {
                                        FsExtra.copySync(Path.join(__dirname, 'fixtures/fullSetup/invalidFile/test.json'), Path.join(this.workingDir, '/files/test.json'));
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            watcherOptions: true,
                                            linter: linterBuilderMock.linterMock,
                                            editorGroupContext: true,
                                            editorContexts: {
                                                '*': []
                                            },
                                            projects: {
                                                [this.workingDir]: true
                                            },
                                            projectListener: true
                                        }));

                                        checkLinterSpies(linterBuilderMock, fileName, [buildIssueCheck(this.workingDir)], 0);

                                        plugin.deactivate();
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, internalDataWhenStopped);

                                        checkLinterSpies(linterBuilderMock, fileName, [], 1);

                                        resolve();
                                    }
                                ]);
                            }));
                        });

                        it('is removed', function test() {
                            waitsForPromise(() => new Promise((resolve) => {
                                const fileName = Path.join(this.workingDir, 'files\\test.json');
                                let linterBuilderMock;

                                runSteps([
                                    () => {
                                        validateInternalData(plugin.internalData, internalDataWhenStopped);

                                        activate();
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            watcherOptions: true
                                        }));

                                        linterBuilderMock = buidlLinterMock();

                                        plugin.consumeIndie(linterBuilderMock.registerIndieMock);
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            watcherOptions: true,
                                            linter: linterBuilderMock.linterMock,
                                            editorGroupContext: true,
                                            editorContexts: {
                                                '*': []
                                            },
                                            projects: {
                                                [this.workingDir]: true
                                            },
                                            projectListener: true
                                        }));

                                        checkLinterSpies(linterBuilderMock, fileName, [], 0);
                                    },
                                    () => {
                                        FsExtra.removeSync(Path.join(this.workingDir, 'files/test.json'));
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            watcherOptions: true,
                                            linter: linterBuilderMock.linterMock,
                                            editorGroupContext: true,
                                            editorContexts: {
                                                '*': []
                                            },
                                            projects: {
                                                [this.workingDir]: true
                                            },
                                            projectListener: true
                                        }));

                                        checkLinterSpies(linterBuilderMock, fileName, [], 0);

                                        plugin.deactivate();
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, internalDataWhenStopped);

                                        expect(linterBuilderMock.linterMock.dispose.callCount).toBe(1);
                                        expect(linterBuilderMock.linterMock.setMessages.callCount).toBe(0);

                                        linterBuilderMock.linterMock.dispose.reset();

                                        resolve();
                                    }
                                ]);
                            }));
                        });
                    });

                    describe('File starts off invalid', () => {
                        beforeEach(function beforeEach() {
                            FsExtra.copySync(Path.join(__dirname, 'fixtures/fullSetup/invalidFile/test.json'), Path.join(this.workingDir, 'files/test.json'));
                        });

                        it('base', function test() {
                            const fileName = Path.join(this.workingDir, 'files\\test.json');
                            let linterBuilderMock;

                            waitsForPromise(() => new Promise((resolve) => {
                                runSteps([
                                    () => {
                                        validateInternalData(plugin.internalData, internalDataWhenStopped);

                                        activate();
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            watcherOptions: true
                                        }));

                                        linterBuilderMock = buidlLinterMock();

                                        plugin.consumeIndie(linterBuilderMock.registerIndieMock);
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            watcherOptions: true,
                                            linter: linterBuilderMock.linterMock,
                                            editorGroupContext: true,
                                            editorContexts: {
                                                '*': []
                                            },
                                            projects: {
                                                [this.workingDir]: true
                                            },
                                            projectListener: true
                                        }));

                                        checkLinterSpies(linterBuilderMock, fileName, [buildIssueCheck(this.workingDir)], 0);

                                        plugin.deactivate();
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, internalDataWhenStopped);

                                        checkLinterSpies(linterBuilderMock, fileName, [], 1);

                                        resolve();
                                    }
                                ]);
                            }));
                        });

                        it('becomes valid', function test() {
                            waitsForPromise(() => new Promise((resolve) => {
                                const fileName = Path.join(this.workingDir, 'files\\test.json');
                                let linterBuilderMock;

                                runSteps([
                                    () => {
                                        validateInternalData(plugin.internalData, internalDataWhenStopped);

                                        activate();
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            watcherOptions: true
                                        }));

                                        linterBuilderMock = buidlLinterMock();

                                        plugin.consumeIndie(linterBuilderMock.registerIndieMock);
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            watcherOptions: true,
                                            linter: linterBuilderMock.linterMock,
                                            editorGroupContext: true,
                                            editorContexts: {
                                                '*': []
                                            },
                                            projects: {
                                                [this.workingDir]: true
                                            },
                                            projectListener: true
                                        }));

                                        checkLinterSpies(linterBuilderMock, fileName, [buildIssueCheck(this.workingDir)], 0);

                                        FsExtra.copySync(Path.join(this.sourceDir, 'files/test.json'), Path.join(this.workingDir, 'files/test.json'));
                                    },
                                    // () => { /* See "Comment 001" at the top of the file */ },
                                    // () => { /* See "Comment 001" at the top of the file */ },
                                    () => {
                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            watcherOptions: true,
                                            linter: linterBuilderMock.linterMock,
                                            editorGroupContext: true,
                                            editorContexts: {
                                                '*': []
                                            },
                                            projects: {
                                                [this.workingDir]: true
                                            },
                                            projectListener: true
                                        }));

                                        checkLinterSpies(linterBuilderMock, fileName, [], 0);

                                        plugin.deactivate();
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, internalDataWhenStopped);

                                        checkLinterSpies(linterBuilderMock, fileName, [], 1);

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

            describe('Editor tests', () => {
                describe('Editor is opened after activation', () => {
                    describe('File is invalid', () => {
                        beforeEach(function beforeEach() {
                            FsExtra.copySync(Path.join(__dirname, 'fixtures/fullSetup/invalidFile/test.json'), Path.join(this.workingDir, 'files/test.json'));
                        });

                        it('Closed after deactivation', function test() {
                            waitsForPromise(() => new Promise((resolve) => {
                                const fileName = Path.join(this.workingDir, 'files\\test.json');
                                let linterBuilderMock;
                                let _editor;

                                runSteps([
                                    () => {
                                        validateInternalData(plugin.internalData, internalDataWhenStopped);

                                        activate();
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            watcherOptions: true
                                        }));

                                        linterBuilderMock = buidlLinterMock();

                                        plugin.consumeIndie(linterBuilderMock.registerIndieMock);
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            watcherOptions: true,
                                            linter: linterBuilderMock.linterMock,
                                            editorGroupContext: true,
                                            editorContexts: {
                                                '*': []
                                            },
                                            projects: {
                                                [this.workingDir]: true
                                            },
                                            projectListener: true
                                        }));

                                        checkLinterSpies(linterBuilderMock, fileName, [buildIssueCheck(this.workingDir)], 0);
                                    },
                                    () => {
                                        atom.workspace.open(fileName).then((editor) => {
                                            _editor = editor;
                                        });
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            watcherOptions: true,
                                            linter: linterBuilderMock.linterMock,
                                            editorGroupContext: true,
                                            editorContexts: {
                                                '*': [],
                                                [fileName]: true
                                            },
                                            projects: {
                                                [this.workingDir]: true
                                            },
                                            projectListener: true
                                        }));

                                        expect(linterBuilderMock.linterMock.dispose.callCount).toBe(0);
                                        expect(linterBuilderMock.linterMock.setMessages.callCount).toBe(0);

                                        plugin.deactivate();
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, internalDataWhenStopped);

                                        checkLinterSpies(linterBuilderMock, fileName, [], 1);

                                        _editor.destroy();
                                    },
                                    () => {
                                        resolve();
                                    }
                                ]);
                            }));
                        });

                        it('Closed before deactivation', function test() {
                            waitsForPromise(() => new Promise((resolve) => {
                                const fileName = Path.join(this.workingDir, 'files\\test.json');
                                let linterBuilderMock;
                                let _editor;

                                runSteps([
                                    () => {
                                        validateInternalData(plugin.internalData, internalDataWhenStopped);

                                        activate();
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            watcherOptions: true
                                        }));

                                        linterBuilderMock = buidlLinterMock();

                                        plugin.consumeIndie(linterBuilderMock.registerIndieMock);
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            watcherOptions: true,
                                            linter: linterBuilderMock.linterMock,
                                            editorGroupContext: true,
                                            editorContexts: {
                                                '*': []
                                            },
                                            projects: {
                                                [this.workingDir]: true
                                            },
                                            projectListener: true
                                        }));

                                        checkLinterSpies(linterBuilderMock, fileName, [buildIssueCheck(this.workingDir)], 0);
                                    },
                                    () => {
                                        atom.workspace.open(fileName).then((editor) => {
                                            _editor = editor;
                                        });
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            watcherOptions: true,
                                            linter: linterBuilderMock.linterMock,
                                            editorGroupContext: true,
                                            editorContexts: {
                                                '*': [],
                                                [fileName]: true
                                            },
                                            projects: {
                                                [this.workingDir]: true
                                            },
                                            projectListener: true
                                        }));

                                        expect(linterBuilderMock.linterMock.dispose.callCount).toBe(0);
                                        expect(linterBuilderMock.linterMock.setMessages.callCount).toBe(0);

                                        _editor.destroy();
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            watcherOptions: true,
                                            linter: linterBuilderMock.linterMock,
                                            editorGroupContext: true,
                                            editorContexts: {
                                                '*': []
                                            },
                                            projects: {
                                                [this.workingDir]: true
                                            },
                                            projectListener: true
                                        }));

                                        expect(linterBuilderMock.linterMock.dispose.callCount).toBe(0);
                                        expect(linterBuilderMock.linterMock.setMessages.callCount).toBe(0);

                                        plugin.deactivate();
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, internalDataWhenStopped);

                                        checkLinterSpies(linterBuilderMock, fileName, [], 1);

                                        _editor.destroy();
                                    },
                                    () => {
                                        resolve();
                                    }
                                ]);
                            }));
                        });
                    });
                });

                describe('Editor is open before activation', () => {
                    describe('File is invalid', () => {
                        beforeEach(function beforeEach() {
                            FsExtra.copySync(Path.join(__dirname, 'fixtures/fullSetup/invalidFile/test.json'), Path.join(this.workingDir, 'files/test.json'));
                        });

                        it('Closed after deactivation', function test() {
                            waitsForPromise(() => new Promise((resolve) => {
                                const fileName = Path.join(this.workingDir, 'files\\test.json');
                                let linterBuilderMock;
                                let _editor;

                                runSteps([
                                    () => {
                                        atom.workspace.open(fileName).then((editor) => {
                                            _editor = editor;
                                        });
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, internalDataWhenStopped);

                                        activate();
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            watcherOptions: true
                                        }));

                                        linterBuilderMock = buidlLinterMock();

                                        plugin.consumeIndie(linterBuilderMock.registerIndieMock);
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, _.merge({}, internalDataWhenStopped, {
                                            watcherOptions: true,
                                            linter: linterBuilderMock.linterMock,
                                            editorGroupContext: true,
                                            editorContexts: {
                                                '*': [],
                                                [fileName]: true
                                            },
                                            projects: {
                                                [this.workingDir]: true
                                            },
                                            projectListener: true
                                        }));

                                        checkLinterSpies(linterBuilderMock, fileName, [buildIssueCheck(this.workingDir)], 0);

                                        plugin.deactivate();
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, internalDataWhenStopped);

                                        checkLinterSpies(linterBuilderMock, fileName, [], 1);

                                        _editor.destroy();
                                    },
                                    () => {
                                        validateInternalData(plugin.internalData, internalDataWhenStopped);

                                        expect(linterBuilderMock.linterMock.dispose.callCount).toBe(0);
                                        expect(linterBuilderMock.linterMock.setMessages.callCount).toBe(0);

                                        resolve();
                                    }
                                ]);
                            }));
                        });

                        xit('closed', () => {});

                        xit('second pane is opened for same file', () => {});

                        describe('file is modified in editor to become valid', () => {
                            xit('base', () => {});

                            xit('saved', () => {});

                            xit('closed not saved', () => {}); // should revert
                        });

                        describe('file is modified outside editor to become valid', () => {
                            xit('base', () => {});

                            xit('closed', () => {});

                            describe('changed in editor to and still invalid', () => {
                                xit('base', () => {});

                                xit('saved', () => {});

                                xit('closed and not saved', () => {});
                            });
                        });
                    });
                });
            });
        });
    });
});
