const Rapture = require('rapture-js');

module.exports = Rapture.object().keys({
    foo: Rapture.array().items(Rapture.scope(Rapture.object().keys({
        bar: Rapture.string().register({
            id: 'barValue',
            scope: '__working'
        }),
        baz: Rapture.string().registered()
    })))
});
