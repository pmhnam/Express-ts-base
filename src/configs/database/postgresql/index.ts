import { Sequelize, Dialect } from 'sequelize';
import { config } from 'dotenv';
import { InternalServerHTTP } from '@src/configs/httpException';
import logger from '@src/configs/logger';
import { configDB } from './config.sequelize';

config();

const DB_CONNECT_TIMEOUT = 10 * 1000;
const DB_RECONNECT_TIMEOUT = 1 * 1000;
let connectionTimeout: NodeJS.Timeout | null = null;
let reconnectTimeout: NodeJS.Timeout | null = null;

const sequelize = new Sequelize(configDB.database as string, configDB.username as string, configDB.password, {
  ...configDB,
  dialect: configDB.dialect as Dialect,
});

export const connectDB = async () => {
  try {
    await sequelize.authenticate();
    await sequelize.sync({ alter: process.env.NODE_ENV !== 'development' });
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    if (connectionTimeout) clearTimeout(connectionTimeout);
    logger.log('DB connected');
  } catch (error: any) {
    logger.error('DB connection failed, reconnecting...');
    // try to reconnect
    reconnectTimeout = setTimeout(connectDB, DB_RECONNECT_TIMEOUT);
    if (!connectionTimeout) {
      connectionTimeout = setTimeout(() => {
        logger.error('DB connection failed', { metadata: error });
        throw new InternalServerHTTP('DB connection failed');
      }, DB_CONNECT_TIMEOUT);
    }
  }
};

export const db = {
  sequelize,
};
