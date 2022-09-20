import * as dotenv from 'dotenv';
dotenv.config();

import { FirmaSDK } from '@firmachain/firma-js';

import StoreService from './services/store.service';

import { FIRMA_CONFIG } from './config';
import { logger } from './utils/logger';
import { getNowTime } from './utils/date';

import { SWAP_WALLET_MNEMONIC, SWAP_REWARD_QUEUE, SWAP_REWARD_RESULT } from './constants/event';

const REDIS = process.env.REDIS!;
const REDIS_PASS = process.env.REDIS_PASS!;

class EventScheduler {
  constructor(
    private storeService = new StoreService({ url: REDIS, password: REDIS_PASS }),
    private firmaSDK = new FirmaSDK(FIRMA_CONFIG)
  ) {
    this.start();
  }

  private start() {
    this.work();
  }

  private async work() {
    let reward = null;

    try {
      reward = await this.popAddress();

      if (reward !== null) {
        const rewardJSON = JSON.parse(reward);
        const rewadDataJSON = JSON.parse(rewardJSON.rewardData);
        const address = rewardJSON.address;

        logger.info(`🚀[EVENT] SEND START ${address}`);

        logger.info(`🚀[EVENT] SEND END ${address}`);

        await this.work();
        return;
      } else {
        logger.info(`🚀[EVENT] NO ADDRESS`);
      }
    } catch (error) {
      logger.error(error);
    }

    setTimeout(async () => {
      await this.work();
    }, 3000);
  }

  private async popAddress(): Promise<string | null> {
    return await this.storeService.pop(SWAP_REWARD_QUEUE);
  }

  private async writeResult(address: string, transactionHash: string): Promise<void> {
    await this.storeService.zAdd(SWAP_REWARD_RESULT, getNowTime(), JSON.stringify({ address, transactionHash }));
  }
}

new EventScheduler();
