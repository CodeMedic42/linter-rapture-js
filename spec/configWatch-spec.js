/* global jasmine describe xdescribe it xit expect beforeEach afterEach waitsForPromise */

'use babel';

const Path = require('path');
const Promise = require('bluebird');
const FsExtra = require('fs-extra');

const ConfigWatch = require('../src/configWatch.js');

function validateConfigData(configValue, length) {
    expect(configValue instanceof Object).toBe(true);
    expect(configValue.sessions instanceof Array).toBe(true);
    expect(configValue.sessions.length).toBe(length);
}

function validateFirstSession(configValue) {
    const session = configValue.sessions[0];

    expect(session.id).toBe('sessionIDA');
    expect(session.rules instanceof Array).toBe(true);
    expect(session.rules.length).toBe(1);

    const rule = session.rules[0];

    expect(rule.id).toBe('ruleIDA');
    expect(rule.pattern).toBe('**/*.json');
    expect(rule.rapture).toBe(42);
}

function validateSecondSession(configValue) {
    const session = configValue.sessions[1];

    expect(session.id).toBe('sessionIDB');
    expect(session.rules instanceof Array).toBe(true);
    expect(session.rules.length).toBe(2);

    const ruleA = session.rules[0];

    expect(ruleA.id).toBe('ruleIDA');
    expect(ruleA.pattern).toBe('**/*.foo.json');
    expect(ruleA.rapture).toBe('foo');

    const ruleB = session.rules[1];

    expect(ruleB.id).toBe('ruleIDB');
    expect(ruleB.pattern).toBe('**/*.bar.json');
    expect(ruleB.rapture).toBe('bar');
}

