const Rapture = require('rapture-js');

const RemixRule = Rapture.any();

function load() {
    const session = Rapture.createSessionContext();

    const pluginContext = {
        dispose: () =>
            session.dispose(),
        rules: {
            lexer: (id, data) =>
                session.createArtifactContext(id, RemixRule, data)
        },
        getArtifactContext: id =>
            session.getArtifactContext(id),
        issues: () =>
            session.issues()
    };

    return pluginContext;
}

module.exports = load;
