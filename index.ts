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
      let info: { user: string; followers: string[] } = JSON.parse(message);
      let promises: Promise<any>[] = [];
      const usersInformation: any[] = [];
      const usersIdsLength = info.followers.length;
      while (usersInformation.length !== usersIdsLength) {
        for (let userId of info.followers) {
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
            newUserIds.push(info.followers[index]);
          }
        }
        info.followers = newUserIds;
      }

      // userIds information is ready to be inserted into database
      promises = [];
      for (let userInformation of usersInformation) {
        promises.push(
          new Promise((resolve, reject) => {
            mySQLClient.query(
              // TODO: please replace this query with you own insert query
              `INSERT INTO \`binro\`.\`user_instagramuser\` (\`pk_id\`, \`username\`, \`full_name\`, \`follower_count\`, \`following_count\`, \`profile_pic_url\`, \`media_count\`, \`biography\`, \`is_private\`, \`is_business\`, \`bio_links\`)
               VALUES (${userInformation.pk_id}, ${userInformation.username}, ${userInformation.full_name}, ${userInformation.follower_count}, ${userInformation.following_count}, ${userInformation.profile_pic_url}, ${userInformation.media_count}, ${userInformation.biography}, ${userInformation.is_private}, ${userInformation.public_email}, ${userInformation.public_phone_number}, ${userInformation.category}, ${userInformation.is_business}, ${userInformation.bio_links});
               INSERT INTO \`binro\`.\`user_instagramuser_followers\` (\`${info.user}\`, \`${userInformation.pk_id}\`) VALUES (\'ReportUser\', \'UserFollower\');
              `,
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