describe('ConfigWatch Tests', () => {
    it('starts', () => {
        const configWatch = ConfigWatch(__dirname, {
            usePolling: true,
            interval: 200
        });

        expect(configWatch).toBeDefined();
        expect(configWatch.onUpdate).toBeDefined();
        expect(configWatch.destroy).toBeDefined();

        configWatch.destroy();
    });

    it('Calls onUpdate with null on start when file does not exist', () => {
        waitsForPromise(() =>
            new Promise((resolve) => {
                const testPath = Path.join(__dirname, 'fixtures/rcFiles/noRcFile');

                const configWatch = ConfigWatch(testPath, {
                    usePolling: true,
                    interval: 200
                });

                let instance = 0;

                configWatch.onUpdate((configValue) => {
                    expect(configValue).toBe(null);

                    if (instance === 0) {
                        instance += 1;

                        configWatch.destroy();
                    } else if (instance === 1) {
                        resolve();
                    }
                });
            }).catch((err) => {
                console.log(err);
            })
        );
    });

    it('Calls onUpdate with value on start when file does exist', () => {
        waitsForPromise(() =>
            new Promise((resolve) => {
                const testPath = Path.join(__dirname, 'fixtures/rcFiles/singleSession');

                const configWatch = ConfigWatch(testPath, {
                    usePolling: true,
                    interval: 200
                });

                let instance = 0;

                configWatch.onUpdate((configValue) => {
                    if (instance === 0) {
                        instance += 1;

                        expect(configValue).toBe(null);
                    } else if (instance === 1) {
                        instance += 1;

                        validateConfigData(configValue, 1);
                        validateFirstSession(configValue);

                        configWatch.destroy();
                    } else {
                        expect(configValue).toBe(null);

                        resolve();
                    }
                });
            }).catch((err) => {
                console.log(err);
            })
        );
    });

    describe('When file does not exist', () => {
        beforeEach(() => {
            FsExtra.copySync(Path.join(__dirname, 'fixtures/rcFiles/singleSession/'), Path.join(__dirname, './fixtures/rcFiles/singleSessionCopy/'));
            FsExtra.removeSync(Path.join(__dirname, './fixtures/rcFiles/singleSessionCopy/.rapturelintrc'));
        });

        afterEach(() => {
            FsExtra.removeSync(Path.join(__dirname, './fixtures/rcFiles/singleSessionCopy/'));
        });

        it('Calls onUpdate when file is created', () => {
            // DAMN ATOM SETTING CLOCK SPIES!
            jasmine.useRealClock();

            waitsForPromise(() =>
                new Promise((resolve) => {
                    const testPath = Path.join(__dirname, 'fixtures/rcFiles/singleSessionCopy');

                    const configWatch = ConfigWatch(testPath, {
                        usePolling: true,
                        interval: 200
                    });

                    let instance = 0;

                    configWatch.onUpdate((configValue) => {
                        if (instance === 0) {
                            console.log('onUpdate: 0');
                            // File does not exist
                            instance += 1;

                            expect(configValue).toBe(null);

                            // Create File
                            setTimeout(() => {
                                console.log('setTimeout');
                                FsExtra.copySync(Path.join(__dirname, 'fixtures/rcFiles/singleSession/.rapturelintrc'), Path.join(__dirname, './fixtures/rcFiles/singleSessionCopy/.rapturelintrc'));
                            }, 500);
                        } else if (instance === 1) {
                            console.log('onUpdate: 1');
                            instance += 1;

                            validateConfigData(configValue, 1);
                            validateFirstSession(configValue);

                            configWatch.destroy();
                        } else {
                            console.log('onUpdate: 2');
                            expect(configValue).toBe(null);

                            resolve();
                        }
                    });
                }).catch((err) => {
                    console.log(err);
                })
            );
        });

        xit('when it is created but it is invalid', () => {});
    });

    describe('When file exists', () => {
        beforeEach(() => {
            FsExtra.copySync(Path.join(__dirname, 'fixtures/rcFiles/singleSession/'), Path.join(__dirname, './fixtures/rcFiles/singleSessionCopy/'));
        });

        afterEach(() => {
            FsExtra.removeSync(Path.join(__dirname, './fixtures/rcFiles/singleSessionCopy/'));
        });

        it('Calls onUpdate when file is changed', () => {
            waitsForPromise(() =>
                new Promise((resolve) => {
                    const testPath = Path.join(__dirname, 'fixtures/rcFiles/singleSessionCopy');

                    const configWatch = ConfigWatch(testPath, {
                        usePolling: true,
                        interval: 200
                    });

                    let instance = 0;

                    configWatch.onUpdate((configValue) => {
                        if (instance === 0) {
                            instance += 1;

                            expect(configValue).toBe(null);
                        } else if (instance === 1) {
                            instance += 1;

                            validateConfigData(configValue, 1);
                            validateFirstSession(configValue);

                            FsExtra.copySync(Path.join(__dirname, 'fixtures/rcFiles/multiSession/'), Path.join(__dirname, './fixtures/rcFiles/singleSessionCopy/'));
                        } else if (instance === 2) {
                            instance += 1;

                            validateConfigData(configValue, 2);
                            validateFirstSession(configValue);
                            validateSecondSession(configValue);

                            configWatch.destroy();
                        } else {
                            expect(configValue).toBe(null);

                            resolve();
                        }
                    });
                }).catch((err) => {
                    console.log(err);
                })
            );
        });

        xit('when it is changed but is invalid ', () => {});

        it('Calls onUpdate when file is removed', () => {
            waitsForPromise(() =>
                new Promise((resolve) => {
                    const testPath = Path.join(__dirname, 'fixtures/rcFiles/singleSessionCopy');

                    const configWatch = ConfigWatch(testPath, {
                        usePolling: true,
                        interval: 200
                    });

                    let instance = 0;

                    configWatch.onUpdate((configValue) => {
                        if (instance === 0) {
                            instance += 1;

                            expect(configValue).toBe(null);
                        } else if (instance === 1) {
                            instance += 1;

                            validateConfigData(configValue, 1);
                            validateFirstSession(configValue);

                            FsExtra.removeSync(Path.join(__dirname, './fixtures/rcFiles/singleSessionCopy/.rapturelintrc'));
                        } else if (instance === 2) {
                            instance += 1;

                            expect(configValue).toBe(null);

                            configWatch.destroy();
                        } else {
                            expect(configValue).toBe(null);

                            resolve();
                        }
                    });
                }).catch((err) => {
                    console.log(err);
                })
            );
        });
    });

    describe('rapture rule tests', () => {
        describe('when it does not exist', () => {
            xit('base', () => {});
            xit('when it is created', () => {});
        });
        xit('When it is invalid', () => {});
        xit('When it is becomes unavailable', () => {});
    });
});
