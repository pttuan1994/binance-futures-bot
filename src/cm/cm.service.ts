import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CMFutures, CMStream } from '@binance/futures-connector';
import { Cron } from '@nestjs/schedule';

@Injectable()
// COIN-M Contracts Service
export class CMFuturesService {
  private readonly cmFuturesClient: CMFutures;
  private cmStream: CMStream;
  private readonly logger = new Logger(CMFuturesService.name);
  // Mức giá vào (%) - Entry Price (%)
  private readonly entriesPercent = [0.02, 0.04, 0.06, 0.08, 0.1];
  // Mức chốt lời (%) - Take Profit (%)
  private readonly takeProfitPercent: number = -0.01;
  // Mức cắt lỗ (%) - Stop Loss (%)
  private readonly stopLossPercent: number = -0.02;
  private readonly originPrice: number = 100000;
  private entryPrice: number = 0;
  private indexPrice: number = 0;
  private markPrice: number = 0;
  private fundingRate: number = 0;
  private nextFundingTime: Date = null;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('API_KEY');
    const apiSecret = this.configService.get<string>('API_SECRET');
    this.cmFuturesClient = new CMFutures(apiKey, apiSecret, {
      baseURL: 'https://testnet.binancefuture.com',
    });

    this.cmStream = new CMStream({
      //   wsURL: 'wss://dstream.binance.com',
      wsURL: 'wss://dstream.binancefuture.com',
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

  private calculateEntryPrices() {
    return this.entriesPercent.map(
      (percent) => this.originPrice * (1 + percent),
    );
  }

  async getAccountInfo() {
    try {
      const response = await this.cmFuturesClient.getAccountInformation();
      this.logger.log('Account Info:', response.data);
      return response.data;
    } catch (error) {
      this.logger.error('Error fetching account info:', error.message);
      throw error;
    }
  }

  async getSymbol(symbol) {
    try {
      const response = await this.cmFuturesClient.getExchangeInfo();
      const symbolInfo = response.data.symbols.find((s) => s.symbol === symbol);
      if (!symbolInfo) throw new Error(`Symbol ${symbol} not found`);
      this.logger.log('Available symbol:', symbolInfo);
      return symbolInfo;
    } catch (error) {
      this.logger.error('Error fetching symbol info:', error.message);
      throw error;
    }
  }

  async placeOrder(symbol: string, price: number = 0) {
    try {
      // Lấy thông tin symbol từ Binance
      const symbolInfo = await this.getSymbol(symbol);

      // Lấy thông tin bước giá và bước lượng
      const lotSizeFilter = symbolInfo.filters.find(
        (f) => f.filterType === 'LOT_SIZE',
      );
      const priceFilter = symbolInfo.filters.find(
        (f) => f.filterType === 'PRICE_FILTER',
      );

      const stepSize = parseFloat(lotSizeFilter.stepSize);
      const tickSize = parseFloat(priceFilter.tickSize);

      const rawQuantity = 1; // Số lượng (tạm thời)

      // Làm tròn giá và số lượng
      const quantity = Math.floor(rawQuantity / stepSize) * stepSize;

      const roundedPrice = Math.floor(price / tickSize) * tickSize;

      // Đặt lệnh mua
      const order = await this.cmFuturesClient.newOrder(
        symbol,
        'BUY',
        price ? 'LIMIT' : 'MARKET',
        {
          quantity,
          ...(price && {
            price: roundedPrice,
            timeInForce: 'GTC',
          }),
        },
      );
      this.logger.log('Order placed:', order.data);

      if (price !== 0) {
        // Tính giá chốt lời
        const takeProfitPrice = price * (1 + this.takeProfitPercent);
        const roundedTakeProfit =
          Math.floor(takeProfitPrice / tickSize) * tickSize;
        // Đặt lệnh chốt lời
        const takeProfitOrder = await this.cmFuturesClient.newOrder(
          symbol,
          'SELL',
          'TAKE_PROFIT_MARKET',
          {
            quantity,
            stopPrice: roundedTakeProfit,
          },
        );
        this.logger.log('Take Profit Order:', takeProfitOrder.data);
      }

      if (price === 0) {
        // Tính giá cắt lỗ
        const stopLossPrice = this.originPrice * (1 + this.stopLossPercent);
        const roundedStopLoss = Math.floor(stopLossPrice / tickSize) * tickSize;
        // Đặt lệnh cắt lỗ
        const stopLossOrder = await this.cmFuturesClient.newOrder(
          symbol,
          'SELL',
          'STOP_MARKET',
          {
            stopPrice: roundedStopLoss,
          },
        );
        this.logger.log('Stop Loss Order:', stopLossOrder.data);
      }

      return {
        order: order.data,
      };
    } catch (error) {
      this.logger.error('Error placing orders:', error.message);
      throw error;
    }
  }

  @Cron('0 * * * * *')
  async autoTrade() {
    const symbol = 'BTCUSD_PERP';
    const user = await this.getAccountInfo();
    const { assets } = user;
    const btcAsset = assets.find((asset) => asset.asset === 'BTC');
    const availableBalance = parseFloat(btcAsset.availableBalance);
    this.logger.log(availableBalance);
    if (availableBalance < 1) throw new Error(`Available balance not enough`);
    this.cmStream.markPriceAllSymbolsOfPairStream(symbol, '1s');

    if (this.entryPrice === 0) {
      await this.placeOrder(symbol);
      return;
    }

    const entryPrices = this.calculateEntryPrices();
    // Lọc giá cao nhất trong các mức giá nhỏ hơn hoặc bằng `markPrice`
    const eligiblePrices = entryPrices.filter(
      (price) => price <= this.markPrice,
    );
    const highestPrice = Math.max(...eligiblePrices);

    if (eligiblePrices.length > 0 && this.entryPrice !== highestPrice) {
      this.logger.log(`Placing order at highest entryPrice: ${highestPrice}`);
      await this.placeOrder(symbol, highestPrice);
      this.entryPrice = highestPrice; // Cập nhật giá đã đặt lệnh
    }
  }

  handleTickerChange(data: any) {
    this.markPrice = parseFloat(data.p);
    this.indexPrice = parseFloat(data.P);
    this.fundingRate = parseFloat(data.r);
    this.nextFundingTime = new Date(data.T);
    this.logger.log(this.indexPrice);
  }
}
