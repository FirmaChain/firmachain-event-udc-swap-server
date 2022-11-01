import moment from 'moment';
import { v4 } from 'uuid';
import { EncodeObject } from '@cosmjs/proto-signing';
import { BankTxClient } from '@firmachain/firma-js';

import StoreService from './store.service';
import { ConnectService } from './connect.service';
import {
  SUCCESS,
  INVALID,
  RELAY,
  PROJECT_SECRET_KEY,
  REQUEST_EXPIRE_SECOND,
  SWAP_WALLET_ADDRESS,
  SWAP_REQUEST,
  ADDRESSBOOK,
  LOGIN_MESSAGE,
  SWAP_MESSAGE,
  STATION_IDENTITY,
  TOKEN_DENOM,
  TOKEN_SYMBOL,
  SWAP_REWARD_QUEUE,
  EXPIRED_EVENT,
} from '../constants/event';

class SwapService {
  constructor(public storeService: StoreService, private connectService: ConnectService = new ConnectService(RELAY)) {}

  public async getTokenData(): Promise<{ token: { denom: string; symbol: string } }> {
    try {
      return {
        token: {
          denom: TOKEN_DENOM,
          symbol: TOKEN_SYMBOL,
        },
      };
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  public async getStatus(
    requestKey: string
  ): Promise<{ message: string; status: number; signer: string; addedAt: string }> {
    try {
      const requestData = await this.getRequest(requestKey);

      return requestData;
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  public async arbitarySignForLogin(): Promise<{ requestKey: string; qrcode: string }> {
    try {
      const message: string = v4();
      const info: string = LOGIN_MESSAGE;

      const session = await this.connectService.connect(PROJECT_SECRET_KEY);
      const qrcodeOrigin = await this.connectService.getQRCodeForArbitarySign(session, message, info);
      const requestKey = qrcodeOrigin.replace('sign://', '');
      const qrcode = qrcodeOrigin.replace('sign://', `${STATION_IDENTITY}://`);

      await this.addRequest('LOGIN', requestKey, message);

      return {
        requestKey,
        qrcode,
      };
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  public async directSignForSwap(signer: string, tokenAmount: number): Promise<{ requestKey: string; qrcode: string }> {
    try {
      if (EXPIRED_EVENT === 'true') {
        throw new Error('EXPIRED SWAP EVENT');
      }

      const message = this.createSampleMessage(signer, tokenAmount);
      const info: string = SWAP_MESSAGE;
      const pubkey = await this.getPubkey(signer);

      const session = await this.connectService.connect(PROJECT_SECRET_KEY);
      const signDoc = await this.connectService.getSignDoc(signer, pubkey, message);

      const uTokenAmount = this.connectService.getUFCTStringFromFCT(tokenAmount);

      const qrcodeOrigin = await this.connectService.getQRCodeForDirectSign(session, signer, signDoc, info, {
        token: { denom: TOKEN_DENOM, symbol: TOKEN_SYMBOL, amount: uTokenAmount },
      });
      const requestKey = qrcodeOrigin.replace('sign://', '');
      const qrcode = qrcodeOrigin.replace('sign://', `${STATION_IDENTITY}://`);

      await this.addRequest('SWAP', requestKey, signDoc, signer);

      return {
        requestKey,
        qrcode,
      };
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  public async callback(requestKey: string, approve: boolean, signData: any): Promise<void> {
    const requestData = await this.getRequest(requestKey);

    if (approve === false) {
      await this.changeRequestStatus(requestKey, INVALID);
      return;
    }

    try {
      switch (requestData.type) {
        case 'LOGIN':
          await this.callbackLogin(signData, requestKey, requestData.message);
          break;
        case 'SWAP':
          await this.callbackSwap(requestKey, signData, requestData.signer);
          break;
      }
    } catch (error) {
      console.log(error);
    }
  }

  private async callbackLogin(signData: any, requestKey: string, originMessage: string) {
    const signRawData = signData.rawData;

    if (await this.connectService.verifyArbitary(signRawData, originMessage)) {
      const signer = signData.address;
      const pubkey = this.connectService.getSingerPubkeyFromSignRaw(signRawData);

      await this.changeRequestStatus(requestKey, SUCCESS);
      await this.changeRequestSigner(requestKey, signer);

      if ((await this.isDuplicateAddress(signer)) === false) {
        await this.addAddress(signer, pubkey);
      }
    } else {
      await this.changeRequestStatus(requestKey, INVALID);
    }
  }

  private async callbackSwap(requestKey: string, signData: any, signer: string) {
    await this.changeRequestStatus(requestKey, SUCCESS);
    await this.changeRequestSignData(requestKey, signData);

    await this.addSwapQueue(signer, JSON.stringify(signData));
  }

  public async verify(
    requestKey: string,
    signature: string
  ): Promise<{ requestKey: string; signature: string; isValid: boolean }> {
    const requestData = await this.getRequest(requestKey);
    const signDoc = this.connectService.parseSignDocValues(requestData.message);
    const address = requestData.signer;

    const isValid = await this.connectService.verifyDirectSignature(address, signature, signDoc);

    return {
      requestKey,
      signature,
      isValid,
    };
  }

  private createSampleMessage(address: string, tokenAmount: number): Array<EncodeObject> {
    const userAddress = address;
    const dappAddress = SWAP_WALLET_ADDRESS;

    const sendAmount = { denom: TOKEN_DENOM, amount: this.connectService.getUFCTStringFromFCT(tokenAmount) };

    let msgSend = BankTxClient.msgSend({
      fromAddress: userAddress,
      toAddress: dappAddress,
      amount: [sendAmount],
    });

    return [msgSend];
  }

  private async addRequest(type: string, requestKey: string, message: string, signer = '', extra = ''): Promise<void> {
    const addedAt = moment.utc().format('YYYY-MM-DD HH:mm:ss');

    await this.storeService.hsetMessage(`${SWAP_REQUEST}${requestKey}`, 'type', type);
    await this.storeService.hsetMessage(`${SWAP_REQUEST}${requestKey}`, 'message', message);
    await this.storeService.hsetMessage(`${SWAP_REQUEST}${requestKey}`, 'status', 0);
    await this.storeService.hsetMessage(`${SWAP_REQUEST}${requestKey}`, 'signer', signer);
    await this.storeService.hsetMessage(`${SWAP_REQUEST}${requestKey}`, 'signData', '');
    await this.storeService.hsetMessage(`${SWAP_REQUEST}${requestKey}`, 'extra', extra);
    await this.storeService.hsetMessage(`${SWAP_REQUEST}${requestKey}`, 'addedAt', addedAt);

    await this.storeService.expireKey(`${SWAP_REQUEST}${requestKey}`, Number(REQUEST_EXPIRE_SECOND));
  }

  private async getRequest(requestKey: string): Promise<{
    message: string;
    type: string;
    status: number;
    signer: string;
    signData: string;
    extra: string;
    addedAt: string;
  }> {
    const result = await this.storeService.hgetAll(`${SWAP_REQUEST}${requestKey}`);
    if (result.status) result.status = Number(result.status);
    else result.status = -1;

    return result;
  }

  private async changeRequestStatus(requestKey: string, status: number): Promise<void> {
    await this.storeService.hsetMessage(`${SWAP_REQUEST}${requestKey}`, 'status', status);
  }

  private async changeRequestSigner(requestKey: string, signer: string): Promise<void> {
    await this.storeService.hsetMessage(`${SWAP_REQUEST}${requestKey}`, 'signer', signer);
  }

  private async changeRequestSignData(requestKey: string, signData: any): Promise<void> {
    await this.storeService.hsetMessage(`${SWAP_REQUEST}${requestKey}`, 'signData', JSON.stringify(signData));
  }

  private async addSwapQueue(address: string, signData: string) {
    await this.storeService.push(SWAP_REWARD_QUEUE, JSON.stringify({ address, signData }));
  }

  private async addAddress(address: string, pubkey: string): Promise<void> {
    await this.storeService.hsetMessage(ADDRESSBOOK, address, pubkey);
  }

  private async getPubkey(address: string): Promise<string> {
    return await this.storeService.hget(ADDRESSBOOK, address);
  }

  private async isDuplicateAddress(address: string): Promise<boolean> {
    const pubkey = await this.storeService.hget(ADDRESSBOOK, address);
    return pubkey !== null;
  }
}

export default SwapService;
