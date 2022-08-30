import { MarketUpdated, MarketRemoved, GlobalAddressUpdated } from '../../generated/LyraRegistry/LyraRegistry'
import { SynthetixAdapter } from '../../generated/LyraRegistry/SynthetixAdapter'
import { ExchangeRates } from '../../generated/LyraRegistry/ExchangeRates'
import { OptionGreekCache as GreekCacheContract } from '../../generated/LyraRegistry/OptionGreekCache'
import {
  LiquidityPool as LiquidityPoolTemplate,
  OptionMarket as OptionMarketTemplate,
  OptionMarketPricer as OptionMarketPricerTemplate,
  OptionGreekCache as OptionGreekCacheTemplate,
  OptionToken as OptionTokenTemplate,
  ShortCollateral as ShortCollateralTemplate,
  ShortPoolHedger as PoolHedgerTemplate,
  SynthetixAdapter as SynthetixAdapterTemplate,
  OptionMarketWrapper as OptionMarketWrapperTemplate,
} from '../../generated/templates'

import {
  Market,
  Pool,
  GreekCache,
  OptionToken,
  OptionMarketPricer,
  ShortCollateral,
  PoolHedger,
  Global,
} from '../../generated/schema'
import { Entity, ZERO, HOURLY_PERIODS, UNIT, HOUR_SECONDS, ZERO_ADDRESS, Snapshot } from '../lib'
import { log, Address, Bytes, BigInt, DataSourceContext, dataSource } from '@graphprotocol/graph-ts'
import { addProxyAggregator } from './latestRates'

export function createPoolHedger(poolHedgerAddress: Address, timestamp: i32, optionMarketId: string): PoolHedger {
  let poolHedgerId = Entity.getIDFromAddress(poolHedgerAddress)
  let poolHedger = new PoolHedger(poolHedgerId)
  poolHedger.market = optionMarketId

  let poolHedgerSnapshot = Entity.loadOrCreatePoolHedgerSnapshot(
    poolHedgerAddress,
    optionMarketId,
    HOUR_SECONDS,
    timestamp,
  )
  poolHedgerSnapshot.save()

  poolHedger.latestPoolHedgerExposure = poolHedgerSnapshot.id

  return poolHedger
}

//Creates the Chainlink Aggregator data source and initial spot price entities
export function createPriceFeed(
  optionMarketAddress: Address,
  baseKey: Bytes,
  timestamp: i32,
  blockNumber: i32,
): BigInt {
  let global = Entity.loadOrCreateGlobal() as Global
  // let exchangeRatesAddress = changetype<Address>(
  //   changetype<Address>(Bytes.fromHexString('0xF62Da62b5Af8B0cae27B1D9D8bB0Adb94EB4c1e2')),
  // ) //TODO: Switch back to global.exchangeRatesAddress

  let exchangeRatesAddress = changetype<Address>(global.exchangeRatesAddress)

  let er = ExchangeRates.bind(exchangeRatesAddress)
  let aggregatorAddress = er.try_aggregators(baseKey)

  //TODO: REMOVE THIS FOR MAINNET DEPLOYMENT
  if (dataSource.network() == 'optimism-kovan' && aggregatorAddress.reverted) {
    er = ExchangeRates.bind(changetype<Address>(Bytes.fromHexString('0xF62Da62b5Af8B0cae27B1D9D8bB0Adb94EB4c1e2'))) //Kovan ExchangeRates Address
    aggregatorAddress = er.try_aggregators(baseKey)
  }

  if (!aggregatorAddress.reverted) {
    let optionMarketId = Entity.getIDFromAddress(optionMarketAddress)
    addProxyAggregator(aggregatorAddress.value, optionMarketId)

    let r = er.rateForCurrency(baseKey)

    //Get the largest relevant period
    let base_period = HOURLY_PERIODS[0]
    let period_timestamp = Snapshot.roundTimestamp(timestamp, base_period)
    for (let p = 1; p < HOURLY_PERIODS.length; p++) {
      if (Snapshot.roundTimestamp(timestamp, HOURLY_PERIODS[p]) == period_timestamp) {
        base_period = HOURLY_PERIODS[p]
      }
    }

    let spotPriceSnapshot = Entity.createSpotPriceSnapshot(optionMarketId, base_period, timestamp, blockNumber)
    spotPriceSnapshot.spotPrice = r
    spotPriceSnapshot.save()

    return r
  } else {
    log.error('Failed to retrieve aggregator for: {}', [baseKey.toString()])
  }
  return ZERO
}

