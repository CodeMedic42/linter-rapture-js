'use babel';

// eslint-disable-next-line
import { CompositeDisposable } from 'atom';
// import Path from 'path';
// eslint-disable-next-line
import FsExtra from 'fs-extra';
import Rapture from 'C:/Users/cmicle/Desktop/Rapture/Current/3 - scope working/src';
import _ from 'lodash';
import Minimatch from 'minimatch';
import ConfigWatch from './configWatch';
import FileWatch from './fileWatch';

let watcherOptions;

export const internalData = {
    configWatch: null,
    sessions: null,
    fileWatchers: null,
    inEditor: null,
    globs: null,
    editorContexts: null,
    linter: null,
    editorGroupContext: null,
    currentConfig: null
};

function closeSessions() {
    _.forEach(internalData.sessions, (session, index) => {
        session.destroy();

        internalData.sessions[index] = null;
    });

    internalData.sessions = null;
    internalData.globs = null;
}

function closefileWatchers() {
    _.forEach(internalData.fileWatchers, (fileWatcher, index) => {
        fileWatcher.destroy();

        internalData.fileWatchers[index] = null;
    });

    internalData.fileWatchers = null;
}

function setIssues(artifactContext) {
    console.log('setIssues');

    const messages = _.reduce(artifactContext.issues(), (reduc, issue) => {
        reduc.push({
            severity: issue.severity,
            location: {
                file: artifactContext.id,
                position: [[issue.location.rowStart, issue.location.columnStart], [issue.location.rowEnd, issue.location.columnEnd]],
            },
            excerpt: `Type: ${issue.type}; ${issue.message}`
        });

        return reduc;
    }, []);

    internalData.linter.setMessages(artifactContext.id, messages);
}

function setupArtifactContext(sessionContext, file, raptureRule, contents) {
    console.log('setupArtifactContext');
    let artifactContext = sessionContext.getArtifactContext(file);

    if (artifactContext == null) {
        artifactContext = sessionContext.createArtifactContext(file, raptureRule, contents);

        artifactContext.on('raise', () => {
            console.log('setupArtifactContext:onRaise');

            setIssues(artifactContext);
        });

        artifactContext.on('destroy', () => {
            console.log('setupArtifactContext:onDestroy');

            internalData.linter.setMessages(artifactContext.id, []);
        });

        console.log('setupArtifactContext:inital Setup');

        setIssues(artifactContext);

        return artifactContext;
    }

    console.log('setupArtifactContext:update');

    artifactContext.update(contents);

    return null;
}

function openSessions(config) {
    internalData.fileWatchers = [];
    internalData.sessions = [];
    internalData.globs = [];
    internalData.inEditor = {};

    _.forEach(config.sessions, (session) => {
        const sessionContext = Rapture.createSessionContext();

        internalData.sessions.push(sessionContext);

        _.forEach(session.rules, (rule) => {
            console.log('fileWatch: setup');

            const fileWatch = FileWatch(rule.pattern, watcherOptions);

            internalData.globs.push({
                sessionContext,
                pattern: rule.pattern,
                rule: rule.rapture
            });

            internalData.fileWatchers.push(fileWatch);

            console.log('fileWatch.onUpdate: setup');

            fileWatch.onUpdate((file, contents) => {
                if (_.isUndefined(contents)) {
                    console.log('fileWatch.onUpdate: undefined');

                    if (internalData.inEditor[file]) {
                        // The file has been deleted or we are no longer watching it.
                        // Either way we need to leave the artifact context alone for the editor.
                        return;
                    }

                    // Destroy the artifact context for this file.
                    const artifactContext = sessionContext.getArtifactContext(file);

                    if (artifactContext != null) {
                        artifactContext.destroy();
                    }
                } else {
                    console.log('fileWatch.onUpdate: Is defined');

                    internalData.inEditor[file] = _.isNil(internalData.inEditor[file]) ? false : internalData.inEditor[file];

                    // If the file is open in atom then do nothing. We are getting our data from atom directly.
                    if (!internalData.inEditor[file]) {
                        // otherwise lets load it
                        setupArtifactContext(sessionContext, file, rule.rapture, contents);
                    }
                }
            });
        });
    });
}

function cleanUp() {
    closefileWatchers();
    closeSessions();

    if (!_.isNil(internalData.editorGroupContext)) {
        internalData.editorGroupContext.dispose();
        internalData.editorGroupContext = null;
    }

    internalData.inEditor = null;
}

