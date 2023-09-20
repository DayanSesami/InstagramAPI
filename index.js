"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const redis = __importStar(require("redis"));
const mysql = __importStar(require("mysql"));
const axios_1 = __importDefault(require("axios"));
const redisClient = redis.createClient({
    url: process.env.REDIS_URL,
});
const mySQLClient = mysql.createConnection({
    host: process.env.MY_SQL_HOST,
    port: Number(process.env.MY_SQL_PORT),
    user: process.env.MY_SQL_USERNAME,
    password: process.env.MY_SQL_PASSWORD,
});
mySQLClient.connect((err, args) => __awaiter(void 0, void 0, void 0, function* () {
    if (err) {
        console.log(`application didn't connect to the database`);
        console.error(err);
        process.exit(0);
    }
    yield redisClient.connect();
    yield redisClient.subscribe(process.env.REDIS_TOPIC, (message, channel) => __awaiter(void 0, void 0, void 0, function* () {
        // TODO: the message that is sent to the queue is a list of ids each time
        // for example ['123', '12', '1']
        let info = JSON.parse(message);
        let promises = [];
        const usersInformation = [];
        const usersIdsLength = info.followers.length;
        while (usersInformation.length !== usersIdsLength) {
            for (let userId of info.followers) {
                // TODO: Please check if this is the api we need to call
                const newPromise = axios_1.default.post("https://v1.rocketapi.io/instagram/user/get_info_by_id", {
                    id: userId,
                }, {
                    headers: {
                        Authorization: `Token ${process.env.INSTAGRAM_API_TOKEN}`,
                    },
                });
                promises.push(newPromise);
            }
            const result = yield Promise.allSettled(promises);
            const newUserIds = [];
            for (let index = 0; index < result.length; index++) {
                if (result[index].status === "fulfilled") {
                    usersInformation.push(result[index]["value"]);
                }
                else {
                    newUserIds.push(info.followers[index]);
                }
            }
            info.followers = newUserIds;
        }
        // userIds information is ready to be inserted into database
        promises = [];
        for (let userInformation of usersInformation) {
            promises.push(new Promise((resolve, reject) => {
                mySQLClient.query(
                // TODO: please replace this query with you own insert query
                `INSERT INTO \`binro\`.\`user_instagramuser\` (\`pk_id\`, \`username\`, \`full_name\`, \`follower_count\`, \`following_count\`, \`profile_pic_url\`, \`media_count\`, \`biography\`, \`is_private\`, \`is_business\`, \`bio_links\`)
               VALUES (${userInformation.pk_id}, ${userInformation.username}, ${userInformation.full_name}, ${userInformation.follower_count}, ${userInformation.following_count}, ${userInformation.profile_pic_url}, ${userInformation.media_count}, ${userInformation.biography}, ${userInformation.is_private}, ${userInformation.public_email}, ${userInformation.public_phone_number}, ${userInformation.category}, ${userInformation.is_business}, ${userInformation.bio_links});
               INSERT INTO \`binro\`.\`user_instagramuser_followers\` (\`${info.user}\`, \`${userInformation.pk_id}\`) VALUES (\'ReportUser\', \'UserFollower\');
              `, function (err, result) {
                    if (err) {
                        console.log(err);
                    }
                    resolve(null);
                });
            }));
        }
        yield Promise.allSettled(promises);
    }));
}));
