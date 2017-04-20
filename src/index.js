'use babel';

// eslint-disable-next-line
import { CompositeDisposable } from 'atom';
import FsExtra from 'fs-extra';
import Rapture from 'rapture-js';
import _ from 'lodash';
import Path from 'path';
import Minimatch from 'minimatch';
import ConfigWatch from './configWatch';
import FileWatch from './fileWatch';

export const internalData = {
    editorContexts: null,
    linter: null,
    editorGroupContext: null,
    projects: null,
    watcherOptions: null,
    projectListener: null
};

function closeProjectSessions(project) {
    _.forEach(project.sessions, (session, index) => {
        session.dispose();

        project.sessions[index] = null;
    });

    project.sessions = null;
    project.globs = null;
}

function closeProjectFileWatchers(project) {
    _.forEach(project.fileWatchers, (fileWatcher, index) => {
        fileWatcher.dispose();

        project.fileWatchers[index] = null;
    });

    project.fileWatchers = null;
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

        artifactContext.on('disposed', () => {
            console.log('setupArtifactContext:disposed');

            internalData.linter.setMessages(artifactContext.id, []);
        });

        console.log('setupArtifactContext:inital Setup');

        setIssues(artifactContext);

        return artifactContext;
    }

    console.log('setupArtifactContext:update');

    artifactContext.update(contents);

    return artifactContext;
}

function fillOpenEditors(sessionContext, glob) {
    _.forEach(internalData.editorContexts, (editorContext) => {
        if (_.isNil(editorContext.path)) {
            return;
        }

        if (!Minimatch(editorContext.path, glob.pattern)) {
            return;
        }

        const text = editorContext.textEditor.getText();

        // New file!
        const artifactContext = setupArtifactContext(sessionContext, editorContext.path, glob.rule, text);

        editorContext.artifactContexts.push(artifactContext);
    });
}

function setupGlobList(project, sessionContext, rule) {
    const glob = {
        sessionContext,
        pattern: Path.join(project.path, rule.pattern),
        rule: rule.rapture
    };

    project.globs.push(glob);

    fillOpenEditors(sessionContext, glob);
}

function openProjectSessions(project) {
    project.fileWatchers = [];
    project.sessions = [];
    project.globs = [];

    _.forEach(project.currentConfig.sessions, (session) => {
        const sessionContext = Rapture.createSessionContext();

        project.sessions.push(sessionContext);

        _.forEach(session.rules, (rule) => {
            console.log('fileWatch: setup');

            setupGlobList(project, sessionContext, rule);

            const fileWatch = FileWatch(rule.pattern, project.path, internalData.watcherOptions);

            project.fileWatchers.push(fileWatch);

            console.log('fileWatch.onUpdate: setup');

            fileWatch.onUpdate((file, contents) => {
                if (_.isUndefined(contents)) {
                    console.log('fileWatch.onUpdate: undefined');

                    if (internalData.editorContexts[file]) {
                        // The file has been deleted or we are no longer watching it.
                        // Either way we need to leave the artifact context alone for the editor.
                        return;
                    }

                    // Destroy the artifact context for this file.
                    const artifactContext = sessionContext.getArtifactContext(file);

                    if (!_.isNil(artifactContext)) {
                        artifactContext.dispose();
                    }
                } else {
                    console.log('fileWatch.onUpdate: Is defined');

                    // If the file is open in atom then do nothing. We are getting our data from atom directly.
                    if (!internalData.editorContexts[file]) {
                        // otherwise lets load it
                        setupArtifactContext(sessionContext, file, rule.rapture, contents);
                    }
                }
            });
        });
    });
}

function closeEditor() {
    if (!_.isNil(internalData.editorGroupContext)) {
        internalData.editorGroupContext.dispose();
        internalData.editorGroupContext = null;
    }
}

function cleanUpProject(project) {
    closeProjectFileWatchers(project);
    closeProjectSessions(project);
}

