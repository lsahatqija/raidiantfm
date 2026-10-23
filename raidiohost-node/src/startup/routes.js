const express = require('express');
const { createAuthRouter } = require('../routes/auth.routes');
const apiRoutes = require('../routes/api.routes');
const userRoutes = require('../routes/user.routes');
const radioRoutes = require('../routes/radio.routes');

module.exports = function configureRoutes(app, runtimeConfig) {
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    app.use('/auth', createAuthRouter({ config: runtimeConfig }));
    app.use('/api', apiRoutes);
    app.use('/api/users', userRoutes);
    app.use('/api/radio', radioRoutes);
}
