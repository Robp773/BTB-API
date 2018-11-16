var express = require('express');
var app = express();
const axios = require('axios');
const mongoose = require('mongoose');
var moment = require('moment');
const cors = require('cors');
const {
    Logs
} = require('./models');
const {
    DATABASE_URL,
    PORT
} = require('./config');
app.use(cors());
mongoose.promise = global.promise;

// returns data in chartJS format
app.get('/totals', function (req, res) {

    let dataObj = {}
    let userObj = {}

    // query database
    Logs.findOne({})
        .then((result) => {

            // counting up success/fails for each user
            for (let i = 0; i < result.logs.length; i++) {
                let currentLog = result.logs[i]
                let currentUser = currentLog.UserName
                // if userObj doesnt already have a key created for user, create one
                if (!userObj[currentUser]) {
                    userObj[currentUser] = {
                        success: 0,
                        fail: 0
                    };
                }
                // add up success/fails
                if (result.logs[i].Action === "Logon-Success") {

                    userObj[currentUser].success++

                } else if (result.logs[i].Action === "Logon-Failure") {

                    userObj[currentUser].fail++
                }
            }
            // arrange totals into array so they can be sorted by success or fail afterwards
            let userTotals = []
            for (let user in userObj) {
                userTotals.push({
                    name: user,
                    success: userObj[user].success,
                    fail: userObj[user].fail
                })
            }

            // sort for largest number of success/fail
            let successArray = userTotals.sort((a, b) => (a.success > b.success) ? 1 : ((b.success > a.success) ? -1 : 0));
            dataObj.success = successArray.slice(-8, userTotals.length)

            let failArray = userTotals.sort((a, b) => (a.fail > b.fail) ? 1 : ((b.fail > a.fail) ? -1 : 0));
            dataObj.fail = failArray.slice(-8, userTotals.length)

            let barData = {
                success: {
                    labels: [],
                    data: []
                },
                fail: {
                    labels: [],
                    data: []
                }
            }
            // format into arrays of labels and matching values for chartJS
            for (let i = 0; i < dataObj.success.length; i++) {
                barData.success.labels.push(dataObj.success[i].name)
                barData.success.data.push(dataObj.success[i].success)
            }

            for (let i = 0; i < dataObj.fail.length; i++) {
                barData.fail.labels.push(dataObj.fail[i].name)
                barData.fail.data.push(dataObj.fail[i].fail)
            }
            res.send(barData)
        })
});

// connects mongoose and starts server
function runServer(databaseUrl = DATABASE_URL, port = PORT) {
    return new Promise((resolve, reject) => {
        // identifies the server url to connect to for mongoDB database server.
        mongoose.connect(databaseUrl, err => {
            if (err) {
                return reject(err);
            }
            // begins accepting connections on the specified port.
            server = app.listen(port, () => {
                    console.log(`Your app is listening on port ${port}`);
                    resolve();
                })
                .on('error', err => {
                    mongoose.disconnect();
                    reject(err);
                });
        });
    });
}

// get auth token
function getAuth() {
    return axios.get('https://duoauth.me/auth')
        .then(response => {
            return response
        })
        .catch(error => {
            console.log(error);
        });
}
// checks for new logs and saves them to db
function updateDB() {
    let oldLogCap, newLogCap, filteredArray;

    // get auth token
    return getAuth().then((res) => {
        // find the current db document
        Logs.findOne({})
            .then((log) => {
                // find number of last log that was stored in database
                // used in the "from" param later
                oldLogCap = log.logs.length === 1 ? 0 : log.logs.length

                // array of normalized data, new logs will be pushed into this
                filteredArray = log.logs

                // ---------------------------------------------------------------------------------

                // used for finding duplicate id's - not being used since I've decided
                // its better to leave duplicate ids and count them in data rather than
                // change them to unique ids and 

                // for (let i = 0; i <= filteredArray.length - 1; i++) {
                //     if (i !== 0) {
                // if (filteredArray[i].AcmeApiId === filteredArray[i - 1].AcmeApiId) {

                //          }
                //     }
                // }

                // ---------------------------------------------------------------------------------

            })

            // send auth token in header and set "from" param to lastLog value in db
            .then(() => {
                let config = {
                    headers: {
                        "Authorization": res.data
                    },
                    params: {
                        // +1 because last log id is not an array index number
                        from: oldLogCap + 1
                    }
                }

                console.log(`requesting data from ${oldLogCap} and up`)

                // get new data with params
                axios.get('https://duoauth.me/get-events', config)
                    .then(response => {

                        // set log cap to include any new logs retrieved
                        newLogCap = oldLogCap + response.data.length

                        // if there are new results
                        if (response.data) {
                            // normalizing data
                            for (let i = 0; i < response.data.length; i++) {
                                let newObj = {}
                                newObj.AcmeApiId = response.data[i].id
                                newObj.UserName = response.data[i].user_Name.toLowerCase().substring(response.data[i].user_Name.indexOf(":") + 1).trim();
                                newObj.SourceIp = response.data[i].ips[0]
                                newObj.Target = response.data[i].target

                                if (response.data[i].EVENT_0_ACTION.toLowerCase().includes('success')) {
                                    newObj.Action = "Logon-Success"
                                } else {
                                    newObj.Action = "Logon-Failure"
                                }
                                newObj.EventTime = moment(response.data[i].DateTimeAndStuff).format("MMMM Do YYYY, h:mm:ss a")
                                filteredArray.push(newObj)
                            }
                        }

                        // update db with new log count
                        return Logs.findOneAndUpdate({}, {
                            $set: {
                                "lastLog": newLogCap,
                                "logs": filteredArray
                            }
                        })
                    })
                    .catch(error => {
                        console.log(error);
                    });
            })
    })
}

function runDB() {
    // start the server
    return runServer().catch(err => console.error(err))
        .then(() => {
            // check for new logs
            updateDB()
            // check again every minute
            setInterval(updateDB, 60000)
        });
}

runDB()