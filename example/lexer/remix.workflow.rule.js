const Rapture = require('rapture-js');

const routeRule = Rapture.object().keys({
    route: Rapture.string().register({
        id: Rapture.logic({
            onRun: (context, contents) => `route/${contents}`
        }),
        scope: '__artifact'
    })
});

const redirectRule = Rapture.object().keys({
    route: Rapture.string().registered(Rapture.logic({
        onRun: (context, contents) => `route/${contents}`
    }))
});

module.exports = Rapture.object().keys({
    start: Rapture.string().registered(Rapture.logic({
        onRun: (context, contents) => `route/${contents}`
    })),
    routes: Rapture.array().items(routeRule),
    redirects: Rapture.array().items(redirectRule)
}).required('start');