function setupOnLoad(editorContext, oldTitle, newTitle) {
    internalData.inEditor[oldTitle] = false;

    _.forEach(internalData.globs, (glob) => {
        const sessionContext = glob.sessionContext;

        const currentMatch = Minimatch(oldTitle, glob.pattern);
        const newMatch = Minimatch(newTitle, glob.pattern);

        if (currentMatch && newMatch) {
            internalData.inEditor[newTitle] = true;
            // Same file new name?
            // Need to make sure the watcher does not have a fit.
            sessionContext.updateContextId(oldTitle, newTitle);
        } else if (currentMatch) {
            // The file no longer matches
            const artifactContext = sessionContext.getArtifactContext(oldTitle);

            if (artifactContext != null) {
                _.pull(editorContext.contexts, artifactContext).destroy();
            } else {
                throw new Error('I do not expect to get here.');
            }
        } else if (newMatch) {
            console.log('setupOnLoad: is new match');

            internalData.inEditor[newTitle] = true;

            const currentBuffer = editorContext.textEditor.getBuffer();

            // New file!
            const context = setupArtifactContext(sessionContext, oldTitle, glob.rapture, currentBuffer.toString());

            editorContext.contexts.push(context);
        } else {
            throw new Error('A glob match not being found should not happen');
        }
    });

    return () => {
        internalData.inEditor[oldTitle] = false;
    };
}

function setupEditorContext(editorContext) {
    let currentTitle = editorContext.textEditor.getTitle();

    setupOnLoad(editorContext, null, currentTitle);

    const onDidChangeTitleSubscription = editorContext.textEditor.onDidChangeTitle(() => {
        const newTitle = editorContext.textEditor.getTitle();

        setupOnLoad(editorContext, currentTitle, newTitle);

        currentTitle = newTitle;
    });

    internalData.subscriptions.add(() => {
        onDidChangeTitleSubscription.dispose();
    });

    const onDidStopChangingSubscription = editorContext.textEditor.onDidStopChanging(() => {
        const newData = editorContext.textEditor.getBuffer();

        _.forEach(editorContext.artifactContexts, (contexts) => {
            contexts.update(newData);
        });
    });

    internalData.subscriptions.add(() => {
        onDidStopChangingSubscription.dispose();
    });

    const onDidDestroySubscription = editorContext.textEditor.onDidDestroy(() => {
        editorContext.destroy();
    });

    internalData.subscriptions.add(() => {
        onDidDestroySubscription.dispose();
    });
}

function openEditor() {
    internalData.editorContexts = [];

    const editorSubscription = atom.workspace.observeTextEditors((textEditor) => {
        const editorPath = textEditor.getPath();

        if (!editorPath) {
            return;
        }

        let editorContext = {
            textEditor,
            artifactContexts: [],
            subscriptions: [],
            dispose: () => {
                _.forEach(editorContext.subscriptions, (subscription, index) => {
                    subscription();

                    editorContext.subscriptions[index] = null;
                });

                editorContext.subscriptions = null;

                // trying to help the GC
                editorContext.textEditor = null;
                editorContext.artifactContexts = null;

                editorContext = null;
            }
        };

        internalData.editorContexts.push(editorContext);

        // Init connection
        setupEditorContext(editorContext);
    });

    internalData.editorGroupContext = {
        dispose: () => {
            _.forEach(internalData.editorContexts, (context, index) => {
                context.dispose();
                internalData.editorContexts[index] = null;
            });

            internalData.editorContexts = null;

            editorSubscription.dispose();
        }
    };
}

export function activate(options) {
    watcherOptions = options;

    internalData.configWatch = ConfigWatch(options);
}

export function deactivate() {
    watcherOptions = null;

    cleanUp();

    if (!_.isNil(internalData.configWatch)) {
        internalData.configWatch.destroy();
        internalData.configWatch = null;
    }

    if (!_.isNil(internalData.linter)) {
        internalData.linter.dispose();
        internalData.linter = null;
    }
}

export function consumeIndie(registerIndie) {
    internalData.linter = registerIndie({
        name: 'Json'
    });

    internalData.configWatch.onUpdate((config) => {
        if (FsExtra.existsSync('C:/Users/cmicle/Desktop/Rapture/linter/atempt-1/json-linter/spec/fixtures/fullSetup/singleSessionCopy/.rapturelintrc')) {
            console.log('Exists');
        } else {
            console.log('DN exist');
        }

        console.log('internalData.configWatch.onUpdate: 0');

        console.log(`internalData.configWatch.onUpdate: ${config}`);

        if (_.isNil(config) && _.isNil(internalData.currentConfig)) {
            // No need to rerun if both are nill
            return;
        }

        console.log('internalData.configWatch.onUpdate: 1');

        internalData.currentConfig = config;

        cleanUp();

        if (config != null) {
            openSessions(config);
            openEditor();
        }
    });
}
