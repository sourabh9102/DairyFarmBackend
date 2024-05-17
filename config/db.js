const dotenv = require('dotenv');
dotenv.config({ path: '../config/config.env' });

const { Sequelize } = require('sequelize');


const sequelize = new Sequelize(process.env.DATABASE, process.env.DATABASE_USER, process.env.DATABASE_PASSWORD, {
    host: process.env.DATABASE_HOST,
    dialect: 'mysql',
    define: {
        timestamps: false
    }
});

sequelize.authenticate()
    .then(() => {
        console.log('Connection has been established successfully.');
    })
    .catch(error => {
        console.log('Unable to connect to the database:', error);
    });

const db = {};
db.Sequelize = Sequelize;
db.sequelize = sequelize;



db.authRoute = require('../routes/authRoutes');

db.sequelize.sync()
    .then(async () => {
        console.log("Re-sync");
    })
    .catch(error => {
        console.log("Error in sync:", error);
    });


module.exports = db;