function updateContextLocation(editorContext, oldPath, newPath) {
    const oldExists = !_.isNil(oldPath);
    const newExists = !_.isNil(newPath);

    if (oldExists && newExists) {
        if (oldPath !== newPath) {
            // path has changed
            delete internalData.editorContexts[oldPath];

            internalData.editorContexts[newPath] = editorContext;
        }
    } else if (newExists) {
        // old was null but the new one has a path.
        _.pull(internalData.editorContexts['*'], editorContext);

        internalData.editorContexts[newPath] = editorContext;
    } else if (oldExists) {
        // The file no longe has a path
        delete internalData.editorContexts[oldPath];

        internalData.editorContexts['*'].push(editorContext);
    }

    editorContext.path = newPath;
}

function setupOnLoad(editorContext) {
    const oldPath = editorContext.path;
    const newPath = editorContext.textEditor.getPath();

    updateContextLocation(editorContext, oldPath, newPath);

    const removedContexts = [];

    _.forOwn(internalData.projects, (project) => {
        _.forEach(project.globs, (glob) => {
            const sessionContext = glob.sessionContext;

            const currentMatch = _.isNil(oldPath) ? false : Minimatch(oldPath, glob.pattern);
            const newMatch = _.isNil(newPath) ? false : Minimatch(newPath, glob.pattern);

            if (currentMatch && newMatch) {
                // Same file new name?

                // What happens if the file name changes externaly to Atom?
                    // Well the file watcher will find the file and add it because we have no idea what the user is doing.
                    // In atom if the file has no changes then everything just updates.
                    // If the file has changes then the editor stays open.
                    // In this case we are going to run with both and let the user sort it out.

                // This line should fire before the file watcher does.
                // If it does then the file watcher will just stop becuase it is already loaded in the editor.
                // If for some reason the file watcher is first it will remove the old context and create a new one.
                    // This line will fail because the id already exists and Rapture should complain.

                // But we will try and catch it here.
                const artifactContext = sessionContext.getArtifactContext(newPath);

                if (_.isNil(artifactContext)) {
                    sessionContext.updateContextId(oldPath, newPath);
                } else {
                    throw new Error('Unexpected Result when file name changed');
                }
            } else if (currentMatch) {
                // The file no longer matches
                removedContexts.push(sessionContext);
            } else if (newMatch) {
                console.log('setupOnLoad: is new match');

                const text = editorContext.textEditor.getText();

                // New file!
                const context = setupArtifactContext(sessionContext, newPath, glob.rule, text);

                editorContext.artifactContexts.push(context);
            }
        });

        _.forEach(removedContexts, (sessionToRemoveFrom, index) => {
            const artifactContext = sessionToRemoveFrom.getArtifactContext(oldPath);

            _.pull(editorContext.contexts, artifactContext);

            if (artifactContext == null) {
                throw new Error('I do not expect to get here.');
            }

            // Check if file exists
            if (FsExtra.existsSync(oldPath)) {
                // If it does then reload the file from this and let the file watcher

                const contents = FsExtra.readFileSync(oldPath).toString();

                artifactContext.update(contents);
            } else {
                // The file only existed in the editor. Dispose the artifact context.
                artifactContext.dispose();
            }

            removedContexts[index] = null;
        });

        editorContext.path = newPath;
    });
}

function setupEditorContext(editorContext) {
    // let currentPath = editorContext.textEditor.getPath();

    setupOnLoad(editorContext);

    editorContext.subscriptions.push(() => {
        if (_.isNil(editorContext.path)) {
            _.pull(internalData.editorContexts['*'], editorContext);
        } else {
            delete internalData.editorContexts[editorContext.path];
        }
    });

    const onDidChangePathSubscription = editorContext.textEditor.onDidChangePath(() => {
        setupOnLoad(editorContext);
    });

    editorContext.subscriptions.push(() => {
        onDidChangePathSubscription.dispose();
    });

    const onDidStopChangingSubscription = editorContext.textEditor.onDidStopChanging(() => {
        const test = editorContext.textEditor.getText();

        _.forEach(editorContext.artifactContexts, (context) => {
            context.update(test);
        });
    });

    editorContext.subscriptions.push(() => {
        onDidStopChangingSubscription.dispose();
    });

    const onDidDestroySubscription = editorContext.textEditor.onDidDestroy(() => {
        editorContext.dispose();
    });

    editorContext.subscriptions.push(() => {
        onDidDestroySubscription.dispose();
    });
}

