const express = require('express');
const authRoutes = require('../routes/auth.routes');
const apiRoutes = require('../routes/api.routes');
const userRoutes = require('../routes/user.routes');
const radioRoutes = require('../routes/radio.routes');

module.exports = function(app){
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    app.use('/auth', authRoutes);
    app.use('/api', apiRoutes);
    app.use('/api/users', userRoutes);
    app.use('/api/radio', radioRoutes);
}