import App from './app';

import StoreService from './services/store.service';

import IndexRoute from './routes/index.route';
import SwapRoute from './routes/swap.route';
import validateEnv from './utils/validateEnv';

import * as dotenv from 'dotenv';

dotenv.config();
validateEnv();

const storeService = new StoreService({ url: process.env.REDIS!, password: process.env.REDIS_PASS! });

const app = new App([new IndexRoute(), new SwapRoute(storeService)]);

app.listen();
