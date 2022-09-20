import { Request, Response } from 'express';

import StoreService from '../services/store.service';
import SwapService from '../services/swap.service';

import { resultLog } from '../utils/logger';
import { SUCCESS, INVALID_KEY } from '../constants/httpResult';

class EventController {
  constructor(public storeService: StoreService, private swapService = new SwapService(storeService)) {}

  public getTokenData = (req: Request, res: Response): void => {
    this.swapService
      .getTokenData()
      .then((result) => {
        res.send({ ...SUCCESS, result });
      })
      .catch(() => {
        res.send({ ...INVALID_KEY, result: {} });
      });
  };

  public getStatus = (req: Request, res: Response): void => {
    const { requestKey } = req.params;

    this.swapService
      .getStatus(requestKey)
      .then((result) => {
        res.send({ ...SUCCESS, result });
      })
      .catch(() => {
        res.send({ ...INVALID_KEY, result: {} });
      });
  };

  public arbitarySignForLogin = (req: Request, res: Response): void => {
    this.swapService
      .arbitarySignForLogin()
      .then((result) => {
        resultLog(result);
        res.send({ ...SUCCESS, result });
      })
      .catch(() => {
        res.send({ ...INVALID_KEY, result: {} });
      });
  };

  public directSignForSwap = (req: Request, res: Response): void => {
    const { signer, tokenAmount } = req.body;

    this.swapService
      .directSignForSwap(signer, tokenAmount)
      .then((result) => {
        resultLog(result);
        res.send({ ...SUCCESS, result });
      })
      .catch(() => {
        res.send({ ...INVALID_KEY, result: {} });
      });
  };

  public callback = (req: Request, res: Response): void => {
    const { requestKey, approve, signData } = req.body;

    this.swapService
      .callback(requestKey, approve, signData)
      .then((result) => {
        resultLog(result);
        res.send({ ...SUCCESS, result });
      })
      .catch(() => {
        res.send({ ...INVALID_KEY, result: {} });
      });
  };

  public verify = (req: Request, res: Response): void => {
    const { requestKey, signature } = req.body;

    this.swapService
      .verify(requestKey, signature)
      .then((result) => {
        resultLog(result);
        res.send(result);
      })
      .catch(() => {
        res.send({ requestKey, signature, isValid: false });
      });
  };
}

export default EventController;
