import * as dotenv from 'dotenv';
dotenv.config();

import TelegramBot from 'node-telegram-bot-api';
import { FirmaSDK } from '@firmachain/firma-js';

import StoreService from './services/store.service';

import { FIRMA_CONFIG } from './config';
import { logger } from './utils/logger';
import { getNowTime } from './utils/date';
import { getDecryptString } from './utils/crypto';

import {
  SWAP_WALLET_MNEMONIC,
  SWAP_REWARD_QUEUE,
  SWAP_REWARD_RESULT,
  TOKEN_DENOM,
  SECRET,
  SWAP_WALLET_ADDRESS,
} from './constants/event';

const REDIS = process.env.REDIS!;
const REDIS_PASS = process.env.REDIS_PASS!;
const BOT_TOKEN = process.env.BOT_TOKEN!;
const CHAT_ID = process.env.CHAT_ID!;
const EXPLORER_HOST = process.env.EXPLORER_HOST!;

const telegrambot = new TelegramBot(BOT_TOKEN, { polling: false });

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
    let queueData = null;

    try {
      queueData = await this.popAddress();

      if (queueData !== null) {
        const queueDataJSON = JSON.parse(queueData);
        const signer = queueDataJSON.signer;
        const signData = queueDataJSON.signData;
        const signDataJSON = JSON.parse(signData);
        const rawDataJSON = JSON.parse(signDataJSON.rawData);
        const rawLogJSON = JSON.parse(rawDataJSON.rawLog);
        const transactionHash = rawDataJSON.transactionHash;

        logger.info(`🚀[SWAP] SEND START`);

        if (signDataJSON.chainId !== this.firmaSDK.Config.chainID) {
          throw new Error(`INVALID CHAIN ID ${signDataJSON.chainId}`);
        }

        if (signer !== signDataJSON.address) {
          throw new Error(`INVALID SIGNER ADDRESS ID ${signer} ${signDataJSON}`);
        }

        if (rawDataJSON.code !== 0) {
          throw new Error(`FAILED TRANSACTION ${rawDataJSON.code}`);
        }

        let isCorrect = false;
        let amount = 0;
        for (let raw of rawLogJSON) {
          if (raw.type === 'transfer') {
            let counter = 0;
            for (let attribute of raw.attributes) {
              if (attribute.key === 'recipient' && attribute.value === SWAP_WALLET_ADDRESS) {
                counter++;
              }
              if (attribute.key === 'sender' && attribute.value === signer) {
                counter++;
              }
              if (attribute.key === 'amount') {
                amount = Number(attribute.value.replace(TOKEN_DENOM, ''));
              }
            }

            if (counter === 2) {
              isCorrect = true;
            }
          }
        }

        if (isCorrect === false) {
          throw new Error(`INVALID RAW ${JSON.stringify(rawLogJSON)}`);
        }

        telegrambot.sendMessage(
          CHAT_ID,
          `[SWAP][SUCCESS] ${amount} UET SEND TO SWAP SERVICE\n${EXPLORER_HOST}/transactions/${transactionHash}`,
          { disable_web_page_preview: true }
        );

        const decryptMnemonic = getDecryptString(SWAP_WALLET_MNEMONIC, SECRET);
        const swapWallet = await this.firmaSDK.Wallet.fromMnemonic(decryptMnemonic);
        const fctAmount = amount / 100;

        const result = await this.firmaSDK.Bank.send(swapWallet, signer, fctAmount);

        if (result.code !== 0) {
          throw new Error(`FAILED SWAP TRANSACTION ${signer} ${result.code}`);
        } else {
          await this.writeResult(signer, result.transactionHash);
          logger.info(`🚀[EVENT] ${signer} ${amount}UET > ${fctAmount}FCT: ${result.transactionHash}`);

          telegrambot.sendMessage(
            CHAT_ID,
            `[SWAP][SUCCESS] ${signer} ${amount}UET > ${fctAmount}FCT\n${EXPLORER_HOST}/transactions/${result.transactionHash}`,
            { disable_web_page_preview: true }
          );
        }

        logger.info(`🚀[SWAP] SEND END`);
        await this.work();
        return;
      } else {
        logger.info(`🚀[SWAP] NO ADDRESS`);
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
