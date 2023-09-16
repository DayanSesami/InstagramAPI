import redis from "redis";
import mysql from "mysql";
import axios from "axios";

const redisClient = redis.createClient({
  url: process.env.REDIS_URL,
});

const mySQLClient = mysql.createConnection({
  host: process.env.MY_SQL_HOST!,
  port: Number(process.env.MY_SQL_PORT!),
  user: process.env.MY_SQL_USERNAME,
  password: process.env.MY_SQL_PASSWORD,
});

mySQLClient.connect(async (err, args) => {
  if (err) {
    console.log(`application didn't connect to the database`);
    console.error(err);
    process.exit(0);
  }

  await redisClient.connect();

  await redisClient.subscribe(
    process.env.REDIS_TOPIC!,
    async (message, channel) => {
      // TODO: the message that is sent to the queue is a list of ids each time
      // for example ['123', '12', '1']
      let usersIds: string[] = JSON.parse(message);
      let promises: Promise<any>[] = [];
      const usersInformation: any[] = [];
      const usersIdsLength = usersIds.length;
      while (usersInformation.length !== usersIdsLength) {
        for (let userId of usersIds) {
          // TODO: Please check if this is the api we need to call
          const newPromise = axios.post(
            "https://v1.rocketapi.io/instagram/user/get_info_by_id",
            {
              id: userId,
            },
            {
              headers: {
                Authorization: `Token ${process.env.INSTAGRAM_API_TOKEN}`,
              },
            }
          );
          promises.push(newPromise);
        }
        const result = await Promise.allSettled(promises);
        const newUserIds: string[] = [];
        for (let index = 0; index < result.length; index++) {
          if (result[index].status === "fulfilled") {
            usersInformation.push((result[index] as any)["value"]);
          } else {
            newUserIds.push(usersIds[index]);
          }
        }
        usersIds = newUserIds;
      }

      // userIds information is ready to be inserted into database
      promises = [];
      for (let userInformation of usersInformation) {
        promises.push(
          new Promise((resolve, reject) => {
            mySQLClient.query(
              // TODO: please replace this query with you own insert query
              `insert into table REPLACE_WITH_YOUR_TABLE_NAME values (${userInformation.username})`,
              function (err, result) {
                if (err) {
                  console.log(err);
                }
                resolve(null);
              }
            );
          })
        );
      }

      await Promise.allSettled(promises);
    }
  );
});
