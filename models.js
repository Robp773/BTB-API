'use strict';
const mongoose = require('mongoose');

const logSchema = mongoose.Schema({
    lastLog: Number,
    logs: Array
});



const Logs = mongoose.model('Logs', logSchema);
module.exports = {
    Logs
};