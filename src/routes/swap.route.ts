import { Router } from 'express';
import { Routes } from '../interfaces/routes.interface';

import StoreService from '../services/store.service';
import SwapController from '../controllers/swap.controller';

class SwapRoute implements Routes {
  constructor(
    public storeService: StoreService,
    public path = '/swap',
    public router = Router(),
    private swapController = new SwapController(storeService)
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.get(`${this.path}/token`, this.swapController.getTokenData);
    this.router.get(`${this.path}/requests/:requestKey`, this.swapController.getStatus);

    this.router.post(`${this.path}/sign/login`, this.swapController.arbitarySignForLogin);
    this.router.post(`${this.path}/sign/swap`, this.swapController.directSignForSwap);

    this.router.post(`${this.path}/callback`, this.swapController.callback);
    this.router.post(`${this.path}/verify`, this.swapController.verify);
  }
}

export default SwapRoute;
