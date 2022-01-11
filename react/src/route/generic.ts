export abstract class DexRouter {
  abstract makeToken(tokenAddress: string): any;
  abstract quoteLot(tokenA: any, tokenB: any, amount: string): Promise<any>;
  abstract setSlippage(slippage: string): void;
}

export abstract class GenericToken {
  abstract getAddress(): string;

  abstract getDecimals(): number;
}

// TODO: wrap SwapRoute and other routes
export class GenericRoute {
  route: any;

  constructor(route: any) {
    this.route = route;
  }

  getRoute(): any {
    return this.route;
  }
}