export function handleGlobalAddressUpdated(event: GlobalAddressUpdated): void {
  let changedAddress = event.params.name.toString()

  let global = Entity.loadOrCreateGlobal()

  if (changedAddress == 'SYNTHETIX_ADAPTER' && global.synthetixAdapter != event.params.addr) {
    global.synthetixAdapter = event.params.addr
    global.save()
    SynthetixAdapterTemplate.create(event.params.addr)
  } else if (changedAddress == 'MARKET_VIEWER' && global.viewerAddress != event.params.addr) {
    global.viewerAddress = event.params.addr
    global.save()
  } else if (changedAddress == 'MARKET_WRAPPER' && global.wrapperAddress != event.params.addr) {
    global.wrapperAddress = event.params.addr
    global.save()
    OptionMarketWrapperTemplate.create(event.params.addr)
  }
}

//Initializes all datasources and entities for the new market
export function handleMarketUpdated(event: MarketUpdated): void {
  let global = Entity.loadOrCreateGlobal()
  let timestamp = event.block.timestamp.toI32()

  let context = new DataSourceContext()
  context.setString('market', event.params.market.optionMarket.toHex())

  let marketId = Entity.getIDFromAddress(event.params.market.optionMarket)
  let poolId = Entity.getIDFromAddress(event.params.market.liquidityPool)
  let greekCacheId = Entity.getIDFromAddress(event.params.market.greekCache)
  let optionMarketPricerId = Entity.getIDFromAddress(event.params.market.optionMarketPricer)
  let optionTokenId = Entity.getIDFromAddress(event.params.market.optionToken)
  let shortCollateralId = Entity.getIDFromAddress(event.params.market.shortCollateral)
  let poolHedgerId = Entity.getIDFromAddress(event.params.market.poolHedger)

  let market = Market.load(marketId)

  if (market == null) {
    OptionMarketTemplate.createWithContext(event.params.market.optionMarket, context)

    market = new Market(marketId)
    let marketVolumeAndFeesSnapshot = Entity.loadOrCreateMarketVolumeAndFeesSnapshot(marketId, HOUR_SECONDS, timestamp)

    let marketSNXFeesSnapshot = Entity.loadOrCreateMarketSNXFeesSnapshot(market.id, HOUR_SECONDS, timestamp)

    let marketTotalValueSnapshot = Entity.loadOrCreateMarketTotalValueSnapshot(marketId, HOUR_SECONDS, timestamp)
    marketTotalValueSnapshot.NAV = ZERO
    marketTotalValueSnapshot.netOptionValue = ZERO
    marketTotalValueSnapshot.burnableLiquidity = ZERO
    marketTotalValueSnapshot.freeLiquidity = ZERO
    marketTotalValueSnapshot.pendingDeltaLiquidity = ZERO
    marketTotalValueSnapshot.usedCollatLiquidity = ZERO
    marketTotalValueSnapshot.usedDeltaLiquidity = ZERO
    marketTotalValueSnapshot.baseBalance = ZERO
    marketTotalValueSnapshot.tokenPrice = UNIT
    marketTotalValueSnapshot.pendingDeposits = ZERO
    marketTotalValueSnapshot.pendingWithdrawals = ZERO

    let marketGreeksSnapshot = Entity.createMarketGreeksSnapshot(marketId, HOUR_SECONDS, timestamp)
    marketGreeksSnapshot.hedgerNetDelta = ZERO
    marketGreeksSnapshot.baseBalance = ZERO
    marketGreeksSnapshot.poolNetDelta = ZERO
    marketGreeksSnapshot.optionNetDelta = ZERO
    marketGreeksSnapshot.netDelta = ZERO
    marketGreeksSnapshot.netGamma = ZERO
    marketGreeksSnapshot.netTheta = ZERO
    marketGreeksSnapshot.netStdVega = ZERO

    // config
    market.global = global.id
    market.owner = event.transaction.from
    market.rateAndCarry = ZERO
    market.staleUpdateDuration = 0
    market.acceptableSpotPricePercentMove = ZERO
    market.standardSize = ZERO
    market.skewAdjustmentFactor = ZERO
    market.address = event.params.market.optionMarket
    market.quoteAddress = event.params.market.quoteAsset
    market.baseAddress = event.params.market.baseAsset
    market.isRemoved = false
    market.latestVolumeAndFees = marketVolumeAndFeesSnapshot.id
    market.latestSNXFees = marketSNXFeesSnapshot.id
    market.latestTotalValue = marketTotalValueSnapshot.id
    market.tradingCutoff = ZERO.toI32()
    market.latestGreeks = marketGreeksSnapshot.id
    market.liquidityPool = poolId
    market.greekCache = greekCacheId
    market.optionMarketPricer = optionMarketPricerId
    market.optionToken = optionTokenId
    market.shortCollateral = shortCollateralId
    market.poolHedger = poolHedgerId
    market.activeBoardIds = []
    market.chainlinkAggregator = Bytes.fromHexString(ZERO_ADDRESS)
    market.latestSpotPrice = ZERO

    //Get and Set baseKey and quoteKey
    let synthetixAdapterContract = SynthetixAdapter.bind(changetype<Address>(global.synthetixAdapter))
    let baseKey = synthetixAdapterContract.baseKey(event.params.market.optionMarket)
    let quoteKey = synthetixAdapterContract.quoteKey(event.params.market.optionMarket)
    market.baseKey = baseKey
    market.quoteKey = quoteKey
    market.name = baseKey.toString()

    market.save()
    marketVolumeAndFeesSnapshot.save()
    marketSNXFeesSnapshot.save()
    marketTotalValueSnapshot.save()
    marketGreeksSnapshot.save()
  }

  let pool = Pool.load(poolId)
  if (pool == null) {
    LiquidityPoolTemplate.createWithContext(event.params.market.liquidityPool, context)
    pool = new Pool(poolId)
    //References:
    pool.baseBalance = ZERO
    pool.pendingDeposits = ZERO
    pool.pendingWithdrawals = ZERO
  }
  pool.market = marketId
  pool.save()

  let optionMarketPricer = OptionMarketPricer.load(optionMarketPricerId)
  if (optionMarketPricer == null) {
    OptionMarketPricerTemplate.createWithContext(event.params.market.optionMarketPricer, context)
    optionMarketPricer = new OptionMarketPricer(optionMarketPricerId)
  }
  optionMarketPricer.market = marketId
  optionMarketPricer.save()

  let greekCache = GreekCache.load(greekCacheId)
  if (greekCache == null) {
    OptionGreekCacheTemplate.createWithContext(event.params.market.greekCache, context)
    greekCache = new GreekCache(greekCacheId)
    let greekCacheContract = GreekCacheContract.bind(changetype<Address>(event.params.market.greekCache))
    let greekCacheParams = greekCacheContract.try_getGreekCacheParams()

    if (!greekCacheParams.reverted) {
      market.acceptableSpotPricePercentMove = greekCacheParams.value.acceptableSpotPricePercentMove
      market.rateAndCarry = greekCacheParams.value.rateAndCarry
      market.staleUpdateDuration = greekCacheParams.value.staleUpdateDuration.toI32()
      market.save()
    }
  }
  greekCache.market = marketId
  greekCache.save()

  let optionToken = OptionToken.load(optionTokenId)
  if (optionToken == null) {
    OptionTokenTemplate.createWithContext(event.params.market.optionToken, context)
    optionToken = new OptionToken(optionTokenId)
  }
  optionToken.market = marketId
  optionToken.save()

  let shortCollateral = ShortCollateral.load(shortCollateralId)
  if (shortCollateral == null) {
    ShortCollateralTemplate.createWithContext(event.params.market.shortCollateral, context)
    shortCollateral = new ShortCollateral(shortCollateralId)
  }
  shortCollateral.market = marketId
  shortCollateral.save()

  let poolHedger = PoolHedger.load(poolHedgerId)
  if (poolHedger == null) {
    PoolHedgerTemplate.createWithContext(event.params.market.poolHedger, context)
    poolHedger = createPoolHedger(event.params.market.poolHedger, timestamp, marketId)
  }
  poolHedger.market = marketId
  poolHedger.save()

  //Market needs to be created before this
  let latestSpotPrice = createPriceFeed(event.params.market.optionMarket, market.baseKey, event.block.timestamp.toI32(), event.block.number.toI32())
  if (latestSpotPrice != ZERO) {
    market.latestSpotPrice = latestSpotPrice as BigInt
  } else {
    market.latestSpotPrice = BigInt.fromI32(2500).times(UNIT)
  }
  market.save()

  log.info('Created Market {}', [market.name])
}

export function handleMarketRemoved(event: MarketRemoved): void {
  let market = Entity.loadMarket(event.params.market)
  market.isRemoved = true
  market.save()
  log.info('Market removed: {}', [event.params.market.toHex()])
}