function openEditor() {
    internalData.editorContexts = {
        '*': []
    };

    const editorSubscription = atom.workspace.observeTextEditors((textEditor) => {
        let editorContext = {
            textEditor,
            artifactContexts: [],
            subscriptions: [],
            dispose: () => {
                _.forEach(editorContext.subscriptions, (subscription, index) => {
                    subscription();

                    editorContext.subscriptions[index] = null;
                });

                _.forEach(editorContext.artifactContexts, (context, index) => {
                    editorContext.artifactContexts[index] = null;
                });

                editorContext.subscriptions = null;

                // trying to help the GC
                editorContext.textEditor = null;
                editorContext.artifactContexts = null;

                editorContext = null;
            }
        };

        // Init connection
        setupEditorContext(editorContext);
    });

    internalData.editorGroupContext = {
        dispose: () => {
            _.forEach(internalData.editorContexts['*'], (context) => {
                context.dispose();
            });

            delete internalData.editorContexts['*'];

            _.forOwn(internalData.editorContexts, (context) => {
                context.dispose();
            });

            editorSubscription.dispose();
        }
    };
}

function openProject(path) {
    const project = {
        path,
        configWatch: ConfigWatch(path, internalData.watcherOptions),
        fileWatchers: null,
        currentConfig: null,
        sessions: null,
        globs: null,
        dispose: () => {
            if (!_.isNil(project.configWatch)) {
                project.configWatch.dispose();
                project.configWatch = null;
            }

            cleanUpProject(project);

            project.currentConfig = null;
        }
    };

    project.configWatch.onUpdate((config) => {
        if (_.isNil(config) && _.isNil(project.currentConfig)) {
            // No need to rerun if both are nill
            return;
        }

        project.currentConfig = config;

        cleanUpProject(project);

        if (project.currentConfig != null) {
            openProjectSessions(project);
        }
    });

    internalData.projects[path] = project;
}

function updateProjects(openProjectPaths, newProjects) {
    const final = [];

    _.forEach(openProjectPaths, (openPath) => {
        let foundIndex = -1;

        _.forEach(newProjects, (newPath, index) => {
            if (openPath === newPath) {
                // already open and running
                foundIndex = index;
            }

            return foundIndex < 0;
        });

        if (foundIndex < 0) {
            // the project is no longer open
            internalData.projects[openPath].dispose();
            internalData.projects[openPath] = null;
        } else {
            // The project is still open
            // add it to final
            final.push(openPath);

            // remove it from new.
            // After we are done anything left over is a list of projects which need to be opened.
            _.pullAt(newProjects, foundIndex);
        }
    });

    _.forEach(newProjects, (newPath) => {
        openProject(newPath);
        final.push(newPath);
    });

    return final;
}

export function activate(options) {
    internalData.watcherOptions = options;
}

export function deactivate() {
    closeEditor();

    internalData.projectListener.dispose();

    internalData.projectListener = null;

    internalData.watcherOptions = null;

    _.forOwn(internalData.projects, (project, path) => {
        project.dispose();

        internalData.projects[path] = null;
    });

    internalData.projects = null;

    if (!_.isNil(internalData.linter)) {
        internalData.linter.dispose();
        internalData.linter = null;
    }

    internalData.editorContexts = null;
}

export function consumeIndie(registerIndie) {
    internalData.linter = registerIndie({
        name: 'Json'
    });

    internalData.projects = {};

    openEditor();

    let openProjectPaths = atom.project.getPaths();

    _.forEach(openProjectPaths, (openProjectPath) => {
        openProject(openProjectPath);
    });

    internalData.projectListener = atom.project.onDidChangePaths((newProjects) => {
        openProjectPaths = updateProjects(openProjectPaths, newProjects);
    });
}
