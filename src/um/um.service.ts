import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UMFutures, UMStream } from '@binance/futures-connector';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class UMFuturesService {
  private readonly umFuturesClient: UMFutures;
  private umStream: UMStream;
  private readonly logger = new Logger(UMFuturesService.name);
  private indexPrice: number = 0;
  private markPrice: number = 0;
  private fundingRate: number = 0;
  private nextFundingTime: Date = null;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('API_KEY');
    const apiSecret = this.configService.get<string>('API_SECRET');

    // USDⓈ-M Contracts
    this.umFuturesClient = new UMFutures(apiKey, apiSecret, {
      baseURL: 'https://testnet.binancefuture.com',
    });

    this.umStream = new UMStream({
      //   wsURL: 'wss://fstream.binance.com',
      wsURL: 'wss://fstream.binancefuture.com',
      callbacks: {
        open: () => this.logger.log('WebSocket connected.'),
        close: () => this.logger.log('WebSocket disconnected.'),
        error: (error) => this.logger.error('WebSocket error:', error),
        message: (message) => {
          const data = JSON.parse(message);
          this.handleTickerChange(data);
        },
      },
    });
  }

  async getAccountInfo() {
    try {
      const response = await this.umFuturesClient.getAccountInformation();
      this.logger.log('Account Info:', response.data);
      return response.data;
    } catch (error) {
      this.logger.error('Error fetching account info:', error.message);
      throw error;
    }
  }

  async getSymbols() {
    try {
      const response = await this.umFuturesClient.getExchangeInfo();
      const symbols = response.data.symbols.map((s) => s.symbol);
      this.logger.log('Available symbols:', symbols);
      return symbols;
    } catch (error) {
      this.logger.error('Error fetching symbols info:', error.message);
      throw error;
    }
  }

  async placeOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
    price?: number,
  ) {
    try {
      const order = await this.umFuturesClient.newOrder(
        symbol,
        side,
        price ? 'LIMIT' : 'MARKET',
        {
          quantity,
          ...(price && { price, timeInForce: 'GTC' }),
        },
      );
      this.logger.log('Order placed:', order.data);
      return order.data;
    } catch (error) {
      this.logger.error('Error placing order:', error.message);
      throw error;
    }
  }

  @Cron('0 * * * * *')
  async autoTrade() {
    const symbol = 'BTCUSD_PERP';
    const thresholdPrice = 30000;
    // const user = await this.getAccountInfo();
    // const symbols = await this.getSymbols();
    // const { assets, positions } = user;
    // const btcAsset = assets.find((asset) => asset.asset === 'BTC');
    // this.logger.log(btcAsset);
    // const symbolInfo = symbols.find((s) => s.symbol === symbol);
    // this.logger.log(symbolInfo);
    // if (!!symbolInfo) {
    //   this.umStream.markPriceAllSymbolsOfPairStream(symbol, '1s');
    //   await this.placeOrder(symbol, 'BUY', 0.002);
    // }
  }

  handleTickerChange(data: any) {
    this.markPrice = parseFloat(data.p);
    this.indexPrice = parseFloat(data.P);
    this.fundingRate = parseFloat(data.r);
    this.nextFundingTime = new Date(data.T);

    // this.logger.log(this.markPrice);
    this.logger.log(this.indexPrice);

    //   if (currentPrice <= thresholdPrice) {
    //     this.logger.log(`Placing BUY order at ${currentPrice}`);
    //     await this.placeOrder(symbol, 'BUY', 0.001);
    //   }
  }
}
